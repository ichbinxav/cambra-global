import { sha256Canonical } from './legalExecution.ts';

export const RUNTIME_EVIDENCE_VERSION = 'runtime-evidence-2.0.0';
export const RUNTIME_IDENTITY_VERSION = 'cambra-runtime-deployment-identity-v1';
export const EXPECTED_BASE44_PHYSICAL_FUNCTIONS = 276;
export const EXPECTED_BASE44_LOGICAL_ROUTES = 27;

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
  const evidenceKind=String(row?.evidence_kind||'');
  const external=evidenceKind==='EXTERNAL';
  const authoritativeRuntime=['REAL_RUNTIME','OPERATOR_EXERCISE'].includes(evidenceKind);
  const allowExternal=input?.allow_external===true;
  const maxAgeHours=Number(input?.max_age_hours);
  const currentIdentity=runtimeDeploymentIdentity();
  const rowIdentity=runtimeIdentityFromEvidence(row||{});
  if(!row||typeof row!=='object')blockers.push('runtime_evidence_missing');
  if(row?.status!=='PASS')blockers.push('runtime_evidence_not_pass');
  if(!String(row?.gate_key||'').trim())blockers.push('runtime_evidence_gate_key_missing');
  if(!String(row?.source||'').trim())blockers.push('runtime_evidence_source_missing');
  if(!authoritativeRuntime&&!(external&&allowExternal))blockers.push('runtime_evidence_kind_not_authoritative');
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
