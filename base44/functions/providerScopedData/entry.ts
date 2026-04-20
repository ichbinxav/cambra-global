import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Determine provider scope by user email
    const providers = await base44.entities.Provider.filter({ contact_email: me.email });
    const managed = await base44.entities.Provider.filter({ account_manager: me.email });
    const myProviders = [...providers, ...managed].reduce((m,p)=>{ m.add(p.id); return m; }, new Set());

    if (!myProviders.size) return Response.json({ ok: true, providers: [], activations: [], leads: [] });

    const provIds = Array.from(myProviders);
    const activations = (await base44.entities.DealActivation.list()).filter(a=>provIds.includes(a.provider_id));
    const leads = (await base44.entities.ProviderLead?.list?.() || []).filter(l=>provIds.includes(l.provider_id));
    const tasks = await base44.entities.MigrationTask.list();

    const tasksByA = tasks.reduce((m,t)=>{ const k=t.deal_activation_id||t.deal_id; if(!k) return m; (m[k]=m[k]||[]).push(t); return m; },{});

    const shapedActs = activations.map(a=>({
      ...a,
      task_counts: {
        total: (tasksByA[a.id]||[]).length,
        pending: (tasksByA[a.id]||[]).filter(t=>t.status==='pending').length,
        blocked: (tasksByA[a.id]||[]).filter(t=>t.status==='blocked').length,
        provider_required: (tasksByA[a.id]||[]).filter(t=>t.requires_provider_input).length
      }
    }));

    return Response.json({ ok:true, providers: provIds, activations: shapedActs, leads });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});