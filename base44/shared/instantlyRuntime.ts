import { InstantlyOutboundProvider } from './outboundProvider.ts';
import { requireCriticalOperation } from './criticalExecution.ts';

export async function upsertInstantlyProviderState(svc:any,patch:any){
  const rows=await requireCriticalOperation('instantly_provider_state_authority_read',()=>svc.entities.CommercialProviderState.filter({provider_key:'instantly',role:'outbound'},'-last_checked_at',1));
  const value={provider_key:'instantly',role:'outbound',api_version:'v2',secret_present:Boolean(Deno.env.get('INSTANTLY_API_KEY')),...patch};
  return rows[0]?svc.entities.CommercialProviderState.update(rows[0].id,value):svc.entities.CommercialProviderState.create(value);
}

/** Safety primitive used by founder pause, global emergency stop and cost kill-switch. */
export async function pauseAllInstantlyCampaigns(svc:any,reason:string){
  const profiles=await requireCriticalOperation('instantly_sending_profile_authority_read',()=>svc.entities.OutboundSendingProfile.filter({provider:'instantly'},'-created_date',200));
  const campaigns:string[]=[...new Set<string>(profiles.map((row:any)=>String(row.external_campaign_id||'').trim()).filter(Boolean))];
  const key=Deno.env.get('INSTANTLY_API_KEY')||'';
  for(const profile of profiles)await requireCriticalOperation('instantly_local_profile_pause',()=>svc.entities.OutboundSendingProfile.update(profile.id,{status:'paused',last_provider_health_at:new Date().toISOString(),notes:`${reason}; local profile paused before remote provider action`}));
  if(!campaigns.length)return {ok:true,reason:'no_instantiated_campaigns',local_profiles_paused:profiles.length,campaigns:[]};
  if(!key){
    await requireCriticalOperation('instantly_missing_secret_state_write',()=>upsertInstantlyProviderState(svc,{status:'NOT_CONFIGURED',auth_test_pass:false,last_checked_at:new Date().toISOString(),last_error_code:'SECRET_MISSING'}));
    return {ok:false,reason:'instantly_secret_missing',campaigns:campaigns.map(id=>({id,paused:false}))};
  }
  const provider=new InstantlyOutboundProvider(key);
  const results:Array<{id:string;paused:boolean;error_code?:string}>=[];
  for(const id of campaigns){
    try{await provider.pauseCampaign(id);results.push({id,paused:true});}
    catch(error:any){results.push({id,paused:false,error_code:String(error?.code||'INSTANTLY_PAUSE_FAILED')});}
  }
  const ok=results.every(row=>row.paused);
  for(const profile of profiles)await requireCriticalOperation('instantly_profile_pause_confirmation_write',()=>svc.entities.OutboundSendingProfile.update(profile.id,{status:'paused',last_provider_health_at:new Date().toISOString(),notes:`${reason}; remote campaign pause ${ok?'confirmed':'requires review'}`}));
  await requireCriticalOperation('instantly_provider_containment_state_write',()=>upsertInstantlyProviderState(svc,{status:ok?'AUTHENTICATED':'DEGRADED',auth_test_pass:ok,last_checked_at:new Date().toISOString(),...(ok?{last_success_at:new Date().toISOString(),last_error_code:''}:{last_error_code:'REMOTE_CAMPAIGN_PAUSE_UNCONFIRMED'}),metrics_json:{last_pause_reason:reason,last_pause_results:results}}));
  if(!ok)await requireCriticalOperation('instantly_remote_pause_incident_write',()=>svc.entities.AutonomyIncident.create({dedupe_key:'instantly-remote-pause-unconfirmed',domain:'webhook_delivery',severity:'critical',status:'open',subject_type:'CommercialProviderState',subject_id:'instantly',summary:'Instantly remote campaign pause could not be proven',details_json:{reason,results},first_seen_at:new Date().toISOString(),last_seen_at:new Date().toISOString(),workflow_state:'human_review',owner_type:'founder',automation_eligibility:'human_required',financial_impact_minor:0,customer_impact:'high',legal_risk:'medium'}));
  return {ok,campaigns:results};
}
