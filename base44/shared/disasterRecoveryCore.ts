export const DISASTER_RECOVERY_VERSION = 'cambra-dr-1.2.0';
export const DISASTER_RECOVERY_SCHEMA_VERSION = 'cambra-dr-snapshot-v1';
export const DISASTER_RECOVERY_ENVELOPE_VERSION = 'CAMBRA-DR-AES256GCM-1';
export const DR_RPO_TARGET_MINUTES = 24 * 60;
export const DR_RTO_TARGET_MINUTES = 8 * 60;
export const DR_ROOT_FOLDER = 'Production Backups';
export const DR_CANONICAL_SHAREPOINT_HOSTNAME = 'globalcambra.sharepoint.com';
export const DR_CANONICAL_SHAREPOINT_SITE_ID = 'globalcambra.sharepoint.com,1d97af95-b56a-4e67-ae13-7780e2da65f6,591e702a-e5d8-4b2a-8c05-79813de2c411';
export const DR_CANONICAL_SHAREPOINT_DRIVE_ID = 'b!la-XHWq1Z06uE3eA4tpl9ipwHlnY5SpLjAV5gT3ixBH3DsFhdMXTQbUPE9gM2Cc3';
export const DR_CANONICAL_SHAREPOINT_DRIVE_NAME = 'CAMBRA INFRASTRUCTURE';
export const DR_FOLDERS = Object.freeze(['Daily', 'Weekly', 'Monthly', 'Manifests', 'Restore Evidence'] as const);
export const DR_PAGE_SIZE = 500;
export const DR_GRAPH_CHUNK_BYTES = 10 * 1024 * 1024;
export const DR_SCHEDULER_WORKER_KEY = 'disasterRecoveryBackup';
export const DR_SCHEDULER_CADENCE_SECONDS = 24 * 60 * 60;
export const DR_SCHEDULER_FRESHNESS_SECONDS = DR_RPO_TARGET_MINUTES * 60;
export const DR_SCHEDULER_RUNNING_MAX_SECONDS = 15 * 60;
export const DR_DEFAULT_MAX_FILE_BYTES = 100 * 1024 * 1024;
export const DR_MAX_FILE_BYTES_HARD_LIMIT = 1024 * 1024 * 1024;

export const DR_RETENTION_DAYS = Object.freeze({
  Daily:35,
  Weekly:13 * 7,
  Monthly:400,
  Manifests:400,
  'Restore Evidence':7 * 365,
});

export const DR_NON_RESTORABLE_ENTITIES = Object.freeze(new Set([
  'User',
]));

export const DR_EPHEMERAL_SECRET_ENTITIES = Object.freeze(new Set([
  'OAuthState',
  'OAuthAuthorizationCode',
]));

