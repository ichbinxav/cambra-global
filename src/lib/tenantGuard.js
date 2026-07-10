// tenantGuard — mirror of the pure helpers in base44/functions/_tenantGuard/entry.ts.
// This file is the LOCAL testable copy of the ownership logic. Keeping the
// bytes identical to the Deno copy is the same discipline we use for the
// paymentsGap engine (SYNC-START/END markers). If you edit one, edit the
// other and re-run the tests.
//
// Rationale for duplication: Base44 backend functions live in Deno (separate
// runtime) and cannot be imported from src/. Rather than adding a build step,
// we keep the pure logic verbatim in both places and enforce parity via tests.

// SYNC-START: tenantGuardPure
export function normalizeEmail(email) {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

export function checkOwnership(user, brand) {
  if (!user || !user.email) return { ok: false, reason: 'no_user' };
  if (!brand || !brand.created_by) return { ok: false, reason: 'no_brand' };
  const userEmail = normalizeEmail(user.email);
  const ownerEmail = normalizeEmail(brand.created_by);
  if (userEmail !== ownerEmail) return { ok: false, reason: 'not_owner' };
  return { ok: true, owner_email: ownerEmail };
}
// SYNC-END: tenantGuardPure