import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

function assert(v,m){ if(!v) throw new Error(m); }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    assert(me, 'Unauthorized');
    assert(me.role==='admin', 'Forbidden');

    const { activation_id } = await req.json().catch(()=>({}));
    assert(activation_id, 'activation_id required');

    const [act] = await base44.asServiceRole.entities.DealActivation.filter({ id: activation_id });
    assert(act, 'Activation not found');

    const existing = await base44.asServiceRole.entities.MigrationTask.filter({ deal_activation_id: activation_id });
    if (existing.length) return Response.json({ ok:true, skipped: 'already_has_tasks', count: existing.length });

    const templates = (() => {
      if (act.vertical === 'payments') return [
        { step: 'mandate_signed', desc: 'Mandato firmado', owner: 'admin', done: true },
        { step: 'provider_contacted', desc: 'Contacto con PSP', owner: 'admin' },
        { step: 'pricing_confirmed', desc: 'Pricing confirmado', owner: 'provider', requires_provider_input: true, requires_admin_review: true },
        { step: 'configuration', desc: 'Configuración técnica', owner: 'brand', requires_brand_input: true },
        { step: 'testing', desc: 'Pruebas', owner: 'brand', requires_brand_input: true },
        { step: 'go_live', desc: 'Go-live', owner: 'admin' }
      ];
      if (act.vertical === 'shipping') return [
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

    await base44.asServiceRole.entities.MigrationTask.bulkCreate(templates.map((t, idx) => ({
      deal_activation_id: activation_id,
      brand_id: act.brand_id || '',
      provider_id: act.provider_id || '',
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

    return Response.json({ ok:true, generated: templates.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
});