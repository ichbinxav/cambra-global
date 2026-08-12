import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { RECOVERY_ECONOMICS_V2 } from '../../shared/recoveryEconomicsV2.ts';
export default async function(req:Request):Promise<Response>{
 try{
  const base44=createClientFromRequest(req); const user=await base44.auth.me().catch((error:any)=>safeBestEffort(error,{operation:'cancelCambraService',fallback:null,severity:'secondary'})); if(!user)return Response.json({error:'Unauthorized'},{status:401});
  const body=await req.json().catch(()=>({})); if(body.confirm!==true || body.recovery_terms_acknowledged!==true)return Response.json({error:'explicit_cancellation_confirmation_required'},{status:400});
  const svc=base44.asServiceRole; const email=String(user.email||'').toLowerCase();
  const brands=[...(await svc.entities.Brand.filter({contact_email:user.email},'-created_date',5).catch((error:any)=>safeBestEffort(error,{operation:'cancelCambraService',fallback:[],severity:'secondary'}))),...(await svc.entities.Brand.filter({created_by:user.email},'-created_date',5).catch((error:any)=>safeBestEffort(error,{operation:'cancelCambraService',fallback:[],severity:'secondary'})))];
  const brand=brands.find((b:any)=>String(b.contact_email||b.created_by||'').toLowerCase()===email); if(!brand)return Response.json({error:'brand_not_found'},{status:404});
  if(brand.service_status==='cancelled')return Response.json({ok:true,already_cancelled:true,service_cancelled_at:brand.service_cancelled_at||null});
  const now=new Date().toISOString(); const claim=await svc.entities.Brand.updateMany({id:brand.id,service_status:{$ne:'cancelled'}},{$set:{service_status:'cancelled',service_cancelled_at:now,service_cancellation_reason:String(body.reason||'').slice(0,500)}});
  const acts=await svc.entities.DealActivation.filter({brand_id:brand.id},'-created_date',100).catch((error:any)=>safeBestEffort(error,{operation:'cancelCambraService',fallback:[],severity:'secondary'})); const surviving=[]; const paused=[];
  for(const a of acts){
    if(a.recovery_economics_version===RECOVERY_ECONOMICS_V2 && a.economic_right_status==='active'){
      await svc.entities.DealActivation.update(a.id,{service_cancelled_at:now}); surviving.push(a.id); continue;
    }
    if(['authorized','migrating'].includes(a.status)){
      await svc.entities.DealActivation.update(a.id,{status:'paused',service_cancelled_at:now,last_updated:now}); paused.push(a.id);
    } else if(a.status){ await svc.entities.DealActivation.update(a.id,{service_cancelled_at:now}).catch((error:any)=>safeBestEffort(error,{operation:'cancelCambraService',fallback:null,severity:'secondary'})); }
  }
  await svc.entities.OperationalLog.create({brand_id:brand.id,event_type:'status_changed',message:'cambra_service_cancelled',data_json:{surviving_recoveries:surviving,paused_unactivated_recoveries:paused,recovery_terms_acknowledged:true},actor_email:user.email,created_at:now}).catch((error:any)=>safeBestEffort(error,{operation:'cancelCambraService',fallback:null,severity:'secondary'}));
  return Response.json({ok:true,service_cancelled_at:now,surviving_recovery_ids:surviving,paused_recovery_ids:paused});
 }catch(e){console.error('cancelCambraService failed',e);return Response.json({error:'service_cancellation_failed'},{status:500});}
}
