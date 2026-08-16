import { readAuthorityRowsForContainment, readSingletonAuthority } from './singletonAuthority.ts';
import { attemptFailClosedOperation } from './criticalExecution.ts';

export type EmergencyCapability='communications'|'negotiations'|'migrations'|'billing_issuance'|'paid_discovery';
export type EmergencyState={safe_mode:boolean,communications_paused:boolean,negotiations_paused:boolean,migrations_paused:boolean,billing_issuance_paused:boolean,paid_discovery_paused:boolean,resume_check_required:boolean,control_available:boolean,control_id?:string,control_revision?:number,updated_at?:string,reason?:string,last_correlation_id?:string};
export type EmergencyEpochClaim={
  control_id:string;
  control_revision:number;
  capabilities:EmergencyCapability[];
  captured_at:string;
  state:EmergencyState;
};
export type CommunicationTransport='outlook'|'resend'|'instantly';
export type TransportContainmentStatus='NOT_CONFIGURED'|'LOCALLY_BLOCKED'|'REMOTELY_VERIFIED_PAUSED'|'UNVERIFIED'|'ERROR';
export type TransportContainmentObservation={
  transport:CommunicationTransport;
  configured:boolean;
  local_blocked:boolean;
  remote_pause_supported:boolean;
  remote_verified_paused:boolean;
  evidence?:any;
};

export const COMMUNICATION_TRANSPORTS=Object.freeze(['outlook','resend','instantly'] as const);

// A missing/unreadable authority record is not permission. Material execution
// fails closed while read-only intelligence, inbound evidence and reconciliation
// can continue through their existing boundaries.
export const DEFAULT_EMERGENCY_STATE:EmergencyState=Object.freeze({safe_mode:true,communications_paused:true,negotiations_paused:true,migrations_paused:true,billing_issuance_paused:true,paid_discovery_paused:true,resume_check_required:true,control_available:false,reason:'emergency_control_unavailable'});

export async function emergencyState(svc:any):Promise<EmergencyState>{
  const authority=await readSingletonAuthority(svc,{entity:'EmergencyControl',query:{control_key:'global'},sort:'-updated_at',authority:'emergency_control'});
  const r=authority.row;
  if(!authority.ok||!r)return{...DEFAULT_EMERGENCY_STATE,reason:authority.blocker||DEFAULT_EMERGENCY_STATE.reason};
  return{safe_mode:r.safe_mode===true,communications_paused:r.communications_paused===true,negotiations_paused:r.negotiations_paused===true,migrations_paused:r.migrations_paused===true,billing_issuance_paused:r.billing_issuance_paused===true,paid_discovery_paused:r.paid_discovery_paused===true,resume_check_required:r.resume_check_required===true,control_available:true,control_id:String(r.id||''),control_revision:Number.isInteger(Number(r.control_revision))?Number(r.control_revision):undefined,updated_at:String(r.updated_at||''),reason:String(r.reason||''),last_correlation_id:String(r.last_correlation_id||'')};
}

const pausedFor=(state:EmergencyState,capability:EmergencyCapability)=>!state.control_available||state.safe_mode||capability==='communications'&&state.communications_paused||capability==='negotiations'&&state.negotiations_paused||capability==='migrations'&&state.migrations_paused||capability==='billing_issuance'&&state.billing_issuance_paused||capability==='paid_discovery'&&state.paid_discovery_paused;

function emergencyError(message:string,state:EmergencyState,phase?:string){
  const error:any=new Error(message);
  error.code=message.startsWith('emergency_control_epoch_changed')?'EMERGENCY_CONTROL_EPOCH_CHANGED':message.startsWith('emergency_control_epoch_invalid')?'EMERGENCY_CONTROL_EPOCH_INVALID':'EMERGENCY_CONTROL_PAUSED';
  error.status=409;
  error.state=state;
  if(phase)error.phase=phase;
  return error;
}

/**
 * Captures the monotonic EmergencyControl revision which authorizes one
 * material operation. A missing/non-integer revision is not an epoch and is
 * therefore never permission. Callers retain this claim across preparation
 * and revalidate it immediately around every external effect.
 */
