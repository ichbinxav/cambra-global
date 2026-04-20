import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { id } = await req.json().catch(()=>({}));
    if (!id) return Response.json({ error: 'id required' }, { status: 400 });

    const [acts, baselines, rules, mandates, tasks, reports, invoices, logs] = await Promise.all([
      base44.asServiceRole.entities.DealActivation.filter({ id }),
      base44.asServiceRole.entities.Baseline.filter({ deal_activation_id: id }),
      base44.asServiceRole.entities.BillingRule.filter({ deal_activation_id: id }),
      base44.asServiceRole.entities.Mandate.filter({ deal_activation_id: id }),
      base44.asServiceRole.entities.MigrationTask.filter({ deal_activation_id: id }),
      base44.asServiceRole.entities.MonthlySavingsReport.filter({ deal_activation_id: id }),
      base44.asServiceRole.entities.Invoice.filter({ deal_activation_id: id }),
      base44.asServiceRole.entities.OperationalLog.filter({ deal_activation_id: id })
    ]);

    const activation = acts?.[0] || null;
    if (!activation) return Response.json({ error: 'Activation not found' }, { status: 404 });

    const progress = (()=>{
      if (!tasks.length) return 0;
      const done = tasks.filter(t=>t.status==='done').length;
      return Math.round((done / tasks.length) * 100);
    })();

    return Response.json({ ok:true, activation, baselines, rules, mandates, tasks, reports, invoices, logs, progress });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});