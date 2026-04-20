import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

function assert(v,m){ if(!v) throw new Error(m); }

function isAllowedTransition(from, to){
  const order = ['pending','in_progress','blocked','done','canceled'];
  if (!order.includes(to)) return false;
  if (from === 'canceled') return false;
  if (from === 'done') return to === 'blocked' ? false : false; // done is terminal
  return true; // simple allow, more rules below
}

async function canGoLive(base44, activationId){
  const [mandates, tasks] = await Promise.all([
    base44.entities.Mandate.filter({ deal_activation_id: activationId, status: 'active' }, '-created_date', 1),
    base44.entities.MigrationTask.filter({ deal_activation_id: activationId })
  ]);
  const hasMandate = mandates.length > 0;
  const noneBlocked = tasks.every(t => t.status !== 'blocked');
  const coreDone = tasks.filter(t => ['go_live'].includes(t.step_name)).every(t => t.status === 'done');
  return hasMandate && noneBlocked && coreDone;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    assert(me, 'Unauthorized');

    const { taskId, nextStatus, blocked_reason } = await req.json().catch(()=>({}));
    assert(taskId && nextStatus, 'taskId and nextStatus required');

    const tasks = await base44.entities.MigrationTask.filter({ id: taskId });
    const task = tasks?.[0];
    assert(task, 'Task not found');

    const acts = await base44.entities.DealActivation.filter({ id: task.deal_activation_id || task.deal_id });
    const activation = acts?.[0];
    assert(activation, 'Activation not found');

    const isOwner = activation.user_email === me.email;
    const amAdmin = me.role === 'admin';
    assert(isOwner || amAdmin, 'Forbidden');

    assert(isAllowedTransition(task.status, nextStatus), 'Invalid transition');

    const patch = { status: nextStatus, updated_at: new Date().toISOString() };
    if (nextStatus === 'done') patch.completed_at = new Date().toISOString();
    if (nextStatus === 'blocked') patch.blocked_reason = blocked_reason || 'blocked';

    const updated = await base44.entities.MigrationTask.update(taskId, patch);

    // Recalculate activation status
    let newStatus = activation.status;
    if (['in_progress','blocked'].includes(nextStatus)) newStatus = 'migrating';

    // Evaluate go-live
    if (await canGoLive(base44, activation.id)) newStatus = 'live';

    if (newStatus !== activation.status) {
      await base44.entities.DealActivation.update(activation.id, { status: newStatus, last_updated: new Date().toISOString() });
      await base44.entities.OperationalLog.create({
        deal_activation_id: activation.id,
        brand_id: activation.brand_id || '',
        provider_id: activation.provider_id || '',
        event_type: newStatus === 'live' ? 'go_live' : 'status_changed',
        message: `Activation moved to ${newStatus}`,
        data_json: { taskId, nextStatus },
        actor_email: me.email,
        created_at: new Date().toISOString()
      });
    } else {
      await base44.entities.OperationalLog.create({
        deal_activation_id: activation.id,
        brand_id: activation.brand_id || '',
        provider_id: activation.provider_id || '',
        event_type: 'task_updated',
        message: `Task ${task.step_name} -> ${nextStatus}`,
        data_json: { taskId },
        actor_email: me.email,
        created_at: new Date().toISOString()
      });
    }

    return Response.json({ ok: true, task: updated, activation_id: activation.id, activation_status: newStatus });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
});