export async function captureEmergencyEpoch(svc:any,capabilities:EmergencyCapability|EmergencyCapability[]):Promise<EmergencyEpochClaim>{
  const requested=[...new Set((Array.isArray(capabilities)?capabilities:[capabilities]).filter(Boolean))];
  const state=await emergencyState(svc);
  if(requested.length===0)throw emergencyError('emergency_control_epoch_invalid',state,'capture');
  const paused=requested.find((capability)=>pausedFor(state,capability));
  if(paused)throw emergencyError(`emergency_control_paused:${paused}`,state,'capture');
  if(!state.control_id||!Number.isInteger(state.control_revision))throw emergencyError('emergency_control_epoch_unavailable',state,'capture');
  return{control_id:state.control_id,control_revision:Number(state.control_revision),capabilities:requested,captured_at:new Date().toISOString(),state};
}

/**
 * Re-reads the singleton and requires the exact captured id/revision. Merely
 * seeing permissive flags again after STOP -> RESUME is insufficient: every
 * transition advances the revision and invalidates in-flight work.
 */
export async function assertEmergencyEpochUnchanged(svc:any,claim:EmergencyEpochClaim,phase='material_effect'){
  const state=await emergencyState(svc);
  const paused=claim.capabilities.find((capability)=>pausedFor(state,capability));
  if(paused)throw emergencyError(`emergency_control_paused:${paused}`,state,phase);
  if(!state.control_id||!Number.isInteger(state.control_revision)||state.control_id!==claim.control_id||Number(state.control_revision)!==Number(claim.control_revision)){
    const error:any=emergencyError('emergency_control_epoch_changed',state,phase);
    error.expected={control_id:claim.control_id,control_revision:claim.control_revision};
    error.observed={control_id:state.control_id||null,control_revision:Number.isInteger(state.control_revision)?state.control_revision:null};
    throw error;
  }
  return state;
}

/** Adds a stricter capability to an existing claim without granting a newer epoch. */
export async function extendEmergencyEpoch(svc:any,claim:EmergencyEpochClaim,capabilities:EmergencyCapability|EmergencyCapability[]){
  const extended={...claim,capabilities:[...new Set([...claim.capabilities,...(Array.isArray(capabilities)?capabilities:[capabilities])])]} as EmergencyEpochClaim;
  await assertEmergencyEpochUnchanged(svc,extended,'extend_capability');
  return extended;
}

/**
 * Adopts an epoch passed by an authenticated internal parent operation. The
 * value is never trusted as authority: its shape is validated and its exact
 * singleton revision is re-read before use. This closes function-invocation
 * gaps where a child could otherwise capture a fresh epoch after STOP/RESUME.
 */
export async function inheritEmergencyEpoch(svc:any,value:any,capabilities:EmergencyCapability|EmergencyCapability[]){
  const allowed:EmergencyCapability[]=['communications','negotiations','migrations','billing_issuance','paid_discovery'];
  const valid=value&&typeof value==='object'&&typeof value.control_id==='string'&&value.control_id&&Number.isInteger(Number(value.control_revision))&&Array.isArray(value.capabilities)&&value.capabilities.length>0&&value.capabilities.every((capability:any)=>allowed.includes(capability));
  if(!valid){
    const state=await emergencyState(svc);
    throw emergencyError('emergency_control_epoch_invalid',state,'inherit');
  }
  const claim:EmergencyEpochClaim={control_id:String(value.control_id),control_revision:Number(value.control_revision),capabilities:[...new Set(value.capabilities)] as EmergencyCapability[],captured_at:String(value.captured_at||''),state:value.state||DEFAULT_EMERGENCY_STATE};
  return extendEmergencyEpoch(svc,claim,capabilities);
}

/**
 * Normalizes one transport into the only durable containment states accepted
 * by ROOT-OTR-003. A configured one-shot transport can be locally blocked, but
 * it is never represented as remotely verified when no such provider receipt
 * exists.
 */
export function transportContainmentStatus(input:TransportContainmentObservation):TransportContainmentStatus{
  if(!input.configured)return'NOT_CONFIGURED';
  if(!input.local_blocked)return'ERROR';
  if(!input.remote_pause_supported)return'LOCALLY_BLOCKED';
  return input.remote_verified_paused?'REMOTELY_VERIFIED_PAUSED':'UNVERIFIED';
}

