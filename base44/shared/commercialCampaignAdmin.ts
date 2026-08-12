import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const clean=(value:any,max=240)=>String(value??'').replace(/[\r\n\t]+/g,' ').trim().slice(0,max);
const unique=(value:any,max=1000)=>[...new Set((Array.isArray(value)?value:[]).map((item:any)=>clean(item,200)).filter(Boolean))].slice(0,max);

function readiness(profile:any){
  const ready=Boolean(profile?.profile_key&&profile?.domain&&profile?.from_address&&profile?.status==='active'&&Number(profile?.current_daily_cap||0)>0&&(profile?.provider!=='instantly'||(profile?.provider_config_json?.sender_ready===true&&profile?.provider_config_json?.native_ai_conflict!==true&&profile?.webhook_status==='ACTIVE')));
  return{ready,cap:ready?Math.max(0,Number(profile.current_daily_cap||0)):0};
}

export async function handleCommercialCampaignAdmin(req:Request){
  try{
    const base44=createClientFromRequest(req);const user=await base44.auth.me().catch(()=>null);
    if(!user||user.role!=='admin')return Response.json({ok:false,error:'admin_required'},{status:403});
    const body=await req.json().catch(()=>({}));const action=String(body.action||'list');const svc=base44.asServiceRole;
    if(action==='list'){const campaigns=await svc.entities.CommercialCampaign.list('-updated_at',500).catch(()=>[]);return Response.json({ok:true,campaigns});}
    if(action==='create_draft'){
      const leadIds=unique(body.lead_ids,1000);if(!leadIds.length)return Response.json({ok:false,error:'campaign_leads_required'},{status:400});
      const all=await svc.entities.OutboundLead.list('-created_date',5000).catch(()=>[]);const byId=new Map(all.map((lead:any)=>[String(lead.id),lead]));const selected=leadIds.map((id)=>byId.get(id)).filter(Boolean);
      if(selected.length!==leadIds.length)return Response.json({ok:false,error:'unknown_or_unavailable_lead_ids',requested:leadIds.length,resolved:selected.length},{status:409});
      const blocked=selected.filter((lead:any)=>lead.reservoir_state==='suppressed'||lead.outreach_eligibility==='BLOCKED'||lead.compliance_status==='BLOCKED');
      if(blocked.length)return Response.json({ok:false,error:'campaign_contains_blocked_leads',blocked_lead_ids:blocked.map((lead:any)=>lead.id)},{status:409});
      const targetProfileId=clean(body.target_profile_id);const policy=targetProfileId?await svc.entities.CommercialPolicy.get(targetProfileId).catch(()=>null):null;
      const now=new Date().toISOString();const key=`campaign:${Date.now()}:${crypto.randomUUID().slice(0,8)}`;
      const campaign=await svc.entities.CommercialCampaign.create({campaign_key:key,name:clean(body.name,120)||`CAMBRA campaign ${now.slice(0,10)}`,status:'DRAFT',target_profile_id:policy?.id||'',policy_key:policy?.policy_key||'',policy_version:String(policy?.version||''),provider_mode:['AUTO','APOLLO','INSTANTLY','MANUAL'].includes(String(body.provider_mode).toUpperCase())?String(body.provider_mode).toUpperCase():'AUTO',lead_ids:leadIds,audience_snapshot_json:{lead_count:selected.length,filters:body.filters&&typeof body.filters==='object'?body.filters:{},canonical_company_keys:selected.map((lead:any)=>lead.canonical_company_key).filter(Boolean),captured_at:now},strategy_ids:[],message_json:{status:'NOT_PREPARED'},sequence_json:{status:'NOT_PREPARED'},sending_profile_keys:unique(body.sending_profile_keys,100),capacity_preview_json:{capacity:0,blockers:['campaign_not_prepared','founder_pilot_authorization_required']},external_refs_json:{},blockers:['campaign_not_prepared','founder_pilot_authorization_required'],created_by:user.email||user.id,created_at:now,updated_at:now,metrics_json:{selected_leads:selected.length,sent:0,replied:0,meetings:0}});
      await svc.entities.OperationalLog.create({event_type:'commercial_campaign_draft_created',message:campaign.name,data_json:{campaign_id:campaign.id,lead_count:selected.length,provider_mode:campaign.provider_mode,external_send_performed:false},actor_email:user.email,created_at:now}).catch(()=>null);
      return Response.json({ok:true,campaign,external_send_performed:false});
    }
    const id=clean(body.campaign_id);if(!id)return Response.json({ok:false,error:'campaign_id_required'},{status:400});const campaign=await svc.entities.CommercialCampaign.get(id).catch(()=>null);if(!campaign)return Response.json({ok:false,error:'campaign_not_found'},{status:404});
    if(action==='update_draft'){
      if(!['DRAFT','READY_FOR_PILOT','PAUSED'].includes(String(campaign.status)))return Response.json({ok:false,error:'active_campaign_not_editable'},{status:409});
      const patch:any={updated_at:new Date().toISOString()};if(body.name!==undefined)patch.name=clean(body.name,120);if(body.message_json&&typeof body.message_json==='object')patch.message_json=body.message_json;if(body.sequence_json&&typeof body.sequence_json==='object')patch.sequence_json=body.sequence_json;if(Array.isArray(body.sending_profile_keys))patch.sending_profile_keys=unique(body.sending_profile_keys,100);const updated=await svc.entities.CommercialCampaign.update(campaign.id,patch);return Response.json({ok:true,campaign:updated,external_send_performed:false});
    }
    if(action==='prepare_pilot'){
      if(body.confirmation!=='PREPARE_CAMPAIGN_FOR_PILOT')return Response.json({ok:false,error:'confirmation_required',expected_confirmation:'PREPARE_CAMPAIGN_FOR_PILOT'},{status:409});
      const [policy,profiles,controls,leads]=await Promise.all([campaign.target_profile_id?svc.entities.CommercialPolicy.get(campaign.target_profile_id).catch(()=>null):null,svc.entities.OutboundSendingProfile.list('-created_date',500).catch(()=>[]),svc.entities.OutboundControl.filter({control_key:'global'},'-created_date',1).catch(()=>[]),svc.entities.OutboundLead.list('-created_date',5000).catch(()=>[])]);
      const selected=new Set(campaign.lead_ids||[]);const eligible=leads.filter((lead:any)=>selected.has(lead.id)&&lead.outreach_eligibility==='ELIGIBLE'&&lead.compliance_status==='CLEARED'&&lead.contactability==='PROFESSIONAL_VERIFIED');const allowed=new Set(campaign.sending_profile_keys?.length?campaign.sending_profile_keys:policy?.sending_profile_keys||[]);const readyProfiles=profiles.filter((profile:any)=>(!allowed.size||allowed.has(profile.profile_key))&&readiness(profile).ready);const senderCap=readyProfiles.reduce((sum:number,profile:any)=>sum+readiness(profile).cap,0);const policyCap=Math.max(0,Number(policy?.daily_send_limit||0));const blockers:string[]=[];if(!policy)blockers.push('target_profile_required');if(!campaign.message_json||campaign.message_json.status==='NOT_PREPARED')blockers.push('campaign_message_required');if(!campaign.sequence_json||campaign.sequence_json.status==='NOT_PREPARED')blockers.push('campaign_sequence_required');if(!eligible.length)blockers.push('eligible_leads_required');if(!readyProfiles.length)blockers.push('ready_sending_profile_required');if(!policyCap)blockers.push('commercial_policy_daily_limit_missing');if(controls[0]?.acquisition_enabled!==true)blockers.push('founder_pilot_authorization_required');const capacity=Math.min(eligible.length,senderCap,policyCap);const hardBlockers=blockers.filter((value)=>value!=='founder_pilot_authorization_required');const status=hardBlockers.length?'DRAFT':'READY_FOR_PILOT';const updated=await svc.entities.CommercialCampaign.update(campaign.id,{status,capacity_preview_json:{capacity,eligible_leads:eligible.length,sender_cap:senderCap,policy_cap:policyCap,outbound_master_enabled:controls[0]?.acquisition_enabled===true,previewed_at:new Date().toISOString()},blockers,updated_at:new Date().toISOString()});return Response.json({ok:true,campaign:updated,ready_for_pilot:status==='READY_FOR_PILOT',external_send_performed:false});
    }
    if(action==='pause'){const updated=await svc.entities.CommercialCampaign.update(campaign.id,{status:'PAUSED',paused_at:new Date().toISOString(),updated_at:new Date().toISOString(),blockers:[...new Set([...(campaign.blockers||[]),'paused_by_founder'])]});return Response.json({ok:true,campaign:updated,note:'Canonical campaign paused. Use global Founder Control for an immediate transport-wide stop.',external_send_performed:false});}
    return Response.json({ok:false,error:'unsupported_action'},{status:400});
  }catch(error){console.error('commercialCampaignAdmin failed',error);return Response.json({ok:false,error:'commercial_campaign_admin_failed'},{status:500});}
}
