import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

function assert(c,m){ if(!c) throw new Error(m); }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    assert(me, 'Unauthorized');

    const { mandateId, dealActivationId, reason } = await req.json().catch(()=>({}));
    assert(mandateId || dealActivationId, 'mandateId or dealActivationId required');

    let mandate = null;
    if (mandateId) {
      const ms = await base44.entities.Mandate.filter({ id: mandateId });
      mandate = ms?.[0] || null;
    } else {
      const ms = await base44.entities.Mandate.filter({ deal_activation_id: dealActivationId, status: 'active' }, '-created_date', 1);
      mandate = ms?.[0] || null;
    }
    assert(mandate, 'Mandate not found');

    const acts = await base44.entities.DealActivation.filter({ id: mandate.deal_activation_id });
    const activation = acts?.[0];
    assert(activation, 'Activation not found');

    const allowed = me.role === 'admin' || activation.user_email === me.email;
    assert(allowed, 'Forbidden');

    await base44.entities.Mandate.update(mandate.id, {
      status: 'revoked',
      revoked_at: new Date().toISOString(),
      revoked_by: me.email,
      revocation_reason: reason || 'revoked'
    });

    // Activation consequence
    const next = ['migrating','live'].includes(activation.status) ? 'paused' : 'awaiting_authorization';
    await base44.entities.DealActivation.update(activation.id, { status: next, last_updated: new Date().toISOString() });

    await base44.entities.OperationalLog.create({
      deal_activation_id: activation.id,
      brand_id: activation.brand_id || '',
      provider_id: activation.provider_id || '',
      event_type: 'mandate_revoked',
      message: 'Mandate revoked',
      data_json: { reason },
      actor_email: me.email,
      created_at: new Date().toISOString()
    });

    return Response.json({ ok: true, activation_status: next });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
});