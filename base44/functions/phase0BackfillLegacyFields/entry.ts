import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function backfillEntity(base44, entity, fields) {
  const batch = await base44.asServiceRole.entities[entity].filter({}, '-created_date', 500);
  let updates = 0;
  for (const rec of batch) {
    const patch = {};
    if (fields.includes('deal') && !rec.deal_activation_id && rec.deal_id) patch.deal_activation_id = rec.deal_id;
    if (entity === 'Invoice' && !rec.total_amount && typeof rec.amount === 'number') patch.total_amount = rec.amount;
    if (Object.keys(patch).length) {
      await base44.asServiceRole.entities[entity].update(rec.id, patch);
      updates++;
    }
  }
  return updates;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const summary = {};
    summary.Baseline = await backfillEntity(base44, 'Baseline', ['deal']);
    summary.MigrationTask = await backfillEntity(base44, 'MigrationTask', ['deal']);
    summary.Mandate = await backfillEntity(base44, 'Mandate', ['deal']);
    summary.AuthorizationLog = await backfillEntity(base44, 'AuthorizationLog', ['deal']);
    summary.Contract = await backfillEntity(base44, 'Contract', ['deal']);
    summary.Invoice = await backfillEntity(base44, 'Invoice', ['deal']);
    summary.MonthlySavingsReport = await backfillEntity(base44, 'MonthlySavingsReport', ['deal']);

    return Response.json({ status: 'ok', summary });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});