const SYSTEM_FIELDS = new Set(['id', 'created_date', 'updated_date', 'created_by']);
const SECRET_KEY = /(^|_)(access_token|refresh_token|client_secret|webhook_secret|signing_secret|secret_key|secret|password|passwd|private_key|signing_key|encryption_key|pseudonymization_key|api_key|api_token|x_api_key|oauth_token|oauth_access_token|oauth_refresh_token|credential|credentials|credential_key|credential_ref|authorization|authorization_code|bearer_token|session_token|claim_token|control_token|attempt_token|fence_token|commit_token|acceptance_token|service_token|setup_token|sas_token|account_key|connection_string|salt)(_|$)/i;
const SAFE_SECRET_METADATA = /(hash|last4|prefix|present|expires_at|expired_at|type|name|id)$/i;
const TRUSTED_BASE44_MEDIA_HOST = 'media.base44.com';
const TRUSTED_BASE44_APP_HOST = 'base44.app';
const TRUSTED_BASE44_APP_FILE_PREFIX = '/api/apps/6a16288b833b3c26d7ac1fab/files/';
const DR_REDACTED_SECRET = '[redacted-secret]';
const DR_CREDENTIAL_ASSIGNMENT = /(?:(['"])([A-Za-z_$][A-Za-z0-9_$.-]{0,159})\1|([A-Za-z_$][A-Za-z0-9_$.-]{0,159}))([ \t]*)([:=])([ \t]*)(?!['"]?\[redacted-secret\]['"]?)(?:(?:Bearer|Basic)[ \t]+[A-Za-z0-9._~+/=-]+|"[^"\r\n]+"|'[^'\r\n]+'|`[^`\r\n]+`|[^\s,;}\]\)]+)/gi;
const DR_BRACKET_ENV_ASSIGNMENT = /\b((?:process\.env|Deno\.env)\s*\[\s*(['"])([A-Za-z_$][A-Za-z0-9_$.-]{0,159})\2\s*\]\s*=\s*)(?!['"]?\[redacted-secret\]['"]?)(?:"[^"\r\n]+"|'[^'\r\n]+'|`[^`\r\n]+`|[^\s,;}\]\)]+)/g;
const DR_DENO_ENV_SET = /\b(Deno\.env\.set\(\s*(['"])([A-Za-z_$][A-Za-z0-9_$.-]{0,159})\2\s*,\s*)(?!['"]?\[redacted-secret\]['"]?)(?:"[^"\r\n]+"|'[^'\r\n]+'|`[^`\r\n]+`|[^\s,;}\]\)]+)(\s*\))/g;
const DR_STRING_SECRET_PATTERNS:ReadonlyArray<readonly [RegExp,string]> = [
  [/-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----|$)/gi,DR_REDACTED_SECRET],
  [/-----BEGIN PGP PRIVATE KEY BLOCK-----[\s\S]*?(?:-----END PGP PRIVATE KEY BLOCK-----|$)/gi,DR_REDACTED_SECRET],
  [/\bsk-ant-[A-Za-z0-9_-]{16,}\b/g,DR_REDACTED_SECRET],
  [/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,DR_REDACTED_SECRET],
  [/\bwhsec_[A-Za-z0-9]{16,}\b/g,DR_REDACTED_SECRET],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,DR_REDACTED_SECRET],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,DR_REDACTED_SECRET],
  [/\bglpat-[A-Za-z0-9_-]{20,}\b/g,DR_REDACTED_SECRET],
  [/\bhf_[A-Za-z0-9]{20,}\b/g,DR_REDACTED_SECRET],
  [/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,DR_REDACTED_SECRET],
  [/\bre_[A-Za-z0-9_-]{20,}\b/g,DR_REDACTED_SECRET],
  [/\bpplx-[A-Za-z0-9_-]{20,}\b/g,DR_REDACTED_SECRET],
  [/\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g,DR_REDACTED_SECRET],
  [/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g,DR_REDACTED_SECRET],
  [/\bAIza[0-9A-Za-z_-]{30,}\b/g,DR_REDACTED_SECRET],
  [/\bSK[0-9a-fA-F]{32}\b/g,DR_REDACTED_SECRET],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,DR_REDACTED_SECRET],
  [/\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,DR_REDACTED_SECRET],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,'Bearer [redacted-secret]'],
  [/\bBasic\s+[A-Za-z0-9+/=]{4,}/gi,'Basic [redacted-secret]'],
  [/\b([a-z][a-z0-9+.-]{1,31}:\/\/)[^\s/@:]*:[^\s/@]+@/gi,'$1[redacted-secret]@'],
  [/\bAccountKey\s*=\s*[^;\s"'`]{8,}/gi,'AccountKey=[redacted-secret]'],
];
const DR_STRING_SECRET_RESIDUE = [
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/i,
  /-----BEGIN PGP PRIVATE KEY BLOCK-----/i,
  /\bsk-ant-[A-Za-z0-9_-]{16,}\b/,/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/,
  /\bwhsec_[A-Za-z0-9]{16,}\b/,/\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,/\bglpat-[A-Za-z0-9_-]{20,}\b/,
  /\bhf_[A-Za-z0-9]{20,}\b/,/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
  /\bre_[A-Za-z0-9_-]{20,}\b/,/\bpplx-[A-Za-z0-9_-]{20,}\b/,
  /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,/\bAIza[0-9A-Za-z_-]{30,}\b/,
  /\bSK[0-9a-fA-F]{32}\b/,/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/i,/\bBasic\s+[A-Za-z0-9+/=]{4,}/i,
  /\b[a-z][a-z0-9+.-]{1,31}:\/\/[^\s/@:]*:[^\s/@]+@/i,
  /\bAccountKey\s*=\s*[^;\s"'`]{8,}/i,
];

export type BackupTier='Daily'|'Weekly'|'Monthly';
export type SnapshotType='FULL'|'INCREMENTAL';

function canonicalIsoTimestampMs(value:any) {
  if (typeof value !== 'string') return NaN;
  const parsed=Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? parsed : NaN;
}

export function evaluateDisasterRecoveryScheduler(
  runs:any[] = [],
  nowMs=Date.now(),
  options:any = {},
) {
  const workerKey=String(options.worker_key||DR_SCHEDULER_WORKER_KEY);
  const cadenceSeconds=Number(options.cadence_seconds||DR_SCHEDULER_CADENCE_SECONDS);
  const freshnessSeconds=Number(options.freshness_seconds||DR_SCHEDULER_FRESHNESS_SECONDS);
  const scheduled = runs.filter((run:any) =>
    run?.worker_key === workerKey &&
    run?.invocation_kind === 'SCHEDULED'
  ).sort((a:any,b:any) =>
    (Number.isFinite(canonicalIsoTimestampMs(b?.started_at))
      ? canonicalIsoTimestampMs(b?.started_at)
      : Number.POSITIVE_INFINITY) -
    (Number.isFinite(canonicalIsoTimestampMs(a?.started_at))
      ? canonicalIsoTimestampMs(a?.started_at)
      : Number.POSITIVE_INFINITY)
  );
  const latest = scheduled[0] || null;
  const startedAtMs = latest ? canonicalIsoTimestampMs(latest.started_at) : NaN;
  const completedAtMs = latest ? canonicalIsoTimestampMs(latest.completed_at) : NaN;
  const heartbeatAtMs = latest ? canonicalIsoTimestampMs(latest.heartbeat_at) : NaN;
  const leaseExpiresAtMs = latest ? canonicalIsoTimestampMs(latest.lease_expires_at) : NaN;
  const latestStatus = String(latest?.status || '');
  const authoritativeAttempt = latest?.record_kind === 'ATTEMPT' &&
    latest?.claim_acquired === true &&
    Number.isFinite(Number(latest?.cadence_seconds)) &&
    Number(latest?.cadence_seconds) === cadenceSeconds;
  const startedAtValid = Number.isFinite(startedAtMs) && startedAtMs <= nowMs;
  const completedAtProvided = !!latest?.completed_at;
  const completedTimestampValid = !completedAtProvided || (
    Number.isFinite(completedAtMs) && completedAtMs >= startedAtMs &&
    completedAtMs <= nowMs
  );
  const completedAtValid = latestStatus !== 'COMPLETED' ||
    (completedAtProvided && completedTimestampValid);
  const heartbeatAtValid = !!latest?.heartbeat_at && (
    Number.isFinite(heartbeatAtMs) && heartbeatAtMs >= startedAtMs &&
    heartbeatAtMs <= nowMs
  );
  const referenceAtMs = startedAtMs;
  const ageSeconds = startedAtValid && completedTimestampValid && completedAtValid &&
    Number.isFinite(referenceAtMs)
    ? Math.max(0, (nowMs - referenceAtMs) / 1000)
    : null;
  const running = ['CLAIMED','RUNNING'].includes(latestStatus);
  const leaseProvided = !!latest?.lease_expires_at;
  const leaseTimestampValid = leaseProvided && Number.isFinite(leaseExpiresAtMs) &&
    leaseExpiresAtMs >= startedAtMs;
  const heartbeatFresh = heartbeatAtValid &&
    (nowMs - heartbeatAtMs) / 1000 <= DR_SCHEDULER_RUNNING_MAX_SECONDS;
  const leaseActive = leaseTimestampValid && leaseExpiresAtMs > nowMs;
  let status = 'UNKNOWN';
  let reason = 'latest_scheduler_attempt_unverifiable';
  if (!latest) {
    status = 'INACTIVE_OR_UNOBSERVED';
    reason = 'no_scheduled_attempt_observed';
  } else if (!authoritativeAttempt) {
    status = 'UNVERIFIABLE';
    reason = latest?.record_kind !== 'ATTEMPT'
      ? 'latest_scheduled_record_is_not_attempt'
      : latest?.claim_acquired !== true
      ? 'latest_scheduled_attempt_claim_not_acquired'
      : 'latest_scheduled_attempt_cadence_mismatch';
  } else if (!startedAtValid) {
    status = 'UNVERIFIABLE';
    reason = Number.isFinite(startedAtMs) && startedAtMs > nowMs
      ? 'latest_scheduled_attempt_timestamp_future'
      : 'latest_scheduled_attempt_timestamp_invalid';
  } else if (!completedTimestampValid) {
    status = 'UNVERIFIABLE';
    reason = Number.isFinite(completedAtMs) && completedAtMs > nowMs
      ? 'latest_scheduled_completion_timestamp_future'
      : 'latest_scheduled_completion_timestamp_invalid';
  } else if (!completedAtValid) {
    status = 'UNVERIFIABLE';
    reason = 'latest_completed_attempt_requires_valid_completed_at';
  } else if (running && !latest?.heartbeat_at) {
    status = 'UNVERIFIABLE';
    reason = 'running_scheduled_attempt_heartbeat_required';
  } else if (running && !heartbeatAtValid) {
    status = 'UNVERIFIABLE';
    reason = Number.isFinite(heartbeatAtMs) && heartbeatAtMs > nowMs
      ? 'latest_scheduler_heartbeat_timestamp_future'
      : 'latest_scheduler_heartbeat_timestamp_invalid';
  } else if (running && !leaseProvided) {
    status = 'UNVERIFIABLE';
    reason = 'running_scheduled_attempt_lease_required';
  } else if (running && !leaseTimestampValid) {
    status = 'UNVERIFIABLE';
    reason = 'running_scheduled_attempt_lease_invalid';
  } else if (latestStatus === 'FAILED') {
    status = 'FAILED';
    reason = 'latest_scheduled_attempt_failed';
  } else if (latestStatus === 'REVIEW_REQUIRED') {
    status = 'REVIEW_REQUIRED';
    reason = 'latest_scheduled_attempt_requires_review';
  } else if (running && (!leaseActive || !heartbeatFresh)) {
    status = 'HUNG';
    reason = !leaseActive
      ? 'scheduled_attempt_lease_expired'
      : 'scheduled_attempt_heartbeat_stale';
  } else if (latestStatus === 'COMPLETED' && Number(ageSeconds) > freshnessSeconds) {
    status = 'INACTIVE_OR_STALE';
    reason = 'latest_completed_attempt_exceeds_rpo_window';
  } else if (latestStatus === 'COMPLETED') {
    status = 'HEALTHY';
    reason = 'completed_scheduled_attempt_within_rpo';
  } else if (['CLAIMED','RUNNING'].includes(latestStatus)) {
    status = 'RUNNING';
    reason = 'fresh_scheduled_attempt_in_progress';
  } else if (latestStatus === 'DUPLICATE_BLOCKED') {
    status = 'DEGRADED';
    reason = 'latest_scheduled_attempt_duplicate_blocked';
  }
  const observedActive = status === 'HEALTHY' || status === 'RUNNING';
  return {
    worker_key:workerKey,
    expected_cadence_seconds:cadenceSeconds,
    freshness_limit_seconds:freshnessSeconds,
    running_max_seconds:DR_SCHEDULER_RUNNING_MAX_SECONDS,
    status,
    reason,
    observed_active:observedActive,
    healthy:status === 'HEALTHY',
    inactive_or_stale:!observedActive,
    latest_run:latest ? redactSecrets(latest, ['SchedulerRun']).value : null,
    latest_started_at:latest?.started_at || null,
    latest_completed_at:latest?.completed_at || null,
    age_seconds:ageSeconds,
    observed_attempt_count:scheduled.length,
    runtime_config_visibility:'Base44 automation is not introspectable from this handler; activity is inferred from durable scheduled attempts',
  };
}

function normalizedSecretKey(key:string) {
  return String(key || '')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toLowerCase();
}

function secretKeyRequiresRedaction(key:string) {
  const normalized = normalizedSecretKey(key);
  const genericToken=normalized==='token'||normalized.endsWith('_token');
  return (SECRET_KEY.test(normalized)||genericToken) && !SAFE_SECRET_METADATA.test(normalized);
}

function redactDrCredentialAssignments(value:string) {
  let redactions=0;
  DR_BRACKET_ENV_ASSIGNMENT.lastIndex=0;
  let output=value.replace(DR_BRACKET_ENV_ASSIGNMENT,(match,prefix,_quote,key)=>{
    if(!secretKeyRequiresRedaction(String(key||'')))return match;
    redactions++;
    return `${prefix}"${DR_REDACTED_SECRET}"`;
  });
  DR_DENO_ENV_SET.lastIndex=0;
  output=output.replace(DR_DENO_ENV_SET,(match,prefix,_quote,key,closing)=>{
    if(!secretKeyRequiresRedaction(String(key||'')))return match;
    redactions++;
    return `${prefix}"${DR_REDACTED_SECRET}"${closing}`;
  });
  DR_CREDENTIAL_ASSIGNMENT.lastIndex=0;
  output=output.replace(DR_CREDENTIAL_ASSIGNMENT,(match,quote,quotedKey,bareKey,beforeSeparator,separator,afterSeparator)=>{
    const key=String(quotedKey||bareKey||'');
    if(!secretKeyRequiresRedaction(key))return match;
    redactions++;
    const renderedKey=quote?`${quote}${key}${quote}`:key;
    return `${renderedKey}${beforeSeparator}${separator}${afterSeparator}"${DR_REDACTED_SECRET}"`;
  });
  return{output,redactions};
}

function hasDrCredentialAssignmentResidue(value:string) {
  for(const pattern of [DR_BRACKET_ENV_ASSIGNMENT,DR_DENO_ENV_SET,DR_CREDENTIAL_ASSIGNMENT]){
    pattern.lastIndex=0;
    let match:RegExpExecArray|null;
    while((match=pattern.exec(value))!==null){
      const key=pattern===DR_CREDENTIAL_ASSIGNMENT
        ?String(match[2]||match[3]||'')
        :String(match[3]||'');
      if(secretKeyRequiresRedaction(key))return true;
    }
  }
  return false;
}

function redactDrSecretString(value:string) {
  const assignments=redactDrCredentialAssignments(value);
  let output=assignments.output,redactions=assignments.redactions;
  for(const [pattern,replacement] of DR_STRING_SECRET_PATTERNS){
    pattern.lastIndex=0;
    output=output.replace(pattern,(...args:any[])=>{
      redactions++;
      return replacement.replaceAll('$1',String(args[1]||''));
    });
  }
  return{value:output,redactions};
}

function hasDrSecretStringResidue(value:string) {
  const candidate=value.replaceAll(DR_REDACTED_SECRET,'');
  return hasDrCredentialAssignmentResidue(value)||
    DR_STRING_SECRET_RESIDUE.some((pattern)=>pattern.test(candidate));
}

export function parseDrMaxFileBytes(value:any, fallback=DR_DEFAULT_MAX_FILE_BYTES) {
  const raw = String(value ?? '').trim();
  const candidate = raw ? Number(raw) : fallback;
  if (!Number.isSafeInteger(candidate) || candidate <= 0 || candidate > DR_MAX_FILE_BYTES_HARD_LIMIT) {
    throw Object.assign(new Error('dr_max_file_bytes_invalid'), {
      code:'DR_MAX_FILE_BYTES_INVALID',
    });
  }
  return candidate;
}

export async function mapLimitDrained<T,R>(
  values:readonly T[],
  limit:number,
  handler:(value:T,index:number)=>Promise<R>,
) {
  if(!Number.isSafeInteger(limit)||limit<=0){
    throw Object.assign(new Error('dr_concurrency_limit_invalid'),{code:'DR_CONCURRENCY_LIMIT_INVALID'});
  }
  const output=new Array<R>(values.length),failures:Array<{index:number;error:any}>=[];
  let cursor=0;
  const workers=Array.from({length:Math.min(limit,values.length)},async()=>{
    while(true){
      const index=cursor++;
      if(index>=values.length)return;
      try{output[index]=await handler(values[index],index)}catch(error){failures.push({index,error})}
    }
  });
  await Promise.all(workers);
  if(failures.length){
    failures.sort((left,right)=>left.index-right.index);
    throw failures[0].error??Object.assign(new Error('dr_concurrent_operation_failed'),{code:'DR_CONCURRENT_OPERATION_FAILED'});
  }
  return output;
}

function ownedChunk(value:Uint8Array) {
  const copy=new Uint8Array(value.byteLength);
  copy.set(value);
  return copy;
}

/**
 * Reads an attachment response without ever buffering more than the configured
 * limit. Content-Length is an early rejection hint; the streamed byte count is
 * the final authority and is also checked against an unencoded declared size.
 */
export async function readBoundedDrResponseBytes(response:Response,maxBytes:number) {
  if(!Number.isSafeInteger(maxBytes)||maxBytes<=0){
    await response.body?.cancel('dr_max_file_bytes_invalid').catch(()=>undefined);
    throw Object.assign(new Error('dr_max_file_bytes_invalid'),{code:'DR_MAX_FILE_BYTES_INVALID'});
  }
  const declaredText=String(response.headers.get('content-length')||'').trim();
  let declared:number|null=null;
  if(declaredText){
    if(!/^\d+$/.test(declaredText)||!Number.isSafeInteger(Number(declaredText))){
      await response.body?.cancel('dr_owned_file_content_length_invalid').catch(()=>undefined);
      throw Object.assign(new Error('dr_owned_file_content_length_invalid'),{code:'DR_OWNED_FILE_CONTENT_LENGTH_INVALID'});
    }
    declared=Number(declaredText);
    if(declared>maxBytes){
      await response.body?.cancel('dr_owned_file_exceeds_configured_limit').catch(()=>undefined);
      throw Object.assign(new Error('dr_owned_file_exceeds_configured_limit'),{code:'DR_OWNED_FILE_TOO_LARGE',bytes:declared,max:maxBytes});
    }
  }
  if(!response.body){
    if(declared!==null&&declared!==0){
      throw Object.assign(new Error('dr_owned_file_content_length_mismatch'),{code:'DR_OWNED_FILE_CONTENT_LENGTH_MISMATCH'});
    }
    return new Uint8Array();
  }
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];
  let total=0;
  try{
    while(true){
      const next=await reader.read();
      if(next.done)break;
      const chunk=next.value;
      if(!(chunk instanceof Uint8Array)){
        throw Object.assign(new Error('dr_owned_file_stream_chunk_invalid'),{code:'DR_OWNED_FILE_DOWNLOAD_FAILED'});
      }
      if(chunk.byteLength>maxBytes-total){
        throw Object.assign(new Error('dr_owned_file_exceeds_configured_limit'),{code:'DR_OWNED_FILE_TOO_LARGE',bytes:total+chunk.byteLength,max:maxBytes});
      }
      total+=chunk.byteLength;
      chunks.push(ownedChunk(chunk));
    }
  }catch(error){
    await reader.cancel('dr_owned_file_download_aborted').catch(()=>undefined);
    throw error;
  }finally{
    reader.releaseLock();
  }
  const contentEncoding=String(response.headers.get('content-encoding')||'').trim().toLowerCase();
  if(declared!==null&&(!contentEncoding||contentEncoding==='identity')&&declared!==total){
    throw Object.assign(new Error('dr_owned_file_content_length_mismatch'),{code:'DR_OWNED_FILE_CONTENT_LENGTH_MISMATCH',declared,observed:total});
  }
  const bytes=new Uint8Array(total);
  let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return bytes;
}

export function strictMinuteDifference(later:any, earlier:any, nowMs=Date.now()) {
  if (!Number.isFinite(nowMs)) {
    throw Object.assign(new Error('dr_timestamp_reference_invalid'), { code:'DR_TIMESTAMP_INVALID' });
  }
  const laterText = typeof later === 'string' ? later : '';
  const earlierText = typeof earlier === 'string' ? earlier : '';
  const laterMs = Date.parse(laterText);
  const earlierMs = Date.parse(earlierText);
  if (!Number.isFinite(laterMs) || !Number.isFinite(earlierMs) ||
    new Date(laterMs).toISOString() !== laterText || new Date(earlierMs).toISOString() !== earlierText) {
    throw Object.assign(new Error('dr_timestamp_invalid'), { code:'DR_TIMESTAMP_INVALID' });
  }
  if (laterMs > nowMs || earlierMs > nowMs) {
    throw Object.assign(new Error('dr_timestamp_future'), { code:'DR_TIMESTAMP_FUTURE' });
  }
  if (laterMs < earlierMs) {
    throw Object.assign(new Error('dr_timestamp_order_invalid'), { code:'DR_TIMESTAMP_ORDER_INVALID' });
  }
  return (laterMs - earlierMs) / 60000;
}

const DR_SHA256 = /^[a-f0-9]{64}$/iu;
const DR_SHA40 = /^[a-f0-9]{40}$/iu;
const DR_ISOLATED_TARGETS = new Set(['dev','test','staging','sandbox']);

function drValidationError(message:string, code:string) {
  return Object.assign(new Error(message), { code });
}

function requiredText(value:any, code:string) {
  const text = String(value ?? '').trim();
  if (!text) throw drValidationError(code.toLowerCase(), code);
  return text;
}

function timestampMs(value:any, nowMs:number, code='DR_TIMESTAMP_INVALID') {
  const text = typeof value === 'string' ? value : '';
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== text) throw drValidationError('dr_timestamp_invalid', code);
  if (parsed > nowMs) throw drValidationError('dr_timestamp_future', 'DR_TIMESTAMP_FUTURE');
  return parsed;
}

function sha256(value:any, code:string) {
  const hash = String(value ?? '').trim().toLowerCase();
  if (!DR_SHA256.test(hash)) throw drValidationError(code.toLowerCase(), code);
  return hash;
}

function artifactIdentity(artifact:any, backupId:string, kind:'snapshot'|'index') {
  if (!artifact || typeof artifact !== 'object') {
    throw drValidationError(`dr_${kind}_artifact_invalid`, `DR_${kind.toUpperCase()}_ARTIFACT_INVALID`);
  }
  requiredText(artifact.path, `DR_${kind.toUpperCase()}_PATH_INVALID`);
  if (String(artifact.path).includes('..')) {
    throw drValidationError(`dr_${kind}_path_invalid`, `DR_${kind.toUpperCase()}_PATH_INVALID`);
  }
  if ((kind === 'snapshot' && !String(artifact.path).endsWith(`/${backupId}/snapshot.json.gz.aes256gcm`)) ||
    (kind === 'index' && String(artifact.path) !== `Manifests/${backupId}.index.json.gz.aes256gcm`)) {
    throw drValidationError(`dr_${kind}_path_identity_mismatch`, `DR_${kind.toUpperCase()}_IDENTITY_MISMATCH`);
  }
  if (artifact.aad !== `${backupId}|${kind}`) {
    throw drValidationError(`dr_${kind}_aad_identity_mismatch`, `DR_${kind.toUpperCase()}_IDENTITY_MISMATCH`);
  }
  sha256(artifact.encrypted_sha256, `DR_${kind.toUpperCase()}_HASH_INVALID`);
  sha256(artifact.payload_sha256, `DR_${kind.toUpperCase()}_HASH_INVALID`);
  if (artifact.encryption !== 'AES-256-GCM' || artifact.compression !== 'gzip') {
    throw drValidationError(`dr_${kind}_protection_invalid`, `DR_${kind.toUpperCase()}_PROTECTION_INVALID`);
  }
}

/**
 * Validates semantic continuity after every manifest's canonical SHA-256 has
 * been recomputed by the storage reader. It deliberately does not infer or
 * repair chain links.
 */
export function validateRestoreManifestChain(chain:any[], input:any = {}) {
  if (!Array.isArray(chain) || chain.length === 0 || chain.length > 100) {
    throw drValidationError('dr_restore_chain_invalid', 'DR_INCREMENTAL_CHAIN_INVALID');
  }
  const nowMs = Number.isFinite(Number(input.now_ms)) ? Number(input.now_ms) : Date.now();
  const expectedAppId = requiredText(input.source_app_id, 'DR_SOURCE_APP_ID_REQUIRED');
  const expectedEnvironment = String(input.source_environment || 'prod').trim().toLowerCase();
  const expectedCatalog = Array.isArray(input.entity_catalog) ? [...new Set(input.entity_catalog.map(String))].sort() : null;
  const permittedExcluded = Array.isArray(input.excluded_entities) ? [...new Set(input.excluded_entities.map(String))].sort() : null;
  const permittedNonRestorable = Array.isArray(input.non_restorable_entities) ? [...new Set(input.non_restorable_entities.map(String))].sort() : null;
  let previous:any = null;
  let previousCheckpoint = -Infinity;
  const baseFullPath = String(chain[0]?.manifest_path || '');
  const backupIds = new Set<string>();
  const manifestPaths = new Set<string>();
  const artifactPaths = new Set<string>();
  for (let index = 0; index < chain.length; index++) {
    const manifest = chain[index];
    if (!manifest || typeof manifest !== 'object' || manifest.schema_version !== DISASTER_RECOVERY_SCHEMA_VERSION || manifest.dr_version !== DISASTER_RECOVERY_VERSION) {
      throw drValidationError('dr_manifest_schema_invalid', 'DR_MANIFEST_INVALID');
    }
    const backupId = requiredText(manifest.backup_id, 'DR_MANIFEST_BACKUP_ID_INVALID');
    const manifestPath = requiredText(manifest.manifest_path, 'DR_MANIFEST_PATH_INVALID');
    if (backupIds.has(backupId) || manifestPaths.has(manifestPath)) {
      throw drValidationError('dr_restore_chain_identity_duplicate', 'DR_INCREMENTAL_CHAIN_INVALID');
    }
    backupIds.add(backupId);
    manifestPaths.add(manifestPath);
    if (manifestPath !== `Manifests/${backupId}.manifest.json`) {
      throw drValidationError('dr_manifest_path_identity_mismatch', 'DR_MANIFEST_IDENTITY_MISMATCH');
    }
    sha256(manifest.manifest_hash, 'DR_MANIFEST_HASH_INVALID');
    if (manifest.source_app_id !== expectedAppId || manifest.source_environment !== expectedEnvironment) {
      throw drValidationError('dr_manifest_source_identity_mismatch', 'DR_MANIFEST_SOURCE_IDENTITY_MISMATCH');
    }
    requiredText(manifest.release_version, 'DR_MANIFEST_RELEASE_VERSION_INVALID');
    if (!DR_SHA40.test(String(manifest.git_sha || ''))) {
      throw drValidationError('dr_manifest_git_sha_invalid', 'DR_MANIFEST_RELEASE_IDENTITY_INVALID');
    }
    if (!DR_SHA256.test(String(manifest.source_tree_hash || '')) || manifest.source_tree_hash_algorithm !== 'sha256-tree-v1') {
      throw drValidationError('dr_manifest_source_tree_hash_invalid', 'DR_MANIFEST_RELEASE_IDENTITY_INVALID');
    }
    if (input.entity_catalog_version && manifest.entity_catalog_version !== input.entity_catalog_version) {
      throw drValidationError('dr_manifest_entity_catalog_version_mismatch', 'DR_MANIFEST_CATALOG_MISMATCH');
    }
    if (Number.isInteger(input.entity_catalog_count) && manifest.entity_catalog_count !== input.entity_catalog_count) {
      throw drValidationError('dr_manifest_entity_catalog_count_mismatch', 'DR_MANIFEST_CATALOG_MISMATCH');
    }
    if (expectedCatalog) {
      const observedCatalog = Object.keys(manifest.entity_counts || {}).sort();
      if (observedCatalog.length !== expectedCatalog.length || observedCatalog.some((name,index) => name !== expectedCatalog[index])) {
        throw drValidationError('dr_manifest_entity_catalog_membership_mismatch', 'DR_MANIFEST_CATALOG_MISMATCH');
      }
      const observedExcluded = observedCatalog.filter((name) => manifest.entity_counts[name]?.excluded === true).sort();
      const declaredExcluded = Array.isArray(manifest.entity_totals?.excluded_entities) ? [...manifest.entity_totals.excluded_entities].map(String).sort() : [];
      if (observedExcluded.length !== declaredExcluded.length || observedExcluded.some((name,index) => name !== declaredExcluded[index]) ||
        (permittedExcluded && (observedExcluded.length !== permittedExcluded.length || observedExcluded.some((name,index) => name !== permittedExcluded[index])))) {
        throw drValidationError('dr_manifest_excluded_entity_membership_mismatch', 'DR_MANIFEST_CATALOG_MISMATCH');
      }
      const observedNonRestorable = observedCatalog.filter((name) => manifest.entity_counts[name]?.excluded !== true && manifest.entity_counts[name]?.restorable === false).sort();
      const declaredNonRestorable = Array.isArray(manifest.entity_totals?.non_restorable_entities) ? [...manifest.entity_totals.non_restorable_entities].map(String).sort() : [];
      if (observedNonRestorable.length !== declaredNonRestorable.length || observedNonRestorable.some((name,index) => name !== declaredNonRestorable[index]) ||
        (permittedNonRestorable && (observedNonRestorable.length !== permittedNonRestorable.length || observedNonRestorable.some((name,index) => name !== permittedNonRestorable[index])))) {
        throw drValidationError('dr_manifest_non_restorable_entity_membership_mismatch', 'DR_MANIFEST_CATALOG_MISMATCH');
      }
    }
    let manifestSourceTotal=0,manifestIncludedTotal=0,manifestTombstoneTotal=0,manifestRedactedTotal=0;
    const manifestCounts=manifest.entity_counts;
    if (!manifestCounts || typeof manifestCounts !== 'object' || Array.isArray(manifestCounts) ||
      !manifest.entity_totals || typeof manifest.entity_totals !== 'object' || Array.isArray(manifest.entity_totals)) {
      throw drValidationError('dr_manifest_entity_counts_invalid', 'DR_MANIFEST_COUNT_MISMATCH');
    }
    for (const counts of Object.values(manifestCounts) as any[]) {
      for (const field of ['source','included','tombstones','redacted_fields']) {
        if (!Number.isSafeInteger(counts?.[field]) || counts[field] < 0) {
          throw drValidationError('dr_manifest_entity_count_invalid', 'DR_MANIFEST_COUNT_MISMATCH');
        }
      }
      if (manifest.snapshot_type === 'FULL' && (counts.source !== counts.included || counts.tombstones !== 0)) {
        throw drValidationError('dr_manifest_full_semantics_invalid', 'DR_MANIFEST_COUNT_MISMATCH');
      }
      if (counts.excluded === true && (counts.included !== 0 || counts.tombstones !== 0 || counts.restorable !== false)) {
        throw drValidationError('dr_manifest_excluded_entity_count_invalid', 'DR_MANIFEST_COUNT_MISMATCH');
      }
      manifestSourceTotal+=counts.source;
      manifestIncludedTotal+=counts.included;
      manifestTombstoneTotal+=counts.tombstones;
      manifestRedactedTotal+=counts.redacted_fields;
    }
    if (manifest.entity_totals.source !== manifestSourceTotal ||
      manifest.entity_totals.included !== manifestIncludedTotal ||
      manifest.entity_totals.tombstones !== manifestTombstoneTotal ||
      manifest.entity_totals.redacted_fields !== manifestRedactedTotal) {
      throw drValidationError('dr_manifest_entity_totals_mismatch', 'DR_MANIFEST_COUNT_MISMATCH');
    }
    const checkpointTo = timestampMs(manifest.checkpoint_to, nowMs);
    const createdAt = timestampMs(manifest.created_at, nowMs);
    if (checkpointTo !== createdAt || checkpointTo <= previousCheckpoint) {
      throw drValidationError('dr_manifest_checkpoint_timeline_invalid', 'DR_MANIFEST_TIMELINE_INVALID');
    }
    artifactIdentity(manifest.snapshot, backupId, 'snapshot');
    artifactIdentity(manifest.index, backupId, 'index');
    if (!['Daily','Weekly','Monthly'].includes(String(manifest.retention_tier || '')) ||
      manifest.backup_root_path !== `${manifest.retention_tier}/${backupId}` ||
      manifest.snapshot.path !== `${manifest.retention_tier}/${backupId}/snapshot.json.gz.aes256gcm`) {
      throw drValidationError('dr_manifest_backup_path_identity_mismatch', 'DR_MANIFEST_IDENTITY_MISMATCH');
    }
    for (const path of [String(manifest.snapshot.path),String(manifest.index.path)]) {
      if (artifactPaths.has(path)) {
        throw drValidationError('dr_restore_chain_artifact_path_duplicate', 'DR_INCREMENTAL_CHAIN_INVALID');
      }
      artifactPaths.add(path);
    }
    if (manifest.storage_identity?.site_id !== DR_CANONICAL_SHAREPOINT_SITE_ID ||
      manifest.storage_identity?.drive_id !== DR_CANONICAL_SHAREPOINT_DRIVE_ID ||
      manifest.storage_identity?.root_folder !== DR_ROOT_FOLDER) {
      throw drValidationError('dr_manifest_storage_identity_mismatch', 'DR_MANIFEST_STORAGE_IDENTITY_MISMATCH');
    }
    if (index === 0) {
      if (manifest.snapshot_type !== 'FULL' || manifest.checkpoint_from != null || manifest.previous_manifest_path != null || manifest.base_full_manifest_path !== manifestPath) {
        throw drValidationError('dr_restore_chain_full_anchor_invalid', 'DR_INCREMENTAL_CHAIN_INVALID');
      }
    } else if (manifest.snapshot_type !== 'INCREMENTAL' ||
      manifest.previous_manifest_path !== previous.manifest_path ||
      manifest.checkpoint_from !== previous.checkpoint_to ||
      manifest.base_full_manifest_path !== baseFullPath) {
      throw drValidationError('dr_restore_chain_continuity_invalid', 'DR_INCREMENTAL_CHAIN_INVALID');
    }
    previous = manifest;
    previousCheckpoint = checkpointTo;
  }
  return chain;
}

export function validateSnapshotManifestIdentity(manifest:any, payload:any, input:any = {}) {
  if (!payload || typeof payload !== 'object' || payload.schema_version !== DISASTER_RECOVERY_SCHEMA_VERSION) {
    throw drValidationError('dr_snapshot_schema_invalid', 'DR_SNAPSHOT_IDENTITY_MISMATCH');
  }
  for (const field of ['dr_version','backup_id','snapshot_type','retention_tier','source_environment','source_app_id','release_version','git_sha','source_tree_hash','source_tree_hash_algorithm','checkpoint_from','checkpoint_to','created_at']) {
    if ((payload?.[field] ?? null) !== (manifest?.[field] ?? null)) {
      throw drValidationError(`dr_snapshot_${field}_mismatch`, 'DR_SNAPSHOT_IDENTITY_MISMATCH');
    }
  }
  if (!payload.entities || typeof payload.entities !== 'object' || Array.isArray(payload.entities) || !Array.isArray(payload.attachments)) {
    throw drValidationError('dr_snapshot_payload_shape_invalid', 'DR_SNAPSHOT_IDENTITY_MISMATCH');
  }
  if (payload.security?.raw_secrets_included !== false) {
    throw drValidationError('dr_snapshot_secret_policy_invalid', 'DR_SNAPSHOT_IDENTITY_MISMATCH');
  }
  const catalog:string[] = Array.isArray(input.entity_catalog) ? [...new Set<string>(input.entity_catalog.map((name:any) => String(name)))].sort() : Object.keys(manifest.entity_counts || {}).sort();
  const manifestEntityNames = Object.keys(manifest.entity_counts || {}).sort();
  if (manifestEntityNames.length !== catalog.length || manifestEntityNames.some((name,index) => name !== catalog[index])) {
    throw drValidationError('dr_snapshot_manifest_catalog_mismatch', 'DR_SNAPSHOT_CATALOG_MISMATCH');
  }
  const expectedPayloadEntities = catalog.filter((name) => manifest.entity_counts[name]?.excluded !== true).sort();
  const payloadEntityNames = Object.keys(payload.entities).sort();
  if (payloadEntityNames.length !== expectedPayloadEntities.length || payloadEntityNames.some((name,index) => name !== expectedPayloadEntities[index])) {
    throw drValidationError('dr_snapshot_entity_membership_mismatch', 'DR_SNAPSHOT_CATALOG_MISMATCH');
  }
  if (stableJson(payload.entity_counts) !== stableJson(manifest.entity_counts) ||
    stableJson(payload.entity_totals) !== stableJson(manifest.entity_totals) ||
    stableJson(payload.attachments_summary) !== stableJson(manifest.attachments) ||
    stableJson(payload.attachments) !== stableJson(manifest.attachment_items)) {
    throw drValidationError('dr_snapshot_authenticated_summary_mismatch', 'DR_SNAPSHOT_COUNT_MISMATCH');
  }
  let sourceTotal=0,includedTotal=0,tombstoneTotal=0,redactedTotal=0;
  const recordIds = new Set<string>();
  for (const entityName of catalog) {
    const counts = manifest.entity_counts[entityName];
    for (const field of ['source','included','tombstones','redacted_fields']) {
      if (!Number.isSafeInteger(counts?.[field]) || counts[field] < 0) {
        throw drValidationError('dr_snapshot_entity_count_invalid', 'DR_SNAPSHOT_COUNT_MISMATCH');
      }
    }
    sourceTotal+=counts.source;includedTotal+=counts.included;tombstoneTotal+=counts.tombstones;redactedTotal+=counts.redacted_fields;
    if (manifest.snapshot_type === 'FULL' &&
      (counts.source !== counts.included || counts.tombstones !== 0)) {
      throw drValidationError('dr_snapshot_full_semantics_invalid', 'DR_SNAPSHOT_COUNT_MISMATCH');
    }
    if (counts.excluded === true) {
      if (counts.included !== 0 || counts.tombstones !== 0 || counts.restorable !== false) {
        throw drValidationError('dr_snapshot_excluded_entity_count_invalid', 'DR_SNAPSHOT_COUNT_MISMATCH');
      }
      continue;
    }
    const change = payload.entities[entityName];
    if (!change || !Array.isArray(change.records) || !Array.isArray(change.tombstones) ||
      change.records.length !== counts.included || change.tombstones.length !== counts.tombstones) {
      throw drValidationError('dr_snapshot_entity_count_mismatch', 'DR_SNAPSHOT_COUNT_MISMATCH');
    }
    const entityRecordIds = new Set<string>();
    for (const record of change.records) {
      const id = typeof record?.id === 'string' ? record.id.trim() : '';
      if (!id || entityRecordIds.has(id) || recordIds.has(id)) {
        throw drValidationError('dr_snapshot_record_identity_invalid', 'DR_SNAPSHOT_RECORD_INVALID');
      }
      entityRecordIds.add(id);
      recordIds.add(id);
    }
    const tombstoneIds = new Set<string>();
    for (const rawId of change.tombstones) {
      const id = typeof rawId === 'string' ? rawId.trim() : '';
      if (!id || tombstoneIds.has(id) || entityRecordIds.has(id)) {
        throw drValidationError('dr_snapshot_tombstone_identity_invalid', 'DR_SNAPSHOT_RECORD_INVALID');
      }
      tombstoneIds.add(id);
    }
    if (manifest.snapshot_type === 'FULL' && change.tombstones.length !== 0) {
      throw drValidationError('dr_snapshot_full_semantics_invalid', 'DR_SNAPSHOT_COUNT_MISMATCH');
    }
  }
  const attachmentSourceRefs = new Set<string>();
  const attachmentPaths = new Set<string>();
  const attachmentAads = new Set<string>();
  let attachmentOriginalBytes=0,attachmentEncryptedBytes=0;
  for (let index = 0; index < payload.attachments.length; index++) {
    const attachment = payload.attachments[index];
    const ordinal = String(index + 1).padStart(5, '0');
    const sourceRef = requiredText(attachment?.source_ref, 'DR_ATTACHMENT_SOURCE_REF_INVALID');
    const fileName = requiredText(attachment?.file_name, 'DR_ATTACHMENT_FILE_NAME_INVALID');
    const storagePath = requiredText(attachment?.storage_path, 'DR_ATTACHMENT_PATH_INVALID');
    const aad = requiredText(attachment?.aad, 'DR_ATTACHMENT_AAD_INVALID');
    if (!trustedBase44FileUrl(sourceRef) || safeFileName(fileName) !== fileName ||
      storagePath !== `${manifest.retention_tier}/${manifest.backup_id}/attachments/${ordinal}-${fileName}.gz.aes256gcm` ||
      aad !== `${manifest.backup_id}|attachment|${ordinal}` ||
      attachmentSourceRefs.has(sourceRef) || attachmentPaths.has(storagePath) || attachmentAads.has(aad) ||
      !DR_SHA256.test(String(attachment?.source_ref_sha256 || '')) ||
      !DR_SHA256.test(String(attachment?.plaintext_sha256 || '')) ||
      !DR_SHA256.test(String(attachment?.encrypted_sha256 || '')) ||
      !Number.isSafeInteger(attachment?.original_bytes) || attachment.original_bytes < 0 ||
      !Number.isSafeInteger(attachment?.compressed_bytes) || attachment.compressed_bytes < 0 ||
      !Number.isSafeInteger(attachment?.encrypted_bytes) || attachment.encrypted_bytes < 0) {
      throw drValidationError('dr_snapshot_attachment_identity_invalid', 'DR_SNAPSHOT_ATTACHMENT_INVALID');
    }
    attachmentSourceRefs.add(sourceRef);
    attachmentPaths.add(storagePath);
    attachmentAads.add(aad);
    attachmentOriginalBytes += attachment.original_bytes;
    attachmentEncryptedBytes += attachment.encrypted_bytes;
  }
  if (manifest.entity_totals?.source !== sourceTotal || manifest.entity_totals?.included !== includedTotal ||
    manifest.entity_totals?.tombstones !== tombstoneTotal || manifest.entity_totals?.redacted_fields !== redactedTotal ||
    manifest.attachments?.count !== payload.attachments.length ||
    manifest.attachments?.original_bytes !== attachmentOriginalBytes ||
    manifest.attachments?.encrypted_bytes !== attachmentEncryptedBytes) {
    throw drValidationError('dr_snapshot_summary_count_mismatch', 'DR_SNAPSHOT_COUNT_MISMATCH');
  }
  return payload;
}

export function validateLatestCheckpointIdentity(manifest:any, index:any) {
  if (!index || typeof index !== 'object' || index.schema_version !== DISASTER_RECOVERY_SCHEMA_VERSION ||
    index.catalog_version !== manifest?.entity_catalog_version ||
    index.backup_id !== manifest?.backup_id || index.checkpoint_to !== manifest?.checkpoint_to ||
    !index.entities || typeof index.entities !== 'object' || Array.isArray(index.entities)) {
    throw drValidationError('dr_latest_checkpoint_identity_mismatch', 'DR_CHECKPOINT_IDENTITY_MISMATCH');
  }
  const expectedEntities = Object.keys(manifest.entity_counts || {}).filter((name) => manifest.entity_counts[name]?.excluded !== true).sort();
  const observedEntities = Object.keys(index.entities).sort();
  if (expectedEntities.length !== observedEntities.length || expectedEntities.some((name,position) => name !== observedEntities[position]) ||
    observedEntities.some((name) => !index.entities[name] || typeof index.entities[name].records !== 'object' || Array.isArray(index.entities[name].records) ||
      Object.values(index.entities[name].records).some((hash) => !DR_SHA256.test(String(hash || ''))))) {
    throw drValidationError('dr_latest_checkpoint_catalog_mismatch', 'DR_CHECKPOINT_IDENTITY_MISMATCH');
  }
  return index;
}

export function classifyCheckpointCatalog(
  manifest:any,
  currentCatalogVersion:string,
  currentCatalog:readonly string[],
) {
  const observedCatalog = Object.keys(manifest?.entity_counts || {}).sort();
  const declaredCount = Number(manifest?.entity_catalog_count);
  const observedVersion = String(manifest?.entity_catalog_version || '');
  if (
    !observedVersion || !Number.isSafeInteger(declaredCount) || declaredCount < 1 ||
    declaredCount !== observedCatalog.length
  ) {
    throw drValidationError('dr_latest_checkpoint_catalog_identity_invalid', 'DR_CHECKPOINT_IDENTITY_MISMATCH');
  }
  const expectedCatalog = [...currentCatalog].sort();
  const current = observedVersion === currentCatalogVersion &&
    declaredCount === expectedCatalog.length &&
    observedCatalog.every((name, index) => name === expectedCatalog[index]);
  return {
    status: current ? 'CURRENT' : 'LEGACY_COMPATIBLE',
    current,
    requires_full_rebase: !current,
    checkpoint_catalog_version: observedVersion,
    checkpoint_catalog_count: declaredCount,
    current_catalog_version: currentCatalogVersion,
    current_catalog_count: expectedCatalog.length,
  };
}

export function assertAttachmentByteLengths(
  attachment:any,
  lengths:{encrypted:number;compressed:number;original:number},
) {
  const expected = [
    ['encrypted_bytes', lengths.encrypted],
    ['compressed_bytes', lengths.compressed],
    ['original_bytes', lengths.original],
  ] as const;
  for (const [field, observed] of expected) {
    if (!Number.isSafeInteger(attachment?.[field]) || attachment[field] < 0 ||
      !Number.isSafeInteger(observed) || observed < 0 || attachment[field] !== observed) {
      throw drValidationError('dr_attachment_size_mismatch', 'DR_ATTACHMENT_SIZE_MISMATCH');
    }
  }
  return true;
}

export function restoreEvidenceAad(evidence:any) {
  return `${DISASTER_RECOVERY_VERSION}|restore-evidence|${requiredText(evidence?.exercise_key, 'DR_RESTORE_EVIDENCE_EXERCISE_KEY_INVALID')}|${sha256(evidence?.manifest_hash, 'DR_RESTORE_EVIDENCE_MANIFEST_HASH_INVALID')}`;
}

export function validateRestoreEvidenceAttestation(evidence:any, selectedManifest:any, chain:any[], input:any = {}) {
  const nowMs = Number.isFinite(Number(input.now_ms)) ? Number(input.now_ms) : Date.now();
  const appId = requiredText(input.source_app_id, 'DR_SOURCE_APP_ID_REQUIRED');
  if (!evidence || typeof evidence !== 'object' || evidence.schema_version !== 'cambra-dr-restore-evidence-v1' || evidence.dr_version !== DISASTER_RECOVERY_VERSION) {
    throw drValidationError('dr_restore_evidence_schema_invalid', 'DR_RESTORE_EVIDENCE_SCHEMA_INVALID');
  }
  sha256(evidence.evidence_hash, 'DR_RESTORE_EVIDENCE_HASH_INVALID');
  const target = String(evidence.target_environment || '').trim().toLowerCase();
  if (!DR_ISOLATED_TARGETS.has(target) || evidence.target_isolated !== true || evidence.target_production !== false) {
    throw drValidationError('dr_restore_evidence_target_invalid', 'DR_RESTORE_EVIDENCE_TARGET_INVALID');
  }
  if (evidence.source_app_id !== appId || evidence.source_environment !== 'prod' ||
    selectedManifest?.source_app_id !== appId || selectedManifest?.source_environment !== 'prod') {
    throw drValidationError('dr_restore_evidence_source_invalid', 'DR_RESTORE_EVIDENCE_SOURCE_INVALID');
  }
  const expectedTargetRef = `base44:${appId}:data-env:${target}`;
  if (evidence.restored_target_ref !== expectedTargetRef) {
    throw drValidationError('dr_restore_evidence_target_ref_invalid', 'DR_RESTORE_EVIDENCE_TARGET_INVALID');
  }
  const anchorFields:any = {
    manifest_path:evidence.manifest_path,
    manifest_hash:evidence.manifest_hash,
    backup_id:evidence.backup_id,
    checkpoint_to:evidence.backup_checkpoint_at,
    release_version:evidence.source_release_version,
    git_sha:evidence.source_git_sha,
    source_tree_hash:evidence.source_tree_hash,
    source_tree_hash_algorithm:evidence.source_tree_hash_algorithm,
  };
  for (const [field,evidenceField] of Object.entries(anchorFields)) {
    if (evidenceField !== selectedManifest?.[field]) {
      throw drValidationError(`dr_restore_evidence_${field}_mismatch`, 'DR_RESTORE_EVIDENCE_ANCHOR_MISMATCH');
    }
  }
  sha256(evidence.manifest_hash, 'DR_RESTORE_EVIDENCE_MANIFEST_HASH_INVALID');
  if (sha256(evidence.snapshot_encrypted_sha256, 'DR_RESTORE_EVIDENCE_SNAPSHOT_HASH_INVALID') !== String(selectedManifest?.snapshot?.encrypted_sha256 || '').toLowerCase() ||
    sha256(evidence.snapshot_payload_sha256, 'DR_RESTORE_EVIDENCE_SNAPSHOT_HASH_INVALID') !== String(selectedManifest?.snapshot?.payload_sha256 || '').toLowerCase()) {
    throw drValidationError('dr_restore_evidence_snapshot_anchor_mismatch', 'DR_RESTORE_EVIDENCE_ANCHOR_MISMATCH');
  }
  if (!DR_SHA40.test(String(evidence.source_git_sha || '')) || !DR_SHA256.test(String(evidence.source_tree_hash || ''))) {
    throw drValidationError('dr_restore_evidence_release_identity_invalid', 'DR_RESTORE_EVIDENCE_ANCHOR_MISMATCH');
  }
  if (!Array.isArray(evidence.chain) || evidence.chain.length !== chain.length) {
    throw drValidationError('dr_restore_evidence_chain_invalid', 'DR_RESTORE_EVIDENCE_ANCHOR_MISMATCH');
  }
  for (let index = 0; index < chain.length; index++) {
    const expected = chain[index];
    const observed = evidence.chain[index];
    for (const field of ['backup_id','manifest_path','manifest_hash','snapshot_type','checkpoint_from','checkpoint_to']) {
      if ((observed?.[field] ?? null) !== (expected?.[field] ?? null)) {
        throw drValidationError('dr_restore_evidence_chain_mismatch', 'DR_RESTORE_EVIDENCE_ANCHOR_MISMATCH');
      }
    }
  }
  const checkpointMs = timestampMs(evidence.backup_checkpoint_at, nowMs);
  const startedMs = timestampMs(evidence.started_at, nowMs);
  const completedMs = timestampMs(evidence.completed_at, nowMs);
  if (checkpointMs > startedMs || startedMs > completedMs || nowMs - completedMs > 7 * 86400000) {
    throw drValidationError('dr_restore_evidence_timeline_invalid', 'DR_RESTORE_EVIDENCE_TIMELINE_INVALID');
  }
  const numericFields = ['rpo_target_minutes','rpo_observed_minutes','rto_target_minutes','rto_observed_minutes'];
  for (const field of numericFields) {
    if (typeof evidence[field] !== 'number' || !Number.isFinite(evidence[field]) || evidence[field] < 0) {
      throw drValidationError(`dr_restore_evidence_${field}_invalid`, 'DR_RESTORE_EVIDENCE_METRIC_INVALID');
    }
  }
  const recomputedRpo = (startedMs - checkpointMs) / 60000;
  const recomputedRto = (completedMs - startedMs) / 60000;
  if (evidence.rpo_target_minutes !== DR_RPO_TARGET_MINUTES || evidence.rto_target_minutes !== DR_RTO_TARGET_MINUTES ||
    Math.abs(evidence.rpo_observed_minutes - recomputedRpo) > 1e-9 ||
    Math.abs(evidence.rto_observed_minutes - recomputedRto) > 1e-9 ||
    evidence.rpo_observed_minutes > evidence.rpo_target_minutes || evidence.rto_observed_minutes > evidence.rto_target_minutes) {
    throw drValidationError('dr_restore_evidence_metric_mismatch', 'DR_RESTORE_EVIDENCE_METRIC_INVALID');
  }
  const expectedExerciseKey = `real-restore:${evidence.backup_id}:${target}:${evidence.completed_at}`;
  if (evidence.exercise_key !== expectedExerciseKey || evidence.status !== 'PASS' ||
    evidence.integrity?.pass !== true || evidence.attachments?.pass !== true ||
    !Number.isSafeInteger(evidence.attachments?.count) || evidence.attachments.count < 0 ||
    !Array.isArray(evidence.attachments?.items) || evidence.attachments.items.length !== evidence.attachments.count ||
    evidence.attachments.items.some((item:any) => item?.verified !== true) ||
    !evidence.wiped_counts || typeof evidence.wiped_counts !== 'object' || Array.isArray(evidence.wiped_counts) ||
    !evidence.created_counts || typeof evidence.created_counts !== 'object' || Array.isArray(evidence.created_counts) ||
    evidence.user_identity_reconciliation?.missing !== 0 ||
    evidence.security?.backup_encryption_verified !== true ||
    evidence.security?.ciphertext_hashes_verified !== true || evidence.security?.evidence_authentication !== 'AES-256-GCM' ||
    !String(evidence.conducted_by || '').trim()) {
    throw drValidationError('dr_restore_evidence_result_invalid', 'DR_RESTORE_EVIDENCE_NOT_ELIGIBLE');
  }
  return { target, restored_target_ref:expectedTargetRef, rpo_minutes:recomputedRpo, rto_minutes:recomputedRto };
}

const RUNTIME_AUTHORITY_PROJECTION_FIELDS = Object.freeze([
  'id','evidence_key','gate_key','environment','git_sha','source_tree_hash',
  'source_tree_file_count','release_version','release_build_id','base44_bundle_hash',
  'base44_bundle_file_count','deployment_topology_hash','scheduler_inventory_hash',
  'physical_function_count','logical_route_count','identity_version','identity_status',
  'identity_hash','identity_blockers','status','evidence_kind','source','external_run_id',
  'evidence_refs','details_json','observed_at','expires_at','recorded_by','evidence_hash',
]);

function runtimeAuthorityProjection(row:any) {
  return Object.fromEntries(RUNTIME_AUTHORITY_PROJECTION_FIELDS.map((field) => [field,row?.[field] ?? null]));
}

function assertPersistedLatestAuthority(created:any, readback:any, latestRows:any[], input:any) {
  const expectedStatus=String(input.status || '');
  const expectedGateKey=String(input.gate_key || '');
  const code=String(input.code || 'DR_RESTORE_RUNTIME_GATE_BLOCKED');
  const invalid=() => { throw drValidationError('dr_runtime_authority_readback_mismatch', code); };
  if (!created?.id || !created?.evidence_key || !readback?.id || !Array.isArray(latestRows) || latestRows.length === 0 ||
    String(created.id) !== String(readback.id) || String(created.evidence_key) !== String(readback.evidence_key) ||
    readback.gate_key !== expectedGateKey || readback.status !== expectedStatus || readback.identity_status !== 'COMPLETE' ||
    stableJson(runtimeAuthorityProjection(created)) !== stableJson(runtimeAuthorityProjection(readback))) invalid();
  const latest=latestRows[0];
  if (String(latest?.id || '') !== String(readback.id) || String(latest?.evidence_key || '') !== String(readback.evidence_key) ||
    latest?.gate_key !== expectedGateKey || latest?.status !== expectedStatus || latest?.evidence_hash !== readback.evidence_hash ||
    stableJson(runtimeAuthorityProjection(latest)) !== stableJson(runtimeAuthorityProjection(readback))) invalid();
  const latestMs=canonicalIsoTimestampMs(latest?.observed_at);
  const readbackMs=canonicalIsoTimestampMs(readback?.observed_at);
  if (!Number.isFinite(latestMs) || latestMs !== readbackMs) invalid();
  if (latestRows[1]) {
    const previousMs=canonicalIsoTimestampMs(latestRows[1]?.observed_at);
    if (!Number.isFinite(previousMs) || latestMs <= previousMs) invalid();
  }
  return readback;
}

function compensationFailureCode(error:any) {
  const value=String(error?.code || error?.name || 'COMPENSATION_FAILED').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,120);
  return value || 'COMPENSATION_FAILED';
}

