import { assertOperationAllowed } from './operationalControl.ts';
import { approvalImmutableContentHash, buildApprovalAuthoritySnapshot, deriveApprovalLifecycle } from './approvalAuthority.ts';
import { sha256 } from './intelligenceCore.ts';
import { attemptFailClosedOperation, requireCriticalOperation } from './criticalExecution.ts';

const DEFAULT_LEASE_MS = 10 * 60_000;

function exactlyOne(result:any) {
  if (!result || typeof result !== 'object') return false;
  if (result.success === false || result.ok === false) return false;
  const observed=['updated','modified_count','matched_count']
    .filter((key)=>result[key]!==undefined&&result[key]!==null)
    .map((key)=>Number(result[key]));
  return observed.length>0&&observed.every((value)=>Number.isInteger(value)&&value===1);
}

function text(value:any) { return String(value ?? '').trim(); }
function same(left:any, right:any) { return text(left) === text(right); }
function error(code:string, status=409) {
  const value:any = new Error(code);
  value.code = code;
  value.status = status;
  return value;
}

function executionReceiptRef(result:any) {
  const value=text(result?.execution_receipt_ref);
  // A result digest manufactured by this helper is not evidence that the
  // provider/domain effect happened. Callers must bind an observed, typed
  // provider or durable-domain reference explicitly.
  if (!/^[a-z][a-z0-9._-]{1,63}:[^\s].+$/.test(value))
    throw error('external_execution_receipt_required');
  return value;
}

function leaseState(task:any, at=Date.now()) {
  const expires = Date.parse(text(task?.execution_lease_expires_at));
  if (!Number.isFinite(expires)) return 'UNKNOWN';
  return expires > at ? 'ACTIVE' : 'EXPIRED';
}

function allowedAgent(expected:string|string[], actual:any) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  return allowed.includes(text(actual));
}

export function validateExternalApprovalBinding(input:any) {
  const { approval, task } = input;
  if (!approval || approval.status !== 'approved') throw error('approved_external_execution_required', 403);
  if (deriveApprovalLifecycle(approval, task).decision_status !== 'APPROVED') throw error('approved_external_decision_required', 403);
  if (!same(approval.action_type, input.actionType)) throw error('external_execution_action_mismatch');
  if (!task || !same(task.id, approval.agent_task_id)) throw error('external_execution_task_missing_or_mismatched');
  if (!same(task.approval_id, approval.id)) throw error('external_execution_reverse_link_mismatch');
  if (!same(task.brand_id, approval.brand_id)) throw error('external_execution_tenant_mismatch');
  if (!allowedAgent(input.agentName, task.agent_name)) throw error('external_execution_agent_mismatch');
  if (!same(task.task_type, input.taskType)) throw error('external_execution_task_type_mismatch');
  if (Number(task.risk_level) !== Number(input.riskLevel) || Number(approval.risk_level) !== Number(input.riskLevel)) throw error('external_execution_risk_mismatch');
  if (task.requires_approval !== true) throw error('external_execution_authority_flag_missing');
  const commandKey = text(input.commandKey);
  if (!commandKey || !same(commandKey, approval.resolution_command_key)) throw error('external_execution_command_binding_mismatch');
  if (approval.resolution_decision !== 'approve') throw error('external_execution_approve_decision_required');
  if (!text(approval.resolution_actor_email) || !text(approval.resolution_authority_hash) || !text(approval.resolution_content_hash)) throw error('external_execution_authority_evidence_missing');
  if (text(input.actorEmail).toLowerCase() !== text(approval.resolution_actor_email).toLowerCase()) throw error('external_execution_actor_mismatch', 403);
  const expiresAt=Date.parse(text(approval.expires_at));
  const nowMs=Number.isFinite(Number(input.nowMs))?Number(input.nowMs):Date.now();
  if (!Number.isFinite(expiresAt) || expiresAt<=nowMs) throw error('external_execution_approval_expired', 409);
  return commandKey;
}

