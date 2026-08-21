import { sha256Canonical } from './legalExecution.ts';

export const RUNTIME_EVIDENCE_VERSION = 'runtime-evidence-2.0.0';
export const RUNTIME_IDENTITY_VERSION = 'cambra-runtime-deployment-identity-v1';
export const EXPECTED_BASE44_PHYSICAL_FUNCTIONS = 276;
export const EXPECTED_BASE44_LOGICAL_ROUTES = 39;

const SHA40 = /^[a-f0-9]{40}$/iu;
const SHA256 = /^[a-f0-9]{64}$/iu;

type RuntimeEnvironment = Record<string, string | undefined>;

function runtimeEnvironment():RuntimeEnvironment {
  const read = (key:string) => {
    try {
      const deno = (globalThis as any)?.Deno;
      if (deno?.env?.get) return deno.env.get(key);
    } catch { /* unavailable outside Deno */ }
    try {
      const processValue = (globalThis as any)?.process?.env?.[key];
      return typeof processValue === 'string' ? processValue : undefined;
    } catch { return undefined; }
  };
  return Object.fromEntries([
    'CAMBRA_ENVIRONMENT','CAMBRA_RELEASE_VERSION','CAMBRA_RELEASE_BUILD_ID',
    'CAMBRA_GIT_SHA','CAMBRA_SOURCE_TREE_HASH','CAMBRA_SOURCE_TREE_FILE_COUNT',
    'CAMBRA_BASE44_BUNDLE_HASH','CAMBRA_BASE44_BUNDLE_FILE_COUNT',
    'CAMBRA_DEPLOYMENT_TOPOLOGY_HASH','CAMBRA_SCHEDULER_INVENTORY_HASH',
    'CAMBRA_PHYSICAL_FUNCTION_COUNT','CAMBRA_LOGICAL_ROUTE_COUNT',
  ].map((key) => [key, read(key)]));
}

function integer(value:any) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function withoutUndefined(value:any):any {
  if(Array.isArray(value))return value.map(withoutUndefined);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,entry])=>entry!==undefined).map(([key,entry])=>[key,withoutUndefined(entry)]));
  return value;
}

const RUNTIME_EVIDENCE_PAYLOAD_FIELDS = Object.freeze([
  'gate_key','environment','git_sha','source_tree_hash','source_tree_file_count',
  'release_version','release_build_id','base44_bundle_hash','base44_bundle_file_count',
  'deployment_topology_hash','scheduler_inventory_hash','physical_function_count',
  'logical_route_count','identity_version','identity_status','identity_hash',
  'identity_blockers','status','evidence_kind','source','external_run_id',
  'evidence_refs','details_json','observed_at','expires_at','recorded_by',
]);

const REAL_RESTORE_EXERCISE_PROJECTION_FIELDS = Object.freeze([
  'exercise_key','environment','exercise_type','status','rpo_target_minutes',
  'rpo_observed_minutes','rto_target_minutes','rto_observed_minutes',
  'backup_snapshot_ref','restored_target_ref','data_integrity_checks_json',
  'evidence_refs','conducted_by','started_at','completed_at',
]);

function runtimeIdentityFromEvidence(row:any) {
  return {
    identity_version:row?.identity_version,
    environment:row?.environment,
    release_version:row?.release_version,
    release_build_id:row?.release_build_id,
    git_sha:row?.git_sha,
    source_tree_hash:row?.source_tree_hash,
    source_tree_file_count:row?.source_tree_file_count,
    base44_bundle_hash:row?.base44_bundle_hash,
    base44_bundle_file_count:row?.base44_bundle_file_count,
    deployment_topology_hash:row?.deployment_topology_hash,
    scheduler_inventory_hash:row?.scheduler_inventory_hash,
    physical_function_count:row?.physical_function_count,
    logical_route_count:row?.logical_route_count,
  };
}

/** Canonical signed portion of a persisted RuntimeGateEvidence row. */
export function runtimeGateEvidencePayload(row:any) {
  return withoutUndefined(Object.fromEntries(
    RUNTIME_EVIDENCE_PAYLOAD_FIELDS
      .filter((field) => row?.[field] !== undefined)
      .map((field) => [field,row[field]]),
  ));
}

