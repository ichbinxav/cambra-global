import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { reservePaidOperation, settlePaidOperation } from '../../shared/costGovernance.ts';
import { APOLLO_EXPIRY_AT, classifyProfessionalEmail, discoveryProviderStatus, normalizeDiscoveryDomain } from '../../shared/discoveryRadar.ts';

const AGENT_NAME = 'lead_enrichment';
const TASK_TYPE = 'enrich_leads';
const RISK_LEVEL = 1;
const now = () => new Date().toISOString();
const sleep = (milliseconds:number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function apolloEnrich(key:string, lead:any) {
  const personId = String(lead?.external_refs_json?.apollo_person_id || '').trim();
  const params = new URLSearchParams();
  if (personId) params.set('id', personId);
  else {
    if (lead?.contact_full_name) params.set('name', String(lead.contact_full_name));
    if (lead?.company_domain) params.set('domain', normalizeDiscoveryDomain(lead.company_domain));
  }
  // Personal email, phone and waterfall enrichment stay disabled. CAMBRA only
  // requests the professional profile required for a high-value B2B candidate.
  params.set('reveal_personal_emails', 'false');
  params.set('reveal_phone_number', 'false');
  let lastError:any = null;
  for (let attempt=0; attempt<3; attempt++) {
    try {
      const response = await fetch(`https://api.apollo.io/api/v1/people/match?${params.toString()}`, { method:'POST', headers:{ 'Content-Type':'application/json', 'Cache-Control':'no-cache', 'x-api-key':key } });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) return payload;
      const error:any = new Error(`Apollo enrichment HTTP ${response.status}`); error.status=response.status; error.retryAfter=Number(response.headers.get('retry-after')||0); throw error;
    } catch (error:any) {
      lastError=error;
      const retryable=Number(error?.status||0)===429||Number(error?.status||0)>=500||!Number(error?.status||0);
      if(!retryable||attempt===2)break;
      await sleep(error?.retryAfter?Math.min(5_000,error.retryAfter*1_000):250*(2**attempt));
    }
  }
  throw lastError || new Error('Apollo enrichment failed');
}

function safeApolloPerson(payload:any) {
  const person = payload?.person || payload?.contact || payload || {};
  const organization = person?.organization || {};
  const technologies = [...new Set((Array.isArray(organization?.current_technologies) ? organization.current_technologies : Array.isArray(organization?.technologies) ? organization.technologies : []).map((item:any)=>String(item?.name||item?.uid||item||'').trim().toLowerCase()).filter(Boolean))].slice(0,100);
  return {
    person,
    organization,
    technologies,
    snapshot:{
      provider:'apollo', provider_person_id:person?.id || null, provider_organization_id:organization?.id || null,
      title:person?.title || null, seniority:person?.seniority || null, email_status:person?.email_status || null,
      organization_name:organization?.name || null, organization_domain:normalizeDiscoveryDomain(organization?.primary_domain || organization?.website_url),
      industry:organization?.industry || null, employee_count:organization?.estimated_num_employees ?? null, annual_revenue:organization?.annual_revenue ?? null,
      technologies, observed_at:now(), personal_email_requested:false, phone_requested:false, waterfall_requested:false,
    },
  };
}

