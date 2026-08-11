import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const SOURCES = [
  { entity:'Brand', type:'company', route:'/admin/users', fields:['name','contact_email','country'] },
  { entity:'Provider', type:'provider', route:'/admin/providers', fields:['name','slug','website'] },
  { entity:'OutboundLead', type:'lead', route:'/admin/pipeline', fields:['company_name','company_domain','contact_full_name','contact_email'] },
  { entity:'NegotiationCase', type:'negotiation', route:'/admin/deals', fields:['provider_name','status','next_action'] },
  { entity:'Invoice', type:'invoice', route:'/admin/recover-billing', fields:['invoice_number','status','currency'] },
  { entity:'Approval', type:'approval', route:'/admin/inbox', fields:['action_type','draft_content','status'] },
  { entity:'AgentTask', type:'agent task', route:'/admin/agents', fields:['agent_name','task_type','input_summary','output_summary','status'] },
  { entity:'CommunicationThread', type:'thread', route:'/admin/commercial-autonomy', fields:['thread_key','counterparty_email','counterparty_name','summary','status'] },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') return Response.json({ ok:false, error:'admin_required' }, { status:403 });
    const body = await req.json().catch(() => ({}));
    const query = String(body.query || '').trim().toLowerCase();
    if (query.length < 2) return Response.json({ ok:true, query, results:[] });
    const svc = base44.asServiceRole;
    const results:any[] = [];
    await Promise.all(SOURCES.map(async (source) => {
      const rows = await svc.entities[source.entity].list('-updated_date', 250).catch(() => []);
      for (const row of rows) {
        const values = source.fields.map((field) => String(row?.[field] || '')).filter(Boolean);
        const haystack = values.join(' ').toLowerCase();
        if (!haystack.includes(query)) continue;
        results.push({ id:row.id, entity:source.entity, type:source.type, route:source.route, title:values[0] || `${source.type} ${row.id}`, subtitle:values.slice(1,3).join(' · '), status:String(row.status || ''), matched_fields:source.fields.filter((field) => String(row?.[field] || '').toLowerCase().includes(query)) });
      }
    }));
    results.sort((a,b) => Number(b.title.toLowerCase().startsWith(query)) - Number(a.title.toLowerCase().startsWith(query)) || a.type.localeCompare(b.type));
    return Response.json({ ok:true, query, results:results.slice(0,30), truncated:results.length > 30 });
  } catch (error) {
    console.error('adminGlobalSearch failed', error);
    return Response.json({ ok:false, error:'admin_global_search_failed' }, { status:500 });
  }
});