export function runtimeGateIdentityFromEvidence(row:any) {
  return runtimeIdentityFromEvidence(row);
}

export function realRestoreExerciseProjection(row:any) {
  return withoutUndefined(Object.fromEntries(
    REAL_RESTORE_EXERCISE_PROJECTION_FIELDS
      .filter((field) => row?.[field] !== undefined)
      .map((field) => [field,row[field]]),
  ));
}

export function realRestoreExerciseProjectionHash(row:any) {
  return sha256Canonical(realRestoreExerciseProjection(row));
}

function finalRealRestoreGateProjection(row:any) {
  return withoutUndefined({
    id:row?.id,
    evidence_key:row?.evidence_key,
    evidence_hash:row?.evidence_hash,
    ...runtimeGateEvidencePayload(row),
  });
}

/**
 * Final datastore fence for consumers of REAL_RESTORE PASS. The gate snapshot
 * selected by a caller is not authority after the Exercise and compensation
 * marker reads: compensation can append a newer BLOCKED row in that interval.
 * Consumers must therefore re-read both the exact evidence key and the latest
 * two gate rows, and prove that the same PASS remains uniquely latest.
 */
export async function verifyFinalRealRestoreGateAuthority(
  row:any,
  authority:any,
  verificationInput:any = {},
) {
  const blockers:string[]=[];
  if(!String(row?.id||'')||!String(row?.evidence_key||'')||
    !SHA256.test(String(row?.evidence_hash||''))||row?.gate_key!=='REAL_RESTORE'||
    row?.status!=='PASS'||!String(row?.observed_at||'')){
    blockers.push('real_restore_final_gate_binding_invalid');
  }
  if(
    !authority||authority.available!==true||authority.exact_query!==true||
    authority.latest_query!==true||!Array.isArray(authority.exact_rows)||
    !Array.isArray(authority.latest_rows)
  ){
    blockers.push('real_restore_final_gate_authority_unavailable');
  }else{
    if(authority.exact_rows.length!==1){
      blockers.push(authority.exact_rows.length===0
        ?'real_restore_final_gate_exact_missing'
        :'real_restore_final_gate_exact_ambiguous');
    }
    if(authority.latest_rows.length>2){
      blockers.push('real_restore_final_gate_latest_cardinality_invalid');
    }
    const selectedProjectionHash=await sha256Canonical(finalRealRestoreGateProjection(row));
    const validateFreshRow=async(fresh:any,scope:'exact'|'latest')=>{
      try{
        const projectionHash=await sha256Canonical(finalRealRestoreGateProjection(fresh));
        if(projectionHash!==selectedProjectionHash){
          blockers.push(`real_restore_final_gate_${scope}_mismatch`);
        }
        const expectedEvidenceHash=await sha256Canonical(runtimeGateEvidencePayload(fresh));
        if(!SHA256.test(String(fresh?.evidence_hash||''))||
          String(fresh.evidence_hash).toLowerCase()!==expectedEvidenceHash){
          blockers.push(`real_restore_final_gate_${scope}_hash_mismatch`);
        }
        const verification=await verifyRuntimeGateEvidence(fresh,{
          ...verificationInput,
          expected_status:'PASS',
        });
        if(!verification.ok){
          blockers.push(...verification.blockers.map((blocker:string)=>
            `real_restore_final_gate_${scope}_${blocker}`
          ));
        }
      }catch{
        blockers.push(`real_restore_final_gate_${scope}_verification_failed`);
      }
    };
    const selectedVerification=await verifyRuntimeGateEvidence(row,{
      ...verificationInput,
      expected_status:'PASS',
    }).catch(()=>({ok:false,blockers:['verification_failed']}));
    if(!selectedVerification.ok){
      blockers.push(...selectedVerification.blockers.map((blocker:string)=>
        `real_restore_final_gate_selected_${blocker}`
      ));
    }
    const exact=authority.exact_rows[0];
    if(exact)await validateFreshRow(exact,'exact');
    const latest=authority.latest_rows[0];
    if(!latest){
      blockers.push('real_restore_final_gate_latest_missing');
    }else{
      await validateFreshRow(latest,'latest');
      const latestProjectionHash=await sha256Canonical(finalRealRestoreGateProjection(latest));
      if(latestProjectionHash!==selectedProjectionHash)blockers.push('real_restore_final_gate_not_latest');
      if(latest.gate_key!=='REAL_RESTORE'||latest.status!=='PASS'){
        blockers.push('real_restore_final_gate_not_pass');
      }
      const latestMs=Date.parse(String(latest.observed_at||''));
      if(!Number.isFinite(latestMs)){
        blockers.push('real_restore_final_gate_observed_at_invalid');
      }
      const previous=authority.latest_rows[1];
      if(previous){
        const previousMs=Date.parse(String(previous.observed_at||''));
        if(!Number.isFinite(previousMs)||!Number.isFinite(latestMs)||latestMs<=previousMs){
          blockers.push('real_restore_final_gate_latest_ambiguous');
        }
      }
    }
  }
  const unique=[...new Set(blockers)];
  return{ok:unique.length===0,status:unique.length===0?'VERIFIED':'BLOCKED',blockers:unique};
}

