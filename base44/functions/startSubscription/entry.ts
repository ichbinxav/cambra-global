import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

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