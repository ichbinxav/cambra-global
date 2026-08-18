import { safeBestEffort } from '../../shared/bestEffort.ts';
import { claimSchedulerRun, finishSchedulerRunOrThrow, markSchedulerEffectStarted, schedulerClaimDeniedResponse } from '../../shared/schedulerRun.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { buildCommercialIntelligence, COMMERCIAL_INTELLIGENCE_VERSION, normalizeCompanyDomain } from '../../shared/commercialIntelligence.ts';
import { emergencyState } from '../../shared/operationalControl.ts';
import { APOLLO_EXPIRY_AT, DISCOVERY_ENGINE_VERSION, discoveryPartitionKey, discoveryProviderStatus, selectDiscoveryPolicy } from '../../shared/discoveryRadar.ts';
import { selectLeadIntelligenceProvider } from '../../shared/leadIntelligenceProvider.ts';
import { processScheduledDiscoverySearches } from '../../shared/discoveryV2Admin.ts';

const VERSION = `${DISCOVERY_ENGINE_VERSION}:worker-1.0.0`;
const now = () => new Date().toISOString();
const COUNTRY_NAMES: Record<string,string> = {
  AT:'Austria',BE:'Belgium',BG:'Bulgaria',HR:'Croatia',CY:'Cyprus',CZ:'Czechia',DK:'Denmark',EE:'Estonia',FI:'Finland',FR: 'France',DE:'Germany',GR:'Greece',HU:'Hungary',IE:'Ireland',IT:'Italy',LV:'Latvia',LT:'Lithuania',LU:'Luxembourg',MT:'Malta',NL:'Netherlands',PL:'Poland',PT:'Portugal',RO:'Romania',SK:'Slovakia',SI:'Slovenia',ES: 'Spain',SE:'Sweden',IS:'Iceland',LI:'Liechtenstein',NO:'Norway',CH:'Switzerland',GB:'United Kingdom',MC:'Monaco',
};

function countBy(rows:any[], value:(row:any)=>unknown) {
  const output:Record<string,number>={};
  for(const row of rows){const key=String(value(row)||'unknown');output[key]=(output[key]||0)+1;}
  return output;
}

