import { safeBestEffort } from '../../shared/bestEffort.ts';
// P9 merchant projection. Deliberately hides internal task mechanics: the client
// sees one CAMBRA-owned migration, a simple stage, progress and only blockers
// that genuinely require merchant action.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const STAGES = ['preparing','provider_coordination','scheduled','going_live','verifying'];

function customerStage(tasks:any[], activation:any) {
  if (activation.status === 'monetizing') return 'completed';
  const verify = tasks.find(t => t.step_name === 'verify_savings');
  if (verify?.status === 'done') return 'completed';
  const live = tasks.find(t => t.step_name === 'go_live');
  if (live?.status === 'done' || activation.status === 'live') return 'verifying';
  for (const stage of STAGES) {
    const rows = tasks.filter(t => t?.metadata_json?.customer_stage === stage);
    if (rows.some(t => !['done','canceled'].includes(t.status))) return stage;
  }
  return tasks.length ? 'verifying' : 'preparing';
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch((error:any)=>safeBestEffort(error,{operation:'getMyPaymentsMigration',fallback:null,severity:'critical'}));
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const svc = base44.asServiceRole;
    const email = String(me.email || '').toLowerCase();
    const acts = await svc.entities.DealActivation.filter({ user_email: me.email }, '-created_date', 25).catch((error:any)=>safeBestEffort(error,{operation:'getMyPaymentsMigration',fallback:[],severity:'critical'}));
    const activation:any = (acts || []).find((a:any) => a.vertical === 'payments' && ['authorized','migrating','live','monetizing'].includes(a.status));
    if (!activation) return Response.json({ ok: true, migration: null });
    if (String(activation.user_email || '').toLowerCase() !== email) return Response.json({ error: 'Forbidden' }, { status: 403 });

    let allTasks:any[] = await svc.entities.MigrationTask.filter({ deal_activation_id: activation.id }, 'order', 100).catch((error:any)=>safeBestEffort(error,{operation:'getMyPaymentsMigration',fallback:[],severity:'critical'}));
    let tasks = allTasks.filter(t => t?.metadata_json?.plan_version === 'payments-recover-p9-v1');
    // Backward-compatible bootstrap for Recover mandates accepted before P9 or
    // carrying the legacy migration template.
    if (!tasks.length) {
      const started = await base44.functions.invoke('startPaymentsMigration', { deal_activation_id: activation.id }).catch((error:any)=>safeBestEffort(error,{operation:'getMyPaymentsMigration',fallback:null,severity:'critical'}));
      if (started?.data?.ok) {
        allTasks = await svc.entities.MigrationTask.filter({ deal_activation_id: activation.id }, 'order', 100).catch((error:any)=>safeBestEffort(error,{operation:'getMyPaymentsMigration',fallback:[],severity:'critical'}));
        tasks = allTasks.filter(t => t?.metadata_json?.plan_version === 'payments-recover-p9-v1');
      }
    }

    const activeTasks = tasks.filter(t => t.status !== 'canceled');
    const done = activeTasks.filter(t => t.status === 'done').length;
    const blockers = activeTasks.filter(t => t.status === 'blocked');
    const merchantBlockers = blockers
      .filter(t => t.requires_brand_input === true)
      .map(t => {
        const copy = t?.metadata_json?.merchant_blocker_i18n;
        const safe = copy && ['en','fr','es'].every(lang => typeof copy?.[lang] === 'string' && copy[lang].trim().length >= 3);
        // Never fall back to blocked_reason/description: those are internal operational fields.
        return safe ? { id: t.id, step_key: t.step_name, reason_i18n: { en: copy.en, fr: copy.fr, es: copy.es } } : null;
      })
      .filter(Boolean);
    const stage = customerStage(activeTasks, activation);

    return Response.json({ ok: true, migration: {
      activation_id: activation.id,
      stage,
      status: activation.status,
      provider_from: activation.provider_from || '',
      provider_to: activation.provider_to || '',
      projected_savings_annual: Number(activation.projected_savings_annual || activation.estimated_savings_yearly || 0),
      progress_pct: activeTasks.length ? Math.round((done / activeTasks.length) * 100) : 0,
      needs_you: merchantBlockers.length > 0,
      merchant_blockers: merchantBlockers,
      conditions_activated_at: activation.conditions_activated_at || null,
      started_at: activeTasks[0]?.completed_at || activeTasks[0]?.created_date || activation.last_updated || null,
      // Only customer-safe milestones. Internal owner/retry/admin notes stay server-side.
      milestones: activeTasks.filter(t => t?.metadata_json?.customer_visible !== false).map(t => ({
        key: t.step_name,
        status: t.status === 'blocked' && !t.requires_brand_input ? 'in_progress' : t.status,
        customer_stage: t?.metadata_json?.customer_stage || 'preparing',
      })),
    }});
  } catch (error) {
    console.error('getMyPaymentsMigration failed', error);
    return Response.json({ error: 'migration_projection_failed' }, { status: 500 });
  }
}
