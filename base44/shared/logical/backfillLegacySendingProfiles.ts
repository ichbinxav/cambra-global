// AUDIT 2026-08-18 — moved out of base44/functions/backfillLegacySendingProfiles/entry.ts so hosts of this
// logical route can import it without a relative import escaping their bundle.
import { safeBestEffort } from '../bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import {
  LEGACY_SENDING_PROFILE_RESOLVER_VERSION, SENDING_PROFILE_REVIEW_REASON,
  automaticFollowUpCandidate, legacyResolutionPatch, resolveLegacySendingProfile, sendingProfileIsValid,
} from '../commercialActivation.ts';

function equivalent(thread:any,result:any){
  if(thread?.sending_profile_resolution_status!==result.status)return false;
  if(thread?.sending_profile_resolution_reason!==result.reason)return false;
  if(thread?.sending_profile_resolver_version!==LEGACY_SENDING_PROFILE_RESOLVER_VERSION)return false;
  if(result.status==='RESOLVED'){
    if(thread?.sending_profile_key!==result.profile_key)return false;
    return thread?.pause_reason!==SENDING_PROFILE_REVIEW_REASON;
  }
  return thread?.automation_paused===true&&thread?.pause_reason===SENDING_PROFILE_REVIEW_REASON;
}

async function candidates(svc:any){
  const [open,counterparty,cambra,approval]=await Promise.all([
    svc.entities.CommunicationThread.filter({status:'open'},'-created_date',1000).catch((error:any)=>safeBestEffort(error,{operation:'backfillLegacySendingProfiles',fallback:[],severity:'secondary'})),
    svc.entities.CommunicationThread.filter({status:'awaiting_counterparty'},'-next_action_at',1000).catch((error:any)=>safeBestEffort(error,{operation:'backfillLegacySendingProfiles',fallback:[],severity:'secondary'})),
    svc.entities.CommunicationThread.filter({status:'awaiting_cambra'},'-next_action_at',1000).catch((error:any)=>safeBestEffort(error,{operation:'backfillLegacySendingProfiles',fallback:[],severity:'secondary'})),
    svc.entities.CommunicationThread.filter({status:'awaiting_approval'},'-created_date',1000).catch((error:any)=>safeBestEffort(error,{operation:'backfillLegacySendingProfiles',fallback:[],severity:'secondary'})),
  ]);
  return {
    rows:[...open,...counterparty,...cambra,...approval].filter((thread:any,index:number,rows:any[])=>rows.findIndex((row:any)=>row.id===thread.id)===index),
    truncated:open.length>=1000||counterparty.length>=1000||cambra.length>=1000||approval.length>=1000,
  };
}

export async function handleBackfillLegacySendingProfiles(req: Request) {
  try{
    const base44=createClientFromRequest(req);
    const user=await base44.auth.me().catch((error:any)=>safeBestEffort(error,{operation:'backfillLegacySendingProfiles',fallback:null,severity:'secondary'}));
    if(!user||user.role!=='admin')return Response.json({ok:false,error:'forbidden'},{status:403});
    const body=await req.json().catch(()=>({}));
    const apply=body?.apply===true;
    if(apply&&body?.confirmation!=='BACKFILL_LEGACY_SENDING_PROFILES')return Response.json({ok:false,error:'confirmation_required'},{status:409});
    const svc=base44.asServiceRole;
    const [scan,profiles,policies]=await Promise.all([
      candidates(svc),svc.entities.OutboundSendingProfile.list('-created_date',500).catch((error:any)=>safeBestEffort(error,{operation:'backfillLegacySendingProfiles',fallback:[],severity:'secondary'})),svc.entities.CommercialPolicy.list('-created_date',500).catch((error:any)=>safeBestEffort(error,{operation:'backfillLegacySendingProfiles',fallback:[],severity:'secondary'})),
    ]);
    const policyFor=(thread:any)=>policies.find((policy:any)=>policy.policy_key===thread.policy_key&&policy.version===thread.policy_version)||policies.find((policy:any)=>policy.policy_key===thread.policy_key&&policy.status==='active')||null;
    const now=new Date().toISOString();
    const actor=String(user.email||user.id||'admin');
    let resolved=0,reviewRequired=0,updated=0,unchanged=0;
    const report:any[]=[];

    for(const thread of scan.rows){
      const messages=await svc.entities.CommunicationMessage.filter({thread_id:thread.id},'-created_date',50).catch((error:any)=>safeBestEffort(error,{operation:'backfillLegacySendingProfiles',fallback:[],severity:'secondary'}));
      const result=resolveLegacySendingProfile({thread,messages,profiles,policy:policyFor(thread)});
      if(result.status==='RESOLVED')resolved++;else reviewRequired++;
      const same=equivalent(thread,result);
      if(same)unchanged++;
      else if(apply){await svc.entities.CommunicationThread.update(thread.id,legacyResolutionPatch(result,actor,now,thread));updated++;}
      report.push({thread_id:thread.id,thread_key:thread.thread_key||null,status:result.status,profile_key:result.profile_key||null,reason:result.reason,changed:!same});
    }

    let invalidEligible:any[]=[];
    let postScanTruncated=scan.truncated;
    if(apply){
      const after=await candidates(svc);postScanTruncated=after.truncated;
      const profileByKey=new Map<string,any>();
      for(const profile of profiles)if(!profileByKey.has(String(profile.profile_key)))profileByKey.set(String(profile.profile_key),profile);
      invalidEligible=after.rows.filter(automaticFollowUpCandidate).filter((thread:any)=>!sendingProfileIsValid(profileByKey.get(String(thread.sending_profile_key||''))));
      await svc.entities.OperationalLog.create({
        event_type:'legacy_sending_profile_backfill',message:`${resolved} resolved, ${reviewRequired} review required`,
        data_json:{resolver_version:LEGACY_SENDING_PROFILE_RESOLVER_VERSION,scanned:scan.rows.length,resolved,review_required:reviewRequired,updated,unchanged,coverage_truncated:postScanTruncated,eligible_after_without_valid_profile:invalidEligible.length},
        actor_email:actor,created_at:now,
      }).catch((error:any)=>safeBestEffort(error,{operation:'backfillLegacySendingProfiles',fallback:null,severity:'secondary'}));
    }
    const activationReady=apply&&!postScanTruncated&&invalidEligible.length===0;
    return Response.json({
      ok:!apply||activationReady,dry_run:!apply,activation_ready:activationReady,resolver_version:LEGACY_SENDING_PROFILE_RESOLVER_VERSION,
      scanned:scan.rows.length,resolved,review_required:reviewRequired,updated,unchanged,coverage_truncated:postScanTruncated,
      eligible_after_without_valid_profile:invalidEligible.length,
      invalid_eligible_threads:invalidEligible.slice(0,100).map((thread:any)=>({thread_id:thread.id,thread_key:thread.thread_key||null,sending_profile_key:thread.sending_profile_key||null})),
      report:report.slice(0,500),report_truncated:report.length>500,
      note:apply?'Unresolved threads are explicitly paused as REVIEW_REQUIRED; no profile is inferred.':'Dry-run only. Re-run with apply=true and the explicit confirmation to persist.',
    },{status:apply&&!activationReady?409:200});
  }catch(error){
    console.error('backfillLegacySendingProfiles failed',error);
    return Response.json({ok:false,error:'legacy_sending_profile_backfill_failed'},{status:500});
  }
}