/**
 * Runtime identity is read only from deployment-owned environment variables.
 * Request payloads are deliberately not an identity source: an Admin can ask
 * CAMBRA to verify a release, but cannot turn that release into the deployed
 * release merely by posting its hashes.
 */
export function runtimeDeploymentIdentity(environment:RuntimeEnvironment = runtimeEnvironment()) {
  return {
    identity_version:RUNTIME_IDENTITY_VERSION,
    environment:String(environment.CAMBRA_ENVIRONMENT || '').trim().toLowerCase(),
    release_version:String(environment.CAMBRA_RELEASE_VERSION || '').trim(),
    release_build_id:String(environment.CAMBRA_RELEASE_BUILD_ID || '').trim(),
    git_sha:String(environment.CAMBRA_GIT_SHA || '').trim().toLowerCase(),
    source_tree_hash:String(environment.CAMBRA_SOURCE_TREE_HASH || '').trim().toLowerCase(),
    source_tree_file_count:integer(environment.CAMBRA_SOURCE_TREE_FILE_COUNT),
    base44_bundle_hash:String(environment.CAMBRA_BASE44_BUNDLE_HASH || '').trim().toLowerCase(),
    base44_bundle_file_count:integer(environment.CAMBRA_BASE44_BUNDLE_FILE_COUNT),
    deployment_topology_hash:String(environment.CAMBRA_DEPLOYMENT_TOPOLOGY_HASH || '').trim().toLowerCase(),
    scheduler_inventory_hash:String(environment.CAMBRA_SCHEDULER_INVENTORY_HASH || '').trim().toLowerCase(),
    physical_function_count:integer(environment.CAMBRA_PHYSICAL_FUNCTION_COUNT),
    logical_route_count:integer(environment.CAMBRA_LOGICAL_ROUTE_COUNT),
  };
}