/**
 * Persists restore authority as an explicitly ordered non-transactional saga.
 * The preflight PASS is read back, proven uniquely latest and then closed before
 * the Exercise can become PASS. The final REAL_RESTORE PASS is the last write
 * on success; all following operations are datastore reads. Failure compensation
 * blocks and verifies the runtime gate before touching the Exercise projection.
 * If that fence cannot be proven, the Exercise is not mutated and a durable
 * compensation-ambiguity marker is required; marker failure remains an error.
 */
export async function persistRestoreAttestationAuthority(operations:any) {
  let probe:any=null,probeReadback:any=null,probeClosure:any=null,exercise:any=null,gate:any=null,readback:any=null;
  let probeClosed=false,postProbe=false;

  const closeProbe=async(error:any,reason:string)=>{
    const created=await operations.block_probe({error,reason,probe:probeReadback || probe});
    const persisted=await operations.read_probe(created);
    const latest=await operations.read_latest_probe();
    assertPersistedLatestAuthority(created,persisted,latest,{status:'BLOCKED',gate_key:'REAL_RESTORE_ATTESTATION_PROBE',code:'DR_RESTORE_PROBE_COMPENSATION_AMBIGUOUS'});
    const verification=await operations.verify_blocked_probe(persisted);
    if (verification?.ok !== true) throw drValidationError('dr_restore_probe_compensation_unverified','DR_RESTORE_PROBE_COMPENSATION_AMBIGUOUS');
    probeClosed=true;
    return persisted;
  };

  try {
    probe=await operations.record_probe();
    probeReadback=await operations.read_probe(probe);
    const latestProbe=await operations.read_latest_probe();
    assertPersistedLatestAuthority(probe,probeReadback,latestProbe,{status:'PASS',gate_key:'REAL_RESTORE_ATTESTATION_PROBE',code:'DR_RESTORE_RUNTIME_GATE_BLOCKED'});
    const probeVerification=await operations.verify_probe(probeReadback);
    if (probeVerification?.ok !== true) throw drValidationError('dr_restore_runtime_gate_preflight_blocked','DR_RESTORE_RUNTIME_GATE_BLOCKED');
    probeClosure=await closeProbe(null,'preflight_verified');
    postProbe=true;

    exercise=await operations.promote_exercise(probeReadback);
    readback=await operations.read_exercise(exercise);
    const latestExercises=await operations.read_latest_exercise();
    if (!Array.isArray(latestExercises) || latestExercises.length !== 1 ||
      String(latestExercises[0]?.id || '') !== String(readback?.id || '') ||
      operations.readback_valid(readback) !== true || operations.readback_valid(latestExercises[0]) !== true) {
      throw drValidationError('dr_restore_exercise_pass_readback_mismatch','DR_RESTORE_EXERCISE_READBACK_MISMATCH');
    }
    gate=await operations.record_gate(exercise,readback);
    const persistedGate=await operations.read_gate(gate);
    const latestGate=await operations.read_latest_gate();
    assertPersistedLatestAuthority(gate,persistedGate,latestGate,{status:'PASS',gate_key:'REAL_RESTORE',code:'DR_RESTORE_RUNTIME_GATE_BLOCKED'});
    const gateVerification=await operations.verify_gate(persistedGate);
    if (gateVerification?.ok !== true) throw drValidationError('dr_restore_runtime_gate_blocked','DR_RESTORE_RUNTIME_GATE_BLOCKED');
    gate=persistedGate;
    return {probe:probeReadback,probe_closure:probeClosure,exercise,gate,readback};
  } catch (error:any) {
    const failures:Array<{stage:string;code:string}>=[];
    const failed=(stage:string,compensationError:any)=>{
      failures.push({stage,code:compensationFailureCode(compensationError)});
      try { operations.compensation_failed?.(stage,compensationError); } catch { /* logging cannot replace authority */ }
    };
    if (postProbe) {
      let gateCompensated=false;
      try {
        const blockedGate=await operations.block_gate({error,exercise,gate});
        const persistedBlockedGate=await operations.read_gate(blockedGate);
        const latestBlockedGate=await operations.read_latest_gate();
        assertPersistedLatestAuthority(blockedGate,persistedBlockedGate,latestBlockedGate,{status:'BLOCKED',gate_key:'REAL_RESTORE',code:'DR_RESTORE_COMPENSATION_AMBIGUOUS'});
        const verification=await operations.verify_blocked_gate(persistedBlockedGate);
        if (verification?.ok !== true) throw drValidationError('dr_restore_gate_compensation_unverified','DR_RESTORE_COMPENSATION_AMBIGUOUS');
        gateCompensated=true;
      } catch (compensationError) {
        failed('gate',compensationError);
        try {
          if (typeof operations.persist_compensation_ambiguity !== 'function') {
            throw drValidationError('dr_restore_compensation_marker_unavailable','DR_RESTORE_COMPENSATION_AMBIGUOUS');
          }
          await operations.persist_compensation_ambiguity({error,compensation_error:compensationError,exercise,gate});
        } catch (markerError) { failed('gate_ambiguity_marker',markerError); }
      }
      if (gateCompensated) {
        try {
          const blockedExercise=await operations.block_exercise({error,exercise,gate});
          const persistedBlockedExercise=await operations.read_exercise(blockedExercise);
          const latestBlockedExercises=await operations.read_latest_exercise();
          if (!Array.isArray(latestBlockedExercises) || latestBlockedExercises.length !== 1 ||
            String(latestBlockedExercises[0]?.id || '') !== String(persistedBlockedExercise?.id || '') ||
            operations.blocked_exercise_valid(persistedBlockedExercise) !== true ||
            operations.blocked_exercise_valid(latestBlockedExercises[0]) !== true) {
            throw drValidationError('dr_restore_exercise_compensation_unverified','DR_RESTORE_COMPENSATION_AMBIGUOUS');
          }
        } catch (compensationError) { failed('exercise',compensationError); }
      }
    }
    if (!probeClosed) {
      try { probeClosure=await closeProbe(error,'preflight_failed'); }
      catch (compensationError) { failed('probe',compensationError); }
    }
    if (failures.length) {
      const critical:any=drValidationError('dr_restore_compensation_ambiguous','DR_RESTORE_COMPENSATION_AMBIGUOUS');
      critical.compensation_failures=failures;
      throw critical;
    }
    throw drValidationError('dr_restore_runtime_gate_blocked','DR_RESTORE_RUNTIME_GATE_BLOCKED');
  }
}

