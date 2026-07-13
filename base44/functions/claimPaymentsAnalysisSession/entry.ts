// claimPaymentsAnalysisSession — the missing handoff step.
//
// Purpose (Opción B, sealed 2026-07-13): when an anonymous visitor runs a
// payments analysis (which persists a PaymentsAnalysisSession keyed only by
// anon_session_id, with NO owner) and then creates an account / logs in, this
// function MATERIALIZES that anonymous result as an AnalyzerResult OWNED by the
// authenticated user — so it appears in their Dashboard and unlocks /Results.
//
// It is the server-side persistence that maybeRescueAnonymousSession() never
// did (that was a pure URL redirect — see AuthContext diagnosis 2026-07-13).
//
// ── CONDICIONES NO NEGOCIABLES (Xavi 2026-07-13) ────────────────────────────
//  1. NO RECALCULAR — COPIAR. The materialized AnalyzerResult carries the
//     EXACT engine_result + engine_version from the PaymentsAnalysisSession.
//     The engine is NEVER re-run here. The user's saved number is byte-identical
//     to the teaser they saw (rango incluido — see details.savings_range below).
//  2. VOCABULARIO — the row is verification_status:"estimated" + was_anonymous:true.
//     NEVER "verified" (that word is reserved for Stripe-measured data). The
//     upgrade path (connect Stripe → verified) stays open — this is the entry
//     door, not the destination.
//  3. IDEMPOTENTE + DUEÑO ÚNICO — keyed by anon_session_id on AnalyzerResult.
//     Reclaiming twice returns the same row (no dup). If the session was already
//     claimed by ANOTHER user → 409 already_claimed (never steal another tenant's
//     analysis).
//  4. AISLAMIENTO DE TENANT — the AnalyzerResult is written with the USER-scoped
//     client (not asServiceRole), so Base44 fixes created_by to the user's email
//     and the entity's RLS (created_by == {{user.email}}) lets ONLY them read it.
//     brand_id points at the user's own Brand. asServiceRole is used ONLY to READ
//     the ownerless PaymentsAnalysisSession by its anon_session_id.
//  5. Fires on BOTH signup AND login — the caller (AuthContext) invokes this
//     whenever didAuth===true and a pending anon session exists. This function
//     doesn't care which auth event triggered it.
//
// ── GRACEFUL DEGRADATION (matiz #3, 2026-07-13) ─────────────────────────────
//  If the anon_session_id no longer exists in PaymentsAnalysisSession (expired
//  / purged — the "This link isn't valid" case), we return { ok:false,
//  error:"session_not_found" } with HTTP 200. The caller treats that as a
//  clean no-op: send the user to the Dashboard's normal empty state, NO visible
//  error. We never throw for a missing session.
//
// Returns:
//   { ok:true, claimed:true,  analyzer_result_id, brand_id }  — freshly claimed
//   { ok:true, claimed:false, analyzer_result_id, brand_id }  — already yours (idempotent)
//   { ok:false, error:"session_not_found" }        (HTTP 200 — graceful)
//   { ok:false, error:"already_claimed" }          (HTTP 409 — another user owns it)
//   { ok:false, error:"invalid_session_id" }       (HTTP 400)
//   { error:"Unauthorized" }                       (HTTP 401)

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeEmail(email: string | null | undefined): string {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

// Copy the annual savings RANGE verbatim from the session's engine_result.
// The teaser shows €lo–€hi; the claimed report MUST show the same range, so we
// persist all three (lo/point/hi) into details.savings_range. `.point` becomes
// the Dashboard headline (total_savings/payment_savings) — a median the user
// already saw inside the range, NOT a recomputation. Combined submits carry
// annual_savings_eur at the top level too (sum across channels) — same read.
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
    // Look for an AnalyzerResult already claimed for this anon_session_id.
    // asServiceRole so we can see rows owned by ANY user — that's how we detect
    // the "already claimed by someone else" case (RLS would hide it otherwise).
    const priorClaims = await base44.asServiceRole.entities.AnalyzerResult
      .filter({ anon_session_id }, '-created_date', 1)
      .catch(() => []);
    if (Array.isArray(priorClaims) && priorClaims[0]) {
      const prior = priorClaims[0];
      const priorOwner = normalizeEmail(prior.created_by);
      if (priorOwner && priorOwner !== userEmail) {
        // Another tenant already claimed this session — never steal it.
        return Response.json({ ok: false, error: 'already_claimed' }, { status: 409 });
      }
      // Already yours — idempotent no-op, return the existing row.
      return Response.json({
        ok: true,
        claimed: false,
        analyzer_result_id: prior.id,
        brand_id: prior.brand_id || null,
      });
    }

    // ── Read the ownerless anonymous session (service role — condición #2) ─
    // This is the ONLY service-role read. Everything written below is
    // user-scoped so RLS binds it to the caller.
    const sessions = await base44.asServiceRole.entities.PaymentsAnalysisSession
      .filter({ anon_session_id }, '-created_date', 1)
      .catch(() => []);
    if (!Array.isArray(sessions) || !sessions[0]) {
      // Graceful degradation (matiz #3) — expired/purged session. HTTP 200,
      // caller sends the user to the clean Dashboard empty state.
      return Response.json({ ok: false, error: 'session_not_found' });
    }
    const session = sessions[0];
    const engineResult = session.engine_result || null;
    const engineVersion = session.engine_version || engineResult?.engine_version || null;
    const snapshot = session.input_snapshot || {};

    if (!engineResult || engineResult.ok !== true) {
      // Session exists but its engine_result is unusable — treat as not-found
      // rather than materialize a broken report.
      return Response.json({ ok: false, error: 'session_not_found' });
    }

    // ── Resolve or create the user's Brand (contact_email pivot) ──────────
    // Same source of truth as getMyActiveBrand — contact_email === user.email.
    // We read with the USER-scoped client so RLS applies.
    //
    // CONCURRENCY — Brand policy (Xavi 2026-07-13): NEVER DELETE a Brand in the
    // claim path. A Brand can be referenced (brand_id on AnalyzerResult and
    // other entities), so deleting a duplicate risks dangling references — the
    // risk of deleting outweighs a dead row. Instead:
    //   1. Resolve/dedup the Brand BEFORE creating the AnalyzerResult, and
    //      always point the report at the WINNER (oldest by created_date, then
    //      id) so we never create a report aimed at a Brand we'd later purge.
    //   2. If a residual race left ≥2 Brands, keep the deterministic winner and
    //      leave the duplicate ORPHANED for an offline purge (logged, not
    //      deleted here). Zero DELETE on Brand in this path.
    const pickWinner = (rows: any[]) => {
      // Deterministic: oldest created_date, tie-break by id ascending. Two
      // concurrent requests reading the same set AGREE on the winner.
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
      });
      // Re-read after create — if a concurrent claim also created one, this
      // returns ≥2 rows and pickWinner deterministically resolves to the same
      // Brand for both requests. The loser's created row is left orphaned
      // (never deleted — see Brand policy above).
      const afterCreate = await base44.entities.Brand
        .filter({ contact_email: userEmail }, '-created_date', 20)
        .catch(() => []);
      brand = (Array.isArray(afterCreate) && afterCreate.length > 0)
        ? pickWinner(afterCreate)
        : null;
      if (Array.isArray(afterCreate) && afterCreate.length > 1) {
        console.warn('claimPaymentsAnalysisSession: residual duplicate Brand for', userEmail, '— left orphaned for offline purge. count=', afterCreate.length);
      }
    }
    if (!brand?.id) {
      return Response.json({ ok: false, error: 'brand_resolution_failed' }, { status: 500 });
    }

    // ── Materialize the AnalyzerResult (COPY, no recompute — condición #1) ─
    // Numbers copied verbatim from the session's engine_result:
    //   • total_savings / payment_savings = annual_savings_eur.point (the
    //     median the user already saw inside the range).
    //   • details.savings_range = {lo, point, hi} so Results renders the SAME
    //     rango (matiz #1 — el número no se mueve a ojos del usuario).
    //   • assumptions + full engine_result + engine_version preserved intact.
    // Written USER-scoped (NOT asServiceRole) so created_by === user.email and
    // the entity's own RLS grants read to exactly this user (condición #4).
    const range = readAnnualRange(engineResult);
    const created = await base44.entities.AnalyzerResult.create({
      brand_id: brand.id,
      anon_session_id,
      was_anonymous: true,                         // sticky origin flag (condición #2)
      verification_status: 'estimated',            // NEVER "verified" (condición #2)
      savings_model_version: engineVersion || undefined,
      score_engine_version: engineVersion || undefined,
      // Dashboard reads these two as the headline figure.
      total_savings: range.point,
      payment_savings: range.point,
      assumptions: Array.isArray(engineResult.assumptions) ? engineResult.assumptions : [],
      methodology: 'Materialized from anonymous payments analysis (estimated). Connect your PSP to verify.',
      confidence_level: 'medium',
      benchmark_source: 'provider_published',
      details: {
        // The RANGE the teaser showed — Results must render this unchanged.
        savings_range: range,
        // Full engine output preserved verbatim so nothing is lost and the
        // Results page can rebuild the exact same view without recomputing.
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

    // ── CONCURRENCY — AnalyzerResult create-then-verify (Xavi 2026-07-13) ──
    // Base44 has no unique constraints, so the check-then-create above can let
    // two truly-simultaneous requests both pass the "no prior claim" check and
    // both create. Safety net (client-side once-guard is the PRIMARY defense):
    // re-read by anon_session_id and, if a duplicate exists, DELETE ONLY our
    // own strictly-non-winner row.
    //
    // Determinism + safety rules (exactly as sealed):
    //   • Winner = oldest by (created_date, then id) — both requests agree.
    //   • Delete ONLY if: the winner is PRESENT in our re-read (never delete on
    //     a stale read that sees only our own row → prefer a temporary
    //     duplicate over reaching ZERO rows), AND the row we delete is
    //     STRICTLY non-winner, is OURS (created_by === user.email), and is
    //     targeted by explicit id. NEVER deleteMany.
    //   • An AnalyzerResult just created has no inbound references → safe to
    //     delete (unlike Brand).
    let winnerId = created.id;
    try {
      const dupes = await base44.asServiceRole.entities.AnalyzerResult
        .filter({ anon_session_id }, '-created_date', 20)
        .catch(() => []);
      if (Array.isArray(dupes) && dupes.length > 1) {
        const winner = pickWinner(dupes);
        winnerId = winner?.id || created.id;
        // Only clean up when the WINNER is present in this read (guards against
        // a stale read that would otherwise let us delete our only row).
        const winnerPresent = dupes.some((r: any) => r.id === winnerId);
        if (winnerPresent && created.id !== winnerId) {
          // Our row is a strict loser — delete OURS, by explicit id, only if
          // it's genuinely ours. User-scoped delete so RLS double-checks.
          const mine = normalizeEmail(created.created_by) === userEmail;
          if (mine) {
            await base44.entities.AnalyzerResult.delete(created.id).catch(() => { /* already gone — fine */ });
          }
        }
      }
    } catch (e) {
      // Verification is best-effort — a failure here at worst leaves a
      // temporary duplicate (never zero rows, never a wrong-owner delete).
      console.warn('claimPaymentsAnalysisSession: dedup verify skipped:', (e as any)?.message);
    }

    return Response.json({
      ok: true,
      claimed: true,
      analyzer_result_id: winnerId,
      brand_id: brand.id,
    });
  } catch (error) {
    console.error('claimPaymentsAnalysisSession:', (error as any)?.message, (error as any)?.stack);
    return Response.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
});