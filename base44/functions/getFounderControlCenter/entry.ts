import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { internalErrorResponse } from '../../shared/publicErrors.ts';
// FMERC-K (2026-08-16) — the full handler lives in
// base44/shared/founderControlCenterCore.ts so behavior tests can invoke it
// without Deno.serve. This entry stays the only trust boundary: client
// creation, auth resolution and body parsing happen here, nothing else.
import { handleFounderControlCenter } from '../../shared/founderControlCenterCore.ts';

// V2 projects the existing Approval, AutonomyIncident, OperatingHealthAssessment
// and RealWorldGapReport governance surfaces into one compact authority snapshot;
// it does not create a parallel control plane. Routine operations stay in
// Admin/digests, while this response contains only Founder-material state.
Deno.serve(async(req)=>{
  try{
    const base44=createClientFromRequest(req);
    const user=await base44.auth.me();
    const body=await req.json().catch(()=>({}));
    return await handleFounderControlCenter(user,body,base44.asServiceRole);
  }catch(error){
    console.error('getFounderControlCenter failed',error);
    return internalErrorResponse(error,'getFounderControlCenter');
  }
});