Deno.serve(async (req) => {let __schedulerSvc:any=null;let __schedulerClaim:any=null;let __schedulerOk=true;
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.clone().json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;
    const service = base44.asServiceRole;
    __schedulerSvc=service;
    __schedulerClaim=await claimSchedulerRun(service,req,{worker_key:'alwaysOnLeadDiscoveryWorker',cadence_seconds:3600});
    {const denied=schedulerClaimDeniedResponse(__schedulerClaim);if(denied)return denied;}
    __schedulerClaim=await markSchedulerEffectStarted(service,__schedulerClaim);
    {const denied=schedulerClaimDeniedResponse(__schedulerClaim);if(denied)return denied;}
    const emergency=await emergencyState(service);
    const scheduledDiscovery=emergency.safe_mode||emergency.paid_discovery_paused
      ? {ok:true,action:'GLOBAL_EMERGENCY_SAFE_MODE_BLOCKED',reason:emergency.reason||'global_emergency_stop'}
      : await processScheduledDiscoverySearches(service).catch((error:any)=>({ok:false,action:'SAFE_FAILURE',error:String(error?.message||error).slice(0,120)}));
    const internal = Deno.env.get('INTERNAL_CALL_SECRET') || '';
    const policies = await service.entities.CommercialPolicy.filter({ engine:'merchant_acquisition' }, '-updated_date', 100).catch((error:any)=>safeBestEffort(error,{operation:'alwaysOnLeadDiscoveryWorker',fallback:[],severity:'secondary'}));
    const policy = selectDiscoveryPolicy(policies);
    if (!policy) return Response.json({ ok:true, status:'waiting_discovery_policy', engine_version:VERSION, scheduled_discovery:scheduledDiscovery, note:'Autonomous harvest requires an explicitly enabled ICP configuration. Founder-scheduled Discovery V2 uses its own accepted saved-search budget.' });

    const [before, profiles, capabilityControls, marketProfiles, checkpoints, diagnosticRows, outboundControls,providerStates] = await Promise.all([
      service.entities.OutboundLead.list('-created_date',5000).catch((error:any)=>safeBestEffort(error,{operation:'alwaysOnLeadDiscoveryWorker',fallback:[],severity:'secondary'})),
      service.entities.OutboundSendingProfile.list('-created_date',100).catch((error:any)=>safeBestEffort(error,{operation:'alwaysOnLeadDiscoveryWorker',fallback:[],severity:'secondary'})),
      service.entities.MarketCapabilityControl.filter({ capability:'DISCOVER_LEAD' }, '-updated_at',500).catch((error:any)=>safeBestEffort(error,{operation:'alwaysOnLeadDiscoveryWorker',fallback:[],severity:'secondary'})),
      service.entities.MarketIntelligenceProfile.list('-updated_at',500).catch((error:any)=>safeBestEffort(error,{operation:'alwaysOnLeadDiscoveryWorker',fallback:[],severity:'secondary'})),
      service.entities.LeadDiscoveryCheckpoint.list('last_attempt_at',1000).catch((error:any)=>safeBestEffort(error,{operation:'alwaysOnLeadDiscoveryWorker',fallback:[],severity:'secondary'})),
      service.entities.LeadDiscoveryCheckpoint.filter({ checkpoint_key:'apollo:provider:diagnostic' }, '-updated_date',1).catch((error:any)=>safeBestEffort(error,{operation:'alwaysOnLeadDiscoveryWorker',fallback:[],severity:'secondary'})),
      service.entities.OutboundControl.filter({ control_key:'global' }, '-created_date',1).catch((error:any)=>safeBestEffort(error,{operation:'alwaysOnLeadDiscoveryWorker',fallback:[],severity:'secondary'})),
      service.entities.CommercialProviderState.list('-last_checked_at',100).catch((error:any)=>safeBestEffort(error,{operation:'alwaysOnLeadDiscoveryWorker',fallback:[],severity:'secondary'})),
    ]);
    const activeProfiles=profiles.filter((profile:any)=>profile?.active===true||profile?.status==='active');
    const configuredCapacity=activeProfiles.reduce((sum:number,profile:any)=>sum+Math.max(0,Number(profile.current_daily_cap||0)),0);
    const capacity=policy.status==='active'&&outboundControls[0]?.acquisition_enabled===true?configuredCapacity:0;
    const minScore=Number(policy.min_lead_score||70);
    const targetUnique=Math.max(100,Math.min(250000,Number(policy?.icp_json?.target_unique_companies||10000)));
    const uniqueCompaniesBefore=new Set(before.map((lead:any)=>String(lead.canonical_company_key||normalizeCompanyDomain(lead.company_domain))).filter(Boolean)).size;
    const provider=discoveryProviderStatus(Boolean(Deno.env.get('APOLLO_API_KEY')));
    const providerDiagnostic=diagnosticRows[0]?.provider_usage_json||null;
    const instantlyState=providerStates.find((row:any)=>row.provider_key==='instantly_supersearch'&&row.role==='lead_intelligence')||null;
    const providerSelection=selectLeadIntelligenceProvider({mode:policy?.icp_json?.provider_mode||'AUTO',apolloConfigured:Boolean(Deno.env.get('APOLLO_API_KEY')),instantlyConfigured:Boolean(Deno.env.get('INSTANTLY_API_KEY')),instantlySuperSearchPermission:instantlyState?.metrics_json?.supersearch_permission_verified===true});
    const selectedProvider=providerSelection.selected;
    const providerOperational=selectedProvider==='apollo'?provider.available&&providerDiagnostic?.auth?.pass!==false:selectedProvider==='instantly_supersearch'&&instantlyState?.metrics_json?.supersearch_permission_verified===true;
    const shouldDiscover=!emergency.safe_mode&&!emergency.paid_discovery_paused&&providerOperational&&uniqueCompaniesBefore<targetUnique;
    const discoveryAction=emergency.safe_mode||emergency.paid_discovery_paused?'safe_mode_no_external_discovery':!selectedProvider?providerSelection.reason:uniqueCompaniesBefore>=targetUnique?'warehouse_target_reached':shouldDiscover?'continue_controlled_harvest':'provider_degraded';

    const blockedMarkets=new Set(capabilityControls.filter((row:any)=>row.blocked===true&&(!row.effective_to||Date.parse(row.effective_to)>Date.now())).map((row:any)=>String(row.jurisdiction||'').toUpperCase()));
    const marketPriority=new Map<string,number>(marketProfiles.map((row:any)=>[String(row.jurisdiction||'').toUpperCase(),/READY|HIGH|PRIORITY/i.test(String(row.commercial_priority_status||''))?0:1] as [string,number]));
    const requestedCountries=(Array.isArray(policy.countries)?policy.countries:[]).map((value:any)=>String(value).toUpperCase()).filter((value:string)=>value&&!blockedMarkets.has(value)).sort((a:string,b:string)=>(marketPriority.get(a)??1)-(marketPriority.get(b)??1)||a.localeCompare(b));
    const verticals=(Array.isArray(policy?.icp_json?.verticals)&&policy.icp_json.verticals.length?policy.icp_json.verticals:[policy?.icp_json?.industry||'ecommerce']).map((value:any)=>String(value)).slice(0,20);
    const employeeRanges=(Array.isArray(policy?.icp_json?.employee_ranges)&&policy.icp_json.employee_ranges.length?policy.icp_json.employee_ranges:['10,50','50,200','200,1000']).map((value:any)=>String(value)).slice(0,12);
    const checkpointByKey=new Map<string,any>(checkpoints.map((row:any)=>[String(row.checkpoint_key),row] as [string,any]));
    const partitions:any[]=[];
    for(const country of requestedCountries)for(const vertical of verticals)for(const employee_range of employeeRanges){
      const partition={country,vertical,employee_range,technology:''};
      const key=discoveryPartitionKey(selectedProvider||'unavailable',partition);
      const checkpoint=checkpointByKey.get(key);
      partitions.push({key,partition,checkpoint,last_attempt_at:checkpoint?.last_attempt_at||null,next_eligible_at:checkpoint?.next_eligible_at||null});
    }
    const eligiblePartitions=partitions.filter((item)=>!item.next_eligible_at||Date.parse(item.next_eligible_at)<=Date.now()).sort((a,b)=>Date.parse(a.last_attempt_at||'1970-01-01')-Date.parse(b.last_attempt_at||'1970-01-01')||a.key.localeCompare(b.key));
    const partitionsPerRun=Math.max(1,Math.min(4,Number(policy?.icp_json?.partitions_per_run||1)));
    const selectedPartitions=eligiblePartitions.slice(0,partitionsPerRun);
    const perRun=Math.max(1,Math.min(100,Number(policy?.icp_json?.per_run||100)));
    const discoveryRuns:any[]=[];
    if(shouldDiscover){
      for(const selected of selectedPartitions){
        const countryCode=selected.partition.country;
        const result=await base44.functions.invoke('leadOrchestrator',{icp:{
          provider:selectedProvider,industry:selected.partition.vertical,vertical:selected.partition.vertical,titles:policy.icp_json?.titles||[],seniorities:policy.icp_json?.seniorities||[],
          country:COUNTRY_NAMES[countryCode]||countryCode,country_code:countryCode,employee_range:selected.partition.employee_range,per_page:perRun,limit:perRun,
          page:Number(selected.checkpoint?.page||1),checkpoint_id:selected.checkpoint?.id||undefined,checkpoint_key:selected.key,enrichment_threshold:Number(policy?.icp_json?.enrichment_threshold||45),
        },internal_secret:internal}).catch((error:any)=>({data:{ok:false,error:String(error?.message||error).slice(0,160)}}));
        const outer=result?.data||result||{};
        const data=outer?.data||outer;
        const discoveryResult=data?.executed?.find((step:any)=>step?.step==='leadDiscoveryAgent')?.result||data;
        discoveryRuns.push({checkpoint_key:selected.key,country:countryCode,vertical:selected.partition.vertical,employee_range:selected.partition.employee_range,ok:data.ok!==false,status:data.status||null,scanned:discoveryResult.scanned??null,created:discoveryResult.count??null,decision_makers_found:discoveryResult.decision_makers_found??null,quality_rejected:discoveryResult.rejected_count??null,duplicate_rejected:discoveryResult.duplicate_rejected??null,next_page:discoveryResult.next_page??null,error:data.error||null});
      }
    }

    const leads=await service.entities.OutboundLead.list('-created_date',5000).catch((error:any)=>safeBestEffort(error,{operation:'alwaysOnLeadDiscoveryWorker',fallback:[],severity:'secondary'}));
    const uniqueCompanies=new Set(leads.map((lead:any)=>String(lead.canonical_company_key||normalizeCompanyDomain(lead.company_domain))).filter(Boolean)).size;
    const rankedForDedupe=[...leads].sort((a:any,b:any)=>Number(b.score||b.pre_score||0)-Number(a.score||a.pre_score||0)||Date.parse(b.updated_date||b.created_date||'')-Date.parse(a.updated_date||a.created_date||''));
    const companyWinner=new Map<string,string>();
    const duplicateLeadIds=new Set<string>();
    let deduplicated=0;
    for(const lead of rankedForDedupe){
      const domain=normalizeCompanyDomain(lead.company_domain);if(!domain)continue;
      const canonicalKey=`domain:${domain}`;
      if(!lead.canonical_company_key)await service.entities.OutboundLead.update(lead.id,{canonical_company_key:canonicalKey,reservoir_updated_at:now()}).catch((error:any)=>safeBestEffort(error,{operation:'alwaysOnLeadDiscoveryWorker',fallback:null,severity:'secondary'}));
      if(!companyWinner.has(domain)){companyWinner.set(domain,lead.id);continue;}
      if(!['contacted','meeting','won'].includes(String(lead.stage))){await service.entities.OutboundLead.update(lead.id,{reservoir_state:'disqualified',suppression_reason:`duplicate_company:${companyWinner.get(domain)}`,reservoir_updated_at:now()}).catch((error:any)=>safeBestEffort(error,{operation:'alwaysOnLeadDiscoveryWorker',fallback:null,severity:'secondary'}));duplicateLeadIds.add(lead.id);deduplicated++;}
    }

    let suppressed=0,qualified=0,highConfidence=0,outreachReady=0,contactable=0,stale=0;
    const staleCutoff=Date.now()-30*86400000;
    for(const lead of leads){
      if(duplicateLeadIds.has(lead.id)||lead.reservoir_state==='disqualified')continue;
      const email=String(lead.contact_email||'').trim().toLowerCase();
      const suppression=email?await service.entities.ContactSuppression.filter({email,active:true},'-created_date',1).catch((error:any)=>safeBestEffort(error,{operation:'alwaysOnLeadDiscoveryWorker',fallback:[],severity:'secondary'})):[];
      if(suppression.length){suppressed++;await service.entities.OutboundLead.update(lead.id,{reservoir_state:'suppressed',outreach_eligibility:'BLOCKED',suppression_reason:'contact_suppression',reservoir_updated_at:now()}).catch((error:any)=>safeBestEffort(error,{operation:'alwaysOnLeadDiscoveryWorker',fallback:null,severity:'secondary'}));continue;}
      const score=Number(lead.score||lead.pre_score||0),confidence=Number(lead.score_breakdown_json?.evidence_confidence||0);
      const isQualified=['scored','outreach_ready'].includes(String(lead.stage))&&score>=minScore;if(isQualified)qualified++;
      if(isQualified&&confidence>=.75)highConfidence++;
      if(lead.contactability==='PROFESSIONAL_VERIFIED')contactable++;
      const isReady=isQualified&&confidence>=.55&&lead.contactability==='PROFESSIONAL_VERIFIED'&&lead.compliance_status==='CLEARED'&&lead.outreach_eligibility==='ELIGIBLE';
      if(isReady){outreachReady++;await service.entities.OutboundLead.update(lead.id,{reservoir_state:'ready',revenue_stage:'outreach_ready',outreach_ready_at:lead.outreach_ready_at||now(),last_verified_at:now(),reservoir_updated_at:now()}).catch((error:any)=>safeBestEffort(error,{operation:'alwaysOnLeadDiscoveryWorker',fallback:null,severity:'secondary'}));}
      else if(['lead','enriched','scored'].includes(String(lead.stage))){await service.entities.OutboundLead.update(lead.id,{reservoir_state:lead.stage==='lead'?'discovered':lead.stage==='enriched'?'enriching':'qualified',reservoir_updated_at:now()}).catch((error:any)=>safeBestEffort(error,{operation:'alwaysOnLeadDiscoveryWorker',fallback:null,severity:'secondary'}));}
      const lastVerified=Date.parse(lead.last_enriched_at||lead.last_verified_at||lead.updated_date||lead.created_date||'');if(!Number.isFinite(lastVerified)||lastVerified<staleCutoff)stale++;
    }

    const coverage=capacity>0?Number((outreachReady/capacity).toFixed(2)):outreachReady>0?999:0;
    const targetDays=Math.max(.5,Math.min(30,Number(policy?.icp_json?.pipeline_coverage_days||3)));
    const coverageStatus=uniqueCompanies>=targetUnique?'EXCESS':uniqueCompanies>=Math.max(100,targetUnique*.25)?'HEALTHY':'LOW';
    const countryBreakdown=countBy(leads,(lead)=>lead.country);
    const verticalBreakdown=countBy(leads,(lead)=>lead.industry);
    const opportunityBreakdown={unknown:leads.filter((lead:any)=>!Number.isFinite(Number(lead.score||lead.pre_score))).length,low:leads.filter((lead:any)=>Number(lead.score||lead.pre_score)<50).length,medium:leads.filter((lead:any)=>Number(lead.score||lead.pre_score)>=50&&Number(lead.score||lead.pre_score)<70).length,high:leads.filter((lead:any)=>Number(lead.score||lead.pre_score)>=70).length};
    const latestCheckpoints=await service.entities.LeadDiscoveryCheckpoint.list('-last_attempt_at',1000).catch((error:any)=>safeBestEffort(error,{operation:'alwaysOnLeadDiscoveryWorker',fallback:[],severity:'secondary'}));
    const harvestMetrics={
      companies_scanned:latestCheckpoints.reduce((sum:number,row:any)=>sum+Number(row.candidates_scanned||0),0),unique_companies:uniqueCompanies,
      duplicates_rejected:latestCheckpoints.reduce((sum:number,row:any)=>sum+Number(row.duplicates_rejected||0),0)+deduplicated,quality_rejected:latestCheckpoints.reduce((sum:number,row:any)=>sum+Number(row.quality_rejected||0),0),
      enrichment_candidates:latestCheckpoints.reduce((sum:number,row:any)=>sum+Number(row.enrichment_candidates||0),0),contactable,high_fit:qualified,outreach_ready:outreachReady,
      partitions_total:partitions.length,partitions_touched:latestCheckpoints.filter((row:any)=>row.source_key===selectedProvider&&row.partition_json?.kind!=='provider_diagnostic').length,
    };
    const latestSuccess=latestCheckpoints.map((row:any)=>row.last_success_at).filter(Boolean).sort().at(-1)||null;
    const nextScheduled=new Date(Date.now()+3600000).toISOString();
    const reservoir=await service.entities.LeadReservoirSnapshot.create({
      snapshot_key:`reservoir:${Date.now()}`,captured_at:now(),discovered:leads.filter((lead:any)=>lead.stage==='lead').length,enriching:leads.filter((lead:any)=>lead.stage==='enriched').length,
      qualified,high_confidence:highConfidence,outreach_ready:outreachReady,queued:0,waiting_window:0,waiting_capacity:Math.max(0,outreachReady-capacity),suppressed,disqualified:deduplicated,stale,
      safe_daily_send_capacity:capacity,coverage_days:coverage,target_coverage_days:targetDays,coverage_status:coverageStatus,discovery_action:discoveryAction,
      cost_guard_json:{per_run_limit:perRun,partitions_per_run:partitionsPerRun,enrichment_daily_limit:Number(policy?.icp_json?.enrichment_daily_limit||25),enrichment_weekly_limit:Number(policy?.icp_json?.enrichment_weekly_limit||125),target_unique_companies:targetUnique,countries_this_run:selectedPartitions.map((item)=>item.partition.country),safe_mode:emergency.safe_mode,selected_provider:selectedProvider,note:selectedProvider==='apollo'?'Apollo Organization Search remains cost-reserved and enrichment selective.':'Instantly SuperSearch begins with its official preview endpoint; paid enrichment remains separately cost-gated.'},
      country_breakdown_json:countryBreakdown,vertical_breakdown_json:verticalBreakdown,opportunity_breakdown_json:opportunityBreakdown,
      provider_status_json:{selected:selectedProvider,selection_reason:providerSelection.reason,apollo:{...provider,status:providerDiagnostic?.auth?.pass===false?'DEGRADED':provider.status,auth_test_pass:providerDiagnostic?.auth?.pass??null,usage:providerDiagnostic?.usage||null,expires_at:APOLLO_EXPIRY_AT},instantly_supersearch:{status:instantlyState?.status||'NOT_CONFIGURED',auth_test_pass:instantlyState?.auth_test_pass===true,permission_verified:instantlyState?.metrics_json?.supersearch_permission_verified===true}},
      harvest_metrics_json:harvestMetrics,last_successful_run_at:latestSuccess,next_scheduled_run_at:nextScheduled,checkpoint_id:selectedPartitions[0]?.checkpoint?.id||null,engine_version:VERSION,
    });

    const intelligence=buildCommercialIntelligence(leads, policy);
    const commercialSnapshot=await service.entities.CommercialIntelligenceSnapshot.create({snapshot_key:`commercial:${Date.now()}`,generated_at:intelligence.generated_at,engine_version:intelligence.version,policy_key:policy.policy_key,policy_version:String(policy.version||''),market_sizing_json:intelligence.market_sizing,prioritization_json:intelligence.prioritization,lead_graph_json:intelligence.lead_graph,forecast_json:intelligence.forecast,learning_json:intelligence.learning,data_quality_json:intelligence.data_quality,source_coverage_json:{...intelligence.source_coverage,provider_status:{selected:selectedProvider,apollo:provider.status,instantly_supersearch:instantlyState?.status||'NOT_CONFIGURED'},configured_markets:requestedCountries,blocked_markets:[...blockedMarkets]},unknowns:intelligence.unknowns,reservoir_snapshot_id:reservoir.id});
    await service.entities.Event.create({brand_id:'_platform',event_type:'commercial.intelligence.snapshot.created',source:'always_on_lead_discovery',entity_type:'CommercialIntelligenceSnapshot',entity_id:commercialSnapshot.id,payload_json:{engine_version:COMMERCIAL_INTELLIGENCE_VERSION,reservoir_snapshot_id:reservoir.id,market_methodology:intelligence.market_sizing.methodology},status:'pending'}).catch((error:any)=>safeBestEffort(error,{operation:'alwaysOnLeadDiscoveryWorker',fallback:null,severity:'secondary'}));
    return Response.json({ok:true,engine_version:VERSION,reservoir_snapshot_id:reservoir.id,commercial_intelligence_snapshot_id:commercialSnapshot.id,discovery_enabled:true,scheduled_discovery:scheduledDiscovery,outbound_policy_status:policy.status,coverage_days:coverage,target_coverage_days:targetDays,coverage_status:coverageStatus,outreach_ready:outreachReady,safe_daily_send_capacity:capacity,discovery_action:discoveryAction,discovery_runs:discoveryRuns,safe_mode:emergency.safe_mode,deduplicated,suppressed,harvest_metrics:harvestMetrics,provider_status:{selected:selectedProvider,reason:providerSelection.reason,apollo:provider.status,instantly_supersearch:instantlyState?.status||'NOT_CONFIGURED'},market_sizing:intelligence.market_sizing,source_coverage:intelligence.source_coverage});
  }catch(error){__schedulerOk=false;console.error('alwaysOnLeadDiscoveryWorker failed',String((error as Error)?.message||error).slice(0,200));return Response.json({ok:false,error:'always_on_lead_discovery_failed'},{status:500})}
  finally{if(__schedulerSvc&&__schedulerClaim)await finishSchedulerRunOrThrow(__schedulerSvc,__schedulerClaim,{worker_key:'alwaysOnLeadDiscoveryWorker'},__schedulerOk)}
});
