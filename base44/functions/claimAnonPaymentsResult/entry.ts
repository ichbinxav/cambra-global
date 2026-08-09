// claimAnonPaymentsResult — the payments-only handoff step. SINGLE SOURCE OF
import { sha256 } from '../../shared/intelligenceCore.ts';
// TRUTH for the anonymous→authenticated claim (the only claim function; the
// former `claimPaymentsAnalysisSession` was deleted 2026-07-13).
//
// ROOT CAUSE (corrected 2026-07-13): reports rendered blank NOT because of a
// "frozen deploy" but because the AnalyzerResult.details schema only declared
// the legacy scoreEngine keys, so Base44 silently STRIPPED every payments key
// on write (engine_result, input_snapshot, AND the details_shape fingerprint —
// which is exactly why edits appeared to "never land": the probe itself was
// being eaten). The fix was declaring the payments sub-properties on the
// details schema. The deploy was never frozen. This is the sole survivor and
// AuthContext points at it.
//
// ── CONDICIONES NO NEGOCIABLES (Xavi 2026-07-13) ────────────────────────────
//  1. NO RECALCULAR — COPIAR. The materialized AnalyzerResult carries the
//     EXACT engine_result + engine_version from the PaymentsAnalysisSession.
//     The engine is NEVER re-run here.
//  2. VOCABULARIO — the row is verification_status:"estimated" + was_anonymous:true.
//  3. IDEMPOTENTE + DUEÑO ÚNICO — keyed by anon_session_id on AnalyzerResult.
//  4. AISLAMIENTO DE TENANT — written USER-scoped so created_by === user.email.
//  5. Fires on BOTH signup AND login.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeEmail(email: string | null | undefined): string {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

