import { buildDiscoveryAdminRadar } from './discoveryAdmin.ts';
import { leadProviderRegistry } from './leadIntelligenceProvider.ts';
import { readRuntimeRows, runtimeSourceCoverage } from './runtimeSourceRead.ts';

export const COMMERCIAL_OPERATING_SYSTEM_VERSION = 'commercial-os-runtime-1.0.0';
const text=(value:unknown)=>String(value??'').trim();
const score=(lead:any)=>Number(lead?.score??lead?.pre_score??0);
const confidence=(lead:any)=>Number(lead?.revenue_confidence??lead?.score_breakdown_json?.evidence_confidence??0);

export function commercialSenderReadiness(profile:any){
  const configured=Boolean(text(profile?.profile_key)&&text(profile?.domain)&&text(profile?.from_address));
  const senderReady=profile?.provider_config_json?.sender_ready===true;
  const webhookReady=profile?.provider!=='instantly'||profile?.webhook_status==='ACTIVE';
  const healthy=Number(profile?.bounce_rate_pct||0)<Number(profile?.bounce_pause_threshold_pct||3)&&Number(profile?.complaint_rate_pct||0)<Number(profile?.complaint_pause_threshold_pct||.3);
  let status='SETUP_PENDING';
  if(profile?.status==='paused')status='PAUSED';
  else if(!configured||(profile?.provider==='instantly'&&!senderReady))status='SETUP_PENDING';
  else if(!healthy||profile?.webhook_status==='ERROR')status='BROKEN';
  else if(profile?.status==='warming')status='WARMING';
  else if(profile?.status==='active'&&senderReady&&webhookReady&&Number(profile?.current_daily_cap||0)>0)status='READY';
  else if(profile?.status==='active')status='LIMITED';
  return{status,ready:status==='READY',cap:status==='READY'?Math.max(0,Number(profile?.current_daily_cap||0)):0,configured,sender_ready:senderReady,webhook_ready:webhookReady,healthy};
}