export function stableValue(value:any):any {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
}

export function stableJson(value:any) {
  return JSON.stringify(stableValue(value));
}

export function* jsonValueChunks(value:any):Generator<string> {
  const ancestors=new Set<any>();
  const omitted=(candidate:any)=>['undefined','function','symbol'].includes(typeof candidate);
  function prepared(candidate:any,key:string){return candidate&&typeof candidate==='object'&&typeof candidate.toJSON==='function'?candidate.toJSON(key):candidate}
  function* visit(candidate:any,key:string,arrayValue:boolean):Generator<string>{
    candidate=prepared(candidate,key);
    if(omitted(candidate)){if(arrayValue)yield'null';else throw new TypeError('dr_json_value_not_serializable');return}
    if(candidate===null){yield'null';return}
    if(typeof candidate==='string'){yield JSON.stringify(candidate);return}
    if(typeof candidate==='boolean'){yield candidate?'true':'false';return}
    if(typeof candidate==='number'){yield Number.isFinite(candidate)?String(candidate):'null';return}
    if(typeof candidate==='bigint')throw new TypeError('Do not know how to serialize a BigInt');
    if(ancestors.has(candidate))throw new TypeError('Converting circular structure to JSON');
    ancestors.add(candidate);
    try{
      if(Array.isArray(candidate)){
        yield'[';
        for(let index=0;index<candidate.length;index++){if(index)yield',';yield*visit(candidate[index],String(index),true)}
        yield']';return;
      }
      yield'{';let first=true;
      for(const property of Object.keys(candidate)){
        const child=prepared(candidate[property],property);if(omitted(child))continue;
        if(!first)yield',';first=false;yield JSON.stringify(property);yield':';yield*visit(child,property,false);
      }
      yield'}';
    }finally{ancestors.delete(candidate)}
  }
  yield*visit(value,'',false);
}

