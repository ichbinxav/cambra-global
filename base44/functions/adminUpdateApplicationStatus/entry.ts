import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const ALLOWED_STATUSES = [
  'submitted', 'in_review', 'provider_contacted', 'offer_ready', 'activated', 'rejected', 'closed'
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: Admin only' }, { status: 403 });

    const body = await req.json();
    const { id, status, reason } = body || {};
    if (!id || !status) return Response.json({ error: 'Missing id or status' }, { status: 400 });
    if (!ALLOWED_STATUSES.includes(status)) return Response.json({ error: 'Invalid status' }, { status: 400 });

    const apps = await base44.entities.DealApplication.filter({ id });
    if (!apps.length) return Response.json({ error: 'Application not found' }, { status: 404 });

    const updated = await base44.entities.DealApplication.update(id, { status });

    // Log
    try {
      await base44.entities.OperationalLog.create({
        deal_activation_id: null,
        brand_id: null,
        provider_id: null,
        event_type: 'status_changed',
        message: `Application ${id} → ${status}${reason ? ' — ' + reason : ''}`,
        data_json: { id, status },
        actor_email: user.email,
        created_at: new Date().toISOString(),
      });
    } catch (_) {}

    return Response.json({ ok: true, application: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});