async function validateStoredConfirmationBinding(approval:any) {
  const stored=approval?.resolution_binding_json;
  const storedHash=text(approval?.resolution_binding_hash);
  if (!stored || typeof stored !== 'object' || !storedHash || !text(approval?.resolution_nonce_used_at)) throw error('external_execution_confirmation_binding_missing');
  const { binding_hash:_ignored, ...unsigned }=stored;
  if (await sha256(unsigned)!==storedHash || text(stored.binding_hash)!==storedHash) throw error('external_execution_confirmation_binding_hash_mismatch');
  const payloadHash=await sha256({ draft_content:approval.draft_content||'', draft_payload_json:approval.draft_payload_json||{} });
  if (!same(stored.payload_hash,payloadHash)) throw error('external_execution_confirmation_payload_mismatch');
  if (!same(stored.actor,text(approval.resolution_actor_email).toLowerCase()) || !same(stored.tenant,approval.brand_id)) throw error('external_execution_confirmation_actor_tenant_mismatch');
  if (!same(stored.subject?.type,approval.related_entity_type||'AgentTask') || !same(stored.subject?.id,approval.related_entity_id||approval.agent_task_id)) throw error('external_execution_confirmation_subject_mismatch');
  if (!same(stored.expires_at,approval.expires_at) || !same(stored.confirmation_nonce_hash,approval.resolution_nonce_hash)) throw error('external_execution_confirmation_expiry_nonce_mismatch');
  if (!same(stored.policy?.key,approval.resolution_policy_key) || !same(stored.policy?.version,approval.resolution_policy_version)) throw error('external_execution_confirmation_policy_mismatch');
  if (!same(stored.authority_snapshot?.id,approval.resolution_authority_snapshot_id) || !same(stored.authority_snapshot?.hash,approval.resolution_authority_hash)) throw error('external_execution_confirmation_authority_mismatch');
  if (!same(stored.intelligence_snapshot?.id,approval.resolution_intelligence_snapshot_id) || !same(stored.intelligence_snapshot?.hash,approval.resolution_intelligence_snapshot_hash)) throw error('external_execution_confirmation_intelligence_mismatch');
  if (!same(stored.economic_terms_hash,approval.resolution_economic_terms_hash) || !same(stored.legal_terms_hash,approval.resolution_legal_terms_hash)) throw error('external_execution_confirmation_terms_mismatch');
  if (!same(stored.market_scope_version,approval.resolution_market_scope_version) || !same(stored.emergency_control?.id,approval.resolution_emergency_control_id) || Number(stored.emergency_control?.revision)!==Number(approval.resolution_emergency_control_revision)) throw error('external_execution_confirmation_scope_emergency_mismatch');
  return storedHash;
}

async function validateExternalAuthorityIntegrity(svc:any, input:any) {
  await validateStoredConfirmationBinding(input.approval);
  const actor = text(input.actorEmail).toLowerCase();
  const contentHash = await sha256({
    approval:await approvalImmutableContentHash(input.approval, actor),
    decision:'approve',
    reason:text(input.approval.resolution_reason),
  });
  if (!same(contentHash, input.approval.resolution_content_hash)) throw error('external_execution_content_hash_mismatch');
  if (input.task.status === 'waiting_approval') {
    const authorityHash = await sha256(await buildApprovalAuthoritySnapshot(svc, input.approval, input.task, actor));
    if (!same(authorityHash, input.approval.resolution_authority_hash)) throw error('external_execution_authority_hash_mismatch');
    return authorityHash;
  }
  if (!same(input.task.execution_authority_hash, input.approval.resolution_authority_hash)) throw error('external_execution_claim_authority_mismatch');
  return text(input.task.execution_authority_hash);
}

function terminalState(task:any, commandKey:string) {
  const owned = same(task.execution_command_key, commandKey);
  if (text(task.execution_command_key) && !owned) throw error('external_execution_command_owner_mismatch');
  if (task.status === 'completed' && task.execution_phase === 'completed' && owned) {
    const result=task.execution_result_json || task.output_payload_json || {};
    if (!text(task.execution_receipt_ref) || task.execution_status !== 'EXECUTED' || !same(result.execution_receipt_ref,task.execution_receipt_ref)) {
      return { state:'review_required', acquired:false, task, result:task.execution_result_json || {}, error:'external_execution_receipt_missing' };
    }
    return { state:'replay', acquired:false, task, result };
  }
  if (task.execution_phase === 'review_required' || task.status === 'waiting_input') {
    return { state:'review_required', acquired:false, task, result:task.execution_result_json || {}, error:task.execution_error || 'external_execution_review_required' };
  }
  if (task.status === 'failed' || task.status === 'cancelled') {
    return { state:'terminal_failure', acquired:false, task, error:task.execution_error || task.error || `external_execution_${task.status}` };
  }
  return null;
}