Deno.serve(async (req) => {
  let task:any = null;
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;
    const service = base44.asServiceRole;
    const leadIds = Array.isArray(body?.lead_ids) ? body.lead_ids.map((value:any)=>String(value)).filter(Boolean).slice(0,100) : null;
    const policies = await service.entities.CommercialPolicy.filter({ engine:'merchant_acquisition' }, '-updated_date', 20).catch((error:any)=>safeBestEffort(error,{operation:'leadEnrichmentAgent',fallback:[],severity:'secondary'}));
    const discoveryPolicy = policies.find((policy:any)=>policy?.icp_json?.discovery_enabled===true) || policies[0] || null;
    const configuredDailyLimit = Math.max(0, Math.min(250, Math.floor(Number(discoveryPolicy?.icp_json?.enrichment_daily_limit ?? 25))));
    const configuredWeeklyLimit = Math.max(0, Math.min(1250, Math.floor(Number(discoveryPolicy?.icp_json?.enrichment_weekly_limit ?? configuredDailyLimit * 5))));
    const today = now().slice(0,10);
    const recentUsage = await service.entities.CostUsageEvent.filter({ provider:'apollo', source:'leadEnrichmentAgent' }, '-occurred_at', 500).catch((error:any)=>safeBestEffort(error,{operation:'leadEnrichmentAgent',fallback:[],severity:'secondary'}));
    const usedToday = recentUsage.filter((event:any)=>String(event.occurred_at||'').startsWith(today) && !['VOID','FAILED'].includes(String(event.status))).length;
    const rollingWeekCutoff=Date.now()-7*86_400_000;
    const usedThisWeek=recentUsage.filter((event:any)=>Date.parse(event.occurred_at||event.created_date||'')>=rollingWeekCutoff&&!['VOID','FAILED'].includes(String(event.status))).length;
    const remainingDaily = Math.max(0, configuredDailyLimit - usedToday);
    const remainingWeekly = Math.max(0, configuredWeeklyLimit - usedThisWeek);
    const remaining = Math.min(remainingDaily,remainingWeekly);
    const requestedLimit = Math.max(1, Math.min(Number(body?.limit || 25), 100));
    const limit = Math.min(requestedLimit, remaining);

    task = await service.entities.AgentTask.create({ brand_id:'_platform', agent_name:AGENT_NAME, task_type:TASK_TYPE, status:'running', requires_approval:false, risk_level:RISK_LEVEL, input_summary:`Selectively enrich up to ${limit} high-value leads (${remaining} daily Apollo slots remain)`, started_at:now() });
    if (limit <= 0) {
      const status=remainingDaily<=0?'daily_enrichment_limit_reached':'weekly_enrichment_limit_reached';
      await service.entities.AgentTask.update(task.id,{status:'completed',output_summary:'Enrichment guardrail reached; no paid enrichment attempted',output_payload_json:{count:0,status,daily_limit:configuredDailyLimit,weekly_limit:configuredWeeklyLimit,used_today:usedToday,used_this_week:usedThisWeek},completed_at:now()});
      return Response.json({ok:true,task_id:task.id,count:0,status,daily_limit:configuredDailyLimit,weekly_limit:configuredWeeklyLimit,used_today:usedToday,used_this_week:usedThisWeek});
    }
    let leads:any[] = leadIds?.length
      ? await service.entities.OutboundLead.filter({ id:{ $in:leadIds } }, '-created_date', leadIds.length).catch((error:any)=>safeBestEffort(error,{operation:'leadEnrichmentAgent',fallback:[],severity:'secondary'}))
      : await service.entities.OutboundLead.filter({ enrichment_worthy:true }, '-pre_score', Math.min(100,limit*4)).catch((error:any)=>safeBestEffort(error,{operation:'leadEnrichmentAgent',fallback:[],severity:'secondary'}));
    const freshnessCutoff = Date.now() - Math.max(7, Math.min(180, Number(discoveryPolicy?.icp_json?.enrichment_freshness_days || 30))) * 86_400_000;
    leads = leads.filter((lead:any)=>lead?.enrichment_worthy===true && (!lead?.last_enriched_at || Date.parse(lead.last_enriched_at)<freshnessCutoff) && !['suppressed','disqualified','converted'].includes(String(lead.reservoir_state))).sort((a:any,b:any)=>Number(b.pre_score||0)-Number(a.pre_score||0)).slice(0,limit);
    if (!leads.length) {
      await service.entities.AgentTask.update(task.id,{status:'completed',output_summary:'No high-value stale candidates require enrichment',output_payload_json:{count:0},completed_at:now()});
      return Response.json({ok:true,task_id:task.id,count:0});
    }

    const apolloKey = Deno.env.get('APOLLO_API_KEY') || '';
    const clayKey = Deno.env.get('CLAY_API_KEY') || '';
    const apolloStatus = discoveryProviderStatus(Boolean(apolloKey));
    let enriched=0, skipped=0, failed=0;
    const enrichedIds:string[]=[];
    for (const lead of leads) {
      let reservation:any=null;
      try {
        if (lead.source === 'apollo' && apolloStatus.available && lead?.external_refs_json?.apollo_person_id) {
          reservation=await reservePaidOperation(service,{event_key:`enrichment:apollo:${lead.id}:${today}`,category:'enrichment',provider:'apollo',source:'leadEnrichmentAgent',related_entity_type:'OutboundLead',related_entity_id:lead.id});
          const payload=await apolloEnrich(apolloKey,lead);
          const safe=safeApolloPerson(payload);
          const professional=classifyProfessionalEmail(safe.person?.email,lead.company_domain||safe.organization?.primary_domain);
          const verified=professional.accepted && String(safe.person?.email_status||'').toLowerCase()==='verified';
          const patch:any={
            contact_full_name:safe.person?.name||lead.contact_full_name||null,contact_title:safe.person?.title||lead.contact_title||null,linkedin_url:safe.person?.linkedin_url||lead.linkedin_url||null,
            ...(professional.accepted?{contact_email:professional.email}:{}),email_verification_status:String(safe.person?.email_status||professional.reason||'unknown'),contactability:verified?'PROFESSIONAL_VERIFIED':professional.accepted?'UNVERIFIED':'UNAVAILABLE',
            industry:safe.organization?.industry||lead.industry||null,detected_technologies:safe.technologies.length?safe.technologies:lead.detected_technologies||[],
            enriched:true,stage:'enriched',reservoir_state:'enriching',reservoir_updated_at:now(),last_enriched_at:now(),last_source_checked_at:now(),
            enrichment_json:safe.snapshot,external_refs_json:{...(lead.external_refs_json||{}),apollo_person_id:safe.person?.id||lead.external_refs_json?.apollo_person_id||null,apollo_organization_id:safe.organization?.id||lead.external_refs_json?.apollo_organization_id||null},
            source_evidence_json:{...(lead.source_evidence_json||{}),enrichment_source:'apollo:people/match',enriched_at:now(),professional_email_reason:professional.reason||'accepted',provider_expiry_at:APOLLO_EXPIRY_AT},
          };
          await service.entities.OutboundLead.update(lead.id,patch);
          await settlePaidOperation(service,reservation,{ok:true,usage_json:{endpoint:'people/match',provider_credit_cost_documented_range:'1-9',professional_email_returned:professional.accepted,personal_email_requested:false,phone_requested:false,waterfall_requested:false}});
          enriched++;enrichedIds.push(lead.id);continue;
        }
        if (clayKey) {
          reservation=await reservePaidOperation(service,{event_key:`enrichment:clay:${lead.id}:${today}`,category:'enrichment',provider:'clay',source:'leadEnrichmentAgent',related_entity_type:'OutboundLead',related_entity_id:lead.id});
          const response=await fetch('https://api.clay.com/v1/enrich',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${clayKey}`},body:JSON.stringify({domain:lead.company_domain||undefined,linkedin_url:lead.linkedin_url||undefined})});
          const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(`Clay HTTP ${response.status}`);
          await service.entities.OutboundLead.update(lead.id,{enriched:true,stage:'enriched',reservoir_state:'enriching',reservoir_updated_at:now(),last_enriched_at:now(),enrichment_json:{provider:'clay',payload,observed_at:now()}});
          await settlePaidOperation(service,reservation,{ok:true,usage_json:{lead_id:lead.id}});enriched++;enrichedIds.push(lead.id);continue;
        }
        skipped++;
      } catch (error:any) {
        failed++;
        if(reservation)await settlePaidOperation(service,reservation,{ok:false,usage_json:{error_code:Number(error?.status||0)===429?'RATE_LIMITED':'ENRICHMENT_FAILED'}}).catch((error:any)=>safeBestEffort(error,{operation:'leadEnrichmentAgent',fallback:null,severity:'secondary'}));
        await service.entities.OutboundLead.update(lead.id,{source_evidence_json:{...(lead.source_evidence_json||{}),last_enrichment_error:Number(error?.status||0)===429?'RATE_LIMITED':'ENRICHMENT_FAILED',last_enrichment_attempt_at:now()}}).catch((error:any)=>safeBestEffort(error,{operation:'leadEnrichmentAgent',fallback:null,severity:'secondary'}));
      }
    }
    await service.entities.AgentTask.update(task.id,{status:'completed',output_summary:`Selectively enriched ${enriched}; skipped ${skipped}; failed safely ${failed}`,output_payload_json:{count:leads.length,enriched,skipped,failed,daily_limit:configuredDailyLimit,weekly_limit:configuredWeeklyLimit,used_today_before:usedToday,used_this_week_before:usedThisWeek,provider_priority:apolloStatus.available?'apollo':'clay_or_none'},completed_at:now()});
    return Response.json({ok:true,task_id:task.id,count:leads.length,enriched,skipped,failed,enriched_ids:enrichedIds,daily_limit:configuredDailyLimit,weekly_limit:configuredWeeklyLimit,remaining_after:Math.max(0,remaining-enriched)});
  } catch(error:any) {
    if(task?.id){const base44=createClientFromRequest(req);await base44.asServiceRole.entities.AgentTask.update(task.id,{status:'failed',error:'lead_enrichment_failed',completed_at:now()}).catch((error:any)=>safeBestEffort(error,{operation:'leadEnrichmentAgent',fallback:null,severity:'secondary'}))}
    return Response.json({ok:false,error:'lead_enrichment_failed',task_id:task?.id||null},{status:500});
  }
});
