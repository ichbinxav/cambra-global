import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { recoveryTermFromActivation, standardFeeForDate, effectiveFee, referralCountFromYear1EquivalentFee, RECOVERY_ECONOMICS_V2, parisRecoveryDate } from '../../shared/recoveryEconomicsV2.ts';
import { resolveFeePctForMonth } from '../../shared/billingFee.ts';

function mask(a:any, currentFee:number|null){
  return { id:a.id, name:a.deal_name||'Payments Optimization', vertical:a.vertical, status:a.status,
    recovery_economics_version:a.recovery_economics_version||null, recovery_term_start_date:a.recovery_term_start_date||null,
    recovery_term_year2_start_date:a.recovery_term_year2_start_date||null, recovery_term_end_date:a.recovery_term_end_date||null,
    economic_right_status:a.economic_right_status||null, current_fee_pct:currentFee,
    projected_savings_annual:a.projected_savings_annual??a.estimated_savings_yearly??null,
    service_cancelled_at:a.service_cancelled_at||null, verification_access_status:a.verification_access_status||null };
}
export default async function(req:Request):Promise<Response>{
 try{
  const base44=createClientFromRequest(req); const user=await base44.auth.me().catch(()=>null); if(!user)return Response.json({error:'Unauthorized'},{status:401});
  const svc=base44.asServiceRole; const email=String(user.email||'').toLowerCase();
  const brands=[...(await svc.entities.Brand.filter({contact_email:user.email},'-created_date',5).catch(()=>[])),...(await svc.entities.Brand.filter({created_by:user.email},'-created_date',5).catch(()=>[]))];
  const brand=brands.find((b:any)=>String(b.contact_email||b.created_by||'').toLowerCase()===email); if(!brand)return Response.json({ok:true,exists:false,recoveries:[]});
  const acts=await svc.entities.DealActivation.filter({brand_id:brand.id},'-created_date',100).catch(()=>[]); const today=parisRecoveryDate(new Date()); const month=today.slice(0,7); const out=[];
  for(const a of acts){
    let currentFee:null|number=null;
    if(a.recovery_economics_version===RECOVERY_ECONOMICS_V2 && a.conditions_activated_at && a.economic_right_status==='active'){
      const term=recoveryTermFromActivation(a.conditions_activated_at); const standard=standardFeeForDate(today,term);
      const rule=await resolveFeePctForMonth(svc,{deal_activation_id:a.id,brand_id:a.brand_id,provider_id:a.provider_id,fallbackPct:25},month);
      currentFee=effectiveFee(standard,referralCountFromYear1EquivalentFee(rule.pct));
    }
    if(a.economic_right_status==='active' || ['authorized','migrating','live','monetizing','paused'].includes(a.status)) out.push(mask(a,currentFee));
  }
  return Response.json({ok:true,exists:true,brand:{id:brand.id,name:brand.name,service_status:brand.service_status||'active',service_cancelled_at:brand.service_cancelled_at||null},recoveries:out});
 }catch(e){console.error('getMyRecoveryCommitments failed',e);return Response.json({error:'recovery_commitments_failed'},{status:500});}
}
