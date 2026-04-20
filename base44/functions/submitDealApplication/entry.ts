import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { user_email, deal, current_user_deal_id, requested_status } = body || {};
    if (!deal?.id || !deal?.provider || !deal?.category || !deal?.title) {
      return Response.json({ error: 'Invalid deal payload' }, { status: 400 });
    }
    if (user.email !== user_email && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const email = user_email || user.email;

    // Upsert UserDeal safely
    let userDeal = null;
    if (current_user_deal_id) {
      userDeal = await base44.entities.UserDeal.update(current_user_deal_id, {
        status: requested_status || 'pending',
        estimated_savings: deal.estimated_savings ?? null,
        is_real_savings: false,
      });
    } else {
      const existing = await base44.entities.UserDeal.filter({ user_email: email, deal_id: deal.id }, '-created_date', 1);
      if (existing?.length) {
        userDeal = await base44.entities.UserDeal.update(existing[0].id, {
          status: requested_status || 'pending',
          estimated_savings: deal.estimated_savings ?? null,
          is_real_savings: false,
        });
      } else {
        userDeal = await base44.entities.UserDeal.create({
          user_email: email,
          deal_id: deal.id,
          deal_name: deal.title,
          provider: deal.provider,
          category: deal.category,
          status: requested_status || 'pending',
          estimated_savings: deal.estimated_savings ?? null,
          is_real_savings: false,
        });
      }
    }

    // Ensure DealApplication exists
    const existingApps = await base44.entities.DealApplication.filter({ user_email: email, deal_id: deal.id }, '-created_date', 1);
    let application = existingApps?.[0] || null;
    if (!application) {
      application = await base44.entities.DealApplication.create({
        user_email: email,
        deal_id: deal.id,
        deal_name: deal.title,
        provider: deal.provider,
        category: deal.category,
        deal_mode: deal.mode,
        status: 'submitted',
        estimated_savings: deal.estimated_savings ?? null,
        activity_log: [{ date: new Date().toISOString(), action: 'Application submitted by user', by: email }],
      });
    }

    // Log operational event (best-effort)
    try {
      await base44.entities.OperationalLog.create({
        deal_activation_id: null,
        brand_id: null,
        provider_id: null,
        event_type: 'activation_created',
        message: `Deal application submitted for ${deal.provider}`,
        data_json: { deal_id: deal.id, user_email: email, requested_status: requested_status || 'pending' },
        actor_email: email,
        created_at: new Date().toISOString(),
      });
    } catch (_) {}

    return Response.json({ ok: true, userDeal, application });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});