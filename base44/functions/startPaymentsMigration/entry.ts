// P9 — Recover Fulfilment & Migration Operations.
// Idempotently turns an authorized payments Recover into an operational migration.
// The merchant has already mandated CAMBRA to act: standard tasks are owned by
// CAMBRA/provider, not pushed back to the merchant.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireUserOrInternal } from '../../shared/internalGate.ts';

const PLAN_VERSION = 'payments-recover-p9-v1';
const PLAN = [
  // key, title, description, owner, customer stage, SLA days
  ['takeover','CAMBRA takes over','We open the migration case, lock scope and assign operational ownership.','admin','preparing',1],
  ['provider_coordination','Provider coordination','CAMBRA coordinates commercial onboarding and required provider documentation.','admin','provider_coordination',2],
  ['provider_ready','Provider ready','The target PSP account, pricing and payment capabilities are confirmed.','provider','provider_coordination',5],
  ['technical_configuration','Payment configuration','CAMBRA prepares the payment configuration and integration changes required for cutover.','admin','provider_coordination',3],
  ['migration_testing','Migration testing','CAMBRA validates payment, 3DS, refund, webhook and reconciliation flows before live traffic moves.','admin','scheduled',2],
  ['cutover_ready','Cutover ready','CAMBRA confirms rollback, timing and all go-live prerequisites.','admin','scheduled',1],
  ['go_live','Going live','CAMBRA moves the approved payment scope to the new provider or conditions.','admin','going_live',1],
  ['verify_savings','Verify savings','CAMBRA observes live payment data against the locked baseline before savings become billable.','admin','verifying',35],
];
function dueIn(days:number){ const d=new Date(); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); }

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    // Accept the authenticated merchant/admin path AND the canonical internal
    // secret used by acceptRecoverMandate's fire-and-forget handoff. Without
    // this, the automatic takeover could silently fail when no user session is
    // propagated through the service-role function invocation.
    const gate = await requireUserOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;
    const me = gate.user;
    const activationId = String(body?.deal_activation_id || '');
    if (!activationId) return Response.json({ error: 'deal_activation_id required' }, { status: 400 });

    const svc = base44.asServiceRole;
    const rows = await svc.entities.DealActivation.filter({ id: activationId }, '-created_date', 1).catch(() => []);
    const activation:any = rows?.[0];
    if (!activation) return Response.json({ error: 'activation_not_found' }, { status: 404 });
    const isOwner = !!me && String(activation.user_email || '').toLowerCase() === String(me.email || '').toLowerCase();
    if (!gate.isInternal && !isOwner && me?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    if (activation.vertical !== 'payments') return Response.json({ error: 'payments_only' }, { status: 409 });
    if (!['authorized','migrating','live','monetizing'].includes(activation.status)) {
      return Response.json({ error: 'activation_not_ready', status: activation.status }, { status: 409 });
    }

    const mandates = await svc.entities.Mandate.filter({ deal_activation_id: activationId, status: 'active' }, '-created_date', 1).catch(() => []);
    if (!mandates.length) return Response.json({ error: 'active_mandate_required' }, { status: 409 });

    let tasks:any[] = await svc.entities.MigrationTask.filter({ deal_activation_id: activationId }, 'order', 100).catch(() => []);
    let p9Tasks = tasks.filter(t => t?.metadata_json?.plan_version === PLAN_VERSION);
    if (!p9Tasks.length) {
      // Preserve legacy task history but remove it from active operations. P9 is
      // the canonical plan from this point forward; we never silently delete evidence.
      for (const legacy of tasks.filter(t => !['done','canceled'].includes(t.status))) {
        await svc.entities.MigrationTask.update(legacy.id, { status: 'canceled', updated_at: new Date().toISOString(), metadata_json: { ...(legacy.metadata_json || {}), superseded_by_plan: PLAN_VERSION } }).catch(() => null);
      }
      await svc.entities.MigrationTask.bulkCreate(PLAN.map((p:any[], idx:number) => ({
        deal_activation_id: activationId,
        brand_id: activation.brand_id || '',
        provider_id: activation.provider_id || '',
        task_type: p[0], step_name: p[0], description: p[2],
        status: idx === 0 ? 'done' : (idx === 1 ? 'in_progress' : 'pending'),
        order: idx + 1, owner_type: p[3],
        requires_provider_input: p[3] === 'provider',
        requires_brand_input: false,
        requires_admin_review: p[3] === 'admin',
        completed_at: idx === 0 ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString(),
        due_date: idx === 1 ? dueIn(Number(p[5] || 3)) : undefined,
        metadata_json: { plan_version: PLAN_VERSION, customer_stage: p[4], customer_visible: true, sla_days: Number(p[5] || 3), retry_count: 0 },
      })));
      tasks = await svc.entities.MigrationTask.filter({ deal_activation_id: activationId }, 'order', 100).catch(() => []);
      p9Tasks = tasks.filter(t => t?.metadata_json?.plan_version === PLAN_VERSION);
      // Base44 has no transaction/unique constraint here. Collapse a concurrent
      // double-start deterministically: earliest task per step wins, later rows
      // are retained as canceled audit evidence rather than silently deleted.
      for (const step of PLAN.map((p:any[]) => p[0])) {
        const same = p9Tasks.filter(t => t.step_name === step).sort((a,b) => String(a.created_date || a.id).localeCompare(String(b.created_date || b.id)));
        for (const duplicate of same.slice(1)) {
          if (duplicate.status !== 'canceled') {
            await svc.entities.MigrationTask.update(duplicate.id, {
              status: 'canceled', updated_at: new Date().toISOString(),
              metadata_json: { ...(duplicate.metadata_json || {}), duplicate_of: same[0]?.id || null, duplicate_collapsed: true },
            }).catch(() => null);
          }
        }
      }
      tasks = await svc.entities.MigrationTask.filter({ deal_activation_id: activationId }, 'order', 100).catch(() => []);
      p9Tasks = tasks.filter(t => t?.metadata_json?.plan_version === PLAN_VERSION && t.status !== 'canceled');
      await svc.entities.OperationalLog.create({
        deal_activation_id: activationId, brand_id: activation.brand_id || '', provider_id: activation.provider_id || '',
        event_type: 'tasks_generated', message: 'P9 payments migration orchestration started',
        data_json: { plan_version: PLAN_VERSION, task_count: PLAN.length }, actor_email: me?.email || (gate.isInternal ? 'internal' : 'system'), created_at: new Date().toISOString(),
      }).catch(() => null);
    }

    if (activation.status === 'authorized') {
      await svc.entities.DealActivation.update(activationId, { status: 'migrating', last_updated: new Date().toISOString() });
      await svc.entities.OperationalLog.create({
        deal_activation_id: activationId, brand_id: activation.brand_id || '', provider_id: activation.provider_id || '',
        event_type: 'status_changed', message: 'Recover fulfilment started: authorized → migrating',
        data_json: { from: 'authorized', to: 'migrating', plan_version: PLAN_VERSION }, actor_email: me?.email || (gate.isInternal ? 'internal' : 'system'), created_at: new Date().toISOString(),
      }).catch(() => null);
    }

    return Response.json({ ok: true, activation_id: activationId, status: activation.status === 'authorized' ? 'migrating' : activation.status, task_count: p9Tasks.length, plan_version: PLAN_VERSION });
  } catch (error) {
    console.error('startPaymentsMigration failed', error);
    return Response.json({ error: 'migration_start_failed' }, { status: 500 });
  }
}