async function observedState(svc:any, taskId:string, commandKey:string) {
  const observed = await requireCriticalOperation('external_approval_task_read', () => svc.entities.AgentTask.get(taskId));
  if (!observed) throw error('external_execution_task_disappeared');
  return terminalState(observed, commandKey) || { state:'in_progress', acquired:false, task:observed, error:'external_execution_claim_in_progress' };
}

/**
 * Acquire the one durable claim that is allowed to cross the external-effect
 * boundary. A lease may only be recovered when effects_started=false. Once an
 * effect may have happened, expiry converts the task to REVIEW_REQUIRED.
 */
export async function claimExternalApprovalExecution(svc:any, input:any) {
  await assertOperationAllowed(svc, 'communications');
  let task = input.task;
  const commandKey = validateExternalApprovalBinding({ ...input, task });
  const authorityHash = await validateExternalAuthorityIntegrity(svc, { ...input, task });
  const terminal = terminalState(task, commandKey);
  if (terminal) return terminal;

  const nowMs = Number.isFinite(Number(input.nowMs)) ? Number(input.nowMs) : Date.now();
  const now = new Date(nowMs).toISOString();
  const token = `external-execution:${crypto.randomUUID()}`;
  const nextRevision = Number(task.execution_revision || 0) + 1;
  const lease = new Date(nowMs + Number(input.leaseMs || DEFAULT_LEASE_MS)).toISOString();

  let filter:any;
  if (task.status === 'waiting_approval') {
    filter = { id:task.id, approval_id:input.approval.id, status:'waiting_approval' };
    if (task.execution_revision != null) filter.execution_revision = Number(task.execution_revision || 0);
  } else if (task.status === 'running' && same(task.execution_command_key, commandKey)) {
    const observedLease=leaseState(task, nowMs);
    if (observedLease==='ACTIVE') return { state:'in_progress', acquired:false, task, error:'external_execution_claim_in_progress' };
    if (observedLease==='UNKNOWN') {
      const changed=await attemptFailClosedOperation('external_approval_unknown_lease_fence',()=>svc.entities.AgentTask.updateMany({
        id:task.id,
        status:'running',
        execution_command_key:commandKey,
        execution_attempt_token:text(task.execution_attempt_token),
        execution_revision:Number(task.execution_revision||0),
      },{$set:{
        status:'waiting_input',
        execution_phase:'review_required',
        execution_status:'REVIEW_REQUIRED',
        execution_error:'external_execution_lease_unknown',
        execution_lease_expires_at:'',
        execution_completed_at:now,
        completed_at:now,
        output_summary:'External execution lease is absent or invalid; founder reconciliation is required.',
        execution_result_json:{ok:false,review_required:true,reason:'external_execution_lease_unknown',approval_id:input.approval.id,command_key:commandKey},
      }}));
      if (!exactlyOne(changed)) return observedState(svc,task.id,commandKey);
      return observedState(svc,task.id,commandKey);
    }
    if (task.execution_effects_started === true) {
      const changed = await attemptFailClosedOperation('external_approval_ambiguous_effect_fence', () => svc.entities.AgentTask.updateMany({
        id:task.id,
        status:'running',
        execution_command_key:commandKey,
        execution_attempt_token:text(task.execution_attempt_token),
        execution_revision:Number(task.execution_revision || 0),
        execution_effects_started:true,
      }, { $set:{
        status:'waiting_input',
        execution_phase:'review_required',
        execution_status:'REVIEW_REQUIRED',
        execution_error:'external_execution_lease_expired_after_effect',
        execution_lease_expires_at:'',
        execution_completed_at:now,
        completed_at:now,
        output_summary:'External effect may have completed; founder reconciliation required before any retry.',
        execution_result_json:{ ok:false, review_required:true, reason:'external_execution_lease_expired_after_effect', approval_id:input.approval.id, command_key:commandKey },
      } }));
      if (exactlyOne(changed)) return observedState(svc, task.id, commandKey);
      return observedState(svc, task.id, commandKey);
    }
    filter = {
      id:task.id,
      status:'running',
      execution_command_key:commandKey,
      execution_attempt_token:text(task.execution_attempt_token),
      execution_revision:Number(task.execution_revision || 0),
      execution_effects_started:false,
    };
  } else {
    throw error('external_execution_task_state_not_claimable');
  }

  const changed = await attemptFailClosedOperation('external_approval_claim_cas', () => svc.entities.AgentTask.updateMany(filter, { $set:{
    status:'running',
    execution_command_key:commandKey,
    execution_authority_hash:authorityHash,
    execution_phase:'claimed',
    execution_status:'CLAIMED',
    execution_receipt_ref:'',
    execution_revision:nextRevision,
    execution_attempt_token:token,
    execution_effects_started:false,
    execution_lease_expires_at:lease,
    execution_started_at:task.execution_started_at || now,
    execution_completed_at:'',
    execution_error:'',
    started_at:task.started_at || now,
  } }));
  if (!exactlyOne(changed)) return observedState(svc, task.id, commandKey);
  task = await requireCriticalOperation('external_approval_claim_readback',()=>svc.entities.AgentTask.get(task.id));
  if (!task || task.status!=='running' || task.execution_phase!=='claimed' || task.execution_status!=='CLAIMED' || !same(task.execution_command_key,commandKey) || !same(task.execution_attempt_token,token) || Number(task.execution_revision)!==nextRevision || task.execution_effects_started!==false) throw error('external_execution_claim_readback_mismatch');
  return { state:'claimed', acquired:true, task, approval:input.approval, commandKey, token, revision:nextRevision, effectsStarted:false };
}