export function validateRuntimeDeploymentIdentity(identity:any, expected:any = {}) {
  const blockers:string[] = [];
  if (identity?.identity_version !== RUNTIME_IDENTITY_VERSION) blockers.push('runtime_identity_version_invalid');
  if (!identity?.environment) blockers.push('runtime_environment_missing');
  if (expected.environment && identity?.environment !== String(expected.environment).trim().toLowerCase()) blockers.push('runtime_environment_mismatch');
  if (!identity?.release_version) blockers.push('runtime_release_version_missing');
  if (!identity?.release_build_id) blockers.push('runtime_release_build_id_missing');
  if (!SHA40.test(String(identity?.git_sha || ''))) blockers.push('runtime_git_sha_invalid');
  if (!SHA256.test(String(identity?.source_tree_hash || ''))) blockers.push('runtime_source_tree_hash_invalid');
  if (!Number.isInteger(identity?.source_tree_file_count) || identity.source_tree_file_count <= 0) blockers.push('runtime_source_tree_file_count_invalid');
  if (!SHA256.test(String(identity?.base44_bundle_hash || ''))) blockers.push('runtime_base44_bundle_hash_invalid');
  if (!Number.isInteger(identity?.base44_bundle_file_count) || identity.base44_bundle_file_count <= 0) blockers.push('runtime_base44_bundle_file_count_invalid');
  if (!SHA256.test(String(identity?.deployment_topology_hash || ''))) blockers.push('runtime_deployment_topology_hash_invalid');
  if (!SHA256.test(String(identity?.scheduler_inventory_hash || ''))) blockers.push('runtime_scheduler_inventory_hash_invalid');
  if (identity?.physical_function_count !== EXPECTED_BASE44_PHYSICAL_FUNCTIONS) blockers.push('runtime_physical_function_count_mismatch');
  if (identity?.logical_route_count !== EXPECTED_BASE44_LOGICAL_ROUTES) blockers.push('runtime_logical_route_count_mismatch');
  if (expected.git_sha && identity?.git_sha !== String(expected.git_sha).trim().toLowerCase()) blockers.push('runtime_git_sha_mismatch');
  for (const field of ['release_version','release_build_id','source_tree_hash','source_tree_file_count','base44_bundle_hash','base44_bundle_file_count','deployment_topology_hash','scheduler_inventory_hash','physical_function_count','logical_route_count']) {
    if (expected[field] !== undefined && expected[field] !== null && identity?.[field] !== expected[field]) blockers.push(`runtime_${field}_mismatch`);
  }
  return { ok:blockers.length === 0,status:blockers.length === 0 ? 'COMPLETE':'INCOMPLETE',blockers:[...new Set(blockers)] };
}

/**
 * Verifies a persisted runtime gate against the deployment-owned identity that
 * is executing this code. Hashes are recomputed from canonical fields; caller
 * payloads, Base44 metadata and a claimed identity_status are never trusted.
 */
