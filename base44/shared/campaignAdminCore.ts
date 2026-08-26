// CAMP-C2 (2026-08-16) — the Campaigns admin handler, extracted from
// commercialCampaignAdmin.ts so behavior tests can invoke it without the Deno
// Base44 SDK specifier (same pattern as emergencyControlAdminCore.ts).
// commercialCampaignAdmin.ts remains the only trust boundary: client creation,
// auth resolution and body parsing happen there, nothing else.
// This route never performs an external effect.
import { readRuntimeRows, readRuntimeSource, requireRuntimeSource, runtimeSourceCoverage } from './runtimeSourceRead.ts';
import { CAMPAIGN_LANES, canonicalCampaignState } from './campaignsCore.ts';
import { buildCampaignsOverview, filterCampaignSummaries, projectCampaignSummary } from './campaignsReadModel.ts';
// CAMP-C3: audience/content/sequence/preflight authorities.
import { audienceContentHash, buildAudienceReconciliation } from './campaignAudienceBuilder.ts';
import { validateCampaignContent } from './campaignContentValidator.ts';
import { validateCampaignSequence } from './campaignSequenceValidator.ts';
import { buildApprovalBinding, buildCampaignPreflight } from './campaignPreflight.ts';
import { sha256 } from './intelligenceCore.ts';
// COMMAND-C1: the FounderPermit authority now exists and is consulted here.
import { evaluatePermit } from './founderPermitAuthority.ts';
import { LEAD_LAUNCH_MARKETS, leadMarketScope, projectLeadPerson } from './leadPeopleProjection.ts';

const clean=(value:any,max=240)=>String(value??'').replace(/[\r\n\t]+/g,' ').trim().slice(0,max);
const unique=(value:any,max=1000)=>[...new Set((Array.isArray(value)?value:[]).map((item:any)=>clean(item,200)).filter(Boolean))].slice(0,max);

function normalizeLaunchMarkets(value:any){
  const requested=unique(value,60).map((market)=>leadMarketScope(market));
  return{
    markets:[...new Set(requested.filter((market)=>market.launch_market_eligible).map((market)=>market.country))],
    rejected:[...new Set(requested.filter((market)=>!market.launch_market_eligible).map((market)=>market.observed_country||market.country))],
  };
}

/**
 * COMMAND-C1: does a live FounderPermit actually cover approving THIS campaign?
 *
 * Fail-closed at every step: no reference, an unreadable permit, or a permit
 * that fails evaluation all resolve to "not covered". The permit is evaluated
 * against the same live hard controls as any other action, so an emergency or a
 * protected market blocks coverage even when the permit itself is valid.
 */
async function resolveCampaignPermitCoverage(svc:any,campaign:any,emergency:any,emergencyAvailable:boolean){
  const permitId=clean(campaign?.founder_permit_id);
  if(!permitId)return{covered:false,blockers:['no_founder_permit_bound_to_campaign'],permit_id:null};
  const read=await readRuntimeSource<any>({source:'campaign_preflight_permit',read:()=>svc.entities.FounderPermit.get(permitId),fallback:null});
  if(read.status==='UNAVAILABLE')return{covered:false,blockers:['founder_permit_unreadable'],permit_id:permitId};
  const permit=read.value;
  if(!permit)return{covered:false,blockers:['founder_permit_not_found'],permit_id:permitId};
  const evaluation=evaluatePermit({
    permit,
    now:new Date().toISOString(),
    presented_permit_hash:clean(campaign?.approval_binding_json?.permit_hash)||undefined,
    request:{
      domain:'campaign',
      tool_id:'cambra.campaign.request_approval',
      read_or_write:'WRITE',
      effect_class:'campaign_config',
      entity_type:'CommercialCampaign',
      entity_id:clean(campaign?.id),
      market:(Array.isArray(campaign?.market_scope)?campaign.market_scope:[])[0],
      environment:'production',
    },
    controls:{
      emergency,
      emergencyAvailable,
      // Approving a configuration is not a send, so no recipient suppression
      // applies at this point; the send path re-checks it for real.
      suppressionAvailable:true,
      recipient_suppressed:false,
      tenant_matches:true,
      exposes_secret:false,
      market_commercially_eligible:true,
      legal_block:false,
    },
  });
  return{covered:evaluation.allowed,blockers:evaluation.blockers,permit_id:permitId,permit_hash:clean(permit.permit_hash)};
}

function readiness(profile:any){
  const ready=Boolean(profile?.profile_key&&profile?.domain&&profile?.from_address&&profile?.status==='active'&&Number(profile?.current_daily_cap||0)>0&&(profile?.provider!=='instantly'||(profile?.provider_config_json?.sender_ready===true&&profile?.provider_config_json?.native_ai_conflict!==true&&profile?.webhook_status==='ACTIVE')));
  return{ready,cap:ready?Math.max(0,Number(profile.current_daily_cap||0)):0};
}

/**
 * CAMP-C2 (2026-08-16): the handler body lives here so behavior tests can
 * invoke it without constructing a Request or a Base44 client (same extraction
 * pattern as emergencyControlAdminCore.ts). handleCommercialCampaignAdmin
 * below stays the only trust boundary: client creation, auth resolution and
 * body parsing happen there, nothing else.
 *
 * This route never performs an external effect. Every response therefore
 * carries external_send_performed:false.
 */