function ownedFilter(execution:any, phase?:string) {
  const filter:any = {
    id:execution.task.id,
    status:'running',
    execution_command_key:execution.commandKey,
    execution_attempt_token:execution.token,
    execution_revision:execution.revision,
  };
  if (phase) filter.execution_phase = phase;
  return filter;
}

export async function beginExternalApprovalEffects(svc:any, execution:any) {
  if (!execution?.acquired) throw error('external_execution_claim_required');
  const expiresAt=Date.parse(text(execution.approval?.expires_at));
  if (!Number.isFinite(expiresAt) || expiresAt<=Date.now()) throw error('external_execution_approval_expired');
  await assertOperationAllowed(svc, 'communications');
  const changed = await svc.entities.AgentTask.updateMany({ ...ownedFilter(execution, 'claimed'), execution_effects_started:false }, { $set:{
    execution_phase:'applying',
    execution_status:'EFFECTING',
    execution_effects_started:true,
    execution_lease_expires_at:new Date(Date.now() + DEFAULT_LEASE_MS).toISOString(),
  } });
  if (!exactlyOne(changed)) throw error('external_execution_effect_fence_lost');
  execution.effectsStarted = true;
  execution.task = await requireCriticalOperation('external_approval_effect_start_readback',()=>svc.entities.AgentTask.get(execution.task.id));
  if (!execution.task || execution.task.execution_phase!=='applying' || execution.task.execution_status!=='EFFECTING' || execution.task.execution_effects_started!==true || !same(execution.task.execution_attempt_token,execution.token)) throw error('external_execution_effect_start_readback_mismatch');
  return execution;
}

export async function assertExternalApprovalExecutionActive(svc:any, execution:any) {
  await assertOperationAllowed(svc, 'communications');
  const expiresAt=Date.parse(text(execution.approval?.expires_at));
  if (!Number.isFinite(expiresAt) || expiresAt<=Date.now()) throw error('external_execution_approval_expired');
  const observed = await requireCriticalOperation('external_approval_fence_read', () => svc.entities.AgentTask.get(execution.task.id));
  if (!observed || observed.status !== 'running' || observed.execution_phase !== 'applying' || observed.execution_status !== 'EFFECTING' || !same(observed.execution_command_key, execution.commandKey) || !same(observed.execution_attempt_token, execution.token) || Number(observed.execution_revision) !== Number(execution.revision)) throw error('external_execution_fence_lost');
  return observed;
}

export async function checkpointExternalApprovalExecution(svc:any, execution:any, progress:any) {
  await assertExternalApprovalExecutionActive(svc, execution);
  const changed = await svc.entities.AgentTask.updateMany(ownedFilter(execution, 'applying'), { $set:{ execution_result_json:{ ...progress, terminal:false, approval_id:execution.approval.id, command_key:execution.commandKey }, execution_lease_expires_at:new Date(Date.now() + DEFAULT_LEASE_MS).toISOString() } });
  if (!exactlyOne(changed)) throw error('external_execution_checkpoint_fence_lost');
  execution.task = { ...execution.task, execution_result_json:{ ...progress, terminal:false, approval_id:execution.approval.id, command_key:execution.commandKey } };
}

