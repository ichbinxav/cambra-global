import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const PAYMENT_PLAN = [
  { step_name: 'plan_ready', description: 'Migration plan prepared and reviewed by CAMBRA', owner_type: 'admin', requires_admin_review: true, customer_stage: 'plan' },
  { step_name: 'provider_setup', description: 'New payment provider account and commercial terms ready', owner_type: 'provider', requires_provider_input: true, customer_stage: 'prepare' },
  { step_name: 'technical_setup', description: 'Payment configuration and integration prepared', owner_type: 'admin', requires_admin_review: true, customer_stage: 'prepare' },
  { step_name: 'sandbox_testing', description: 'Test payment, 3DS, refund and webhook flows', owner_type: 'admin', requires_admin_review: true, customer_stage: 'test' },
  { step_name: 'merchant_approval', description: 'Merchant confirms the migration is ready to go live', owner_type: 'brand', requires_brand_input: true, customer_stage: 'approve' },
  { step_name: 'go_live', description: 'Move live payment traffic to the new conditions/provider', owner_type: 'admin', requires_admin_review: true, customer_stage: 'live' },
  { step_name: 'verify_savings', description: 'Verify the first live payment data and start savings measurement', owner_type: 'admin', requires_admin_review: true, customer_stage: 'verify' },
];

function stageFor(tasks:any[]) {
  const ordered = ['plan','prepare','test','approve','live','verify'];
  for (const stage of ordered) {
    const rows = tasks.filter((t:any) => t?.metadata_json?.customer_stage === stage);
    if (rows.length && !rows.every((t:any) => t.status === 'done')) return stage;
  }
  return tasks.length ? 'complete' : 'plan';
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const email = String(me.email || '').toLowerCase();
    const svc = base44.asServiceRole;

    const acts = await svc.entities.DealActivation.filter({ user_email: me.email }, '-created_date', 25).catch(() => []);
    const activation = (acts || []).find((a:any) => a.vertical === 'payments' && ['authorized','migrating','live','monetizing'].includes(a.status));
    if (!activation) return Response.json({ ok: true, migration: null });

    if (String(activation.user_email || '').toLowerCase() !== email) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    let tasks = await svc.entities.MigrationTask.filter({ deal_activation_id: activation.id }, 'order', 100).catch(() => []);
    if (!tasks.length) {
      await svc.entities.MigrationTask.bulkCreate(PAYMENT_PLAN.map((t, idx) => ({
        deal_activation_id: activation.id,
        brand_id: activation.brand_id || '',
        provider_id: activation.provider_id || '',
        task_type: t.step_name,
        step_name: t.step_name,
        description: t.description,
        status: idx === 0 ? 'done' : 'pending',
        order: idx + 1,
        owner_type: t.owner_type,
        requires_provider_input: !!t.requires_provider_input,
        requires_brand_input: !!t.requires_brand_input,
        requires_admin_review: !!t.requires_admin_review,
        completed_at: idx === 0 ? new Date().toISOString() : undefined,
        metadata_json: { customer_stage: t.customer_stage, plan_version: 'payments-migration-v1' },
      })));
      tasks = await svc.entities.MigrationTask.filter({ deal_activation_id: activation.id }, 'order', 100).catch(() => []);
      await svc.entities.OperationalLog.create({
        deal_activation_id: activation.id,
        brand_id: activation.brand_id || '',
        provider_id: activation.provider_id || '',
        event_type: 'migration_plan_created',
        message: 'Payments migration V1 plan created',
        data_json: { plan_version: 'payments-migration-v1', tasks: PAYMENT_PLAN.length },
        actor_email: email,
        created_at: new Date().toISOString(),
      }).catch(() => null);
    }

    const done = tasks.filter((t:any) => t.status === 'done').length;
    const blocked = tasks.filter((t:any) => t.status === 'blocked').length;
    const current_stage = stageFor(tasks);

    return Response.json({
      ok: true,
      migration: {
        activation_id: activation.id,
        status: activation.status,
        provider_from: activation.provider_from || '',
        provider_to: activation.provider_to || activation.provider || '',
        projected_savings_annual: Number(activation.projected_savings_annual || activation.estimated_savings_yearly || 0),
        payment_method_status: activation.payment_method_status || 'none',
        current_stage,
        progress_pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
        blocked_count: blocked,
        tasks: tasks.map((t:any) => ({
          id: t.id,
          step_name: t.step_name,
          description: t.description,
          status: t.status,
          order: t.order,
          owner_type: t.owner_type,
          requires_brand_input: !!t.requires_brand_input,
          blocked_reason: t.blocked_reason || '',
          customer_stage: t?.metadata_json?.customer_stage || '',
        })),
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
