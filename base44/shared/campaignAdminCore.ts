// CAMP-C2 (2026-08-16) — the Campaigns admin handler, extracted from
// commercialCampaignAdmin.ts so behavior tests can invoke it without the Deno
// Base44 SDK specifier (same pattern as emergencyControlAdminCore.ts).
// commercialCampaignAdmin.ts remains the only trust boundary: client creation,
// auth resolution and body parsing happen there, nothing else.
// This route never performs an external effect.
import { readRuntimeRows, readRuntimeSource, requireRuntimeSource, runtimeSourceCoverage } from './runtimeSourceRead.ts';
import { CAMPAIGN_LANES, canonicalCampaignState } from './campaignsCore.ts';
import { buildCampaignsOverview, filterCampaignSummaries, projectCampaignSummary } from './campaignsReadModel.ts';

const clean=(value:any,max=240)=>String(value??'').replace(/[\r\n\t]+/g,' ').trim().slice(0,max);
const unique=(value:any,max=1000)=>[...new Set((Array.isArray(value)?value:[]).map((item:any)=>clean(item,200)).filter(Boolean))].slice(0,max);

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

  if(action==='create_draft'){
    const leadIds=unique(body.lead_ids,1000);if(!leadIds.length)return Response.json({ok:false,error:'campaign_leads_required'},{status:400});
    const lane=clean(body.lane,60).toUpperCase();
    if(lane&&!(CAMPAIGN_LANES as readonly string[]).includes(lane))return Response.json({ok:false,error:'unsupported_campaign_lane',supported_lanes:CAMPAIGN_LANES},{status:400});
    const leadRead=await readRuntimeRows({source:'commercial_campaign_leads',limit:5000,read:()=>svc.entities.OutboundLead.list('-created_date',5000)});const all=requireRuntimeSource(leadRead);const byId=new Map(all.map((lead:any)=>[String(lead.id),lead]));const selected=leadIds.map((id)=>byId.get(id)).filter(Boolean);
    if(selected.length!==leadIds.length)return Response.json({ok:false,error:'unknown_or_unavailable_lead_ids',requested:leadIds.length,resolved:selected.length},{status:409});
    const blocked=selected.filter((lead:any)=>lead.reservoir_state==='suppressed'||lead.outreach_eligibility==='BLOCKED'||lead.compliance_status==='BLOCKED');
    if(blocked.length)return Response.json({ok:false,error:'campaign_contains_blocked_leads',blocked_lead_ids:blocked.map((lead:any)=>lead.id)},{status:409});
    const targetProfileId=clean(body.target_profile_id);const policyRead=targetProfileId?await readRuntimeSource<any>({source:'commercial_campaign_target_policy',read:()=>svc.entities.CommercialPolicy.get(targetProfileId),fallback:null}):null;const policy=policyRead?requireRuntimeSource(policyRead):null;
    const now=new Date().toISOString();const key=`campaign:${Date.now()}:${crypto.randomUUID().slice(0,8)}`;
    const campaign=await svc.entities.CommercialCampaign.create({campaign_key:key,name:clean(body.name,120)||`CAMBRA campaign ${now.slice(0,10)}`,status:'DRAFT',...(lane?{lane}:{}),...(clean(body.objective_type,80)?{objective_type:clean(body.objective_type,80)}:{}),...(clean(body.description,500)?{description:clean(body.description,500)}:{}),...(Array.isArray(body.market_scope)?{market_scope:unique(body.market_scope,60)}:{}),...(Array.isArray(body.language_scope)?{language_scope:unique(body.language_scope,40)}:{}),target_profile_id:policy?.id||'',policy_key:policy?.policy_key||'',policy_version:String(policy?.version||''),provider_mode:['AUTO','APOLLO','INSTANTLY','MANUAL'].includes(String(body.provider_mode).toUpperCase())?String(body.provider_mode).toUpperCase():'AUTO',lead_ids:leadIds,audience_snapshot_json:{lead_count:selected.length,filters:body.filters&&typeof body.filters==='object'?body.filters:{},canonical_company_keys:selected.map((lead:any)=>lead.canonical_company_key).filter(Boolean),captured_at:now},strategy_ids:[],message_json:{status:'NOT_PREPARED'},sequence_json:{status:'NOT_PREPARED'},sending_profile_keys:unique(body.sending_profile_keys,100),capacity_preview_json:{capacity:0,blockers:['campaign_not_prepared','founder_pilot_authorization_required']},external_refs_json:{},blockers:['campaign_not_prepared','founder_pilot_authorization_required'],created_by:user.email||user.id,created_at:now,updated_at:now,metrics_json:{selected_leads:selected.length,sent:0,replied:0,meetings:0}});
    try{await svc.entities.OperationalLog.create({event_type:'commercial_campaign_draft_created',message:campaign.name,data_json:{campaign_id:campaign.id,lead_count:selected.length,provider_mode:campaign.provider_mode,lane:lane||null,external_send_performed:false},actor_email:user.email,created_at:now});}
    catch(error:any){
      const blocker='campaign_audit_persistence_failed';
      try{await svc.entities.CommercialCampaign.update(campaign.id,{status:'DRAFT',blockers:[...new Set([...(campaign.blockers||[]),blocker])],updated_at:new Date().toISOString()});}catch{/* response remains fail-closed even if containment projection also fails */}
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
    if(Array.isArray(body.market_scope))patch.market_scope=unique(body.market_scope,60);
    if(Array.isArray(body.language_scope))patch.language_scope=unique(body.language_scope,40);
    const updated=await svc.entities.CommercialCampaign.update(campaign.id,patch);return Response.json({ok:true,campaign:updated,item:projectCampaignSummary(updated),external_send_performed:false});
  }

  if(action==='prepare_pilot'){
    if(body.confirmation!=='PREPARE_CAMPAIGN_FOR_PILOT')return Response.json({ok:false,error:'confirmation_required',expected_confirmation:'PREPARE_CAMPAIGN_FOR_PILOT'},{status:409});
    const [policyRead,profileRead,controlRead,leadRead]=await Promise.all([campaign.target_profile_id?readRuntimeSource<any>({source:'commercial_campaign_prepare_policy',read:()=>svc.entities.CommercialPolicy.get(campaign.target_profile_id),fallback:null}):null,readRuntimeRows({source:'commercial_campaign_prepare_profiles',limit:500,read:()=>svc.entities.OutboundSendingProfile.list('-created_date',500)}),readRuntimeRows({source:'commercial_campaign_prepare_control',read:()=>svc.entities.OutboundControl.filter({control_key:'global'},'-created_date',2)}),readRuntimeRows({source:'commercial_campaign_prepare_leads',limit:5000,read:()=>svc.entities.OutboundLead.list('-created_date',5000)})]);
    const policy=policyRead?requireRuntimeSource(policyRead):null,profiles=requireRuntimeSource(profileRead),controls=requireRuntimeSource(controlRead),leads=requireRuntimeSource(leadRead);if(controls.length!==1)return Response.json({ok:false,error:controls.length?'outbound_control_authority_ambiguous':'outbound_control_required'},{status:409});
    const selected=new Set(campaign.lead_ids||[]);const eligible=leads.filter((lead:any)=>selected.has(lead.id)&&lead.outreach_eligibility==='ELIGIBLE'&&lead.compliance_status==='CLEARED'&&lead.contactability==='PROFESSIONAL_VERIFIED');const allowed=new Set(campaign.sending_profile_keys?.length?campaign.sending_profile_keys:policy?.sending_profile_keys||[]);const readyProfiles=profiles.filter((profile:any)=>(!allowed.size||allowed.has(profile.profile_key))&&readiness(profile).ready);const senderCap=readyProfiles.reduce((sum:number,profile:any)=>sum+readiness(profile).cap,0);const policyCap=Math.max(0,Number(policy?.daily_send_limit||0));const blockers:string[]=[];if(!policy)blockers.push('target_profile_required');if(!campaign.message_json||campaign.message_json.status==='NOT_PREPARED')blockers.push('campaign_message_required');if(!campaign.sequence_json||campaign.sequence_json.status==='NOT_PREPARED')blockers.push('campaign_sequence_required');if(!eligible.length)blockers.push('eligible_leads_required');if(!readyProfiles.length)blockers.push('ready_sending_profile_required');if(!policyCap)blockers.push('commercial_policy_daily_limit_missing');if(controls[0]?.acquisition_enabled!==true)blockers.push('founder_pilot_authorization_required');const capacity=Math.min(eligible.length,senderCap,policyCap);const hardBlockers=blockers.filter((value)=>value!=='founder_pilot_authorization_required');const status=hardBlockers.length?'DRAFT':'READY_FOR_PILOT';const updated=await svc.entities.CommercialCampaign.update(campaign.id,{status,capacity_preview_json:{capacity,eligible_leads:eligible.length,sender_cap:senderCap,policy_cap:policyCap,outbound_master_enabled:controls[0]?.acquisition_enabled===true,previewed_at:new Date().toISOString()},blockers,updated_at:new Date().toISOString()});return Response.json({ok:true,campaign:updated,item:projectCampaignSummary(updated),ready_for_pilot:status==='READY_FOR_PILOT',external_send_performed:false});
  }

  if(action==='pause'){const updated=await svc.entities.CommercialCampaign.update(campaign.id,{status:'PAUSED',paused_at:new Date().toISOString(),updated_at:new Date().toISOString(),blockers:[...new Set([...(campaign.blockers||[]),'paused_by_founder'])]});return Response.json({ok:true,campaign:updated,item:projectCampaignSummary(updated),note:'Canonical campaign paused. Use global Founder Control for an immediate transport-wide stop.',external_send_performed:false});}
  return Response.json({ok:false,error:'unsupported_action'},{status:400});
}