export function normalizeTransportContainment(observations:TransportContainmentObservation[]){
  const byTransport=new Map(observations.map((row)=>[row.transport,row]));
  const transports=COMMUNICATION_TRANSPORTS.map((transport)=>{
    const observed=byTransport.get(transport);
    if(!observed)return{transport,configured:false,status:'NOT_CONFIGURED' as TransportContainmentStatus,local_blocked:false,remote_pause_supported:false,remote_verified_paused:false,evidence:null};
    return{
      transport,
      configured:observed.configured===true,
      status:transportContainmentStatus(observed),
      local_blocked:observed.local_blocked===true,
      remote_pause_supported:observed.remote_pause_supported===true,
      remote_verified_paused:observed.remote_verified_paused===true,
      evidence:observed.evidence??null,
    };
  });
  // CAMBRA's current drill contract intentionally remains stricter than local
  // blocking: every configured transport needs a provider pause receipt.
  // Outlook and Resend cannot meet that contract today, so they keep the drill
  // at CONTAINMENT_INCOMPLETE while still recording LOCALLY_BLOCKED honestly.
  const complete=transports.every((row)=>!row.configured||row.status==='REMOTELY_VERIFIED_PAUSED');
  return{containment_status:complete?'CONTAINED' as const:'CONTAINMENT_INCOMPLETE' as const,transports};
}

/** Persists transport evidence on the existing EmergencyControl authority. */
export async function persistEmergencyTransportContainment(svc:any,input:{
  control_id:string;
  control_revision:number;
  correlation_id:string;
  observed_at?:string;
  observations:TransportContainmentObservation[];
  additional_blockers?:string[];
}){
  const observedAt=String(input.observed_at||new Date().toISOString());
  const normalized=normalizeTransportContainment(input.observations);
  const blockers=[
    ...normalized.transports.filter((row)=>row.configured&&row.status!=='REMOTELY_VERIFIED_PAUSED').map((row)=>`transport:${row.transport}:${row.status}`),
    ...(Array.isArray(input.additional_blockers)?input.additional_blockers:[]),
  ].filter(Boolean);
  const containmentStatus=normalized.containment_status==='CONTAINED'&&blockers.length===0?'CONTAINED' as const:'CONTAINMENT_INCOMPLETE' as const;
  const evidence={
    schema_version:'emergency-transport-containment-v1',
    correlation_id:String(input.correlation_id||''),
    observed_at:observedAt,
    containment_status:containmentStatus,
    blockers:[...new Set(blockers)],
    transports:normalized.transports,
  };
  const changed=await attemptFailClosedOperation('emergency_transport_containment_evidence_cas',()=>svc.entities.EmergencyControl.updateMany(
    {id:String(input.control_id||''),control_revision:Number(input.control_revision)},
    {$set:{transport_containment_json:evidence,transport_containment_status:containmentStatus,transport_containment_observed_at:observedAt}},
  ));
  if(!exactlyOne(changed))return{ok:false,persisted:false,containment_status:'CONTAINMENT_INCOMPLETE' as const,transports:normalized.transports,error:'emergency_transport_containment_authority_changed'};
  const control=await attemptFailClosedOperation('emergency_transport_containment_evidence_readback',()=>svc.entities.EmergencyControl.get(String(input.control_id||'')));
  const persisted=Boolean(
    control&&Number(control.control_revision)===Number(input.control_revision)&&
    control.transport_containment_status===containmentStatus&&
    control.transport_containment_json?.correlation_id===evidence.correlation_id&&
    JSON.stringify(control.transport_containment_json?.transports||[])===JSON.stringify(evidence.transports),
  );
  return persisted
    ?{ok:true,persisted:true,containment_status:containmentStatus,blockers:evidence.blockers,transports:normalized.transports,evidence,control}
    :{ok:false,persisted:false,containment_status:'CONTAINMENT_INCOMPLETE' as const,transports:normalized.transports,evidence,control,error:'emergency_transport_containment_readback_mismatch'};
}

const exactlyOne=(result:any)=>Boolean(result&&(result.updated===1||result.modified_count===1||result.matched_count===1));

/**
 * Durable local containment for a transport after a stale-epoch race. It
 * visits every OutboundControl row (including split-brain rows), invalidates
 * any in-flight start claim and pauses matching sending profiles. Instantly's
 * remote campaign pause remains the caller's additional provider boundary.
 */
