// _tenantGuard — the ONE place in the codebase where "does this user own this
// brand?" is resolved. Every backend function that reads or writes per-brand
// data on behalf of an authenticated user MUST call resolveOwnedBrandOrFail
// before touching data. Never re-implement this check per-function.
//
// Why this exists (M3-Chunk 2, 2026-07-10):
//   Base44 RLS cannot join across entities (verified against docs.base44.com).
//   Base44 SDK forces created_by to the service account on every
//   asServiceRole.create() (verified empirically — see Decision_Log).
//   Consequence: RLS by created_by is inert for any entity whose writes go
//   through service role — the "owner match" clause never fires.
//
// Mitigation:
//   1. Entities that store per-brand verified data (PaymentsAnalysisVerified
//      today, others as they land) denormalize owner_email onto the row.
//      Their RLS reads become "admin OR data.owner_email == {{user.email}}".
//   2. This helper is the SINGLE, AUDITABLE gate that resolves the (user,
//      brand_id) pair to that owner_email or throws. Every write must fill
//      the row's owner_email with the value returned here.
//
// This file is a Deno backend function AS WELL AS a shared module: it exposes
// its helpers via base44.functions.invoke('_tenantGuard', { op, ... }) for
// backend-to-backend use, and the same logic can be inlined verbatim into any
// function that needs the check with zero HTTP hop. Prefer inlining for
// hot-path writes; use the invoke path only for one-off admin tools.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// ── Pure helpers (no I/O, testable in isolation) ─────────────────────────

/**
 * Normalizes an email for equality comparison. Lowercase + trim.
 * Base44 stores user.email as the canonical form; brand.created_by may have
 * casing drift if it was ever written through a non-standard path.
 */
export function normalizeEmail(email: string | null | undefined): string {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/**
 * Pure ownership check. Given a user record and a brand record, returns
 * { ok: true, owner_email } if the user owns the brand, or { ok: false,
 * reason } otherwise. No side effects — safe to unit-test.
 */
export function checkOwnership(user: { email?: string } | null, brand: { created_by?: string } | null): { ok: true; owner_email: string } | { ok: false; reason: string } {
  if (!user || !user.email) return { ok: false, reason: 'no_user' };
  if (!brand || !brand.created_by) return { ok: false, reason: 'no_brand' };
  const userEmail = normalizeEmail(user.email);
  const ownerEmail = normalizeEmail(brand.created_by);
  if (userEmail !== ownerEmail) return { ok: false, reason: 'not_owner' };
  return { ok: true, owner_email: ownerEmail };
}

// ── HTTP entry point ─────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { op, brand_id } = body || {};

    if (op !== 'resolveOwnedBrand') {
      return Response.json({ error: 'unknown_op' }, { status: 400 });
    }
    if (typeof brand_id !== 'string' || !brand_id) {
      return Response.json({ error: 'brand_id_required' }, { status: 400 });
    }

    // Admins can always resolve — but we still return the OWNER email of the
    // brand (not the admin's), because that's what needs to be written to
    // owner_email columns so real merchants can read their rows.
    const brand = await base44.asServiceRole.entities.Brand.get(brand_id).catch(() => null);
    if (!brand) return Response.json({ error: 'brand_not_found' }, { status: 404 });

    if (user.role === 'admin') {
      return Response.json({ ok: true, owner_email: normalizeEmail(brand.created_by), acting_as: 'admin' });
    }

    const check = checkOwnership(user, brand);
    if (!check.ok) {
      // 404 (not 403) — never leak "this brand exists but isn't yours" to a
      // non-owner. Same shape a truly-missing brand would return.
      return Response.json({ error: 'brand_not_found' }, { status: 404 });
    }
    return Response.json({ ok: true, owner_email: check.owner_email, acting_as: 'owner' });
  } catch (error) {
    console.error('_tenantGuard error:', error);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
});