function ownedBuffer(bytes:Uint8Array) {
  const copy=new Uint8Array(bytes.byteLength);copy.set(bytes);return copy.buffer;
}

function ownedBytes(bytes:Uint8Array) {
  const copy=new Uint8Array(bytes.byteLength);copy.set(bytes);return copy;
}

export async function sha256Hex(value:Uint8Array|string) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', ownedBuffer(bytes));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

export function bytesToBase64(bytes:Uint8Array) {
  let result = '';
  const block = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += block) result += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + block)));
  return btoa(result);
}

export function base64ToBytes(value:string) {
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}

export function parseAes256Key(value:string) {
  let bytes:Uint8Array;
  try { bytes = base64ToBytes(String(value || '').trim()); }
  catch { throw Object.assign(new Error('dr_backup_aes256_key_invalid_base64'), { code:'DR_BACKUP_AES256_KEY_INVALID' }); }
  if (bytes.byteLength !== 32) throw Object.assign(new Error('dr_backup_aes256_key_must_be_32_bytes'), { code:'DR_BACKUP_AES256_KEY_INVALID' });
  return bytes;
}

async function transformBytes(bytes:Uint8Array, format:'gzip'|'deflate', decompress=false, maxOutputBytes=DR_DEFAULT_MAX_FILE_BYTES) {
  const stream = decompress ? new DecompressionStream(format) : new CompressionStream(format);
  const writer = stream.writable.getWriter();
  // CompressionStream's writable contract accepts an ArrayBufferView. Keep
  // the byte ownership and the view together: passing the backing ArrayBuffer
  // is not portable when `bytes` is a subarray and can include unrelated data.
  // Start draining before awaiting the write so a large payload cannot stall
  // on CompressionStream backpressure with no active reader.
  const output:Promise<Uint8Array> = readBoundedDrResponseBytes(
    new Response(stream.readable),
    maxOutputBytes,
  );
  const settledOutput=output.then(
    (value)=>({ok:true as const,value}),
    (error)=>({ok:false as const,error}),
  );
  let writerError:any=null;
  try{
    await writer.write(ownedBytes(bytes));
    await writer.close();
  }catch(error){
    writerError=error;
    await writer.abort('dr_transform_write_failed').catch(()=>undefined);
  }
  const result=await settledOutput;
  if('error' in result)throw result.error?.code?result.error:(writerError||result.error);
  if(writerError)throw writerError;
  return result.value;
}

