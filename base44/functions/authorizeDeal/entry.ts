import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

function assert(v, m){ if(!v) throw new Error(m); }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    assert(me, 'Unauthorized');

    const body = await req.json().catch(()=>({}));
    const { dealActivationId, consents, signer, signed_document_uri } = body || {};
    assert(dealActivationId, 'dealActivationId required');
    assert(consents && typeof consents === 'object', 'consents required');
    assert(signer && signer.name && signer.email && signer.role && signer.entity, 'signer incomplete');

    const acts = await base44.entities.DealActivation.filter({ id: dealActivationId });
    const activation = acts?.[0];
    assert(activation, 'Activation not found');

    const isOwner = activation.user_email === me.email;
    const amAdmin = me.role === 'admin';
    assert(isOwner || amAdmin, 'Forbidden');

    await base44.entities.Mandate.create({
      deal_activation_id: dealActivationId,
      brand_id: activation.brand_id || '',
      provider_id: activation.provider_id || '',
      catalog_deal_id: activation.catalog_deal_id || '',
      scope_type: 'deal_specific',
      vertical: activation.vertical,
      authorized_actions_json: consents,
      signed_by_name: signer.name,
      signed_by_email: signer.email,
      signed_by_role: signer.role,
      signed_at: new Date().toISOString(),
      ip_address: 'client',
      document_version: 'v1',
      status: 'active',
      signed_document_url: signed_document_uri || ''
    });

    const from = activation.status;
    if (from === 'activated') {
      await base44.entities.DealActivation.update(dealActivationId, { status: 'awaiting_authorization', last_updated: new Date().toISOString() });
    }
    await base44.entities.DealActivation.update(dealActivationId, { status: 'authorized', last_updated: new Date().toISOString() });

    const flows = activation.vertical === 'payments' ? ['mandate_signed','provider_setup','pricing_confirmed','integration','go_live']
      : activation.vertical === 'shipping' ? ['account_created','rate_configuration','label_setup','go_live']
      : ['audit_completed','tools_cancelled','tools_migrated','savings_confirmed'];

    await base44.entities.MigrationTask.bulkCreate(flows.map((name, idx) => ({
      deal_activation_id: dealActivationId,
      brand_id: activation.brand_id || '',
      provider_id: activation.provider_id || '',
      step_name: name,
      task_type: name,
      status: name === 'mandate_signed' ? 'done' : 'pending',
      order: idx + 1
    })));

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
});