export async function buildCommercialOperatingSystem(service:any){
  const [radar,policyRead,campaignRead,profileRead,controlRead,threadRead,messageRead,strategyRead,taskRead,approvalRead,questionRead,providerStateRead,schedulerRead]=await Promise.all([
    buildDiscoveryAdminRadar(service),
    readRuntimeRows({source:'commercial_policies',limit:50,read:()=>service.entities.CommercialPolicy.filter({engine:'merchant_acquisition'},'-updated_date',50)}),
    readRuntimeRows({source:'commercial_campaigns',limit:50,read:()=>service.entities.CommercialCampaign.list('-updated_at',50)}),
    readRuntimeRows({source:'commercial_sending_profiles',limit:100,read:()=>service.entities.OutboundSendingProfile.list('-created_date',100)}),
    readRuntimeRows({source:'commercial_outbound_control',read:()=>service.entities.OutboundControl.filter({control_key:'global'},'-created_date',2)}),
    readRuntimeRows({source:'commercial_threads',limit:100,read:()=>service.entities.CommunicationThread.filter({engine:'merchant_acquisition'},'-last_message_at',100)}),
    readRuntimeRows({source:'commercial_messages',limit:500,read:()=>service.entities.CommunicationMessage.list('-created_date',500)}),
    readRuntimeRows({source:'commercial_strategies',limit:200,read:()=>service.entities.CommercialStrategy.list('-created_at',200)}),
    readRuntimeRows({source:'commercial_agent_tasks',limit:200,read:()=>service.entities.AgentTask.list('-created_date',200)}),
    readRuntimeRows({source:'commercial_pending_approvals',limit:100,read:()=>service.entities.Approval.filter({status:'pending'},'-created_date',100)}),
    readRuntimeRows({source:'commercial_pending_questions',limit:100,read:()=>service.entities.AgentQuestion.filter({status:'pending'},'-created_date',100)}),
    readRuntimeRows({source:'commercial_provider_states',limit:100,read:()=>service.entities.CommercialProviderState.list('-last_checked_at',100)}),
    readRuntimeRows({source:'commercial_scheduler_runs',limit:500,read:()=>service.entities.SchedulerRun.list('-started_at',500)}),
  ]);
  const policies=policyRead.value,campaigns=campaignRead.value,profiles=profileRead.value,controls=controlRead.value,threads=threadRead.value,messages=messageRead.value,strategies=strategyRead.value,tasks=taskRead.value,approvals=approvalRead.value,questions=questionRead.value,providerStates=providerStateRead.value,schedulerRuns=schedulerRead.value;
  if(controlRead.ok&&controls.length!==1){controlRead.status='INCOMPLETE';controlRead.blockers=[controls.length?'commercial_outbound_control_ambiguous':'commercial_outbound_control_missing'];}
  const sourceCoverage=runtimeSourceCoverage({policies:policyRead,campaigns:campaignRead,profiles:profileRead,outbound_control:controlRead,threads:threadRead,messages:messageRead,strategies:strategyRead,tasks:taskRead,approvals:approvalRead,questions:questionRead,provider_states:providerStateRead,scheduler_runs:schedulerRead});
  const control=controls[0]||{acquisition_enabled:false,premium_outlook_enabled:false,volume_resend_enabled:false,instantly_enabled:false};
  const compactControl={acquisition_enabled:control.acquisition_enabled===true,premium_outlook_enabled:control.premium_outlook_enabled===true,volume_resend_enabled:control.volume_resend_enabled===true,instantly_enabled:control.instantly_enabled===true,updated_at:control.updated_at||control.updated_date||null};
  const instantlyState=providerStates.find((row:any)=>row.provider_key==='instantly_supersearch'&&row.role==='lead_intelligence')||null;
  const providers=leadProviderRegistry({
    apolloConfigured:Boolean(Deno.env.get('APOLLO_API_KEY')),
    instantlyConfigured:Boolean(Deno.env.get('INSTANTLY_API_KEY')),
    instantlySuperSearchPermission:instantlyState?.metrics_json?.supersearch_permission_verified===true,
  });
  const senders=profiles.map((profile:any)=>({
    id:profile.id,profile_key:profile.profile_key,provider:profile.provider,domain:profile.domain,from_address:profile.from_address,status:profile.status,current_daily_cap:Number(profile.current_daily_cap||0),target_daily_cap:Number(profile.target_daily_cap||0),bounce_rate_pct:Number(profile.bounce_rate_pct||0),complaint_rate_pct:Number(profile.complaint_rate_pct||0),webhook_status:profile.webhook_status||'NOT_CONFIGURED',external_campaign_id:profile.external_campaign_id||null,readiness:commercialSenderReadiness(profile),
  }));
  const domainMap=new Map<string,any>();
  for(const sender of senders){const key=text(sender.domain).toLowerCase()||'unassigned';const current=domainMap.get(key)||{domain:key,status:'SETUP_PENDING',mailboxes:[],daily_capacity:0};current.mailboxes.push(sender);current.daily_capacity+=sender.readiness.cap;const order=['BROKEN','PAUSED','SETUP_PENDING','WARMING','LIMITED','READY'];if(order.indexOf(sender.readiness.status)<order.indexOf(current.status)||current.mailboxes.length===1)current.status=sender.readiness.status;domainMap.set(key,current);}
  const latestByAgent:Record<string,any>={};for(const task of tasks)if(task.agent_name&&!latestByAgent[task.agent_name])latestByAgent[task.agent_name]=task;
  const eligible=(radar.prioritized||[]).filter((lead:any)=>lead.outreach_eligibility==='ELIGIBLE'&&lead.compliance_status==='CLEARED'&&lead.contactability==='PROFESSIONAL_VERIFIED');
  const openThreads=threads.filter((thread:any)=>!['closed','suppressed'].includes(String(thread.status)));
  const unresolvedLegacy=threads.filter((thread:any)=>!thread.sending_profile_key&&thread.sending_profile_resolution_status!=='NOT_APPLICABLE');
  const liveWorkers=['alwaysOnLeadDiscoveryWorker','outboundVolumeWorker','followUpWorker','instantlyReconciliationWorker'].map((worker_key)=>{const run=schedulerRuns.find((row:any)=>row.worker_key===worker_key);return{worker_key,status:run?.status||'NOT_EVIDENCED',last_started_at:run?.started_at||null};});
  const attention:any[]=[];
  if(sourceCoverage.status!=='COMPLETE'||radar.source_coverage?.status!=='COMPLETE')attention.push({severity:'critical',code:'commercial_runtime_sources_incomplete',label:'One or more canonical commercial sources are unavailable or truncated; displayed counts are not portfolio totals.',blockers:[...sourceCoverage.blockers,...(radar.source_coverage?.blockers||[])]});
  if(!providers.find((provider:any)=>provider.key==='instantly_supersearch')?.available)attention.push({severity:'info',code:'instantly_supersearch_not_verified',label:'Verify Instantly SuperSearch access after loading the API key.'});
  if(unresolvedLegacy.length)attention.push({severity:'critical',code:'legacy_sending_profiles_unresolved',count:unresolvedLegacy.length,label:'Legacy threads require an explicit sending profile review.'});
  if(!senders.some((sender:any)=>sender.readiness.ready))attention.push({severity:'critical',code:'no_ready_sender',label:'No mailbox is fully ready for a pilot.'});
  if(control.acquisition_enabled!==true)attention.push({severity:'safe',code:'outbound_locked',label:'Real outbound is safely OFF until founder pilot authorization.'});
  const compactLeads=(radar.prioritized||[]).slice(0,30).map((lead:any)=>({id:lead.id,canonical_company_key:lead.canonical_company_key,company_name:lead.company_name,company_domain:lead.company_domain,country:lead.country,industry:lead.industry,employee_range:lead.employee_range,revenue_range:lead.revenue_range,estimated_tpv_min_eur:lead.estimated_tpv_min_eur,estimated_tpv_max_eur:lead.estimated_tpv_max_eur,estimation_status:lead.estimation_status,ecommerce_platform:lead.ecommerce_platform,probable_payment_stack:(lead.probable_payment_stack||[]).slice(0,5),contact_full_name:lead.contact_full_name,contact_title:lead.contact_title,contact_email:lead.contact_email,contactability:lead.contactability,icp_score:lead.icp_score,opportunity_score:lead.opportunity_score,confidence:lead.confidence,why:(lead.why||[]).slice(0,4),source:lead.source,outreach_eligibility:lead.outreach_eligibility,compliance_status:lead.compliance_status}));
  const compactCampaigns=campaigns.slice(0,30).map((campaign:any)=>({id:campaign.id,name:campaign.name,status:campaign.status,provider_mode:campaign.provider_mode,lead_ids:campaign.lead_ids||[],created_at:campaign.created_at,capacity_preview_json:campaign.capacity_preview_json,message_json:{status:campaign.message_json?.status||'NOT_PREPARED'},sequence_json:{status:campaign.sequence_json?.status||'NOT_PREPARED'},metrics_json:{sent:Number(campaign.metrics_json?.sent||0)},blockers:campaign.blockers||[]}));
  const compactLatest=Object.fromEntries(Object.entries(latestByAgent).map(([name,task]:any)=>[name,{id:task.id,agent_name:task.agent_name,status:task.status,task_type:task.task_type,updated_date:task.updated_date||task.created_date||null}]));
  return{
    ok:true,version:COMMERCIAL_OPERATING_SYSTEM_VERSION,generated_at:new Date().toISOString(),data_status:sourceCoverage.status,source_coverage:{commercial:sourceCoverage,discovery:radar.source_coverage||{status:'UNKNOWN',complete:false,blockers:['discovery_source_coverage_missing']}},
    safety:{outbound_locked:controlRead.status!=='COMPLETE'||control.acquisition_enabled!==true,control:{...compactControl,status:controlRead.status},explicit_pilot_required:true,external_send_performed:false},
    summary:{total_leads:radar.metrics?.companies_discovered||0,unique_companies:radar.metrics?.unique_companies||0,high_fit:radar.metrics?.high_fit||0,verified_contacts:radar.metrics?.usable_verified_contacts||0,outreach_ready:radar.metrics?.outreach_ready||0,active_target_profiles:policies.filter((row:any)=>row.icp_json?.discovery_enabled===true).length,campaigns:campaigns.length,ready_senders:senders.filter((row:any)=>row.readiness.ready).length,open_conversations:openThreads.length,pending_approvals:approvals.length,pending_questions:questions.length},
    providers,target_profiles:policies.map((policy:any)=>({id:policy.id,policy_key:policy.policy_key,name:policy.icp_json?.profile_name||policy.version,status:policy.status,discovery_enabled:policy.icp_json?.discovery_enabled===true,provider_mode:String(policy.icp_json?.provider_mode||'AUTO').toUpperCase(),countries:policy.countries||[],excluded_domains:policy.excluded_domains||[],daily_send_limit:Number(policy.daily_send_limit||0),min_lead_score:Number(policy.min_lead_score||0),icp_json:{verticals:(policy.icp_json?.verticals||[]).slice(0,20)},updated_date:policy.updated_date||policy.created_date||null})),
    leads:compactLeads,campaigns:compactCampaigns,senders,domains:[...domainMap.values()],
    conversations:openThreads.slice(0,50).map((thread:any)=>({id:thread.id,thread_key:thread.thread_key,lead_id:thread.lead_id,company_name:thread.company_name,counterparty_name:thread.counterparty_name,counterparty_email:thread.counterparty_email,status:thread.status,conversation_state:thread.conversation_state,last_message_at:thread.last_message_at,next_action_at:thread.next_action_at,automation_paused:thread.automation_paused===true,sending_profile_key:thread.sending_profile_key||null,resolution_status:thread.sending_profile_resolution_status||null})),
    communication_metrics:{messages:messages.length,inbound:messages.filter((row:any)=>row.direction==='inbound').length,outbound:messages.filter((row:any)=>row.direction==='outbound').length,bounced:messages.filter((row:any)=>row.send_status==='bounced').length,complained:messages.filter((row:any)=>row.send_status==='complained').length},
    strategies:{ready:strategies.filter((row:any)=>row.status==='READY').length,review_required:strategies.filter((row:any)=>row.status==='REVIEW_REQUIRED').length,blocked:strategies.filter((row:any)=>row.status==='BLOCKED').length},
    agents:{latest:compactLatest,recent:tasks.slice(0,20).map((task:any)=>({id:task.id,agent_name:task.agent_name,status:task.status,task_type:task.task_type,updated_date:task.updated_date||task.created_date||null}))},workers:liveWorkers,attention,radar:{metrics:radar.metrics,active_policy_count:radar.active_policy_count,provider_state_count:radar.provider_state_count},
  };
}
