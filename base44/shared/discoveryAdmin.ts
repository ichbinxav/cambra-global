import { APOLLO_EXPIRY_AT, selectDiscoveryPolicy, whyThisProspect } from './discoveryRadar.ts';
import { readRuntimeRows, runtimeSourceCoverage } from './runtimeSourceRead.ts';

const text=(value:unknown)=>String(value||'').trim();
const scoreOf=(lead:any)=>Number(lead?.score??lead?.pre_score??0);
const confidenceOf=(lead:any)=>Number(lead?.score_breakdown_json?.evidence_confidence||0);

export async function buildDiscoveryAdminRadar(service:any){
  const [policyRead,leadRead,reservoirRead,snapshotRead,checkpointRead,schedulerRead,costRead,taskRead,outboundProviderRead,outboundEventRead,outboundProfileRead,outboundControlRead,strategyRead]=await Promise.all([
    readRuntimeRows({source:'discovery_policy',limit:100,read:()=>service.entities.CommercialPolicy.filter({engine:'merchant_acquisition'},'-updated_date',100)}),
    readRuntimeRows({source:'discovery_leads',limit:5000,read:()=>service.entities.OutboundLead.list('-score',5000)}),
    readRuntimeRows({source:'discovery_reservoir_snapshots',limit:20,read:()=>service.entities.LeadReservoirSnapshot.list('-captured_at',20)}),
    readRuntimeRows({source:'discovery_intelligence_snapshots',limit:5,read:()=>service.entities.CommercialIntelligenceSnapshot.list('-generated_at',5)}),
    readRuntimeRows({source:'discovery_checkpoints',limit:1000,read:()=>service.entities.LeadDiscoveryCheckpoint.list('-last_attempt_at',1000)}),
    readRuntimeRows({source:'discovery_scheduler_runs',limit:100,read:()=>service.entities.SchedulerRun.filter({worker_key:'alwaysOnLeadDiscoveryWorker'},'-started_at',100)}),
    readRuntimeRows({source:'discovery_cost_events',limit:2000,read:()=>service.entities.CostUsageEvent.list('-occurred_at',2000)}),
    readRuntimeRows({source:'discovery_agent_tasks',limit:500,read:()=>service.entities.AgentTask.filter({agent_name:{$in:['lead_discovery','lead_enrichment','lead_scoring','lead_orchestrator']}},'-started_at',500)}),
    readRuntimeRows({source:'discovery_outbound_providers',limit:20,read:()=>service.entities.CommercialProviderState.filter({role:'outbound'},'-last_checked_at',20)}),
    readRuntimeRows({source:'discovery_outbound_events',limit:1000,read:()=>service.entities.OutboundProviderEvent.list('-first_received_at',1000)}),
    readRuntimeRows({source:'discovery_outbound_profiles',limit:100,read:()=>service.entities.OutboundSendingProfile.list('-created_date',100)}),
    readRuntimeRows({source:'discovery_outbound_control',read:()=>service.entities.OutboundControl.filter({control_key:'global'},'-created_date',2)}),
    readRuntimeRows({source:'discovery_strategies',limit:1000,read:()=>service.entities.CommercialStrategy.list('-created_at',1000)}),
  ]);
  const policies=policyRead.value,leads=leadRead.value,reservoirs=reservoirRead.value,snapshots=snapshotRead.value,checkpoints=checkpointRead.value,schedulerRuns=schedulerRead.value,costEvents=costRead.value,tasks=taskRead.value,outboundProviders=outboundProviderRead.value,outboundEvents=outboundEventRead.value,outboundProfiles=outboundProfileRead.value,outboundControls=outboundControlRead.value,strategies=strategyRead.value;
  if(outboundControlRead.ok&&outboundControls.length!==1){outboundControlRead.status='INCOMPLETE';outboundControlRead.blockers=[outboundControls.length?'discovery_outbound_control_ambiguous':'discovery_outbound_control_missing'];}
  const sourceCoverage=runtimeSourceCoverage({policies:policyRead,leads:leadRead,reservoirs:reservoirRead,snapshots:snapshotRead,checkpoints:checkpointRead,scheduler_runs:schedulerRead,cost_events:costRead,tasks:taskRead,outbound_providers:outboundProviderRead,outbound_events:outboundEventRead,outbound_profiles:outboundProfileRead,outbound_control:outboundControlRead,strategies:strategyRead});
  const policy=selectDiscoveryPolicy(policies);
  const latest=reservoirs[0]||null;
  const intelligence=snapshots[0]||null;
  const diagnostic=checkpoints.find((row:any)=>row.checkpoint_key==='apollo:provider:diagnostic')||null;
  const latestScheduler=schedulerRuns[0]||null;
  const schedulerAlive=Boolean(latestScheduler?.started_at&&Date.now()-Date.parse(latestScheduler.started_at)<3*3600000&&['RUNNING','COMPLETED'].includes(String(latestScheduler.status)));
  const uniqueCompanies=new Set(leads.map((lead:any)=>lead.canonical_company_key||lead.company_domain).filter(Boolean)).size;
  const highFit=leads.filter((lead:any)=>scoreOf(lead)>=Number(policy?.min_lead_score||70)).length;
  const contactable=leads.filter((lead:any)=>lead.contactability==='PROFESSIONAL_VERIFIED').length;
  const outreachReady=leads.filter((lead:any)=>lead.reservoir_state==='ready'||lead.revenue_stage==='outreach_ready').length;
  const providerStatus=latest?.provider_status_json?.apollo||{
    status:diagnostic?.provider_status||'UNAVAILABLE',auth_test_pass:diagnostic?.provider_usage_json?.auth?.pass??null,usage:diagnostic?.provider_usage_json?.usage||null,expires_at:APOLLO_EXPIRY_AT,
  };
  const status=sourceCoverage.status==='UNAVAILABLE'?'UNKNOWN':!policy?'PAUSED':providerStatus.status==='CIRCUIT_OPEN'?'ERROR':schedulerAlive?'ACTIVE':'DEGRADED';
  const prioritized=[...leads].sort((a:any,b:any)=>scoreOf(b)-scoreOf(a)||confidenceOf(b)-confidenceOf(a)||Date.parse(b.discovered_at||b.created_date||'')-Date.parse(a.discovered_at||a.created_date||'')).slice(0,500).map((lead:any)=>({
    id:lead.id,company_name:lead.company_name||null,company_domain:lead.company_domain||null,contact_full_name:lead.contact_full_name||null,contact_email:lead.contact_email||null,contact_title:lead.contact_title||null,country:lead.country||null,industry:lead.industry||null,employee_range:lead.employee_range||null,revenue_range:lead.revenue_range||null,detected_technologies:Array.isArray(lead.detected_technologies)?lead.detected_technologies:[],
    ecommerce_platform:lead.ecommerce_platform||lead.score_breakdown_json?.signals?.commerce_platform||null,probable_payment_stack:Array.isArray(lead.probable_payment_stack)?lead.probable_payment_stack:[],
    estimated_tpv_min_eur:lead.estimated_tpv_min_eur??null,estimated_tpv_max_eur:lead.estimated_tpv_max_eur??null,estimated_opportunity_min_eur:lead.estimated_opportunity_min_eur??null,estimated_opportunity_max_eur:lead.estimated_opportunity_max_eur??null,
    estimation_status:lead.estimation_status||'UNKNOWN',icp_score:scoreOf(lead)||null,opportunity_score:Number(lead.score_breakdown_json?.opportunity_score??lead.revenue_opportunity_score??0)||null,confidence:confidenceOf(lead)||null,
    contactability:lead.contactability||'UNKNOWN',commercial_status:lead.revenue_stage||lead.stage||'lead',reservoir_state:lead.reservoir_state||null,outreach_eligibility:lead.outreach_eligibility||'NOT_ASSESSED',compliance_status:lead.compliance_status||'NOT_ASSESSED',
    source:lead.source||null,discovered_at:lead.discovered_at||lead.created_date||null,last_enriched_at:lead.last_enriched_at||null,why:whyThisProspect(lead),
  }));
  const discoveryCosts=costEvents.filter((event:any)=>['leadDiscoveryAgent','leadEnrichmentAgent'].includes(String(event.source)));
  const apiCalls=discoveryCosts.filter((event:any)=>event.category==='api').length;
  const enrichmentCalls=discoveryCosts.filter((event:any)=>event.category==='enrichment'&&!['VOID','FAILED'].includes(String(event.status))).length;
  const externalCostMinor=discoveryCosts.filter((event:any)=>!['VOID','FAILED'].includes(String(event.status))).reduce((sum:number,event:any)=>sum+Number(event.amount_minor||0),0);
  const providerCreditsConsumed=discoveryCosts.filter((event:any)=>!['VOID','FAILED'].includes(String(event.status))).reduce((sum:number,event:any)=>sum+Number(event.usage_json?.provider_credit_cost_documented||0),0);
  const contactableHighFit=leads.filter((lead:any)=>scoreOf(lead)>=Number(policy?.min_lead_score||70)&&lead.contactability==='PROFESSIONAL_VERIFIED').length;
  const taskCounts=tasks.reduce((output:any,row:any)=>(output[row.status]=(output[row.status]||0)+1,output),{});
  const checkpointTotals={
    api_calls:checkpoints.reduce((sum:number,row:any)=>sum+Number(row.api_calls||0),0),companies_scanned:checkpoints.reduce((sum:number,row:any)=>sum+Number(row.candidates_scanned||0),0),
    unique_companies_created:checkpoints.reduce((sum:number,row:any)=>sum+Number(row.unique_companies_created||0),0),duplicates_rejected:checkpoints.reduce((sum:number,row:any)=>sum+Number(row.duplicates_rejected||0),0),
    quality_rejected:checkpoints.reduce((sum:number,row:any)=>sum+Number(row.quality_rejected||0),0),enrichment_candidates:checkpoints.reduce((sum:number,row:any)=>sum+Number(row.enrichment_candidates||0),0),
  };
  return{
    ok:true,engine_version:latest?.engine_version||null,status,data_status:sourceCoverage.status,source_coverage:sourceCoverage,discovery_enabled:policyRead.ok&&Boolean(policy),outbound_policy_status:policy?.status||null,policy_id:policy?.id||policies[0]?.id||null,
    configured_markets:policy?.countries||policies[0]?.countries||[],last_successful_run_at:latest?.last_successful_run_at||diagnostic?.last_success_at||null,next_scheduled_run_at:latest?.next_scheduled_run_at||null,
    scheduler:{alive:schedulerAlive,last_status:latestScheduler?.status||null,last_started_at:latestScheduler?.started_at||null,duplicate_blocked:schedulerRuns.filter((row:any)=>row.status==='DUPLICATE_BLOCKED').length},
    provider:{key:'apollo',...providerStatus,secret_present:providerStatus.status!=='UNAVAILABLE',secret_value_exposed:false,expires_at:APOLLO_EXPIRY_AT,circuit_open_until:diagnostic?.circuit_open_until||null},
    metrics:{companies_scanned:checkpointTotals.companies_scanned,companies_discovered:leads.length,unique_companies:uniqueCompanies,duplicates_rejected:checkpointTotals.duplicates_rejected,candidates_pre_scored:leads.filter((lead:any)=>Number.isFinite(Number(lead.pre_score))).length,candidates_enriched:leads.filter((lead:any)=>lead.enriched===true).length,decision_makers_found:leads.filter((lead:any)=>text(lead.contact_full_name)||text(lead.contact_title)).length,usable_verified_contacts:contactable,high_fit:highFit,outreach_ready:outreachReady,stale:latest?.stale??null},
    distributions:{country:latest?.country_breakdown_json||{},vertical:latest?.vertical_breakdown_json||{},opportunity:latest?.opportunity_breakdown_json||{},provider:intelligence?.market_sizing_json?.segments?.provider||[]},
    cost:{api_calls:apiCalls,enrichment_calls:enrichmentCalls,provider_credits_consumed:providerCreditsConsumed,estimated_external_cost_minor:externalCostMinor,currency:'EUR',high_quality_contactable_leads_per_external_eur:externalCostMinor>0?Number((contactableHighFit/(externalCostMinor/100)).toFixed(4)):null,provider_usage:providerStatus.usage||null,credit_balance:null,credit_balance_status:'UNKNOWN_UNLESS_APOLLO_USAGE_RESPONSE_EXPOSES_IT'},
    health:{task_status_counts:taskCounts,checkpoint_status_counts:checkpoints.reduce((output:any,row:any)=>(output[row.provider_status]=(output[row.provider_status]||0)+1,output),{}),recent_errors:tasks.filter((task:any)=>task.status==='failed').slice(0,20).map((task:any)=>({at:task.completed_at||task.started_at||null,agent:task.agent_name,error_code:text(task.error).slice(0,120)||'UNKNOWN'}))},
    outbound_provider:{
      instantly:outboundProviders.find((row:any)=>row.provider_key==='instantly')||{provider_key:'instantly',status:'NOT_CONFIGURED',auth_test_pass:false},
      profiles:outboundProfiles.filter((row:any)=>row.provider==='instantly').map((row:any)=>({profile_key:row.profile_key,status:row.status,domain:row.domain,current_daily_cap:row.current_daily_cap,external_campaign_id:row.external_campaign_id||null,webhook_status:row.webhook_status||'NOT_CONFIGURED',sender_ready:row.provider_config_json?.sender_ready===true,native_ai_conflict:row.provider_config_json?.native_ai_conflict===true})),
      control:{status:outboundControlRead.status,global_enabled:outboundControlRead.status==='COMPLETE'&&outboundControls[0]?.acquisition_enabled===true,instantly_enabled:outboundControlRead.status==='COMPLETE'&&outboundControls[0]?.instantly_enabled===true,effective_capacity:outboundControlRead.status==='COMPLETE'&&outboundControls[0]?.acquisition_enabled===true&&outboundControls[0]?.instantly_enabled===true?outboundProfiles.filter((row:any)=>row.provider==='instantly'&&['warming','active'].includes(row.status)&&row.provider_config_json?.sender_ready===true&&row.webhook_status==='ACTIVE').reduce((sum:number,row:any)=>sum+Number(row.current_daily_cap||0),0):0},
      events:{received:outboundEvents.length,processed:outboundEvents.filter((row:any)=>row.status==='PROCESSED').length,pending_retry:outboundEvents.filter((row:any)=>row.status==='PENDING_RETRY').length,dead_letter:outboundEvents.filter((row:any)=>row.status==='DEAD_LETTER').length},
      strategies:{ready:strategies.filter((row:any)=>row.status==='READY').length,blocked:strategies.filter((row:any)=>['BLOCKED','REVIEW_REQUIRED'].includes(row.status)).length,executed:strategies.filter((row:any)=>row.status==='EXECUTED').length},
      secret_value_exposed:false,
    },
    market_sizing:intelligence?.market_sizing_json||null,prioritized,
  };
}
