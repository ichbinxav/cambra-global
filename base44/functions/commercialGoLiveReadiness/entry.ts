import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { evaluateCommercialGoLiveReadiness } from '../../shared/commercialActivationRuntime.ts';
import { readSingletonAuthority } from '../../shared/singletonAuthority.ts';

export async function handleCommercialGoLiveReadiness(req: Request) {
  try{
    const base44=createClientFromRequest(req);
    const user=await base44.auth.me().catch((error:any)=>safeBestEffort(error,{operation:'commercialGoLiveReadiness',fallback:null,severity:'critical'}));
    if(!user||user.role!=='admin')return Response.json({ok:false,error:'forbidden'},{status:403});
    const body=await req.json().catch(()=>({}));
    const svc=base44.asServiceRole;
    const readiness=await evaluateCommercialGoLiveReadiness(svc,{policy_id:body?.policy_id,policy_ids:body?.policy_ids,provider_scope:body?.provider_scope,final_sha:body?.final_sha});
    const outboundAuthority=await readSingletonAuthority(svc,{entity:'OutboundControl',query:{control_key:'global'},sort:'-created_date',authority:'outbound_control'});
    const control=outboundAuthority.row;
    if(!outboundAuthority.ok||!control)return Response.json({ok:false,error:outboundAuthority.blocker||'outbound_control_authority_unavailable',authority_status:outboundAuthority.status,readiness},{status:409});
    const preflight={...readiness,requested_by:String(user.email||user.id||'admin')};
    await svc.entities.OutboundControl.update(control.id,{
      preflight_status:readiness.allowed?'PASS':'BLOCKED',preflight_hash:readiness.preflight_hash||null,
      preflight_policy_id:readiness.policy_id||null,preflight_policy_ids:readiness.policy_ids||[],preflight_provider_scope:readiness.provider_scope,
      preflight_checked_at:readiness.checked_at,preflight_expires_at:readiness.expires_at||null,preflight_json:preflight,
    });
    for(const policyId of readiness.policy_ids||[])await svc.entities.CommercialPolicy.update(policyId,{activation_readiness_snapshot_json:preflight}).catch((error:any)=>safeBestEffort(error,{operation:'commercialGoLiveReadiness',fallback:null,severity:'critical'}));
    await svc.entities.OperationalLog.create({
      event_type:'commercial_go_live_preflight',message:readiness.allowed?'CANARY preflight passed':'CANARY preflight blocked',
      data_json:{allowed:readiness.allowed,blockers:readiness.blockers,preflight_hash:readiness.preflight_hash||null,policy_ids:readiness.policy_ids||[],provider_scope:readiness.provider_scope},
      actor_email:String(user.email||''),created_at:readiness.checked_at,
    }).catch((error:any)=>safeBestEffort(error,{operation:'commercialGoLiveReadiness',fallback:null,severity:'critical'}));
    return Response.json({ok:readiness.allowed,dry_run:true,outbound_unchanged:true,...readiness},{status:readiness.allowed?200:409});
  }catch(error){
    console.error('commercialGoLiveReadiness failed',error);
    return Response.json({ok:false,error:'commercial_go_live_preflight_failed'},{status:500});
  }
}
