import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { event, data, old_data } = body || {};

    if (!event || event.entity_name !== 'DealActivation' || event.type !== 'update') {
      return Response.json({ ok: true, skipped: 'not DealActivation update' });
    }

    // Enforce: cannot move to "authorized" without an active mandate
    if (data?.status === 'authorized') {
      const mandates = await base44.asServiceRole.entities.Mandate.filter({ deal_id: data.id, status: 'active' }, '-created_date', 1);
      const hasMandate = mandates.length > 0;
      if (!hasMandate) {
        // Revert status
        const prev = old_data?.status || 'activated';
        await base44.asServiceRole.entities.DealActivation.update(data.id, { status: prev, last_updated: new Date().toISOString() });
        await base44.asServiceRole.entities.AuthorizationLog.create({
          company_id: data.brand_id || '',
          deal_id: data.id,
          action_type: 'status_reverted',
          description: 'Attempted authorization without mandate — reverted',
          approved_by: data.user_email || '',
          approved_at: new Date().toISOString(),
          source: 'automation',
          document_version: 'v1'
        });
        return Response.json({ ok: true, reverted: true });
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});