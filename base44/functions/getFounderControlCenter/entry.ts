import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { collectFounderControlSnapshot } from '../../shared/founderControlV2.ts';
import { collectAdminSettingsSnapshot } from '../../shared/adminSettingsV2.ts';
import { collectFounderMerchantsV2 } from '../../shared/founderMerchantsV2.ts';
import { internalErrorResponse } from '../../shared/publicErrors.ts';

// V2 projects the existing Approval, AutonomyIncident, OperatingHealthAssessment
// and RealWorldGapReport governance surfaces into one compact authority snapshot;
// it does not create a parallel control plane. Routine operations stay in
// Admin/digests, while this response contains only Founder-material state.
Deno.serve(async(req)=>{
  try{
    const base44=createClientFromRequest(req);
    const user=await base44.auth.me();
    if(!user)return Response.json({ok:false,error:'Unauthorized'},{status:401});
    if(user.role!=='admin')return Response.json({ok:false,error:'Forbidden'},{status:403});
    const body=await req.json().catch(()=>({}));
    if(String(body?.view||'').toLowerCase()==='settings') {
      const snapshot=await collectAdminSettingsSnapshot(base44.asServiceRole,user,body?.section);
      return Response.json(snapshot,{status:snapshot.ok===false?400:200});
    }
    if(String(body?.view||'').toLowerCase()==='merchants') {
      const snapshot=await collectFounderMerchantsV2(base44.asServiceRole,user,body);
      const status=Number(snapshot?.http_status)||(snapshot?.ok===false?400:200);
      if(snapshot&&typeof snapshot==='object'&&'http_status' in snapshot)delete snapshot.http_status;
      return Response.json(snapshot,{status});
    }
    return Response.json(await collectFounderControlSnapshot(base44.asServiceRole));
  }catch(error){
    console.error('getFounderControlCenter failed',error);
    return internalErrorResponse(error,'getFounderControlCenter');
  }
});