export async function completeExternalApprovalExecution(svc:any, execution:any, result:any, summary:string) {
  await assertExternalApprovalExecutionActive(svc, execution);
  const at = new Date().toISOString();
  const receiptRef=executionReceiptRef(result);
  const persisted = { ...result, ok:true, approval_id:execution.approval.id, command_key:execution.commandKey, execution_receipt_ref:receiptRef, terminal:true };
  const changed = await svc.entities.AgentTask.updateMany({ ...ownedFilter(execution, 'applying'), execution_effects_started:true }, { $set:{
    status:'completed',
    execution_phase:'completed',
    execution_status:'EXECUTED',
    execution_receipt_ref:receiptRef,
    execution_lease_expires_at:'',
    execution_completed_at:at,
    execution_result_json:persisted,
    execution_error:'',
    output_summary:summary,
    output_payload_json:persisted,
    completed_at:at,
  } });
  if (!exactlyOne(changed)) throw error('external_execution_completion_fence_lost');
  const observed=await requireCriticalOperation('external_approval_completion_readback',()=>svc.entities.AgentTask.get(execution.task.id));
  if (!observed || observed.status!=='completed' || observed.execution_phase!=='completed' || observed.execution_status!=='EXECUTED' || !same(observed.execution_receipt_ref,receiptRef) || !same(observed.execution_result_json?.execution_receipt_ref,receiptRef) || !same(observed.execution_command_key,execution.commandKey) || !same(observed.execution_attempt_token,execution.token)) throw error('external_execution_completion_readback_mismatch');
  return persisted;
}

export async function releaseExternalApprovalClaim(svc:any, execution:any, reason='external_execution_preflight_failed') {
  if (!execution?.acquired || execution.effectsStarted) return false;
  const changed = await attemptFailClosedOperation('external_approval_claim_release', () => svc.entities.AgentTask.updateMany({ ...ownedFilter(execution, 'claimed'), execution_effects_started:false }, { $set:{
    status:'waiting_approval',
    execution_command_key:'',
    execution_authority_hash:'',
    execution_phase:'idle',
    execution_status:'NOT_STARTED',
    execution_receipt_ref:'',
    execution_revision:Number(execution.revision) + 1,
    execution_attempt_token:'',
    execution_lease_expires_at:'',
    execution_error:reason,
    output_summary:'Approved external execution is waiting for a safe preflight retry.',
  } }));
  if (!exactlyOne(changed)) return false;
  const observed=await requireCriticalOperation('external_approval_release_readback',()=>svc.entities.AgentTask.get(execution.task.id));
  if (!observed || observed.status!=='waiting_approval' || observed.execution_phase!=='idle' || observed.execution_status!=='NOT_STARTED' || text(observed.execution_command_key) || text(observed.execution_attempt_token) || Number(observed.execution_revision)!==Number(execution.revision)+1 || observed.execution_effects_started!==false) throw error('external_execution_release_readback_mismatch');
  return true;
}

export async function markExternalApprovalReviewRequired(svc:any, execution:any, reason='external_execution_effect_ambiguous', evidence:any={}) {
  if (!execution?.acquired) return null;
  const at = new Date().toISOString();
  const persisted = { ok:false, review_required:true, reason, approval_id:execution.approval.id, command_key:execution.commandKey, terminal:true, ...evidence };
  const phase = execution.effectsStarted ? 'applying' : 'claimed';
  const changed = await attemptFailClosedOperation('external_approval_review_required_fence', () => svc.entities.AgentTask.updateMany(ownedFilter(execution, phase), { $set:{
    status:'waiting_input',
    execution_phase:'review_required',
    execution_status:'REVIEW_REQUIRED',
    execution_lease_expires_at:'',
    execution_completed_at:at,
    execution_error:reason,
    execution_result_json:persisted,
    output_summary:'External effect requires founder reconciliation; automatic replay is blocked.',
    output_payload_json:persisted,
    completed_at:at,
  } }));
  const observed=await requireCriticalOperation('external_approval_review_required_readback', () => svc.entities.AgentTask.get(execution.task.id));
  if (!observed || observed.status!=='waiting_input' || observed.execution_phase!=='review_required' || observed.execution_status!=='REVIEW_REQUIRED' || !same(observed.execution_command_key,execution.commandKey) || !same(observed.execution_attempt_token,execution.token) || Number(observed.execution_revision)!==Number(execution.revision)) throw error('external_execution_review_readback_mismatch');
  if (!exactlyOne(changed) && !same(observed.execution_error,reason)) throw error('external_execution_review_fence_lost');
  return observed.execution_result_json || persisted;
}

export function externalExecutionHttpStatus(state:any) {
  if (state?.state === 'in_progress') return 409;
  if (state?.state === 'review_required' || state?.state === 'terminal_failure') return 409;
  return 200;
}
