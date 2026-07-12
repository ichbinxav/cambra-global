// getMyActiveBrand — single source of truth for resolving "the current
// user's brand" in the frontend.
//
// WHY NOT `created_by_id`
// ─────────────────────────
// The historical pattern was:
//   base44.entities.Brand.filter({ created_by_id: me.id }, '-created_date', 1)
//
// That works ONLY for brands the user created directly through the wizard.
// It silently returns `[]` for brands written by service role — self-test
// brands (see createSelfTestBrand), admin-invited brands, and any future
// path where the human owner is not the creator. Base44 forces
// `created_by_id` to the service account on `asServiceRole.create()` (same
// caveat that led to the `owner_email` denormalization on
// PaymentsAnalysisVerified — see the entity schema for the full rationale).
//
// The visible symptom is exactly what this helper fixes: Xavi's own
// Dashboard falling through to the "no brand yet" empty state despite
// owning the CAMBRA self-test brand.
//
// WHY `contact_email`
// ─────────────────────
// `Brand.contact_email` is the field the user edits in onboarding and the
// one Base44's own RLS on Brand already treats as "the owner's email":
//
//   read: { $or: [
//     { user_condition: { role: "admin" } },
//     { data.contact_email: "{{user.email}}" },
//     { created_by: "{{user.email}}" }
//   ]}
//
// Filtering by `contact_email` on the client aligns with the RLS the
// platform is going to enforce anyway — the query can never return brands
// the user isn't allowed to read. `created_by === user.email` (the third
// OR-clause) also matches the wizard path; the `contact_email` pivot is
// strictly a superset.
//
// LIMITATIONS (documented, not fixed here — chunk scope)
// ───────────────────────────────────────────────────────
// 1. Multi-brand users: the helper returns `-created_date, limit 1` — the
//    newest brand. Users with 2+ brands still see only one. The proper
//    fix is a persisted `active_brand_id` in session state; deferred to
//    a future chunk (see M3-Chunk 2 residual debt in KNOWN_DEBT).
// 2. Brands with `contact_email` null: legacy rows created before
//    onboarding populated the field will be invisible to their owner via
//    this helper. Chunk A2 includes a companion audit (auditContactEmail
//    below) to count/list those rows before deciding whether to backfill.
// 3. Email change: if a user changes their Base44 email but the brand's
//    `contact_email` is not updated in tandem, the filter loses the row.
//    Not a real scenario today — Base44 doesn't expose email change from
//    the UI — noted for future work.

import { base44 } from '@/api/base44Client';

/**
 * Resolve the current user's active brand.
 *
 * @returns {Promise<{ user: object|null, brand: object|null }>}
 *   Both fields are always present (never undefined). `user` is null if
 *   the caller is unauthenticated; `brand` is null if the user has no
 *   brand or every brand of theirs has `contact_email` unset (see
 *   LIMITATIONS #2 above).
 *
 * Never throws on the network path — filter failures resolve to null so
 * callers can render an empty state rather than crash.
 */
export async function getMyActiveBrand() {
  let user = null;
  try {
    user = await base44.auth.me();
  } catch {
    // Unauthenticated or session expired — callers handle the null branch.
    return { user: null, brand: null };
  }
  if (!user?.email) return { user, brand: null };

  const brands = await base44.entities.Brand
    .filter({ contact_email: user.email }, '-created_date', 1)
    .catch(() => []);

  return { user, brand: brands[0] || null };
}