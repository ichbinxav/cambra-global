import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { handleAdminGlobalSearch } from '../adminGlobalSearch/entry.ts';
import { buildDiscoveryAdminRadar } from '../../shared/discoveryAdmin.ts';
import { buildCommercialOperatingSystem } from '../../shared/commercialOperatingSystem.ts';
import { handleCommercialCampaignAdmin } from '../../shared/commercialCampaignAdmin.ts';
import { handleDiscoveryV2Admin } from '../../shared/discoveryV2Admin.ts';
// CAMP-C5: Inbox & Conversations read model, hosted here as a logical route.
import { handleConversationAdminAction } from '../../shared/conversationAdminCore.ts';
// COMMAND-C2: durable Command conversations, hosted here as a logical route.
// The physical function quota is exhausted; this needs no entry point of its own.
import { handleCommandConversationAction } from '../../shared/commandConversationCore.ts';
// COMMAND-C6: durable run admin (start/status/cancel/advance), also a logical route.
import { handleCommandRunAction } from '../../shared/commandRunAdminCore.ts';
// DASHBOARD-C3: Pipeline workspace, also a logical route.
import { handlePipelineAdminAction } from '../../shared/pipelineAdminCore.ts';
// DASHBOARD-C4: Audits & Opportunities, also a logical route.
import { handleAuditsAdminAction } from '../../shared/auditsAdminCore.ts';
import { internalErrorResponse } from '../../shared/publicErrors.ts';

Deno.serve(async (req) => {
  const routedBody = await req.clone().json().catch(() => ({}));
  if (routedBody?.action === 'global_search') return handleAdminGlobalSearch(req);
  if (String(routedBody?.action||'').startsWith('campaign_')) return handleCommercialCampaignAdmin(new Request(req.url,{method:req.method,headers:req.headers,body:JSON.stringify({...routedBody,action:String(routedBody.action).replace(/^campaign_/, '')})}));
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    if (String(routedBody?.action||'').startsWith('discovery_v2_')) return handleDiscoveryV2Admin(base44.asServiceRole,user,routedBody);
    if (String(routedBody?.action||'').startsWith('conversation_')) return handleConversationAdminAction(user,{...routedBody,action:String(routedBody.action).replace(/^conversation_/, '')},base44.asServiceRole);
    if (String(routedBody?.action||'').startsWith('command_conversation_')) return handleCommandConversationAction(user,{...routedBody,action:String(routedBody.action).replace(/^command_conversation_/, '')},base44.asServiceRole);
    if (String(routedBody?.action||'').startsWith('command_run_')) return handleCommandRunAction(user,{...routedBody,action:String(routedBody.action).replace(/^command_run_/, '')},base44.asServiceRole);
    if (String(routedBody?.action||'').startsWith('pipeline_')) return handlePipelineAdminAction(user,{...routedBody,action:String(routedBody.action).replace(/^pipeline_/, '')},base44.asServiceRole);
    if (String(routedBody?.action||'').startsWith('audits_')) return handleAuditsAdminAction(user,{...routedBody,action:String(routedBody.action).replace(/^audits_/, '')},base44.asServiceRole);
    if (routedBody?.action === 'discovery_radar') return Response.json(await buildDiscoveryAdminRadar(base44.asServiceRole));
    if (routedBody?.action === 'commercial_os') return Response.json(await buildCommercialOperatingSystem(base44.asServiceRole));

    // Parallel reads
    const [brands, providers, results, deals, reports, invoices, mandates, rules, baselines] = await Promise.all([
      base44.asServiceRole.entities.Brand.list(),
      base44.asServiceRole.entities.Provider.list(),
      base44.asServiceRole.entities.AnalyzerResult.list(),
      base44.asServiceRole.entities.DealActivation.list(),
      base44.asServiceRole.entities.MonthlySavingsReport.list(),
      base44.asServiceRole.entities.Invoice.list(),
      base44.asServiceRole.entities.Mandate.list(),
      base44.asServiceRole.entities.BillingRule.list(),
      base44.asServiceRole.entities.Baseline.list(),
    ]);

    // Platform summary
    const totalIdentified = results.reduce((s,r)=> s + Number(r.total_savings||0), 0);
    const totalActivated = deals.reduce((s,d)=> s + Number(d.projected_savings_annual||0), 0);
    const totalRealized = reports.reduce((s,r)=> s + Number(r.savings||0), 0);
    const totalNodeRevenue = reports.reduce((s,r)=> s + Number(r.node_fee||0), 0);

    const mrrMonth = (()=>{ const d=new Date(); d.setMonth(d.getMonth()-1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })();
    const mrr = reports.filter(r=>r.month===mrrMonth).reduce((s,r)=> s + Number(r.node_fee||0), 0);

    const issued = invoices.filter(i=>['issued','sent','overdue','paid','disputed'].includes(i.status));
    const paid = invoices.filter(i=>i.status==='paid');
    const overdue = invoices.filter(i=>i.status==='overdue');

    const statusCounts = deals.reduce((acc,d)=>{ acc[d.status]=(acc[d.status]||0)+1; return acc; }, {});

    // Economic quality (simple version)
    const byBrand = reports.reduce((map,r)=>{ map[r.brand_id]=(map[r.brand_id]||0)+Number(r.savings||0); return map; },{});
    const topBrands = Object.entries(byBrand).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([brand_id,val])=>({brand_id, realized: val}));

    const byProvider = reports.reduce((map,r)=>{ map[r.provider_id]=(map[r.provider_id]||0)+Number(r.node_fee||0); return map; },{});
    const topProviders = Object.entries(byProvider).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([provider_id,val])=>({provider_id, node_revenue: val}));

    // Averages (rough)
    const authTimes = deals.filter(d=>d.activated_at && d.last_updated && (d.status==='authorized'||d.status==='migrating'||d.status==='live'))
      .map(d=> (new Date(d.last_updated)-new Date(d.activated_at))/(1000*60*60*24)).filter(n=>n>0);
    const avgActivationToNow = authTimes.length ? Math.round(authTimes.reduce((a,b)=>a+b,0)/authTimes.length) : 0;

    const summary = {
      totals: {
        brands: brands.length,
        providers: providers.length,
        analyzer_results: results.length,
        identified_yearly: totalIdentified,
        activated_yearly: totalActivated,
        realized_total: totalRealized,
        node_revenue_total: totalNodeRevenue,
        node_mrr: mrr,
        invoices_issued_total: issued.reduce((s,i)=>s+Number(i.amount||0),0),
        invoices_paid_total: paid.reduce((s,i)=>s+Number(i.amount||0),0),
        invoices_overdue_total: overdue.reduce((s,i)=>s+Number(i.amount||0),0)
      },
      pipeline: statusCounts,
      economic_quality: {
        projected_vs_realized_ratio: totalActivated>0 ? (totalRealized/totalActivated) : null,
        top_brands: topBrands,
        top_providers: topProviders,
        avg_days_activation_to_now: avgActivationToNow
      },
      samples: {
        recent_deals: deals.slice(0,20),
        recent_reports: reports.slice(0,20),
        recent_invoices: invoices.slice(0,20)
      }
    };

    return Response.json({ ok: true, summary });
  } catch (error) {
    return internalErrorResponse(error, 'adminSummaries');
  }
});