export async function verifyRuntimeGateEvidence(row:any,input:any={}) {
  const blockers:string[]=[];
  const nowMs=Number.isFinite(Number(input?.now_ms))?Number(input.now_ms):Date.now();
  const expectedStatus=String(input?.expected_status || 'PASS');
  const evidenceKind=String(row?.evidence_kind||'');
  const external=evidenceKind==='EXTERNAL';
  const authoritativeRuntime=['REAL_RUNTIME','OPERATOR_EXERCISE'].includes(evidenceKind);
  const allowExternal=input?.allow_external===true;
  const maxAgeHours=Number(input?.max_age_hours);
  const currentIdentity=runtimeDeploymentIdentity();
  const rowIdentity=runtimeIdentityFromEvidence(row||{});
  if(!row||typeof row!=='object')blockers.push('runtime_evidence_missing');
  if(row?.status!==expectedStatus)blockers.push(expectedStatus==='PASS'?'runtime_evidence_not_pass':'runtime_evidence_status_mismatch');
  if(!String(row?.gate_key||'').trim())blockers.push('runtime_evidence_gate_key_missing');
  if(!String(row?.source||'').trim())blockers.push('runtime_evidence_source_missing');
  if(!authoritativeRuntime&&!(external&&allowExternal))blockers.push('runtime_evidence_kind_not_authoritative');
  if(expectedStatus==='PASS'&&row?.gate_key==='REAL_RESTORE'){
    const details=row?.details_json||{};
    if(details.exercise_projection_verified!==true||details.exercise_projection_status!=='PASS'||!String(details.exercise_id||'').trim()||String(details.exercise_projection_readback_id||'')!==String(details.exercise_id||''))blockers.push('real_restore_exercise_projection_unverified');
    if(!String(details.exercise_key||'').trim()||!SHA256.test(String(details.exercise_projection_hash||''))||!String(details.compensation_incident_key||'').trim())blockers.push('real_restore_exercise_authority_binding_invalid');
    if(details.authenticated_aes256gcm_evidence!==true||details.manifest_chain_reverified!==true)blockers.push('real_restore_backup_anchor_unverified');
    if(!SHA256.test(String(details.manifest_hash||''))||!String(details.manifest_path||'').startsWith('Manifests/')||!String(details.backup_id||'').trim())blockers.push('real_restore_manifest_identity_invalid');
    if(!SHA256.test(String(details.evidence_hash||''))||!SHA256.test(String(details.evidence_file_sha256||''))||!['dev','test','staging','sandbox'].includes(String(details.target_environment||'')))blockers.push('real_restore_attestation_identity_invalid');
    if(!String(details.source_app_id||'').trim()||details.source_environment!=='prod'||!String(details.source_release_version||'').trim()||!SHA40.test(String(details.source_git_sha||''))||!SHA256.test(String(details.source_tree_hash||'')))blockers.push('real_restore_source_identity_invalid');
    const authority=input?.real_restore_exercise_authority;
    if(!authority||authority.available!==true||authority.exact_query!==true||!Array.isArray(authority.rows)||!Array.isArray(authority.compensation_markers)){
      blockers.push('real_restore_exercise_authority_unavailable');
    }else{
      if(authority.rows.length!==1)blockers.push(authority.rows.length===0?'real_restore_exercise_authority_missing':'real_restore_exercise_authority_ambiguous');
      if(authority.compensation_markers.length>1)blockers.push('real_restore_compensation_authority_ambiguous');
      if(authority.compensation_markers.some((marker:any)=>marker?.status!=='resolved'))blockers.push('real_restore_compensation_ambiguous_open');
      const exercise=authority.rows[0];
      if(exercise){
        const projectionHash=await realRestoreExerciseProjectionHash(exercise);
        if(String(exercise.id||'')!==String(details.exercise_id||'')||exercise.exercise_key!==details.exercise_key||
          exercise.exercise_type!=='REAL_RESTORE'||exercise.status!=='PASS'||
          exercise.environment!==`production-boundary-to-${String(details.target_environment||'')}`||
          exercise.backup_snapshot_ref!==details.manifest_path||
          exercise.restored_target_ref!==`base44:${String(details.source_app_id||'')}:data-env:${String(details.target_environment||'')}`||
          String(details.exercise_projection_hash||'').toLowerCase()!==projectionHash){
          blockers.push('real_restore_exercise_projection_mismatch');
        }
      }
    }
  }
  if(authoritativeRuntime){
    const currentValidation=validateRuntimeDeploymentIdentity(currentIdentity,{environment:String(input?.environment||'production')});
    const parityValidation=validateRuntimeDeploymentIdentity(rowIdentity,currentIdentity);
    if(row?.identity_status!=='COMPLETE')blockers.push('runtime_identity_status_not_complete');
    blockers.push(...currentValidation.blockers,...parityValidation.blockers);
  }
  const observedAt=Date.parse(String(row?.observed_at||''));
  const expiresAt=Date.parse(String(row?.expires_at||''));
  if(!Number.isFinite(observedAt))blockers.push('runtime_evidence_observed_at_invalid');
  else if(observedAt>nowMs+5*60_000)blockers.push('runtime_evidence_from_future');
  else if(Number.isFinite(maxAgeHours)&&maxAgeHours>0&&nowMs-observedAt>maxAgeHours*3600000)blockers.push('runtime_evidence_stale');
  if(!row?.expires_at)blockers.push('runtime_evidence_expiry_required');
  else if(!Number.isFinite(expiresAt))blockers.push('runtime_evidence_expiry_invalid');
  else if(expiresAt<=nowMs)blockers.push('runtime_evidence_expired');
  else if(Number.isFinite(observedAt)&&expiresAt<=observedAt)blockers.push('runtime_evidence_expiry_not_after_observation');
  const expectedIdentityHash=await sha256Canonical(rowIdentity);
  if(authoritativeRuntime&&(!SHA256.test(String(row?.identity_hash||''))||String(row.identity_hash).toLowerCase()!==expectedIdentityHash))blockers.push('runtime_identity_hash_mismatch');
  if(external&&allowExternal&&input?.sha_bound===true){
    const finalSha=String(input?.final_sha||'').trim().toLowerCase();
    const evidenceSha=String(row?.git_sha||'').trim().toLowerCase();
    if(!SHA40.test(finalSha))blockers.push('runtime_evidence_final_sha_required');
    else if(evidenceSha!==finalSha)blockers.push('runtime_evidence_final_sha_mismatch');
  }
  const expectedEvidenceHash=await sha256Canonical(runtimeGateEvidencePayload(row));
  if(!SHA256.test(String(row?.evidence_hash||''))||String(row.evidence_hash).toLowerCase()!==expectedEvidenceHash)blockers.push('runtime_evidence_hash_mismatch');
  const unique=[...new Set(blockers)];
  return{ok:unique.length===0,status:unique.length===0?'VERIFIED':'BLOCKED',blockers:unique,identity_hash:authoritativeRuntime?expectedIdentityHash:'',evidence_hash:expectedEvidenceHash,current_identity:currentIdentity};
}