export const gzipBytes = (bytes:Uint8Array,maxOutputBytes=DR_DEFAULT_MAX_FILE_BYTES) => transformBytes(bytes, 'gzip', false, maxOutputBytes);
export const gunzipBytes = (bytes:Uint8Array,maxOutputBytes=DR_DEFAULT_MAX_FILE_BYTES) => transformBytes(bytes, 'gzip', true, maxOutputBytes);

export async function encryptEnvelope(plain:Uint8Array, rawKey:Uint8Array, aad:string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', ownedBuffer(rawKey), { name:'AES-GCM' }, false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name:'AES-GCM', iv:ownedBuffer(iv), additionalData:ownedBuffer(new TextEncoder().encode(aad)), tagLength:128 }, key, ownedBuffer(plain)));
  const header = new TextEncoder().encode(`${DISASTER_RECOVERY_ENVELOPE_VERSION}\n${JSON.stringify({ iv:bytesToBase64(iv), aad, algorithm:'AES-256-GCM', tag_bits:128 })}\n`);
  const envelope = new Uint8Array(header.byteLength + cipher.byteLength);
  envelope.set(header, 0);
  envelope.set(cipher, header.byteLength);
  return envelope;
}

export async function decryptEnvelope(envelope:Uint8Array, rawKey:Uint8Array, expectedAad?:string) {
  const first = envelope.indexOf(10);
  const second = envelope.indexOf(10, first + 1);
  if (first < 0 || second < 0) throw Object.assign(new Error('dr_envelope_header_invalid'), { code:'DR_ENVELOPE_INVALID' });
  const magic = new TextDecoder().decode(envelope.subarray(0, first));
  if (magic !== DISASTER_RECOVERY_ENVELOPE_VERSION) throw Object.assign(new Error('dr_envelope_version_unsupported'), { code:'DR_ENVELOPE_INVALID' });
  const header = JSON.parse(new TextDecoder().decode(envelope.subarray(first + 1, second)));
  if (header.algorithm !== 'AES-256-GCM' || Number(header.tag_bits) !== 128) throw Object.assign(new Error('dr_envelope_algorithm_invalid'), { code:'DR_ENVELOPE_INVALID' });
  if (expectedAad && header.aad !== expectedAad) throw Object.assign(new Error('dr_envelope_aad_mismatch'), { code:'DR_ENVELOPE_AAD_MISMATCH' });
  const key = await crypto.subtle.importKey('raw', ownedBuffer(rawKey), { name:'AES-GCM' }, false, ['decrypt']);
  try {
    const plain = await crypto.subtle.decrypt({ name:'AES-GCM', iv:ownedBuffer(base64ToBytes(header.iv)), additionalData:ownedBuffer(new TextEncoder().encode(header.aad)), tagLength:128 }, key, ownedBuffer(envelope.subarray(second + 1)));
    return { bytes:new Uint8Array(plain), aad:String(header.aad) };
  } catch {
    throw Object.assign(new Error('dr_envelope_authentication_failed'), { code:'DR_ENVELOPE_AUTHENTICATION_FAILED' });
  }
}

