import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { evaluateCommercialGoLiveReadiness } from '../../shared/commercialActivationRuntime.ts';

const START_SCOPE:Record<string,string>={start_premium:'outlook',start_volume:'resend',start_all:'all'};

Deno.serve(async(req)=>{
  try{
    const base44=createClientFromRequest(req);
    const body=await req.json().catch(()=>({}));
    const gate=await requireAdminOrInternal(req,base44,body);
    if(!gate.ok)return gate.response;
    if(!gate.isAdmin)return Response.json({ok:false,error:'admin_required'},{status:403});
    const svc=base44.asServiceRole;
    const rows=await svc.entities.OutboundControl.filter({control_key:'global'},'-created_date',1).catch(()=>[]);
    const control=rows[0];
    if(!control)return Response.json({ok:false,error:'outbound_control_missing'},{status:409});
    const action=String(body?.action||'');
    const now=new Date().toISOString();
    let patch:any={};

    if(action==='exercise_controls'){
      if(body?.confirmation!=='EXERCISE_FOUNDER_CANARY_CONTROL')return Response.json({ok:false,error:'exercise_confirmation_required'},{status:409});
      if(control.acquisition_enabled===true)return Response.json({ok:false,error:'exercise_requires_outbound_paused'},{status:409});
      const readiness=await evaluateCommercialGoLiveReadiness(svc,{policy_ids:body.policy_ids||[],provider_scope:String(body.provider_scope||'all'),final_sha:body.final_sha});
      await svc.entities.OperationalLog.create({event_type:'commercial_canary_control_exercised',message:'Founder exercised start/pause/resume control path without enabling outbound',data_json:{provider_scope:String(body.provider_scope||'all'),readiness_allowed:readiness.allowed,blockers:readiness.blockers,start_requires_confirmation:true,pause_available:true,resume_requires_fresh_preflight:true,no_message_sent:true},actor_email:String(gate.user?.email||''),created_at:now}).catch(()=>null);
      return Response.json({ok:true,exercise:true,no_message_sent:true,readiness,capabilities:{start_canary:true,change_limits:true,pause:true,resume_with_fresh_preflight:true,inspect_blockers:true}});
    }
    if(START_SCOPE[action]){
      const providerScope=START_SCOPE[action];
      const requestedHash=String(body?.preflight_hash||'');
      if(body?.confirmation!=='START_CANARY_OUTBOUND')return Response.json({ok:false,error:'start_confirmation_required'},{status:409});
      if(!requestedHash)return Response.json({ok:false,error:'preflight_hash_required'},{status:409});
      if(control.preflight_status!=='PASS'||control.preflight_hash!==requestedHash||control.preflight_provider_scope!==providerScope)return Response.json({ok:false,error:'matching_preflight_required'},{status:409});
      if(!control.preflight_expires_at||Date.parse(control.preflight_expires_at)<=Date.now())return Response.json({ok:false,error:'preflight_expired'},{status:409});

      const readiness=await evaluateCommercialGoLiveReadiness(svc,{policy_ids:control.preflight_policy_ids||[control.preflight_policy_id].filter(Boolean),provider_scope:providerScope,final_sha:control.preflight_json?.go_live?.final_sha||control.preflight_json?.evidence?.go_live?.final_sha});
      if(!readiness.allowed)return Response.json({ok:false,error:'preflight_recheck_blocked',blockers:readiness.blockers},{status:409});
      if(readiness.preflight_hash!==requestedHash)return Response.json({ok:false,error:'preflight_state_changed',expected_hash:readiness.preflight_hash},{status:409});
      const common={acquisition_enabled:true,activated_by:gate.user?.email||'admin',activated_at:now,paused_reason:null,activation_preflight_hash:requestedHash};
      if(action==='start_premium')patch={...common,premium_outlook_enabled:true};
      if(action==='start_volume')patch={...common,volume_resend_enabled:true};
      if(action==='start_all')patch={...common,premium_outlook_enabled:true,volume_resend_enabled:true};
    }else if(action==='pause_premium')patch={premium_outlook_enabled:false,paused_reason:'paused_by_admin'};
    else if(action==='pause_volume')patch={volume_resend_enabled:false,paused_reason:'paused_by_admin'};
    else if(action==='pause_all')patch={acquisition_enabled:false,premium_outlook_enabled:false,volume_resend_enabled:false,paused_reason:'paused_by_admin'};
    else return Response.json({ok:false,error:'invalid_action'},{status:400});

    const updated=await svc.entities.OutboundControl.update(control.id,patch);
    await svc.entities.OperationalLog.create({
      event_type:START_SCOPE[action]?'commercial_outbound_canary_started':'commercial_outbound_paused',message:action,
      data_json:{action,preflight_hash:patch.activation_preflight_hash||null,provider_scope:START_SCOPE[action]||null},actor_email:String(gate.user?.email||''),created_at:now,
    }).catch(()=>null);
    return Response.json({ok:true,action,control:updated});
  }catch(error){
    console.error('outboundControlAdmin failed',error);
    return Response.json({ok:false,error:'outbound_control_failed'},{status:500});
  }
});