export function releaseIdentityExpectation(input:any = {}) {
  const value = input?.release_manifest || input?.deployment_identity || input?.release_identity || input || {};
  const backend = value.backendBundle || value.backend_bundle || {};
  const ci = value.ciEvidence || value.ci_evidence || {};
  return {
    environment:String(value.environment || 'production').trim().toLowerCase(),
    release_version:String(value.release_version || value.version || '').trim(),
    release_build_id:String(value.release_build_id || value.build_id || ci.runId || ci.run_id || '').trim(),
    git_sha:String(value.git_sha || value.gitSha || '').trim().toLowerCase(),
    source_tree_hash:String(value.source_tree_hash || value.sourceTreeHash || '').trim().toLowerCase(),
    source_tree_file_count:integer(value.source_tree_file_count ?? value.sourceTreeFileCount),
    base44_bundle_hash:String(value.base44_bundle_hash || backend.staged_tree_sha256 || backend.stagedTreeSha256 || '').trim().toLowerCase(),
    base44_bundle_file_count:integer(value.base44_bundle_file_count ?? backend.staged_file_count ?? backend.stagedFileCount),
    deployment_topology_hash:String(value.deployment_topology_hash || value.backendDeploymentTopologySha || '').trim().toLowerCase(),
    scheduler_inventory_hash:String(value.scheduler_inventory_hash || value.schedulerInventorySha || '').trim().toLowerCase(),
    physical_function_count:integer(value.physical_function_count ?? backend.physical_function_count ?? backend.physicalFunctionCount),
    logical_route_count:integer(value.logical_route_count ?? backend.logical_route_count ?? backend.logicalRouteCount),
  };
}

export function validateReleaseIdentityExpectation(input:any) {
  const expected = releaseIdentityExpectation(input);
  const validation = validateRuntimeDeploymentIdentity({
    identity_version:RUNTIME_IDENTITY_VERSION,
    ...expected,
  }, { environment:expected.environment || 'production' });
  return {
    expected,
    ok:validation.ok,
    status:validation.status,
    blockers:validation.blockers.map((blocker:string) => blocker.replace(/^runtime_/u, 'expected_release_')),
  };
}

export function compareRuntimeDeploymentIdentity(identity:any, expected:any) {
  const expectation = validateReleaseIdentityExpectation(expected);
  const comparison = validateRuntimeDeploymentIdentity(identity, {
    environment:expectation.expected.environment,
    release_version:expectation.expected.release_version,
    release_build_id:expectation.expected.release_build_id,
    git_sha:expectation.expected.git_sha,
    source_tree_hash:expectation.expected.source_tree_hash,
    source_tree_file_count:integer(expectation.expected.source_tree_file_count),
    base44_bundle_hash:expectation.expected.base44_bundle_hash,
    base44_bundle_file_count:integer(expectation.expected.base44_bundle_file_count),
    deployment_topology_hash:expectation.expected.deployment_topology_hash,
    scheduler_inventory_hash:expectation.expected.scheduler_inventory_hash,
    physical_function_count:integer(expectation.expected.physical_function_count),
    logical_route_count:integer(expectation.expected.logical_route_count),
  });
  const blockers = [...new Set([...expectation.blockers,...comparison.blockers])];
  return { ok:blockers.length === 0,status:blockers.length === 0 ? 'COMPLETE':'INCOMPLETE',blockers };
}

