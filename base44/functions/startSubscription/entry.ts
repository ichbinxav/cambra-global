import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal, quarantineProbe } from '../../shared/internalGate.ts';

// [QUARANTINE 2026-08-15] PURGE-2 (2026-07-24): orphan, but Subscription holds 2 rows — kept with probe.
Deno.serve(async (req) => {
  await quarantineProbe(createClientFromRequest(req), "startSubscription");
  try {
    const base44 = createClientFromRequest(req);
    // SECURITY-2 (2026-07-24) — quarantined + mutating: canonical admin gate
    // in front of the original logic. Quarantine no longer means "open".
    // Restore the plain user gate only if the subscription flow ever revives.
    const gate = await requireAdminOrInternal(req, base44, null);
    if (!gate.ok) return gate.response;
    const user = gate.user;
    if (!user) return Response.json({ error: 'user context required' }, { status: 400 });

    // If already active, just return success
    const existing = await base44.entities.Subscription.filter({ user_email: user.email, status: 'active' }, '-created_date', 1);
    if (existing.length) {
      return Response.json({ status: 'already_active' });
    }

    // Count current lifetime_free actives
    const allFree = await base44.asServiceRole.entities.Subscription.filter({ plan: 'lifetime_free', status: 'active' }, '-created_date', 1000);
    const freeCount = allFree.length;

    if (freeCount < 500) {
      const rec = await base44.entities.Subscription.create({
        user_email: user.email,
        status: 'active',
        plan: 'lifetime_free',
        is_free_early_bird: true,
        started_at: new Date().toISOString()
      });
      return Response.json({ status: 'activated_free', subscription: rec });
    }

    // No free seats left — signal checkout required (Stripe to be wired)
    return Response.json({ status: 'requires_checkout', price: 60, currency: 'EUR', interval: 'month' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});