export async function handleCampaignAdminAction(user:any,body:any,svc:any):Promise<Response>{
  if(!user||user.role!=='admin')return Response.json({ok:false,error:'admin_required'},{status:403});
  const action=String(body?.action||'list');

  if(action==='overview'){
    // Each source is read independently so one failure degrades exactly one
    // part of the response to UNKNOWN instead of emptying the whole page.
    const [campaignRead,controlRead,emergencyRead]=await Promise.all([
      readRuntimeRows({source:'commercial_campaign_overview',limit:500,read:()=>svc.entities.CommercialCampaign.list('-updated_at',500)}),
      readRuntimeRows({source:'commercial_campaign_overview_control',limit:2,read:()=>svc.entities.OutboundControl.filter({control_key:'global'},'-created_date',2)}),
      readRuntimeRows({source:'commercial_campaign_overview_emergency',limit:2,read:()=>svc.entities.EmergencyControl.filter({control_key:'global'},'-updated_at',2)}),
    ]);
    const campaignsAvailable=campaignRead.status!=='UNAVAILABLE';
    const controls=controlRead.value||[];
    const emergencies=emergencyRead.value||[];
    const overview=buildCampaignsOverview({
      campaigns:campaignRead.value||[],
      campaignsAvailable,
      campaignsFreshness:(campaignRead.value||[])[0]?.updated_at||null,
      campaignsBlocker:campaignsAvailable?null:'commercial_campaign_source_unavailable',
      // A duplicated or unreadable singleton authority is UNKNOWN, never a
      // silently chosen first row.
      outboundControl:controls.length===1?controls[0]:null,
      outboundControlAvailable:controlRead.status!=='UNAVAILABLE'&&controls.length===1,
      emergency:emergencies.length===1?emergencies[0]:null,
      emergencyAvailable:emergencyRead.status!=='UNAVAILABLE'&&emergencies.length===1,
    });
    return Response.json({ok:true,...overview,data_status:campaignRead.status,source_coverage:runtimeSourceCoverage({campaigns:campaignRead,outbound_control:controlRead,emergency_control:emergencyRead}),external_send_performed:false});
  }

  if(action==='list'){
    const read=await readRuntimeRows({source:'commercial_campaign_list',limit:500,read:()=>svc.entities.CommercialCampaign.list('-updated_at',500)});
    const available=read.status!=='UNAVAILABLE';
    const projected=available?(read.value||[]).map(projectCampaignSummary):[];
    const filtered=filterCampaignSummaries(projected,{
      status:body?.status,lane:body?.lane,market:body?.market,owner:body?.owner,
      needs_attention:body?.needs_attention===true,search:body?.search,
    });
    return Response.json({
      ok:true,
      // `campaigns` keeps the raw rows for existing readers; `items` is the
      // canonical projection the new workspace consumes.
      campaigns:read.value,
      items:filtered,
      total:projected.length,
      returned:filtered.length,
      data_status:read.status,
      blockers:available?[]:['commercial_campaign_source_unavailable'],
      source_coverage:runtimeSourceCoverage({campaigns:read}),
      external_send_performed:false,
    },{status:available?200:503});
  }

  if(action==='builder_options'){
    const [leadRead,policyRead,profileRead,controlRead,audienceRead]=await Promise.all([
      readRuntimeRows({source:'campaign_builder_leads',limit:5000,read:()=>svc.entities.OutboundLead.list('-created_date',5000)}),
      readRuntimeRows({source:'campaign_builder_policies',limit:100,read:()=>svc.entities.CommercialPolicy.filter({engine:'merchant_acquisition'},'-updated_date',100)}),
      readRuntimeRows({source:'campaign_builder_profiles',limit:500,read:()=>svc.entities.OutboundSendingProfile.list('-created_date',500)}),
      readRuntimeRows({source:'campaign_builder_outbound_control',limit:2,read:()=>svc.entities.OutboundControl.filter({control_key:'global'},'-created_date',2)}),
      readRuntimeRows({source:'campaign_builder_saved_audiences',limit:500,read:()=>svc.entities.FounderSavedView.filter({view_type:'lead_audience'},'-updated_at',500)}),
    ]);
    const unavailable=[leadRead,policyRead,profileRead,controlRead].filter((read)=>read.status==='UNAVAILABLE');
    const search=clean(body?.search,160).toLowerCase();
    const country=clean(body?.country,20).toUpperCase();
    const currentAudiences=(audienceRead.value||[]).filter((view:any)=>view.is_current!==false);
    const requestedAudienceId=clean(body?.audience_id);
    const selectedAudience=requestedAudienceId?currentAudiences.find((view:any)=>String(view.id)===requestedAudienceId):null;
    if(requestedAudienceId&&!selectedAudience)return Response.json({ok:false,error:'lead_audience_not_found',external_send_performed:false},{status:404});
    const audienceLeadIds=selectedAudience?new Set(unique(selectedAudience.config_json?.lead_ids,1000)):null;
    const requestedLimit=Math.max(1,Math.min(1000,Number(body?.limit)||250));
    const allProjectedLeads=(leadRead.value||[]).map((lead:any)=>{
      const person=projectLeadPerson(lead);
      return{
        id:lead.id,company_name:lead.company_name||'',company_domain:lead.company_domain||'',canonical_company_key:lead.canonical_company_key||'',
        contact_full_name:person.person_name,contact_title:person.person_title,contact_email:person.person_email,
        country:person.country,industry:person.industry,score:person.score,
        personas:person.personas,primary_persona:person.primary_persona,
        employee_range:person.employee_range,revenue_range:person.revenue_range,
        estimated_gmv_min_eur:person.estimated_gmv_min_eur,estimated_gmv_max_eur:person.estimated_gmv_max_eur,gmv_truth_class:person.gmv_truth_class,
        score_breakdown:person.score_breakdown,reasons:person.reasons,pipeline_state:person.pipeline_state,
        contactability:lead.contactability||'UNKNOWN',outreach_eligibility:lead.outreach_eligibility||'NOT_ASSESSED',
        compliance_status:lead.compliance_status||'NOT_ASSESSED',reservoir_state:lead.reservoir_state||'UNKNOWN',
        readiness:person.readiness,blockers:person.blockers,
        launch_market_eligible:person.launch_market_eligible,market_scope_status:person.market_scope_status,
      };
    });
    const projectedLeads=allProjectedLeads.filter((lead:any)=>lead.launch_market_eligible===true).filter((lead:any)=>{
      if(audienceLeadIds&&!audienceLeadIds.has(String(lead.id)))return false;
      if(country&&String(lead.country||'').toUpperCase()!==country)return false;
      if(!search)return true;
      return[lead.company_name,lead.company_domain,lead.contact_full_name,lead.contact_title,lead.contact_email]
        .some((value)=>String(value||'').toLowerCase().includes(search));
    }).sort((left:any,right:any)=>{
      const rank:any={READY:0,REVIEW_REQUIRED:1,BLOCKED:2};
      return(rank[left.readiness]??9)-(rank[right.readiness]??9)||Number(right.score||0)-Number(left.score||0)||String(left.company_name||'').localeCompare(String(right.company_name||''),'en');
    });
    const controls=controlRead.value||[];
    const outboundStatus=controlRead.status==='UNAVAILABLE'||controls.length!==1?'UNKNOWN':controls[0]?.acquisition_enabled===true?'ENABLED':'PAUSED_ZERO';
    const sourceCoverage=runtimeSourceCoverage({leads:leadRead,policies:policyRead,sending_profiles:profileRead,outbound_control:controlRead,audiences:audienceRead});
    const response={
      ok:unavailable.length===0,
      ...(unavailable.length?{error:'campaign_builder_sources_unavailable'}:{}),
      leads:projectedLeads.slice(0,requestedLimit),
      lead_counts:{total:projectedLeads.length,returned:Math.min(projectedLeads.length,requestedLimit),ready:projectedLeads.filter((lead:any)=>lead.readiness==='READY').length,review_required:projectedLeads.filter((lead:any)=>lead.readiness==='REVIEW_REQUIRED').length,blocked:projectedLeads.filter((lead:any)=>lead.readiness==='BLOCKED').length,excluded_non_launch:allProjectedLeads.filter((lead:any)=>lead.launch_market_eligible!==true).length},
      launch_markets:LEAD_LAUNCH_MARKETS,
      target_profiles:(policyRead.value||[]).map((policy:any)=>({
        id:policy.id,policy_key:policy.policy_key||'',version:policy.version||'',name:policy.icp_json?.profile_name||policy.version||policy.policy_key||policy.id,
        status:policy.status||'unknown',countries:normalizeLaunchMarkets(policy.countries).markets,daily_send_limit:Number(policy.daily_send_limit||0),
        provider_mode:String(policy.icp_json?.provider_mode||'AUTO').toUpperCase(),sending_profile_keys:Array.isArray(policy.sending_profile_keys)?policy.sending_profile_keys:[],
      })),
      audiences:currentAudiences.map((view:any)=>({
        id:view.id,view_key:view.view_key||'',name:view.name||view.id,revision:Number(view.revision||1),
        member_count:Number(view.config_json?.member_count||view.config_json?.lead_ids?.length||0),
        readiness_counts:view.config_json?.readiness_counts||{},summary:view.config_json?.summary||'',
      })),
      selected_audience:selectedAudience?{
        id:selectedAudience.id,name:selectedAudience.name||selectedAudience.id,
        member_count:Number(selectedAudience.config_json?.member_count||selectedAudience.config_json?.lead_ids?.length||0),
      }:null,
      audiences_status:audienceRead.status,
      senders:(profileRead.value||[]).map((profile:any)=>({
        id:profile.id,profile_key:profile.profile_key||'',provider:profile.provider||'',domain:profile.domain||'',from_address:profile.from_address||'',
        status:profile.status||'unknown',current_daily_cap:Number(profile.current_daily_cap||0),target_daily_cap:Number(profile.target_daily_cap||0),
        webhook_status:profile.webhook_status||'NOT_CONFIGURED',readiness:readiness(profile),
      })),
      outbound_posture:{status:outboundStatus,capacity:outboundStatus==='ENABLED'?(profileRead.value||[]).reduce((sum:number,profile:any)=>sum+readiness(profile).cap,0):0},
      source_coverage:sourceCoverage,
      external_send_performed:false,
    };
    return Response.json(response,{status:unavailable.length?503:200});
  }

  if(action==='create_draft'){
    const leadIds=unique(body.lead_ids,1000);if(!leadIds.length)return Response.json({ok:false,error:'campaign_leads_required'},{status:400});
    const lane=clean(body.lane,60).toUpperCase();
    if(lane&&!(CAMPAIGN_LANES as readonly string[]).includes(lane))return Response.json({ok:false,error:'unsupported_campaign_lane',supported_lanes:CAMPAIGN_LANES},{status:400});
    const leadRead=await readRuntimeRows({source:'commercial_campaign_leads',limit:5000,read:()=>svc.entities.OutboundLead.list('-created_date',5000)});const all=requireRuntimeSource(leadRead);const byId=new Map(all.map((lead:any)=>[String(lead.id),lead]));const selected=leadIds.map((id)=>byId.get(id)).filter(Boolean);
    if(selected.length!==leadIds.length)return Response.json({ok:false,error:'unknown_or_unavailable_lead_ids',requested:leadIds.length,resolved:selected.length},{status:409});
    const selectedPeople=selected.map(projectLeadPerson);const nonLaunch=selectedPeople.filter((lead:any)=>lead.launch_market_eligible!==true);
    if(nonLaunch.length)return Response.json({ok:false,error:'campaign_contains_non_launch_leads',blocked_lead_ids:nonLaunch.map((lead:any)=>lead.id),active_launch_markets:LEAD_LAUNCH_MARKETS},{status:409});
    const blocked=selected.filter((lead:any)=>lead.reservoir_state==='suppressed'||lead.outreach_eligibility==='BLOCKED'||lead.compliance_status==='BLOCKED');
    if(blocked.length)return Response.json({ok:false,error:'campaign_contains_blocked_leads',blocked_lead_ids:blocked.map((lead:any)=>lead.id)},{status:409});
    const requestedMarkets=Array.isArray(body.market_scope)?body.market_scope:selectedPeople.map((lead:any)=>lead.country);
    const normalizedMarkets=normalizeLaunchMarkets(requestedMarkets);
    if(normalizedMarkets.rejected.length)return Response.json({ok:false,error:'campaign_market_outside_active_launch',rejected_markets:normalizedMarkets.rejected,active_launch_markets:LEAD_LAUNCH_MARKETS},{status:409});
    if(!normalizedMarkets.markets.length)return Response.json({ok:false,error:'campaign_market_scope_required',active_launch_markets:LEAD_LAUNCH_MARKETS},{status:400});
    const targetProfileId=clean(body.target_profile_id);const policyRead=targetProfileId?await readRuntimeSource<any>({source:'commercial_campaign_target_policy',read:()=>svc.entities.CommercialPolicy.get(targetProfileId),fallback:null}):null;const policy=policyRead?requireRuntimeSource(policyRead):null;
    const now=new Date().toISOString();const key=`campaign:${Date.now()}:${crypto.randomUUID().slice(0,8)}`;
    const campaign=await svc.entities.CommercialCampaign.create({campaign_key:key,name:clean(body.name,120)||`CAMBRA campaign ${now.slice(0,10)}`,status:'DRAFT',...(lane?{lane}:{}),...(clean(body.objective_type,80)?{objective_type:clean(body.objective_type,80)}:{}),...(clean(body.description,500)?{description:clean(body.description,500)}:{}),market_scope:normalizedMarkets.markets,...(Array.isArray(body.language_scope)?{language_scope:unique(body.language_scope,40)}:{}),target_profile_id:policy?.id||'',policy_key:policy?.policy_key||'',policy_version:String(policy?.version||''),provider_mode:['AUTO','APOLLO','INSTANTLY','MANUAL'].includes(String(body.provider_mode).toUpperCase())?String(body.provider_mode).toUpperCase():'AUTO',lead_ids:leadIds,audience_snapshot_json:{lead_count:selected.length,filters:body.filters&&typeof body.filters==='object'?body.filters:{},canonical_company_keys:selected.map((lead:any)=>lead.canonical_company_key).filter(Boolean),market_scope_decision:'FOUNDER_ACTIVE_LAUNCH_10',captured_at:now},strategy_ids:[],message_json:{status:'NOT_PREPARED'},sequence_json:{status:'NOT_PREPARED'},sending_profile_keys:unique(body.sending_profile_keys,100),capacity_preview_json:{capacity:0,blockers:['campaign_not_prepared','founder_pilot_authorization_required']},external_refs_json:{},blockers:['campaign_not_prepared','founder_pilot_authorization_required'],created_by:user.email||user.id,created_at:now,updated_at:now,metrics_json:{selected_leads:selected.length,sent:0,replied:0,meetings:0}});
    try{await svc.entities.OperationalLog.create({event_type:'commercial_campaign_draft_created',message:campaign.name,data_json:{campaign_id:campaign.id,lead_count:selected.length,provider_mode:campaign.provider_mode,lane:lane||null,external_send_performed:false},actor_email:user.email,created_at:now});}
    catch(error:any){
      const blocker='campaign_audit_persistence_failed';
      try{await svc.entities.CommercialCampaign.update(campaign.id,{status:'DRAFT',blockers:[...new Set([...(campaign.blockers||[]),blocker])],updated_at:new Date().toISOString()});}catch{/* response remains fail-closed even if containment projection also fails */}
      // public-errors:allow-diagnostic — fail-closed 503 with a bounded 120-char `detail` so
      // the operator can distinguish audit-plane outages from real failures; the fixed `error`
      // code is the authoritative machine-readable value.
      return Response.json({ok:false,error:blocker,campaign_id:campaign.id,external_send_performed:false,review_required:true,detail:String(error?.code||error?.message||'audit_unavailable').slice(0,120)},{status:503});
    }
    return Response.json({ok:true,campaign,item:projectCampaignSummary(campaign),external_send_performed:false});
  }

  const id=clean(body.campaign_id);if(!id)return Response.json({ok:false,error:'campaign_id_required'},{status:400});const campaignRead=await readRuntimeRows({source:'commercial_campaign_authority',read:()=>svc.entities.CommercialCampaign.filter({id},'-updated_at',2)});const campaignRows=requireRuntimeSource(campaignRead);if(campaignRows.length>1)return Response.json({ok:false,error:'campaign_authority_ambiguous'},{status:409});const campaign=campaignRows[0]||null;if(!campaign)return Response.json({ok:false,error:'campaign_not_found'},{status:404});

  if(action==='detail'){
    // Versioned authorities are read per campaign. Their absence on a legacy
    // row is reported as a gap, never reconstructed from the inline
    // message_json/sequence_json.
    const [audienceRead,contentRead,sequenceRead,enrollmentRead]=await Promise.all([
      readRuntimeRows({source:'campaign_detail_audience',limit:50,read:()=>svc.entities.CampaignAudienceVersion.filter({campaign_id:campaign.id},'-version',50)}),
      readRuntimeRows({source:'campaign_detail_content',limit:50,read:()=>svc.entities.CampaignContentVersion.filter({campaign_id:campaign.id},'-version',50)}),
      readRuntimeRows({source:'campaign_detail_sequence',limit:50,read:()=>svc.entities.CampaignSequenceVersion.filter({campaign_id:campaign.id},'-version',50)}),
      readRuntimeRows({source:'campaign_detail_enrollments',limit:1,read:()=>svc.entities.CampaignEnrollment.filter({campaign_id:campaign.id},'-updated_at',1)}),
    ]);
    const item=projectCampaignSummary(campaign);
    const gaps=[
      ...(audienceRead.value?.length?[]:['no_versioned_audience']),
      ...(contentRead.value?.length?[]:['no_versioned_content']),
      ...(sequenceRead.value?.length?[]:['no_versioned_sequence']),
    ];
    return Response.json({
      ok:true,
      item,
      campaign,
      audience_versions:audienceRead.value||[],
      content_versions:contentRead.value||[],
      sequence_versions:sequenceRead.value||[],
      has_enrollments:(enrollmentRead.value||[]).length>0,
      canonical_model_gaps:gaps,
      legacy_projection:{
        lead_ids_count:Array.isArray(campaign.lead_ids)?campaign.lead_ids.length:0,
        audience_snapshot:campaign.audience_snapshot_json||null,
        message_prepared:item.legacy_message_prepared,
        sequence_prepared:item.legacy_sequence_prepared,
        note:'Legacy campaigns keep lead_ids and the inline message/sequence as their only audience/content evidence until a versioned authority is built for them.',
      },
      data_status:campaignRead.status,
      source_coverage:runtimeSourceCoverage({campaign:campaignRead,audience_versions:audienceRead,content_versions:contentRead,sequence_versions:sequenceRead}),
      external_send_performed:false,
    });
  }

  if(action==='update_draft'){
    // The guard uses the STORED status so a legacy READY_FOR_PILOT row stays
    // editable exactly as before this refactor.
    if(!['DRAFT','READY_FOR_PILOT','PAUSED'].includes(String(campaign.status)))return Response.json({ok:false,error:'active_campaign_not_editable',status:canonicalCampaignState(campaign.status).canonical},{status:409});
    const patch:any={updated_at:new Date().toISOString()};if(body.name!==undefined)patch.name=clean(body.name,120);if(body.message_json&&typeof body.message_json==='object')patch.message_json=body.message_json;if(body.sequence_json&&typeof body.sequence_json==='object')patch.sequence_json=body.sequence_json;if(Array.isArray(body.sending_profile_keys))patch.sending_profile_keys=unique(body.sending_profile_keys,100);
    if(body.lane!==undefined){const lane=clean(body.lane,60).toUpperCase();if(!(CAMPAIGN_LANES as readonly string[]).includes(lane))return Response.json({ok:false,error:'unsupported_campaign_lane',supported_lanes:CAMPAIGN_LANES},{status:400});patch.lane=lane;}
    if(body.objective_type!==undefined)patch.objective_type=clean(body.objective_type,80);
    if(body.description!==undefined)patch.description=clean(body.description,500);
    if(Array.isArray(body.market_scope)){
      const normalized=normalizeLaunchMarkets(body.market_scope);
      if(normalized.rejected.length)return Response.json({ok:false,error:'campaign_market_outside_active_launch',rejected_markets:normalized.rejected,active_launch_markets:LEAD_LAUNCH_MARKETS},{status:409});
      if(!normalized.markets.length)return Response.json({ok:false,error:'campaign_market_scope_required',active_launch_markets:LEAD_LAUNCH_MARKETS},{status:400});
      patch.market_scope=normalized.markets;
    }
    if(Array.isArray(body.language_scope))patch.language_scope=unique(body.language_scope,40);
    const updated=await svc.entities.CommercialCampaign.update(campaign.id,patch);return Response.json({ok:true,campaign:updated,item:projectCampaignSummary(updated),external_send_performed:false});
  }

  if(action==='prepare_pilot'){
    if(body.confirmation!=='PREPARE_CAMPAIGN_FOR_PILOT')return Response.json({ok:false,error:'confirmation_required',expected_confirmation:'PREPARE_CAMPAIGN_FOR_PILOT'},{status:409});
    const [policyRead,profileRead,controlRead,leadRead]=await Promise.all([campaign.target_profile_id?readRuntimeSource<any>({source:'commercial_campaign_prepare_policy',read:()=>svc.entities.CommercialPolicy.get(campaign.target_profile_id),fallback:null}):null,readRuntimeRows({source:'commercial_campaign_prepare_profiles',limit:500,read:()=>svc.entities.OutboundSendingProfile.list('-created_date',500)}),readRuntimeRows({source:'commercial_campaign_prepare_control',read:()=>svc.entities.OutboundControl.filter({control_key:'global'},'-created_date',2)}),readRuntimeRows({source:'commercial_campaign_prepare_leads',limit:5000,read:()=>svc.entities.OutboundLead.list('-created_date',5000)})]);
    const policy=policyRead?requireRuntimeSource(policyRead):null,profiles=requireRuntimeSource(profileRead),controls=requireRuntimeSource(controlRead),leads=requireRuntimeSource(leadRead);if(controls.length!==1)return Response.json({ok:false,error:controls.length?'outbound_control_authority_ambiguous':'outbound_control_required'},{status:409});
    const selected=new Set(campaign.lead_ids||[]);
    const selectedLeads=leads.filter((lead:any)=>selected.has(lead.id));
    const outsideLaunch=selectedLeads.filter((lead:any)=>projectLeadPerson(lead).launch_market_eligible!==true);
    const eligible=selectedLeads.filter((lead:any)=>projectLeadPerson(lead).launch_market_eligible===true&&lead.outreach_eligibility==='ELIGIBLE'&&lead.compliance_status==='CLEARED'&&lead.contactability==='PROFESSIONAL_VERIFIED');
    const allowed=new Set(campaign.sending_profile_keys?.length?campaign.sending_profile_keys:policy?.sending_profile_keys||[]);
    const readyProfiles=profiles.filter((profile:any)=>(!allowed.size||allowed.has(profile.profile_key))&&readiness(profile).ready);
    const senderCap=readyProfiles.reduce((sum:number,profile:any)=>sum+readiness(profile).cap,0);
    const policyCap=Math.max(0,Number(policy?.daily_send_limit||0));
    const blockers:string[]=[];
    if(!policy)blockers.push('target_profile_required');
    if(!campaign.message_json||campaign.message_json.status==='NOT_PREPARED')blockers.push('campaign_message_required');
    if(!campaign.sequence_json||campaign.sequence_json.status==='NOT_PREPARED')blockers.push('campaign_sequence_required');
    if(outsideLaunch.length)blockers.push('campaign_contains_non_launch_leads');
    if(!eligible.length)blockers.push('eligible_leads_required');
    if(!readyProfiles.length)blockers.push('ready_sending_profile_required');
    if(!policyCap)blockers.push('commercial_policy_daily_limit_missing');
    if(controls[0]?.acquisition_enabled!==true)blockers.push('founder_pilot_authorization_required');
    const capacity=Math.min(eligible.length,senderCap,policyCap);
    const hardBlockers=blockers.filter((value)=>value!=='founder_pilot_authorization_required');
    const status=hardBlockers.length?'DRAFT':'READY_FOR_PILOT';
    const updated=await svc.entities.CommercialCampaign.update(campaign.id,{status,capacity_preview_json:{capacity,eligible_leads:eligible.length,excluded_non_launch:outsideLaunch.length,sender_cap:senderCap,policy_cap:policyCap,outbound_master_enabled:controls[0]?.acquisition_enabled===true,previewed_at:new Date().toISOString()},blockers,updated_at:new Date().toISOString()});
    return Response.json({ok:true,campaign:updated,item:projectCampaignSummary(updated),ready_for_pilot:status==='READY_FOR_PILOT',external_send_performed:false});
  }

  if(action==='pause'){const updated=await svc.entities.CommercialCampaign.update(campaign.id,{status:'PAUSED',paused_at:new Date().toISOString(),updated_at:new Date().toISOString(),blockers:[...new Set([...(campaign.blockers||[]),'paused_by_founder'])]});return Response.json({ok:true,campaign:updated,item:projectCampaignSummary(updated),note:'Canonical campaign paused. Use global Founder Control for an immediate transport-wide stop.',external_send_performed:false});}

  // ---------------------------------------------------------------- CAMP-C3
  // Versioned audience / content / sequence, preflight and approval.
  // None of these actions calls a provider; the campaign cannot send until the
  // C4 execution engine exists, and even then only through the canonical
  // outbound send primitive. This module deliberately never names that
  // primitive: an existing seal test asserts the campaign admin surface does
  // not so much as reference it, which is a cheap and strong guarantee.

  if(action==='build_audience'){
    // Candidates come from the campaign's explicit lead selection. Discovery
    // Saved Searches and dynamic segments are additional source types wired in
    // C8; the reconciliation ladder below is identical whatever the source.
    const leadIds=Array.isArray(campaign.lead_ids)?campaign.lead_ids.map((value:any)=>clean(value,200)).filter(Boolean):[];
    if(!leadIds.length)return Response.json({ok:false,error:'campaign_has_no_selected_leads'},{status:409});
    const [leadRead,suppressionRead]=await Promise.all([
      readRuntimeRows({source:'campaign_audience_leads',limit:5000,read:()=>svc.entities.OutboundLead.filter({id:{$in:leadIds}},'-created_date',Math.max(1,leadIds.length))}),
      readRuntimeRows({source:'campaign_audience_suppressions',limit:5000,read:()=>svc.entities.ContactSuppression.filter({active:true},'-suppressed_at',5000)}),
    ]);
    // Fail closed: an unreadable suppression ledger must never be read as
    // "nobody is suppressed".
    const leads=requireRuntimeSource(leadRead);
    const suppressions=requireRuntimeSource(suppressionRead);
    const built=buildAudienceReconciliation(leads.map((lead:any)=>({
      subject_type:'OutboundLead',subject_id:lead.id,lead_id:lead.id,contact_id:lead.contact_id||lead.id,
      email:lead.contact_email,company_key:lead.canonical_company_key||lead.company_domain,
      company_name:lead.company_name,company_domain:lead.company_domain,country:projectLeadPerson(lead).country,
      city:lead.city,language:lead.language,last_contacted_at:lead.last_contacted_at||lead.last_outbound_at,
      is_merchant:lead.is_merchant===true||Boolean(lead.brand_id),
      policy_blocked:lead.outreach_eligibility==='BLOCKED'||lead.compliance_status==='BLOCKED',
      policy_block_reason:lead.suppression_reason||lead.compliance_status,
    })),{
      suppressions,
      contact_cooldown_days:Number(body?.contact_cooldown_days||0),
      max_contacts_per_company:Number(body?.max_contacts_per_company||campaign.company_contact_limit||0),
      exclude_existing_merchants:body?.exclude_existing_merchants!==false,
      now:new Date().toISOString(),
    });
    const priorRead=await readRuntimeRows({source:'campaign_audience_versions',limit:100,read:()=>svc.entities.CampaignAudienceVersion.filter({campaign_id:campaign.id},'-version',100)});
    const prior=priorRead.value||[];
    const version=prior.reduce((max:number,row:any)=>Math.max(max,Number(row.version)||0),0)+1;
    const contentHash=await audienceContentHash(sha256,{campaign_id:campaign.id,filters:campaign.audience_snapshot_json?.filters||null,eligible:built.eligible});
    const at=new Date().toISOString();
    const created=await svc.entities.CampaignAudienceVersion.create({
      audience_version_id:`audience:${campaign.id}:${version}`,campaign_id:campaign.id,version,
      mode:clean(body?.mode,40).toUpperCase()==='DYNAMIC_UNTIL_LAUNCH'?'DYNAMIC_UNTIL_LAUNCH':'SNAPSHOT',
      source_type:'EXPLICIT_IDS',source_refs:leadIds.slice(0,1000),
      canonical_filter_json:campaign.audience_snapshot_json?.filters||{},
      exclusion_reasons_json:{rows:built.excluded.slice(0,5000)},
      ...built.reconciliation,
      canonical_subject_ids:built.eligible.map((row:any)=>String(row.subject_id)).slice(0,5000),
      canonical_company_keys:[...new Set(built.eligible.map((row:any)=>String(row.company_key||'')).filter(Boolean))].slice(0,5000),
      content_hash:contentHash,captured_at:at,captured_by:user.email||user.id,
      status:built.reconciliation.final_eligible_count>0?'READY':'REVIEW_REQUIRED',
    });
    await svc.entities.CommercialCampaign.update(campaign.id,{audience_current_version_id:created.id,updated_at:at});
    return Response.json({ok:true,audience_version:created,reconciliation:built.reconciliation,reconciles:built.reconciles,excluded_sample:built.excluded.slice(0,50),external_send_performed:false});
  }

  if(action==='freeze_audience'){
    const versionId=clean(body?.audience_version_id)||clean(campaign.audience_current_version_id);
    if(!versionId)return Response.json({ok:false,error:'audience_version_required'},{status:400});
    const existing=await svc.entities.CampaignAudienceVersion.get(versionId);
    if(!existing)return Response.json({ok:false,error:'audience_version_not_found'},{status:404});
    if(String(existing.status)==='FROZEN')return Response.json({ok:true,audience_version:existing,already_frozen:true,external_send_performed:false});
    if(String(existing.status)!=='READY')return Response.json({ok:false,error:'audience_version_not_ready',status:existing.status},{status:409});
    const frozen=await svc.entities.CampaignAudienceVersion.update(existing.id,{status:'FROZEN',frozen_at:new Date().toISOString()});
    return Response.json({ok:true,audience_version:frozen,external_send_performed:false});
  }

  if(action==='validate_content'){
    const validation=validateCampaignContent({
      content:body?.content&&typeof body.content==='object'?body.content:{},
      sample:Array.isArray(body?.sample)?body.sample.slice(0,50):[],
      require_unsubscribe:body?.require_unsubscribe!==false,
    });
    if(body?.persist===true){
      const priorRead=await readRuntimeRows({source:'campaign_content_versions',limit:100,read:()=>svc.entities.CampaignContentVersion.filter({campaign_id:campaign.id},'-version',100)});
      const version=(priorRead.value||[]).reduce((max:number,row:any)=>Math.max(max,Number(row.version)||0),0)+1;
      const at=new Date().toISOString();
      const created=await svc.entities.CampaignContentVersion.create({
        content_version_id:`content:${campaign.id}:${version}`,campaign_id:campaign.id,version,
        language:clean(body?.content?.language,20)||'en',subject:clean(body?.content?.subject,300),
        preview_text:clean(body?.content?.preview_text,300),text_body:String(body?.content?.text_body||'').slice(0,20000),
        html_body:String(body?.content?.html_body||'').slice(0,60000),cta:clean(body?.content?.cta,200),
        variable_schema_json:body?.content?.variable_schema_json||{},
        unresolved_variables:validation.unresolved_variables,
        blocked_claims:validation.blocked_claims.map((row:any)=>String(row.claim_key)),
        quality_gate_json:validation,content_source:clean(body?.content_source,40).toUpperCase()||'HUMAN',
        content_hash:await sha256({campaign_id:campaign.id,version,subject:body?.content?.subject,text_body:body?.content?.text_body}),
        status:validation.status,created_by:user.email||user.id,created_at:at,
      });
      // Only a clean version becomes the current one; a REVIEW_REQUIRED draft
      // is stored as evidence but never promoted.
      if(validation.status==='VALIDATED')await svc.entities.CommercialCampaign.update(campaign.id,{content_current_version_id:created.id,updated_at:at});
      return Response.json({ok:true,validation,content_version:created,promoted:validation.status==='VALIDATED',external_send_performed:false});
    }
    return Response.json({ok:true,validation,persisted:false,external_send_performed:false});
  }

  if(action==='validate_sequence'){
    const validation=validateCampaignSequence({
      steps:Array.isArray(body?.sequence?.steps)?body.sequence.steps:[],
      stop_conditions:Array.isArray(body?.sequence?.stop_conditions)?body.sequence.stop_conditions:[],
      business_hours_policy_json:body?.sequence?.business_hours_policy_json,
      timezone_policy:body?.sequence?.timezone_policy,
      out_of_office_policy_json:body?.sequence?.out_of_office_policy_json,
      max_followups:body?.sequence?.max_followups,
    });
    if(body?.persist===true){
      const priorRead=await readRuntimeRows({source:'campaign_sequence_versions',limit:100,read:()=>svc.entities.CampaignSequenceVersion.filter({campaign_id:campaign.id},'-version',100)});
      const version=(priorRead.value||[]).reduce((max:number,row:any)=>Math.max(max,Number(row.version)||0),0)+1;
      const at=new Date().toISOString();
      const created=await svc.entities.CampaignSequenceVersion.create({
        sequence_version_id:`sequence:${campaign.id}:${version}`,campaign_id:campaign.id,version,
        steps_json:Array.isArray(body?.sequence?.steps)?body.sequence.steps:[],
        stop_conditions:Array.isArray(body?.sequence?.stop_conditions)?body.sequence.stop_conditions.map((value:any)=>clean(value,60).toUpperCase()):[],
        business_hours_policy_json:body?.sequence?.business_hours_policy_json||{},
        timezone_policy:clean(body?.sequence?.timezone_policy,60),
        out_of_office_policy_json:body?.sequence?.out_of_office_policy_json||{},
        max_followups:Number(body?.sequence?.max_followups||0),
        sequence_hash:await sha256({campaign_id:campaign.id,version,steps:body?.sequence?.steps,stop_conditions:body?.sequence?.stop_conditions}),
        status:validation.status,created_by:user.email||user.id,created_at:at,
      });
      if(validation.status==='VALIDATED')await svc.entities.CommercialCampaign.update(campaign.id,{sequence_current_version_id:created.id,updated_at:at});
      return Response.json({ok:true,validation,sequence_version:created,promoted:validation.status==='VALIDATED',external_send_performed:false});
    }
    return Response.json({ok:true,validation,persisted:false,external_send_performed:false});
  }

  if(action==='preflight'||action==='request_approval'){
    const [audienceRead,contentRead,sequenceRead,profileRead,policyRead,controlRead,emergencyRead]=await Promise.all([
      campaign.audience_current_version_id?readRuntimeSource<any>({source:'campaign_preflight_audience',read:()=>svc.entities.CampaignAudienceVersion.get(campaign.audience_current_version_id),fallback:null}):null,
      campaign.content_current_version_id?readRuntimeSource<any>({source:'campaign_preflight_content',read:()=>svc.entities.CampaignContentVersion.get(campaign.content_current_version_id),fallback:null}):null,
      campaign.sequence_current_version_id?readRuntimeSource<any>({source:'campaign_preflight_sequence',read:()=>svc.entities.CampaignSequenceVersion.get(campaign.sequence_current_version_id),fallback:null}):null,
      readRuntimeRows({source:'campaign_preflight_profiles',limit:500,read:()=>svc.entities.OutboundSendingProfile.list('-created_date',500)}),
      campaign.target_profile_id?readRuntimeSource<any>({source:'campaign_preflight_policy',read:()=>svc.entities.CommercialPolicy.get(campaign.target_profile_id),fallback:null}):null,
      readRuntimeRows({source:'campaign_preflight_control',limit:2,read:()=>svc.entities.OutboundControl.filter({control_key:'global'},'-created_date',2)}),
      readRuntimeRows({source:'campaign_preflight_emergency',limit:2,read:()=>svc.entities.EmergencyControl.filter({control_key:'global'},'-updated_at',2)}),
    ]);
    const controls=controlRead.value||[];const emergencies=emergencyRead.value||[];
    // COMMAND-C1: resolve whether a real FounderPermit covers this campaign.
    // A campaign with no permit reference, an unreadable permit, or a permit
    // that fails evaluation is simply "not covered" — never assumed covered.
    const permitCoverage=await resolveCampaignPermitCoverage(svc,campaign,emergencies.length===1?emergencies[0]:null,emergencyRead.status!=='UNAVAILABLE'&&emergencies.length===1);
    const audienceVersion=audienceRead?.value||null;
    const contentVersion=contentRead?.value||null;
    const sequenceVersion=sequenceRead?.value||null;
    const allowedKeys=new Set(campaign.sending_profile_keys?.length?campaign.sending_profile_keys:[]);
    const profiles=(profileRead.value||[]).filter((profile:any)=>!allowedKeys.size||allowedKeys.has(profile.profile_key));
    const preflight=buildCampaignPreflight({
      campaign,
      audienceAvailable:!campaign.audience_current_version_id||audienceRead?.status!=='UNAVAILABLE',
      audienceVersion,
      contentValidation:contentVersion?{status:contentVersion.status,blockers:contentVersion.quality_gate_json?.blockers||[],blocked_claims:(contentVersion.blocked_claims||[]).map((key:any)=>({claim_key:key}))}:null,
      sequenceValidation:sequenceVersion?{status:sequenceVersion.status,blockers:[]}:null,
      sendingProfiles:profiles,
      sendingProfilesAvailable:profileRead.status!=='UNAVAILABLE',
      policy:policyRead?.value||null,
      policyAvailable:!campaign.target_profile_id||policyRead?.status!=='UNAVAILABLE',
      outboundControl:controls.length===1?controls[0]:null,
      outboundControlAvailable:controlRead.status!=='UNAVAILABLE'&&controls.length===1,
      emergency:emergencies.length===1?emergencies[0]:null,
      emergencyAvailable:emergencyRead.status!=='UNAVAILABLE'&&emergencies.length===1,
      budget:{available:Number.isFinite(Number(campaign.budget_limit_minor)),remaining_minor:Number(campaign.budget_limit_minor)},
      // COMMAND-C1 (2026-08-17): the FounderPermit authority now exists, so the
      // dimension reports a real verdict instead of a permanent UNKNOWN. The
      // authority is available; whether a permit actually covers THIS campaign
      // is decided by evaluatePermit against live hard controls — an unreadable
      // permit still yields not-present, which blocks approval.
      founderPermit:{
        authority_available:true,
        present:permitCoverage.covered,
        blockers:permitCoverage.blockers,
      },
    });
    if(action==='preflight'){
      return Response.json({ok:true,preflight,source_coverage:runtimeSourceCoverage({sending_profiles:profileRead,outbound_control:controlRead,emergency_control:emergencyRead}),external_send_performed:false});
    }
    // request_approval: only a clean PASS produces a hash-bound approval scope.
    if(!preflight.approvable){
      return Response.json({ok:false,error:'preflight_not_passed',preflight,external_send_performed:false},{status:409});
    }
    const binding=await buildApprovalBinding(sha256,{
      campaign_id:campaign.id,
      audience_content_hash:audienceVersion?.content_hash||null,
      content_hash:contentVersion?.content_hash||null,
      sequence_hash:sequenceVersion?.sequence_hash||null,
      policy_version:campaign.policy_version||null,
      market_scope:campaign.market_scope||[],
      sending_profile_keys:campaign.sending_profile_keys||[],
      limits:{contact_limit:campaign.contact_limit??null,company_contact_limit:campaign.company_contact_limit??null},
      budget_limit_minor:Number.isFinite(Number(campaign.budget_limit_minor))?Number(campaign.budget_limit_minor):null,
      emergency_control_revision:emergencies.length===1?Number(emergencies[0].control_revision||0):null,
      actor:String(user.email||user.id||'admin'),
      nonce:crypto.randomUUID(),
      expires_at:new Date(Date.now()+15*60*1000).toISOString(),
    });
    const at=new Date().toISOString();
    const updated=await svc.entities.CommercialCampaign.update(campaign.id,{
      status:'READY_FOR_APPROVAL',approval_binding_json:{...binding.scope,approval_hash:binding.approval_hash,preflight_verdict:preflight.verdict,requested_at:at},updated_at:at,
    });
    return Response.json({ok:true,preflight,approval:{approval_hash:binding.approval_hash,scope:binding.scope},campaign:updated,item:projectCampaignSummary(updated),
      note:'Approving this configuration does not authorize any send. External sends require a separate authorization and the execution engine (C4).',
      external_send_performed:false});
  }

  return Response.json({ok:false,error:'unsupported_action'},{status:400});
}
