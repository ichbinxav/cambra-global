export const DISASTER_RECOVERY_VERSION = 'cambra-dr-1.0.0';
export const DISASTER_RECOVERY_SCHEMA_VERSION = 'cambra-dr-snapshot-v1';
export const DISASTER_RECOVERY_ENVELOPE_VERSION = 'CAMBRA-DR-AES256GCM-1';
export const DR_RPO_TARGET_MINUTES = 24 * 60;
export const DR_RTO_TARGET_MINUTES = 8 * 60;
export const DR_ROOT_FOLDER = 'Production Backups';
export const DR_FOLDERS = Object.freeze(['Daily', 'Weekly', 'Monthly', 'Manifests', 'Restore Evidence'] as const);
export const DR_PAGE_SIZE = 500;
export const DR_GRAPH_CHUNK_BYTES = 10 * 1024 * 1024;

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
const SECRET_KEY = /(^|_)(access_token|refresh_token|client_secret|secret|password|private_key|api_key|credential_ref|authorization_code|bearer_token|session_token)(_|$)/i;
const SAFE_SECRET_METADATA = /(hash|last4|prefix|present|expires_at|expired_at|type|name|id)$/i;
const TRUSTED_BASE44_FILE_HOST = /(^|\.)media\.base44\.com$/i;

export type BackupTier='Daily'|'Weekly'|'Monthly';
export type SnapshotType='FULL'|'INCREMENTAL';

export function stableValue(value:any):any {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
}

export function stableJson(value:any) {
  return JSON.stringify(stableValue(value));
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

async function transformBytes(bytes:Uint8Array, format:'gzip'|'deflate', decompress=false) {
  const stream = decompress ? new DecompressionStream(format) : new CompressionStream(format);
  const writer = stream.writable.getWriter();
  // CompressionStream's writable contract accepts an ArrayBufferView. Keep
  // the byte ownership and the view together: passing the backing ArrayBuffer
  // is not portable when `bytes` is a subarray and can include unrelated data.
  // Start draining before awaiting the write so a large payload cannot stall
  // on CompressionStream backpressure with no active reader.
  const output = new Response(stream.readable).arrayBuffer();
  await writer.write(ownedBytes(bytes));
  await writer.close();
  return new Uint8Array(await output);
}

export const gzipBytes = (bytes:Uint8Array) => transformBytes(bytes, 'gzip', false);
export const gunzipBytes = (bytes:Uint8Array) => transformBytes(bytes, 'gzip', true);

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
  if (Array.isArray(value)) return { value:value.map((item, index) => redactSecrets(item, [...path, String(index)], stats).value), stats };
  if (!value || typeof value !== 'object') return { value, stats };
  const output:any = {};
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY.test(key) && !SAFE_SECRET_METADATA.test(key)) {
      stats.fields++;
      if (stats.paths.length < 100) stats.paths.push([...path, key].join('.'));
      continue;
    }
    output[key] = redactSecrets(child, [...path, key], stats).value;
  }
  return { value:output, stats };
}

export function secretLikePaths(value:any, path:string[] = [], found:string[] = []) {
  if (Array.isArray(value)) { value.forEach((item, index) => secretLikePaths(item, [...path, String(index)], found)); return found; }
  if (!value || typeof value !== 'object') return found;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY.test(key) && !SAFE_SECRET_METADATA.test(key)) found.push([...path, key].join('.'));
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
  try { const parsed = new URL(String(value || '')); return parsed.protocol === 'https:' && TRUSTED_BASE44_FILE_HOST.test(parsed.hostname) ? parsed.toString() : null; }
  catch { return null; }
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
