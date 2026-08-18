// AUDIT 2026-08-18 — moved out of base44/functions/instantlyProviderEventRetryWorker/entry.ts so hosts of this
// logical route can import it without a relative import escaping their bundle.
import { safeBestEffort } from '../bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../internalGate.ts';
import { claimSchedulerRun, finishSchedulerRunOrThrow, markSchedulerEffectStarted, schedulerClaimDeniedResponse } from '../schedulerRun.ts';
import { processInstantlyProviderEvent } from '../outboundProviderEventProcessing.ts';

export async function handleInstantlyProviderEventRetryWorker(req:Request){let svc:any=null,claim:any=null,success=true;try{
  const base44=createClientFromRequest(req);const body=await req.json().catch(()=>({}));const gate=await requireAdminOrInternal(req,base44,body);if(!gate.ok)return gate.response;svc=base44.asServiceRole;
  claim=await claimSchedulerRun(svc,req,{worker_key:'instantlyProviderEventRetryWorker',cadence_seconds:300});{const denied=schedulerClaimDeniedResponse(claim);if(denied)return denied;}claim=await markSchedulerEffectStarted(svc,claim);{const denied=schedulerClaimDeniedResponse(claim);if(denied)return denied;}
  const due=await svc.entities.OutboundProviderEvent.filter({provider:'instantly',status:'PENDING_RETRY',next_retry_at:{$lte:new Date().toISOString()}},'next_retry_at',50).catch((error:any)=>safeBestEffort(error,{operation:'instantlyProviderEventRetryWorker',fallback:[],severity:'secondary'}));
  const results=[];for(const row of due)results.push(await processInstantlyProviderEvent(svc,row.raw_event_json,row));
  return Response.json({ok:true,attempted:due.length,recovered:results.filter((row:any)=>row.ok).length,remaining_retry:results.filter((row:any)=>row.queued_retry).length,dead_letter:results.filter((row:any)=>row.dead_letter).length});
}catch(error){success=false;console.error('instantlyProviderEventRetryWorker failed',error);return Response.json({ok:false,error:'instantly_event_retry_failed'},{status:500});}finally{if(svc&&claim?.allowed)await finishSchedulerRunOrThrow(svc,claim,{worker_key:'instantlyProviderEventRetryWorker'},success)}}