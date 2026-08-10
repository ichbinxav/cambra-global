import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

/**
 * FASE 2 (Opción B) — Creates a fresh self-test brand under the CALLER's identity.
 *
 * Why this function exists:
 * Base44 marks `created_by` / `created_by_id` as read-only system fields.
 * `service_role.entities.Brand.update()` cannot reassign ownership — the
 * update succeeds but silently drops those fields. Same for `.create()`
 * with those fields specified.
 *
 * The ONLY way to make a Brand row that belongs to user X is to call
 * `.create()` from a client that authenticated as X. That's what
 * `createClientFromRequest(req)` gives us here — as long as the invoker
 * of this function is authenticated as xavi, the new Brand.created_by_id
 * will be xavi.id.
 *
 * This function is idempotent-ish: if the caller already has a brand
 * named "CAMBRA (self-test)" it returns the existing one instead of
 * creating a duplicate. `is_demo: true` marks it clearly as test data.
 *
 * Not admin-gated on the entity write itself (any authed user can create
 * their own brand), but we check admin here anyway to keep this dev-only
 * harness away from regular users.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    // If caller already has a self-test brand, reuse it (idempotency).
    const existing = await base44.entities.Brand.filter({
      name: 'CAMBRA (self-test)',
      created_by_id: user.id,
    }, '-created_date', 1).catch(() => []);
    if (existing.length > 0) {
      return Response.json({
        ok: true,
        reused: true,
        brand_id: existing[0].id,
        created_by_id: existing[0].created_by_id,
        created_by: existing[0].created_by,
      });
    }

    // Cosmetic fields cloned from the deprecated brand (documented values).
    const newBrand = await base44.entities.Brand.create({
      name: 'CAMBRA (self-test)',
      country: 'FR',
      category: 'other',
      is_demo: true,
      bio: 'Test-mode validation brand — reads Stripe test dataset via static_secret bypass to validate normalizer & sum arithmetic.',
      contact_name: 'CAMBRA infrastructure (test-mode validation)',
      contact_email: user.email,
      onboarding_complete: true,
    });

    return Response.json({
      ok: true,
      reused: false,
      brand_id: newBrand.id,
      created_by_id: newBrand.created_by_id,
      created_by: newBrand.created_by,
      name: newBrand.name,
      is_demo: newBrand.is_demo,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});