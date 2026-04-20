import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

function assert(v,m){ if(!v) throw new Error(m); }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    assert(me, 'Unauthorized');

    const { taskId, nextStatus } = await req.json().catch(()=>({}));
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

    const allowed = new Set(['pending','in_progress','done']);
    assert(allowed.has(nextStatus), 'Invalid status');

    const updated = await base44.entities.MigrationTask.update(taskId, { status: nextStatus, updated_at: new Date().toISOString() });

    if (nextStatus !== 'pending') {
      const sibling = await base44.entities.MigrationTask.filter({ deal_activation_id: activation.id });
      const allDone = sibling.every(t => (t.id === taskId ? nextStatus : t.status) === 'done');
      await base44.entities.DealActivation.update(activation.id, { status: allDone ? 'live' : 'migrating', last_updated: new Date().toISOString() });
    }

    return Response.json({ ok: true, task: updated, activation_id: activation.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
});