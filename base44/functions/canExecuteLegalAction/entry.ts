import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { authorityForAgent } from '../../shared/agentAuthority.ts';
import { evaluateLegalExecution } from '../../shared/legalExecutionRuntime.ts';

Deno.serve(async(req)=>{
  try{
    const base44=createClientFromRequest(req);const body=await req.json().catch(()=>({}));
    const gate=await requireAdminOrInternal(req,base44,body);if(!gate.ok)return gate.response;
    const action=String(body.requested_action||'').toUpperCase();
    const agentName=String(body.agent_name||'').toLowerCase();const authority=authorityForAgent(agentName);
    const allowedActions:string[]=[];
    if(authority.CAN_SEND)allowedActions.push('B2B_OUTREACH','PARTNER_OUTREACH','MERCHANT_COMMUNICATION','CONTACT_PROVIDER','REQUEST_PROVIDER_INFORMATION');
    if(authority.CAN_NEGOTIATE)allowedActions.push('REQUEST_PRICING_QUOTE','NEGOTIATE_PRICING');
    if(authority.CAN_EXECUTE)allowedActions.push('ANALYZE','COORDINATE_MIGRATION');
    if(gate.isAdmin)allowedActions.push(action);
    const result=await evaluateLegalExecution(base44.asServiceRole,{...body,actor:{id:gate.isAdmin?String(gate.user?.email||'admin'):agentName,type:gate.isAdmin?'HUMAN_ADMIN':'AUTOMATION',tool:'canExecuteLegalAction',allowed_actions:[...new Set(allowedActions)]}});
    return Response.json({ok:true,result});
  }catch(error){console.error('canExecuteLegalAction failed',error);return Response.json({ok:false,error:'legal_execution_evaluation_failed'},{status:500});}
});
