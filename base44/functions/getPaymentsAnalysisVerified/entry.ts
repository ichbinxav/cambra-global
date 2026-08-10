// getPaymentsAnalysisVerified — authenticated read of a PaymentsAnalysisVerified row.
//
// Endpoint classification: AUTH_REQUIRED · TENANT_GUARDED.
// This is the reader end of the M3 bridge sealed in Chunk 4. Where
// computeStripeVerifiedGap PRODUCES a verified analysis row from real Stripe
// data, this function EXPOSES that row to the merchant who owns the brand it
// belongs to — with a strict field allowlist and no service-role leakage.
//
// Two entry paths (both go through _tenantGuard's ownership check):
//   A) { verified_id }        → fetch that specific row.
//   B) { brand_id, latest:true } → fetch the most recent row for the brand.
//
// Ownership model (M3-Chunk 2):
//   PaymentsAnalysisVerified rows are written by service role, so their
//   `created_by` is the service account (RLS by created_by is inert). Access
//   isolation lives in the denormalized `owner_email` column, populated at
//   write time by computeStripeVerifiedGap. We resolve the caller's owned
//   brand via checkOwnership (inlined from _tenantGuard), then match against
//   row.owner_email. Admins bypass ownership but still land on the same
//   allowlist — no admin-only extra fields exposed here.
//
// Hard allowlist (see Decision_Log 2026-07-10 M3-Chunk 5):
//   Returned : brand_id, engine_result, engine_version, measurement_window,
//              sample_metrics, measured_current_bps, measured_intl_pct
//   NOT returned : source_charges_hash, owner_email, integration_id, id,
//              created_by, created_date, measured_fixed_fee_minor
//   Enforced by explicit field-by-field copy — no spread, no destructure. If
//   the schema grows tomorrow, new fields DO NOT appear here until listed.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// Inlined pure helpers from _tenantGuard (see file header there). We avoid an
// HTTP hop on the hot read path — same rule as computeStripeVerifiedGap.
function normalizeEmail(email: string | null | undefined): string {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}
function checkOwnership(
  user: { email?: string } | null,
  brand: { created_by?: string } | null
): { ok: true; owner_email: string } | { ok: false; reason: string } {
  if (!user || !user.email) return { ok: false, reason: 'no_user' };
  if (!brand || !brand.created_by) return { ok: false, reason: 'no_brand' };
  const u = normalizeEmail(user.email);
  const o = normalizeEmail(brand.created_by);
  if (u !== o) return { ok: false, reason: 'not_owner' };
  return { ok: true, owner_email: o };
}

// Base44 ObjectId shape — 24 hex chars. verified_id and brand_id both use it.
const OBJECT_ID = /^[0-9a-f]{24}$/i;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // ── 1. Auth ───────────────────────────────────────────────────────────
    // auth.me() throws for anonymous callers → 401 with a clean body, no
    // stack leakage (LOCK #1 pattern from Chunk 2).
    let user: any = null;
    try {
      user = await base44.auth.me();
    } catch (_) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // ── 2. Parse input ────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const verified_id = typeof body?.verified_id === 'string' ? body.verified_id : null;
    const brand_id = typeof body?.brand_id === 'string' ? body.brand_id : null;
    const latest = body?.latest === true;

    // Exactly ONE of the two entry paths must be requested.
    const pathA = !!verified_id;
    const pathB = !!brand_id && latest;
    if (!pathA && !pathB) {
      return Response.json(
        { error: 'invalid_input', detail: 'provide { verified_id } or { brand_id, latest: true }' },
        { status: 400 }
      );
    }
    if (pathA && pathB) {
      return Response.json(
        { error: 'invalid_input', detail: 'cannot combine verified_id with brand_id+latest' },
        { status: 400 }
      );
    }

    // Shape validation before any DB hit — cheap rejection of garbage.
    if (pathA && !OBJECT_ID.test(verified_id!)) {
      return Response.json({ error: 'invalid_verified_id' }, { status: 400 });
    }
    if (pathB && !OBJECT_ID.test(brand_id!)) {
      return Response.json({ error: 'invalid_brand_id' }, { status: 400 });
    }

    // ── 3. Fetch row ──────────────────────────────────────────────────────
    let row: any = null;
    if (pathA) {
      row = await base44.asServiceRole.entities.PaymentsAnalysisVerified
        .get(verified_id!)
        .catch(() => null);
      if (!row) return Response.json({ error: 'not_found' }, { status: 404 });
    } else {
      const rows = await base44.asServiceRole.entities.PaymentsAnalysisVerified
        .filter({ brand_id: brand_id! }, '-created_date', 1)
        .catch(() => []);
      if (!rows.length) return Response.json({ error: 'not_found' }, { status: 404 });
      row = rows[0];
    }

    // ── 4. Tenant guard ───────────────────────────────────────────────────
    // The row belongs to a brand; resolve that brand and verify the caller
    // owns it (or is admin). 404 on non-owner — never leak existence.
    const brand = await base44.asServiceRole.entities.Brand.get(row.brand_id).catch(() => null);
    if (!brand) {
      // Row exists but its brand was deleted — treat as not_found to the caller.
      return Response.json({ error: 'not_found' }, { status: 404 });
    }

    const isAdmin = user.role === 'admin';
    if (!isAdmin) {
      const check = checkOwnership(user, brand);
      if (!check.ok) {
        return Response.json({ error: 'not_found' }, { status: 404 });
      }
    }

    // ── 5. Allowlist (explicit copy, no spread) ───────────────────────────
    const measurement_window = row.measurement_window
      ? {
          from: row.measurement_window.from || null,
          to: row.measurement_window.to || null,
          days_covered: Number(row.measurement_window.days_covered) || null,
        }
      : null;

    // sample_metrics is passed through verbatim — its shape is engine-owned
    // (see Chunk 4 labels: gmv_eur_monthly, gross_volume_eur_90d, etc.) and
    // contains only aggregate numbers, no PII, no IDs.
    const sample_metrics = row.sample_metrics && typeof row.sample_metrics === 'object'
      ? row.sample_metrics
      : null;

    return Response.json({
      ok: true,
      brand_id: row.brand_id,
      engine_version: row.engine_version || null,
      engine_result: row.engine_result || null,
      measurement_window,
      sample_metrics,
      measured_current_bps: typeof row.measured_current_bps === 'number' ? row.measured_current_bps : null,
      measured_intl_pct: typeof row.measured_intl_pct === 'number' ? row.measured_intl_pct : null,
    });
  } catch (error) {
    console.error('getPaymentsAnalysisVerified:', (error as any)?.message);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
});