export function redactSecrets(value:any, path:string[] = [], stats={ fields:0, paths:[] as string[] }):{ value:any; stats:{fields:number;paths:string[]} } {
  if (typeof value === 'string') {
    const redacted=redactDrSecretString(value);
    if(redacted.redactions>0){
      stats.fields++;
      if(stats.paths.length<100)stats.paths.push(path.join('.')||'$');
    }
    return{value:redacted.value,stats};
  }
  if (Array.isArray(value)) return { value:value.map((item, index) => redactSecrets(item, [...path, String(index)], stats).value), stats };
  if (!value || typeof value !== 'object') return { value, stats };
  const output:any = {};
  for (const [key, child] of Object.entries(value)) {
    if (secretKeyRequiresRedaction(key)) {
      stats.fields++;
      if (stats.paths.length < 100) stats.paths.push([...path, key].join('.'));
      continue;
    }
    output[key] = redactSecrets(child, [...path, key], stats).value;
  }
  return { value:output, stats };
}

export function secretLikePaths(value:any, path:string[] = [], found:string[] = []) {
  if (typeof value === 'string') {
    if(hasDrSecretStringResidue(value))found.push(path.join('.')||'$');
    return found;
  }
  if (Array.isArray(value)) { value.forEach((item, index) => secretLikePaths(item, [...path, String(index)], found)); return found; }
  if (!value || typeof value !== 'object') return found;
  for (const [key, child] of Object.entries(value)) {
    if (secretKeyRequiresRedaction(key)) found.push([...path, key].join('.'));
    secretLikePaths(child, [...path, key], found);
  }
  return found;
}

