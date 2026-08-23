// getMyPaymentsHistory — server-side, RLS-independent history feed for /Results.
//
// SECURITY INVARIANT (non-negotiable, Xavi 2026-07-13):
//   - NEVER a client-side filter({}). Reads happen HERE, server-side, with an
//     EXPLICIT filter by the caller's own email — never trusting the implicit
//     RLS enforcement (which the harness could not prove for non-admin users).
//   - NEVER return a row whose created_by !== the caller. Defense-in-depth:
//     the service-role filter is scoped by created_by, AND we re-filter the
//     result client-of-nothing here before returning.
//   - auth.me() fails → 401. NOT a silent empty list (an empty list could mask
//     an auth bug and is indistinguishable from "you have no history").
//
// WHY created_by (not owner_email): claimAnonPaymentsResult writes the
// materialized AnalyzerResult with the USER-SCOPED client, so created_by ===
// user.email on every payments-v1 row (verified empirically 2026-07-13 — 3/3
// claimed rows carried the human email; the 5 service-owned rows are LEGACY
// scoreEngine rows with details_shape=null, correctly excluded by the shape
// filter below). No owner_email denormalization needed — it would be dead work.
//
// List mode returns a MINIMAL projection — date, PSP, country, currency and
// savings. Detail mode accepts an owned result id and returns the engine payload
// only after the tenant-scoped query and a second ownership check.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

function normalizeEmail(email) {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

const OBJECT_ID = /^[0-9a-f]{24}$/i;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let user = null;
    try {
      user = await base44.auth.me();
    } catch {
      user = null;
    }
    // Hard 401 — never a silent empty list.
    if (!user || !user.email) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const email = normalizeEmail(user.email);
    const body = await req.json().catch(() => ({}));
    const result_id = typeof body?.result_id === 'string' ? body.result_id.trim() : '';

    // Detail reads use the same endpoint so history cards remain useful after
    // the anonymous session id is cleared during claim. The service-role query
    // is tenant-scoped before the row is read, then ownership is checked again
    // before any engine payload is returned.
    if (result_id) {
      if (!OBJECT_ID.test(result_id)) {
        return Response.json({ error: 'invalid_result_id' }, { status: 400 });
      }
      const detailRows = await base44.asServiceRole.entities.AnalyzerResult
        .filter({ id: result_id, created_by: user.email }, '-created_date', 2);
      const row = (Array.isArray(detailRows) ? detailRows : []).find(
        (candidate) =>
          candidate?.id === result_id &&
          normalizeEmail(candidate?.created_by) === email
      );
      if (!row || !row?.details?.engine_result) {
        return Response.json({ error: 'not_found' }, { status: 404 });
      }
      return Response.json({
        ok: true,
        engine_result: row.details.engine_result,
        engine_version: row.details?.engine_version || row.savings_model_version || null,
        input_snapshot: row.details?.input_snapshot || null,
        owned: true,
      });
    }

    // EXPLICIT server-side filter — created_by scoped to the caller ONLY.
    // asServiceRole is used so the read does not depend on implicit RLS; the
    // created_by filter is what guarantees tenant isolation.
    //
    // IMPORTANT (2026-07-15): we DO NOT filter by details_shape at the query
    // level. details_shape lives NESTED at details.details_shape (per the
    // AnalyzerResult schema), and the SDK's .filter() does not reliably match
    // dot-paths / nested fields — a `details_shape: 'payments-v1'` (top-level)
    // or even `'details.details_shape'` filter matches ZERO rows and returns a
    // silent empty list (the exact history-empty bug). Instead we filter by
    // created_by server-side and do the shape/engine_result check in JS below,
    // the same robust pattern PaymentsResults already uses.
    const rows = await base44.asServiceRole.entities.AnalyzerResult
      .filter({ created_by: user.email }, '-created_date', 100);

    // Defense-in-depth + shape gate, all in JS (no dependence on nested-path
    // filtering):
    //   1. created_by must be exactly the caller (tenant isolation).
    //   2. the row must carry the payments engine_result — this excludes legacy
    //      scoreEngine rows (details.engine_result absent) that would render
    //      blank. Same guard PaymentsResults uses to decide unlock-vs-teaser.
    const mine = (Array.isArray(rows) ? rows : []).filter(
      (r) =>
        normalizeEmail(r.created_by) === email &&
        !!r?.details?.engine_result
    );

    const items = mine.map((r) => ({
      id: r.id,
      anon_session_id: r.anon_session_id || null,
      created_date: r.created_date,
      total_savings: typeof r.total_savings === 'number' ? r.total_savings : null,
      savings_range: r.details?.savings_range || null,
      provider_slug: r.details?.input_snapshot?.provider_slug || null,
      country: r.details?.input_snapshot?.country || null,
      currency: r.currency || r.details?.input_snapshot?.currency || 'EUR',
    }));

    return Response.json({ ok: true, items });
  } catch (error) {
    console.error('getMyPaymentsHistory failed', error);
    return Response.json({ error: 'payments_history_failed' }, { status: 500 });
  }
});