// Copy the annual savings RANGE verbatim from the session's engine_result.
function readAnnualRange(engineResult: any): { lo: number; point: number; hi: number } {
  const a = engineResult?.annual_savings_eur || {};
  const num = (v: any) => (isFinite(Number(v)) ? Number(v) : 0);
  return { lo: num(a.lo), point: num(a.point), hi: num(a.hi) };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // ── Auth guard (fires on both signup and login) ───────────────────────
    let user: any = null;
    try {
      user = await base44.auth.me();
    } catch {
      user = null;
    }
    if (!user || !user.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const userEmail = normalizeEmail(user.email);

    // ── Parse + validate session id ───────────────────────────────────────
    let body: any = null;
    try {
      body = await req.json();
    } catch {
      return Response.json({ ok: false, error: 'invalid_json_body' }, { status: 400 });
    }
    const anon_session_id = body?.anon_session_id || body?.session_id || null;
    if (typeof anon_session_id !== 'string' || !UUID_V4.test(anon_session_id)) {
      return Response.json({ ok: false, error: 'invalid_session_id' }, { status: 400 });
    }

    // ── IDEMPOTENCY + owner check (condición #3) ──────────────────────────
    const priorClaims = await base44.asServiceRole.entities.AnalyzerResult
      .filter({ anon_session_id }, '-created_date', 1)
      .catch(() => []);
    if (Array.isArray(priorClaims) && priorClaims[0]) {
      const prior = priorClaims[0];
      const priorOwner = normalizeEmail(prior.created_by);
      if (priorOwner && priorOwner !== userEmail) {
        return Response.json({ ok: false, error: 'already_claimed' }, { status: 409 });
      }
      return Response.json({
        ok: true,
        claimed: false,
        analyzer_result_id: prior.id,
        brand_id: prior.brand_id || null,
      });
    }

    // ── Read the ownerless anonymous session (service role — condición #2) ─
    const sessions = await base44.asServiceRole.entities.PaymentsAnalysisSession
      .filter({ anon_session_id }, '-created_date', 1)
      .catch(() => []);
    if (!Array.isArray(sessions) || !sessions[0]) {
      return Response.json({ ok: false, error: 'session_not_found' });
    }
    const session = sessions[0];
    const engineResult = session.engine_result || null;
    const engineVersion = session.engine_version || engineResult?.engine_version || null;
    const snapshot = session.input_snapshot || {};

    if (!engineResult || engineResult.ok !== true) {
      return Response.json({ ok: false, error: 'session_not_found' });
    }

    // ── Resolve or create the user's Brand (contact_email pivot) ──────────
    const pickWinner = (rows: any[]) => {
      return [...rows].sort((a, b) => {
        const da = new Date(a.created_date || 0).getTime();
        const db = new Date(b.created_date || 0).getTime();
        if (da !== db) return da - db;
        return String(a.id).localeCompare(String(b.id));
      })[0];
    };

    let brand: any = null;
    const ownedBrands = await base44.entities.Brand
      .filter({ contact_email: userEmail }, '-created_date', 20)
      .catch(() => []);
    if (Array.isArray(ownedBrands) && ownedBrands.length > 0) {
      brand = pickWinner(ownedBrands);
    } else {
      await base44.entities.Brand.create({
        name: (typeof snapshot.brand_name === 'string' && snapshot.brand_name.trim())
          ? snapshot.brand_name.trim()
          : 'My brand',
        contact_email: userEmail,
        contact_name: user.full_name || undefined,
        website: typeof snapshot.website === 'string' ? snapshot.website : undefined,
        country: typeof snapshot.country === 'string' ? snapshot.country : undefined,
        category: typeof snapshot.sector === 'string' ? snapshot.sector : undefined,
        // EMAIL-1 T2 — carry the anonymous session's language onto the Brand
        // so the welcome + monthly emails keep speaking the language the
        // visitor ran the analysis in. Absent → entity default 'en'.
        locale: typeof session.locale === 'string' ? session.locale : undefined,
      });
      const afterCreate = await base44.entities.Brand
        .filter({ contact_email: userEmail }, '-created_date', 20)
        .catch(() => []);
      brand = (Array.isArray(afterCreate) && afterCreate.length > 0)
        ? pickWinner(afterCreate)
        : null;
      if (Array.isArray(afterCreate) && afterCreate.length > 1) {
        console.warn('claimAnonPaymentsResult: residual duplicate Brand for', userEmail, '— left orphaned for offline purge. count=', afterCreate.length);
      }
    }
    if (!brand?.id) {
      return Response.json({ ok: false, error: 'brand_resolution_failed' }, { status: 500 });
    }

    // ── Materialize the AnalyzerResult (COPY, no recompute — condición #1) ─
    const range = readAnnualRange(engineResult);
    const created = await base44.entities.AnalyzerResult.create({
      brand_id: brand.id,
      anon_session_id,
      was_anonymous: true,
      verification_status: 'estimated',
      savings_model_version: engineVersion || undefined,
      score_engine_version: engineVersion || undefined,
      total_savings: range.point,
      payment_savings: range.point,
      assumptions: Array.isArray(engineResult.assumptions) ? engineResult.assumptions : [],
      methodology: 'Materialized from anonymous payments analysis (estimated). Connect your PSP to verify.',
      confidence_level: 'medium',
      benchmark_source: 'provider_published',
      details: {
        // Payments shape — this is exactly what PaymentsResults reads
        // (details.engine_result + details.input_snapshot).
        details_shape: 'payments-v1',
        savings_range: range,
        engine_result: engineResult,
        engine_version: engineVersion,
        cohort: engineResult.cohort || null,
        input_snapshot: {
          monthly_gmv_eur: snapshot.monthly_gmv_eur ?? null,
          avg_ticket_eur: snapshot.avg_ticket_eur ?? null,
          provider_slug: snapshot.provider_slug ?? null,
          country: snapshot.country ?? null,
        },
      },
    });

    // ── CONCURRENCY — AnalyzerResult create-then-verify ───────────────────
    let winnerId = created.id;
    try {
      const dupes = await base44.asServiceRole.entities.AnalyzerResult
        .filter({ anon_session_id }, '-created_date', 20)
        .catch(() => []);
      if (Array.isArray(dupes) && dupes.length > 1) {
        const winner = pickWinner(dupes);
        winnerId = winner?.id || created.id;
        const winnerPresent = dupes.some((r: any) => r.id === winnerId);
        if (winnerPresent && created.id !== winnerId) {
          const mine = normalizeEmail(created.created_by) === userEmail;
          if (mine) {
            await base44.entities.AnalyzerResult.delete(created.id).catch(() => { /* already gone — fine */ });
          }
        }
      }
    } catch (e) {
      console.warn('claimAnonPaymentsResult: dedup verify skipped:', (e as any)?.message);
    }

    // P12 — freeze the intelligence context that produced the historical AnalyzerResult.
    const analyzerSnapshotPayload = { engine_version: engineVersion, cohort: engineResult.cohort || null, input_snapshot: { monthly_gmv_eur: snapshot.monthly_gmv_eur ?? null, avg_ticket_eur: snapshot.avg_ticket_eur ?? null, provider_slug: snapshot.provider_slug ?? null, country: snapshot.country ?? null }, assumptions: Array.isArray(engineResult.assumptions) ? engineResult.assumptions : [], source: 'anonymous_estimated' };
    const analyzerSnapshotHash = await sha256(analyzerSnapshotPayload);
    const intelSnapshot = await base44.asServiceRole.entities.IntelligenceSnapshot.create({ snapshot_key: `analyzer:${winnerId}:${analyzerSnapshotHash.slice(0,16)}`, snapshot_type: 'analyzer_result', related_entity_type: 'AnalyzerResult', related_entity_id: winnerId, brand_id: brand.id, vertical: 'payments', claim_ids: [], pricing_version_ids: [], benchmark_refs_json: { cohort: engineResult.cohort || null }, calculation_version: engineVersion || undefined, snapshot_json: analyzerSnapshotPayload, snapshot_hash: analyzerSnapshotHash, captured_at: new Date().toISOString() }).catch(() => null);
    if (intelSnapshot?.id) await base44.asServiceRole.entities.AnalyzerResult.update(winnerId,{ intelligence_snapshot_id: intelSnapshot.id }).catch(() => null);

    return Response.json({
      ok: true,
      claimed: true,
      analyzer_result_id: winnerId,
      brand_id: brand.id,
    });
  } catch (error) {
    console.error('claimAnonPaymentsResult:', (error as any)?.message, (error as any)?.stack);
    return Response.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
});