export function backupTier(at=new Date()):BackupTier {
  if (at.getUTCDate() === 1) return 'Monthly';
  if (at.getUTCDay() === 0) return 'Weekly';
  return 'Daily';
}

export function snapshotType(input:any, tier:BackupTier, hasCheckpoint:boolean):SnapshotType {
  const requested = String(input || 'AUTO').toUpperCase();
  if (requested === 'FULL' || tier === 'Weekly' || tier === 'Monthly' || !hasCheckpoint) return 'FULL';
  return 'INCREMENTAL';
}

export function retentionCutoff(folder:keyof typeof DR_RETENTION_DAYS, nowMs=Date.now()) {
  return new Date(nowMs - DR_RETENTION_DAYS[folder] * 86400000).toISOString();
}

export function stripSystemFields(record:any) {
  return Object.fromEntries(Object.entries(record || {}).filter(([key]) => !SYSTEM_FIELDS.has(key)));
}

export function deepRemap(value:any, mapping:Map<string,string>):any {
  if (typeof value === 'string') return mapping.get(value) || value;
  if (Array.isArray(value)) return value.map((item) => deepRemap(item, mapping));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, deepRemap(child, mapping)]));
  return value;
}

export function collectExactReferences(value:any, known:Set<string>, found:string[] = []) {
  if (typeof value === 'string') { if (known.has(value)) found.push(value); return found; }
  if (Array.isArray(value)) { value.forEach((item) => collectExactReferences(item, known, found)); return found; }
  if (value && typeof value === 'object') for (const child of Object.values(value)) collectExactReferences(child, known, found);
  return found;
}

export function restoreEnvironment(req:Request) {
  return String(req.headers.get('x-data-env') || req.headers.get('X-Data-Env') || '').trim().toLowerCase();
}

export function assertIsolatedRestoreTarget(req:Request, confirmation:any) {
  const environment = restoreEnvironment(req);
  if (!['dev', 'test', 'staging', 'sandbox'].includes(environment)) throw Object.assign(new Error('dr_restore_requires_explicit_non_production_data_environment'), { code:'DR_RESTORE_PRODUCTION_FORBIDDEN', environment:environment || 'default' });
  if (confirmation !== 'RESTORE_TO_ISOLATED_NON_PRODUCTION') throw Object.assign(new Error('dr_restore_confirmation_required'), { code:'DR_RESTORE_CONFIRMATION_REQUIRED' });
  return environment;
}

export function trustedBase44FileUrl(value:any) {
  try {
    const parsed = new URL(String(value || ''));
    const hostname = parsed.hostname.toLowerCase();
    const trustedStableRoute = hostname === TRUSTED_BASE44_APP_HOST &&
      parsed.pathname.startsWith(TRUSTED_BASE44_APP_FILE_PREFIX) &&
      parsed.pathname.length > TRUSTED_BASE44_APP_FILE_PREFIX.length;
    const trustedMediaRoute = hostname === TRUSTED_BASE44_MEDIA_HOST && parsed.pathname !== '/';
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.hash &&
      (trustedStableRoute || trustedMediaRoute) ? parsed.toString() : null;
  }
  catch { return null; }
}

export function trustedBase44FileRedirectUrl(value:any) {
  try {
    const parsed = new URL(String(value || ''));
    return parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === TRUSTED_BASE44_MEDIA_HOST &&
      !parsed.username && !parsed.password && !parsed.hash && parsed.pathname !== '/' ? parsed.toString() : null;
  } catch { return null; }
}

export async function fetchTrustedBase44File(
  value:any,
  maxBytes:number,
  fetcher:typeof fetch=fetch,
) {
  const sourceUrl=trustedBase44FileUrl(value);
  if(!sourceUrl)throw Object.assign(new Error('dr_owned_file_url_rejected'),{code:'DR_OWNED_FILE_URL_REJECTED'});
  const source=new URL(sourceUrl);
  const request=async(url:string)=>{
    try{return await fetcher(url,{redirect:'manual',headers:{Accept:'application/octet-stream'}})}
    catch{throw Object.assign(new Error('dr_owned_file_download_failed'),{code:'DR_OWNED_FILE_DOWNLOAD_FAILED'})}
  };
  let response=await request(sourceUrl);
  if(response.status>=300&&response.status<400){
    const location=String(response.headers.get('location')||'');
    await response.body?.cancel('dr_owned_file_redirect_consumed').catch(()=>undefined);
    let resolvedLocation='';
    try{resolvedLocation=new URL(location,sourceUrl).toString()}catch{resolvedLocation=''}
    const redirectUrl=source.hostname.toLowerCase()===TRUSTED_BASE44_APP_HOST && response.status===302
      ? trustedBase44FileRedirectUrl(resolvedLocation)
      : null;
    if(!redirectUrl)throw Object.assign(new Error('dr_owned_file_redirect_rejected'),{code:'DR_OWNED_FILE_REDIRECT_REJECTED',status:response.status});
    response=await request(redirectUrl);
    if(response.status>=300&&response.status<400){
      await response.body?.cancel('dr_owned_file_redirect_chain_rejected').catch(()=>undefined);
      throw Object.assign(new Error('dr_owned_file_redirect_chain_rejected'),{code:'DR_OWNED_FILE_REDIRECT_CHAIN_REJECTED',status:response.status});
    }
  }
  if(!response.ok){
    await response.body?.cancel('dr_owned_file_download_failed').catch(()=>undefined);
    throw Object.assign(new Error('dr_owned_file_download_failed'),{code:'DR_OWNED_FILE_DOWNLOAD_FAILED',status:response.status});
  }
  const bytes=await readBoundedDrResponseBytes(response,maxBytes);
  return{bytes,contentType:String(response.headers.get('content-type')||'application/octet-stream')};
}

export function collectOwnedFileReferences(value:any, output=new Set<string>()) {
  if (Array.isArray(value)) { value.forEach((item) => collectOwnedFileReferences(item, output)); return output; }
  if (!value || typeof value !== 'object') return output;
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'string' && /(file_url|offer_file_url|attachment_url|signed_url)$/i.test(key)) {
      const trusted = trustedBase44FileUrl(child);
      if (trusted) output.add(trusted);
    }
    collectOwnedFileReferences(child, output);
  }
  return output;
}

export async function indexRecords(records:any[]) {
  const index:Record<string,string> = {};
  for (const record of records) if (record?.id) index[String(record.id)] = await sha256Hex(stableJson(record));
  return index;
}

export function diffRecords(records:any[], currentIndex:Record<string,string>, previousIndex:Record<string,string>|undefined, type:SnapshotType) {
  if (type === 'FULL' || !previousIndex) return { records, tombstones:[] as string[] };
  const changed = records.filter((record) => record?.id && currentIndex[String(record.id)] !== previousIndex[String(record.id)]);
  const tombstones = Object.keys(previousIndex).filter((id) => !(id in currentIndex));
  return { records:changed, tombstones };
}

export function safeFileName(value:any, fallback='artifact') {
  const clean = String(value || '').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
  return clean || fallback;
}