export async function containCommunicationTransport(svc:any,transport:CommunicationTransport,reason='emergency_epoch_changed'){
  const authority=await readAuthorityRowsForContainment(svc,{entity:'OutboundControl',query:{control_key:'global'},sort:'-created_date',authority:'outbound_control',limit:1000});
  const results:any[]=[];
  const transportField:Record<CommunicationTransport,string>={outlook:'premium_outlook_enabled',resend:'volume_resend_enabled',instantly:'instantly_enabled'};
  for(const seed of authority.rows||[]){
    let contained=false;
    for(let attempt=0;attempt<4&&!contained;attempt++){
      const current=attempt===0?seed:await attemptFailClosedOperation('emergency_outbound_control_read',()=>svc.entities.OutboundControl.get(seed.id));
      if(!current)break;
      const revision=Number.isInteger(Number(current.control_revision))?Number(current.control_revision):0;
      const patch:any={acquisition_enabled:false,[transportField[transport]]:false,paused_reason:String(reason).slice(0,300),transition_key:'',transition_action:'',transition_actor:'',transition_preflight_hash:'',transition_emergency_revision:null,transition_started_at:null,transition_expires_at:null,control_revision:revision+1};
      const changed=await attemptFailClosedOperation('emergency_outbound_control_containment_cas',()=>svc.entities.OutboundControl.updateMany({id:current.id,control_revision:revision},{$set:patch}));
      contained=exactlyOne(changed);
    }
    results.push({control_id:String(seed.id||''),contained});
  }
  let profiles:any[]=[];
  let profilesRead=true;
  try{
    profiles=await svc.entities.OutboundSendingProfile.filter({provider:transport},'-created_date',1000);
    if(!Array.isArray(profiles))throw new Error('profile_read_unavailable');
    // The SDK filter is bounded. Hitting the bound means containment coverage
    // cannot be proven, even though every visible profile is still paused.
    if(profiles.length>=1000)profilesRead=false;
  }catch{profiles=[];profilesRead=false;}
  const profileResults=[];
  for(const profile of profiles){
    try{await svc.entities.OutboundSendingProfile.update(profile.id,{status:'paused',last_provider_health_at:new Date().toISOString(),notes:`${reason}; durable ${transport} containment after emergency epoch change`});profileResults.push({profile_id:String(profile.id||''),contained:true});}
    catch{profileResults.push({profile_id:String(profile.id||''),contained:false});}
  }
  const ok=authority.complete&&results.every((row)=>row.contained)&&profilesRead&&profileResults.every((row)=>row.contained);
  return{ok,transport,reason,authority_complete:authority.complete,authority_blocker:authority.blocker,control_results:results,profiles_read:profilesRead,profile_results:profileResults};
}

/**
 * Runs one already-idempotent material effect inside a captured epoch. When a
 * stop races with a successful provider response, the caller receives a typed
 * ambiguous result and must reconcile before any retry.
 */
export async function guardedEmergencyEffect<T>(svc:any,input:{
  claim:EmergencyEpochClaim;
  effect_key:string;
  effect:()=>Promise<T>;
  contain?:(result:T)=>Promise<any>;
}){
  await assertEmergencyEpochUnchanged(svc,input.claim,`before:${input.effect_key}`);
  let result:T;
  try{result=await input.effect();}
  catch(error){
    const effectError:any=error;
    effectError.emergency_effect_key=input.effect_key;
    throw effectError;
  }
  try{
    await assertEmergencyEpochUnchanged(svc,input.claim,`after:${input.effect_key}`);
  }catch(error){
    let containment:any=null;
    if(input.contain){
      try{containment=await input.contain(result);}
      catch(containmentError){containment={ok:false,error:compactError(containmentError)};}
    }
    const raced:any=new Error('emergency_control_changed_during_external_effect');
    raced.code='EMERGENCY_EFFECT_AMBIGUOUS';
    raced.status=409;
    raced.effect_key=input.effect_key;
    raced.cause=error;
    raced.effect_result=result;
    raced.containment=containment;
    raced.review_required=true;
    throw raced;
  }
  return result;
}

const compactError=(value:any)=>String(value?.code||value?.message||value||'containment_failed').replace(/[\r\n]+/g,' ').slice(0,160);

export async function assertOperationAllowed(svc:any,capability:EmergencyCapability){
  const s=await emergencyState(svc);
  const paused=pausedFor(s,capability);
  if(paused){const e:any=new Error(`emergency_control_paused:${capability}`);e.code='EMERGENCY_CONTROL_PAUSED';e.state=s;throw e}
  return s;
}
