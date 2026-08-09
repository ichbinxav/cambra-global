// P9 admin operation: advance/block/retry a migration task with sequential and
// go-live/verification invariants. No merchant can mutate orchestration state.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const VALID = new Set(['pending','in_progress','blocked','done']);
const PLAN_VERSION = 'payments-recover-p9-v1';
const ALLOWED = {
  pending: new Set(['in_progress']),
  in_progress: new Set(['blocked','done']),
  blocked: new Set(['in_progress']),
  done: new Set(),
};

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (me.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const taskId = String(body?.task_id || '');
    const nextStatus = String(body?.status || '');
    const note = String(body?.note || '').trim();
    const merchantRequired = body?.merchant_required === true;
    const merchantMessage = body?.merchant_message_i18n && typeof body.merchant_message_i18n === 'object' ? body.merchant_message_i18n : null;
    const merchantMessageComplete = !!merchantMessage && ['en','fr','es'].every(lang => typeof merchantMessage?.[lang] === 'string' && merchantMessage[lang].trim().length >= 3);
    if (!taskId || !VALID.has(nextStatus)) return Response.json({ error: 'task_id and valid status required' }, { status: 400 });
    if (nextStatus === 'blocked' && note.length < 3) return Response.json({ error: 'blocker_note_required' }, { status: 400 });
    if (nextStatus === 'blocked' && merchantRequired && !merchantMessageComplete) {
      return Response.json({ error: 'merchant_blocker_requires_en_fr_es' }, { status: 400 });
    }

    const svc = base44.asServiceRole;
    const found = await svc.entities.MigrationTask.filter({ id: taskId }, '-created_date', 1).catch(() => []);
    const task:any = found?.[0];
    if (!task) return Response.json({ error: 'task_not_found' }, { status: 404 });
    if (task?.metadata_json?.plan_version !== PLAN_VERSION) return Response.json({ error: 'not_p9_task' }, { status: 409 });
    const allowed = ALLOWED[task.status] || new Set();
    if (!allowed.has(nextStatus)) return Response.json({ error: 'invalid_task_transition', from: task.status, to: nextStatus }, { status: 409 });
    if (nextStatus === 'done' && note.length < 3) return Response.json({ error: 'completion_evidence_note_required' }, { status: 400 });
    const acts = await svc.entities.DealActivation.filter({ id: task.deal_activation_id }, '-created_date', 1).catch(() => []);
    const activation:any = acts?.[0];
    if (!activation || activation.vertical !== 'payments') return Response.json({ error: 'payments_activation_not_found' }, { status: 404 });

    const allTasks:any[] = await svc.entities.MigrationTask.filter({ deal_activation_id: activation.id }, 'order', 100).catch(() => []);
    const tasks = allTasks.filter(t => t?.metadata_json?.plan_version === PLAN_VERSION && t.status !== 'canceled');
    if (nextStatus === 'in_progress' || nextStatus === 'done') {
      const earlier = tasks.filter(t => Number(t.order || 0) < Number(task.order || 0) && t.status !== 'done');
      if (earlier.length) return Response.json({ error: 'earlier_tasks_incomplete', task_ids: earlier.map(t => t.id) }, { status: 409 });
    }
    if (nextStatus === 'done') {
      if (task.step_name === 'go_live' && activation.status !== 'migrating') {
        return Response.json({ error: 'go_live_requires_migrating', activation_status: activation.status }, { status: 409 });
      }
      if (task.step_name === 'verify_savings') {
        if (!activation.conditions_activated_at || !activation.first_measurement_month) {
          return Response.json({ error: 'conditions_activation_evidence_required' }, { status: 409 });
        }
        const reports = await svc.entities.MonthlySavingsReport.filter({ deal_activation_id: activation.id }, '-month', 50).catch(() => []);
        const verified = (reports || []).find(r =>
          String(r.month || '') >= String(activation.first_measurement_month || '') &&
          r.measurement_mode === 'fully_verified' &&
          ['verified','realized'].includes(r.verification_status) &&
          Number.isFinite(Number(r.savings)) &&
          Number(r.savings) > 0
        );
        if (!verified) return Response.json({ error: 'verified_real_savings_report_required' }, { status: 409 });
      }
    }

    const now = new Date().toISOString();
    const retryCount = Number(task?.metadata_json?.retry_count || 0) + (task.status === 'blocked' && nextStatus === 'in_progress' ? 1 : 0);
    await svc.entities.MigrationTask.update(taskId, {
      status: nextStatus,
      updated_at: now,
      completed_at: nextStatus === 'done' ? now : undefined,
      blocked_reason: nextStatus === 'blocked' ? note : '',
      requires_brand_input: nextStatus === 'blocked' ? merchantRequired : false,
      metadata_json: {
        ...(task.metadata_json || {}),
        retry_count: retryCount,
        last_note: note || undefined,
        last_actor: me.email,
        last_transition_at: now,
        // Customer-safe copy is deliberately separated from internal notes.
        // A merchant blocker is publishable only when EN/FR/ES are all present.
        merchant_blocker_i18n: nextStatus === 'blocked' && merchantRequired
          ? { en: merchantMessage.en.trim(), fr: merchantMessage.fr.trim(), es: merchantMessage.es.trim() }
          : null,
      },
    });

    if (nextStatus === 'done') {
      if (task.step_name === 'go_live') {
        await svc.entities.DealActivation.update(activation.id, { status: 'live', last_updated: now });
        await svc.entities.OperationalLog.create({ deal_activation_id: activation.id, brand_id: activation.brand_id || '', provider_id: activation.provider_id || '', event_type: 'go_live', message: 'Payments migration went live', data_json: { task_id: taskId }, actor_email: me.email, created_at: now }).catch(() => null);
      }
      const next = tasks.find(t => Number(t.order || 0) > Number(task.order || 0) && t.status === 'pending');
      if (next) {
        const slaDays = Number(next?.metadata_json?.sla_days || 3);
        const due = new Date(); due.setUTCDate(due.getUTCDate() + slaDays);
        await svc.entities.MigrationTask.update(next.id, { status: 'in_progress', updated_at: now, due_date: due.toISOString().slice(0,10) }).catch(() => null);
      }
    }

    await svc.entities.OperationalLog.create({
      deal_activation_id: activation.id, brand_id: activation.brand_id || '', provider_id: activation.provider_id || '',
      event_type: 'task_updated', message: `${task.step_name}: ${task.status} → ${nextStatus}`,
      data_json: { task_id: taskId, from: task.status, to: nextStatus, note: note || null, merchant_required: merchantRequired, merchant_message_locales: merchantRequired ? ['en','fr','es'] : [], retry_count: retryCount }, actor_email: me.email, created_at: now,
    }).catch(() => null);

    return Response.json({ ok: true, task_id: taskId, status: nextStatus });
  } catch (error) {
    return Response.json({ error: error?.message || 'migration_task_update_failed' }, { status: 500 });
  }
}