export async function recordRuntimeGateEvidence(svc:any, input:any) {
  const observedAt = String(input.observed_at || new Date().toISOString());
  const evidenceKind = String(input.evidence_kind || 'REAL_RUNTIME');
  const gateKey = String(input.gate_key || '');
  const requestedStatus = ['PASS','FAIL','BLOCKED','NOT_RUN'].includes(String(input.status)) ? String(input.status) : 'BLOCKED';
  const identity = runtimeDeploymentIdentity();
  const identityRequired = ['REAL_RUNTIME','OPERATOR_EXERCISE'].includes(evidenceKind);
  const hasExpectedIdentity = input.expected_identity !== undefined && input.expected_identity !== null;
  const expectedIdentity:any = hasExpectedIdentity ? releaseIdentityExpectation(input.expected_identity) : {};
  const directValidation = validateRuntimeDeploymentIdentity(identity, {
    environment:String(expectedIdentity.environment || input.environment || 'production'),
    ...(String(input.git_sha || '').trim() ? { git_sha:String(input.git_sha).trim().toLowerCase() } : {}),
  });
  const comparison = hasExpectedIdentity ? compareRuntimeDeploymentIdentity(identity,input.expected_identity) : directValidation;
  const parityBlockers = gateKey === 'BASE44_RUNTIME_PARITY' && !hasExpectedIdentity
    ? ['expected_release_identity_required']
    : [];
  const combinedBlockers = [...new Set([...comparison.blockers,...parityBlockers])];
  const identityValidation = {
    ok:combinedBlockers.length === 0,
    status:combinedBlockers.length === 0 ? 'COMPLETE':'INCOMPLETE',
    blockers:combinedBlockers,
  };
  // A missing/mismatched deployment identity can only make a claimed PASS
  // less authoritative. It never hides a real FAIL already observed.
  const status = requestedStatus === 'PASS' && (identityRequired || gateKey === 'BASE44_RUNTIME_PARITY') && !identityValidation.ok ? 'BLOCKED' : requestedStatus;
  const identityHash = identityRequired ? await sha256Canonical(identity) : '';
  const payload = withoutUndefined({
    gate_key:gateKey, environment:String(input.environment || 'production'),
    git_sha:identityRequired ? identity.git_sha : String(input.git_sha || identity.git_sha || ''),
    source_tree_hash:identityRequired ? identity.source_tree_hash : String(input.source_tree_hash || identity.source_tree_hash || ''),
    source_tree_file_count:identityRequired ? identity.source_tree_file_count : undefined,
    release_version:identityRequired ? identity.release_version : undefined,
    release_build_id:identityRequired ? identity.release_build_id : undefined,
    base44_bundle_hash:identityRequired ? identity.base44_bundle_hash : undefined,
    base44_bundle_file_count:identityRequired ? identity.base44_bundle_file_count : undefined,
    deployment_topology_hash:identityRequired ? identity.deployment_topology_hash : undefined,
    scheduler_inventory_hash:identityRequired ? identity.scheduler_inventory_hash : undefined,
    physical_function_count:identityRequired ? identity.physical_function_count : undefined,
    logical_route_count:identityRequired ? identity.logical_route_count : undefined,
    identity_version:identityRequired ? identity.identity_version : undefined,
    identity_status:identityRequired ? identityValidation.status : 'NOT_REQUIRED', identity_hash:identityHash || undefined,
    identity_blockers:identityRequired ? identityValidation.blockers : [],
    status, evidence_kind:evidenceKind, source:String(input.source || ''),
    external_run_id:String(input.external_run_id || ''), evidence_refs:Array.isArray(input.evidence_refs) ? input.evidence_refs.filter(Boolean).map(String) : [],
    details_json:{ ...(input.details_json || {}), requested_status:requestedStatus,effective_status:status,evidence_version:RUNTIME_EVIDENCE_VERSION,runtime_identity_version:RUNTIME_IDENTITY_VERSION }, observed_at:observedAt,
    expires_at:input.expires_at || undefined, recorded_by:String(input.recorded_by || 'runtime_verifier'),
  });
  if (!payload.gate_key || !payload.source) throw new Error('gate_key_and_source_required');
  const evidenceHash = await sha256Canonical(payload);
  return svc.entities.RuntimeGateEvidence.create({ evidence_key:`${payload.gate_key}:${observedAt}:${evidenceHash.slice(0,16)}`, ...payload, evidence_hash:evidenceHash });
}

export function runtimeGitSha(_input:any = {}) {
  return runtimeDeploymentIdentity().git_sha;
}
