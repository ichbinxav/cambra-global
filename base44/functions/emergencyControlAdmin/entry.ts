import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { internalErrorResponse } from '../../shared/publicErrors.ts';
// FCTRL-J (2026-08-16) — the full handler lives in
// base44/shared/emergencyControlAdminCore.ts so behavior tests can invoke it
// without Deno.serve. This entry stays the only trust boundary: client
// creation, auth resolution and body parsing happen here, nothing else.
import { handleEmergencyControlAction } from '../../shared/emergencyControlAdminCore.ts';

Deno.serve(async(req)=>{
  try{
    const base44=createClientFromRequest(req);
    const user=await base44.auth.me();
    const body=await req.json().catch(()=>({}));
    return await handleEmergencyControlAction(user,body,base44.asServiceRole);
  }catch(error){
    console.error('emergencyControlAdmin failed',error);
    return internalErrorResponse(error,'emergencyControlAdmin');
  }
});
