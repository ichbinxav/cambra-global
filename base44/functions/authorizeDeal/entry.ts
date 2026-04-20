import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

function assert(v,m){ if(!v) throw new Error(m); }

function parseClientIp(req) {
  const xf = req.headers.get('x-forwarded-for') || '';
  return xf.split(',')[0].trim() || 'unknown';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    assert(me, 'Unauthorized');

    const body = await req.json().catch(()=>({}));
    const { dealActivationId, consents, signer, signed_document_uri, document_version } = body || {};
    assert(dealActivationId, 'dealActivationId required');
    assert(consents && typeof consents === 'object', 'consents required');
    assert(signer && signer.name && signer.email && signer.role && signer.entity, 'signer incomplete');

    const acts = await base44.entities.DealActivation.filter({ id: dealActivationId });
    const activation = acts?.[0];
    assert(activation, 'Activation not found');

    const isOwner = activation.user_email === me.email;
    const amAdmin = me.role === 'admin';
    assert(isOwner || amAdmin, 'Forbidden');

    // Idempotency: reuse existing active mandate
    let mandate = (await base44.entities.Mandate.filter({ deal_activation_id: dealActivationId, status: 'active' }, '-created_date', 1))?.[0] || null;
    const ip = parseClientIp(req);
    const ua = req.headers.get('user-agent') || 'unknown';

    if (!mandate) {
      mandate = await base44.entities.Mandate.create({
        deal_activation_id: dealActivationId,
        brand_id: activation.brand_id || '',
        provider_id: activation.provider_id || '',
        catalog_deal_id: activation.catalog_deal_id || '',
        scope_type: 'deal_specific',
        vertical: activation.vertical,
        authorized_actions_json: consents,
        legal_entity_name: signer.entity,
        signed_by_name: signer.name,
        signed_by_email: signer.email,
        signed_by_role: signer.role,
        signed_at: new Date().toISOString(),
        ip_address: ip,
        user_agent: ua,
        document_version: document_version || 'v1',
        status: 'active',
        signed_document_url: signed_document_uri || ''
      });
    }

    // Only authorized if mandate active and fields present
    assert(mandate && mandate.status === 'active', 'Mandate invalid');

    const fromStatus = activation.status;
    const nextStatus = 'authorized';
    await base44.entities.DealActivation.update(dealActivationId, { status: nextStatus, last_updated: new Date().toISOString() });

    // Generate migration tasks by vertical (controlled template)
    const templates = (() => {
      if (activation.vertical === 'payments') return [
        { step: 'mandate_signed', desc: 'Mandato firmado', owner: 'admin', done: true },
        { step: 'provider_contacted', desc: 'Contacto con PSP', owner: 'admin' },
        { step: 'pricing_confirmed', desc: 'Pricing confirmado', owner: 'provider', requires_provider_input: true, requires_admin_review: true },
        { step: 'configuration', desc: 'Configuración técnica', owner: 'brand', requires_brand_input: true },
        { step: 'testing', desc: 'Pruebas', owner: 'brand', requires_brand_input: true },
        { step: 'go_live', desc: 'Go-live', owner: 'admin' }
      ];
      if (activation.vertical === 'shipping') return [
        { step: 'account_created', desc: 'Cuenta creada', owner: 'provider', requires_provider_input: true },
        { step: 'zone_rate_config', desc: 'Zonas y tarifas', owner: 'admin' },
        { step: 'label_config', desc: 'Etiquetas', owner: 'brand', requires_brand_input: true },
        { step: 'operational_testing', desc: 'Pruebas operativas', owner: 'brand', requires_brand_input: true },
        { step: 'go_live', desc: 'Go-live', owner: 'admin' }
      ];
      return [
        { step: 'audit_completed', desc: 'Auditoría completada', owner: 'admin' },
        { step: 'contract_review', desc: 'Revisión contractual', owner: 'admin' },
        { step: 'migration_setup', desc: 'Setup de migración', owner: 'brand', requires_brand_input: true },
        { step: 'license_verification', desc: 'Verificación de licencias', owner: 'provider', requires_provider_input: true },
        { step: 'go_live', desc: 'Go-live', owner: 'admin' }
      ];
    })();

    const existingTasks = await base44.entities.MigrationTask.filter({ deal_activation_id: dealActivationId });
    if (!existingTasks.length) {
      await base44.entities.MigrationTask.bulkCreate(templates.map((t, idx) => ({
        deal_activation_id: dealActivationId,
        brand_id: activation.brand_id || '',
        provider_id: activation.provider_id || '',
        task_type: t.step,
        step_name: t.step,
        description: t.desc,
        status: t.done ? 'done' : 'pending',
        order: idx + 1,
        owner_type: t.owner,
        requires_provider_input: !!t.requires_provider_input,
        requires_brand_input: !!t.requires_brand_input,
        requires_admin_review: !!t.requires_admin_review
      })));
      await base44.entities.OperationalLog.create({
        deal_activation_id: dealActivationId,
        brand_id: activation.brand_id || '',
        provider_id: activation.provider_id || '',
        event_type: 'tasks_generated',
        message: 'Tareas de migración generadas',
        data_json: { count: templates.length },
        actor_email: me.email,
        created_at: new Date().toISOString()
      });
    }

    await base44.entities.DealActivation.update(dealActivationId, { status: 'migrating', last_updated: new Date().toISOString() });

    await base44.entities.OperationalLog.create({
      deal_activation_id: dealActivationId,
      brand_id: activation.brand_id || '',
      provider_id: activation.provider_id || '',
      event_type: 'mandate_signed',
      message: 'Mandato firmado y activación autorizada',
      data_json: { mandate_id: mandate.id },
      actor_email: me.email,
      created_at: new Date().toISOString()
    });

    return Response.json({ ok: true, status: 'migrating' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
});