import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import {
  DR_CANONICAL_SHAREPOINT_DRIVE_ID, DR_CANONICAL_SHAREPOINT_SITE_ID, DR_FOLDERS,
  DR_GRAPH_CHUNK_BYTES,
  assertAttachmentByteLengths, assertIsolatedRestoreTarget, backupTier, classifyCheckpointCatalog, decryptEnvelope, deepRemap,
  diffRecords, encryptEnvelope, fetchTrustedBase44File, gzipBytes, gunzipBytes, indexRecords, jsonValueChunks, mapLimitDrained, parseAes256Key,
  evaluateDisasterRecoveryScheduler, parseDrMaxFileBytes, readBoundedDrResponseBytes, redactSecrets, restoreEvidenceAad,
  persistRestoreAttestationAuthority, secretLikePaths, snapshotType, stableJson, strictMinuteDifference,
  validateLatestCheckpointIdentity, validateRestoreEvidenceAttestation,
  trustedBase44FileRedirectUrl, trustedBase44FileUrl, validateRestoreManifestChain, validateSnapshotManifestIdentity,
} from '../../base44/shared/disasterRecoveryCore.ts';
import {
  MicrosoftGraphError, graphAuthorizationHeaders, isMicrosoftStorageCapabilityUrl, isMicrosoftUploadSessionUrl, listSharePointSiteDrives,
  openSharePointBackupStorage, readDisasterRecoveryPreflightConfiguration,
  readSharePointBackupConfiguration, sanitizeMicrosoftGraphCode,
  verifySharePointBackupStorage,
} from '../../base44/shared/sharePointBackupStorage.ts';
import { DISASTER_RECOVERY_ENTITY_CATALOG } from '../../base44/shared/generated/disasterRecoveryEntityCatalog.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const read=(name)=>fs.readFileSync(path.join(root,name),'utf8');
const env=(values={})=>({get:(key)=>values[key]});
const validRuntimeEnv=(overrides={})=>({
  MS_GRAPH_TENANT_ID:'tenant',MS_GRAPH_CLIENT_ID:'client',MS_GRAPH_CLIENT_SECRET:'secret',
  DR_SHAREPOINT_SITE_ID:DR_CANONICAL_SHAREPOINT_SITE_ID,
  DR_SHAREPOINT_DRIVE_ID:DR_CANONICAL_SHAREPOINT_DRIVE_ID,
  DR_SHAREPOINT_DRIVE_NAME:'CAMBRA INFRASTRUCTURE',
  DR_SHAREPOINT_ROOT_FOLDER:'Production Backups',
  DR_BACKUP_AES256_KEY_B64:Buffer.alloc(32,9).toString('base64'),
  CAMBRA_RELEASE_VERSION:'0.98.0',
  CAMBRA_GIT_SHA:'a'.repeat(40),CAMBRA_SOURCE_TREE_HASH:'b'.repeat(64),
  ...overrides,
});
const testCatalog=['Brand','OAuthState'];
const artifact=(backupId,kind)=>({path:kind==='snapshot'?`Daily/${backupId}/snapshot.json.gz.aes256gcm`:`Manifests/${backupId}.index.json.gz.aes256gcm`,aad:`${backupId}|${kind}`,encrypted_sha256:'1'.repeat(64),payload_sha256:'2'.repeat(64),compression:'gzip',encryption:'AES-256-GCM'});
const manifestFixture=(overrides={})=>{
  const backupId=overrides.backup_id||'backup-full';
  const checkpoint=overrides.checkpoint_to||'2026-08-21T10:00:00.000Z';
  const manifestPath=`Manifests/${backupId}.manifest.json`;
  return {
    schema_version:'cambra-dr-snapshot-v1',dr_version:'cambra-dr-1.2.0',manifest_path:manifestPath,
    manifest_hash:'f'.repeat(64),backup_id:backupId,snapshot_type:'FULL',retention_tier:'Daily',
    source_environment:'prod',source_app_id:'6a16288b833b3c26d7ac1fab',release_version:'0.98.0',
    git_sha:'a'.repeat(40),source_tree_hash:'b'.repeat(64),source_tree_hash_algorithm:'sha256-tree-v1',
    entity_catalog_version:'test-catalog-v1',entity_catalog_count:testCatalog.length,
    checkpoint_from:null,checkpoint_to:checkpoint,previous_manifest_path:null,base_full_manifest_path:manifestPath,
    created_at:checkpoint,backup_root_path:`Daily/${backupId}`,snapshot:artifact(backupId,'snapshot'),index:artifact(backupId,'index'),
    storage_identity:{site_id:DR_CANONICAL_SHAREPOINT_SITE_ID,drive_id:DR_CANONICAL_SHAREPOINT_DRIVE_ID,root_folder:'Production Backups'},
    entity_counts:{Brand:{source:1,included:1,tombstones:0,excluded:false,restorable:true,redacted_fields:0},OAuthState:{source:0,included:0,tombstones:0,excluded:true,restorable:false,redacted_fields:0}},
    entity_totals:{source:1,included:1,tombstones:0,redacted_fields:0,excluded_entities:['OAuthState']},
    attachments:{count:0,original_bytes:0,encrypted_bytes:0,attachment_verification:'digested_after_fetch_only'},attachment_items:[],
    ...overrides,
  };
};
const payloadFixture=(manifest,overrides={})=>({
  schema_version:manifest.schema_version,dr_version:manifest.dr_version,backup_id:manifest.backup_id,
  snapshot_type:manifest.snapshot_type,retention_tier:manifest.retention_tier,
  source_environment:manifest.source_environment,source_app_id:manifest.source_app_id,
  release_version:manifest.release_version,git_sha:manifest.git_sha,source_tree_hash:manifest.source_tree_hash,source_tree_hash_algorithm:manifest.source_tree_hash_algorithm,
  checkpoint_from:manifest.checkpoint_from,checkpoint_to:manifest.checkpoint_to,created_at:manifest.created_at,
  entity_counts:manifest.entity_counts,entity_totals:manifest.entity_totals,
  entities:{Brand:{records:[{id:'brand-1'}],tombstones:[]}},attachments:[],attachments_summary:manifest.attachments,
  security:{raw_secrets_included:false},...overrides,
});

describe('CAMBRA disaster recovery hard gate',()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it('round-trips gzip bytes for empty, large and non-owned subarray inputs on Node 24',async()=>{
    const backing=new Uint8Array([91,92,10,20,30,40,93,94]);
    const large=new Uint8Array(2*1024*1024+17);
    for(let index=0;index<large.length;index++)large[index]=(index*31+17)%256;
    for(const source of [new Uint8Array(),large,backing.subarray(2,6)]){
      const compressed=await gzipBytes(source);
      const opened=await gunzipBytes(compressed);
      expect(Buffer.from(opened).equals(Buffer.from(source))).toBe(true);
    }
    const compressedBomb=await gzipBytes(new Uint8Array(4096));
    await expect(gunzipBytes(compressedBomb,1024)).rejects.toMatchObject({
      code:'DR_OWNED_FILE_TOO_LARGE',max:1024,
    });
    await expect(gzipBytes(new Uint8Array(4096),16)).rejects.toMatchObject({
      code:'DR_OWNED_FILE_TOO_LARGE',max:16,
    });
  });

  it('drains bounded workers before surfacing a deterministic chunk failure',async()=>{
    const completed=[],failure=Object.assign(new Error('chunk failed'),{code:'DR_TEST_CHUNK_FAILED'});
    let active=0,maxActive=0;
    await expect(mapLimitDrained([0,1,2,3],2,async(value)=>{
      active++;maxActive=Math.max(maxActive,active);
      try{
        await new Promise((resolve)=>setTimeout(resolve,value===0?15:5));
        if(value===1)throw failure;
        completed.push(value);
        return value;
      }finally{active--}
    })).rejects.toBe(failure);
    expect(completed.sort((left,right)=>left-right)).toEqual([0,2,3]);
    expect(maxActive).toBe(2);
  });

  it('streams the same JSON bytes as native serialization',()=>{
    const value={unicode:'CAMBRA 🌍',escaped:'line\nquote"',date:new Date('2026-08-26T00:00:00.000Z'),numbers:[0,-0,1.5,NaN,Infinity],array:[1,undefined,,3],nested:{keep:true,drop:undefined}};
    expect([...jsonValueChunks(value)].join('')).toBe(JSON.stringify(value));
    expect(()=>[...jsonValueChunks({value:1n})]).toThrow(TypeError);
    const circular={};circular.self=circular;
    expect(()=>[...jsonValueChunks(circular)]).toThrow(TypeError);
  });

  it('round-trips gzip + AES-256-GCM and rejects tampering/AAD drift',async()=>{
    const key=parseAes256Key(Buffer.alloc(32,7).toString('base64'));
    const source=new TextEncoder().encode(stableJson({merchant:'controlled',rows:[1,2,3]}));
    const compressed=await gzipBytes(source),encrypted=await encryptEnvelope(compressed,key,'backup-1|snapshot');
    const opened=await decryptEnvelope(encrypted,key,'backup-1|snapshot'),plain=await gunzipBytes(opened.bytes);
    expect(new TextDecoder().decode(plain)).toBe(new TextDecoder().decode(source));
    await expect(decryptEnvelope(encrypted,key,'different-aad')).rejects.toMatchObject({code:'DR_ENVELOPE_AAD_MISMATCH'});
    const tampered=encrypted.slice();tampered[tampered.length-1]^=1;
    await expect(decryptEnvelope(tampered,key,'backup-1|snapshot')).rejects.toMatchObject({code:'DR_ENVELOPE_AUTHENTICATION_FAILED'});
  });

  it('removes raw credentials recursively while retaining non-secret proof metadata',()=>{
    const input={access_token:'raw',refresh_token:'raw2',client_secret:'raw3',claim_token:'raw4',controlToken:'raw5',attempt_token:'raw6',fenceToken:'raw7',clientSecret:'raw8',accessToken:'raw9',acceptance_commit_token:'raw10',acceptanceCommitToken:'raw11',acceptance_token:'raw12',acceptanceToken:'raw13',metadata_json:{nested:{api_key:'raw14',token_hash:'safe-hash',secret_present:true,clientSecretHash:'safe-client-hash'}},key_hash:'safe',access_token_expires_at:'2026-09-01T00:00:00Z'};
    const result=redactSecrets(input,['Integration']);
    expect(result.stats.fields).toBe(14);
    expect(result.value).toEqual({metadata_json:{nested:{token_hash:'safe-hash',secret_present:true,clientSecretHash:'safe-client-hash'}},key_hash:'safe',access_token_expires_at:'2026-09-01T00:00:00Z'});
    expect(secretLikePaths(result.value)).toEqual([]);
    expect(secretLikePaths({claim_token:'x',controlToken:'x',attemptToken:'x',fence_token:'x',commitToken:'x',acceptance_commit_token:'x',acceptance_token:'x',acceptanceToken:'x',clientSecret:'x',accessToken:'x'})).toHaveLength(10);
  });

  it('redacts normalized vendor keys and high-confidence credentials embedded in strings',()=>{
    const jwt=['eyJabcdefghijk','eyJabcdefghijklmnop','abcdefghijklmnop'].join('.');
    const pemBegin=['-----BEGIN ','PRIVATE KEY-----'].join('');
    const pemEnd=['-----END ','PRIVATE KEY-----'].join('');
    const pem=[pemBegin,'raw-private-material',pemEnd].join('\n');
    const anthropic=['sk','ant','abcdefghijklmnopqrst'].join('-');
    const resend=['re','abcdefghijklmnopqrstuvwxyz'].join('_');
    const perplexity=['pplx','abcdefghijklmnopqrstuvwxyz'].join('-');
    const uriPassword='backup_password';
    const uri=['postgres://backup_user',`${uriPassword}@example.invalid/cambra`].join(':');
    const assignedBearer=['assigned','bearer','credential'].join('-');
    const input={
      APIKey:'raw-uppercase-api-key',APIToken:'raw-uppercase-api-token',OAuthToken:'raw-uppercase-oauth-token',
      apiKey:'raw-api-key',apiToken:'raw-api-token',oauthToken:'raw-oauth-token',
      githubToken:'raw-github-token',resendApiKey:'raw-resend-key',stripeWebhookSecret:'raw-webhook',
      anthropicCredentials:'raw-vendor-credentials',
      authorization:'Bearer raw-authorization',safe:{apiKeyHash:'safe-hash',APIKeyHash:'safe-uppercase-hash',oauthTokenLast4:'1234'},
      bracketEnv:"process.env['ANTHROPIC_API_KEY'] = 'bracket-secret-value'",
      denoEnv:"Deno.env.set(\"OPENAI_API_KEY\", \"deno-secret-value\")",
      assignments:`apiToken = short-secret; oauth_token: another-secret; Authorization = Bearer ${assignedBearer}; APIKey = uppercase-assignment-secret`,
      vendors:[anthropic,resend,perplexity].join(' '),
      uri,
      pem,jwt,header:'Bearer abcdefghijklmnopqrstuvwxyz',
    };
    expect(secretLikePaths(input)).toEqual(expect.arrayContaining([
      'APIKey','APIToken','OAuthToken','apiKey','apiToken','oauthToken','githubToken','resendApiKey','stripeWebhookSecret','anthropicCredentials',
      'authorization','bracketEnv','denoEnv','assignments','vendors','uri','pem','jwt','header',
    ]));
    const result=redactSecrets(input,['Entity']);
    const serialized=JSON.stringify(result.value);
    for(const raw of ['raw-uppercase-api-key','raw-uppercase-api-token','raw-uppercase-oauth-token','raw-api-key','raw-api-token','raw-oauth-token','raw-github-token','raw-resend-key','raw-webhook','raw-vendor-credentials','raw-authorization','bracket-secret-value','deno-secret-value','short-secret','another-secret',assignedBearer,'uppercase-assignment-secret',anthropic,resend,perplexity,uriPassword,'raw-private-material',jwt]){
      expect(serialized).not.toContain(raw);
    }
    expect(result.value.safe).toEqual({apiKeyHash:'safe-hash',APIKeyHash:'safe-uppercase-hash',oauthTokenLast4:'1234'});
    expect(serialized).toContain('[redacted-secret]');
    expect(secretLikePaths(result.value)).toEqual([]);
    expect(result.stats.fields).toBeGreaterThanOrEqual(15);
    const brokenPem=[pemBegin,'unclosed'].join('\n');
    expect(secretLikePaths({brokenPem})).toEqual(['brokenPem']);
    const brokenPemRedaction=redactSecrets({note:brokenPem}).value;
    expect(brokenPemRedaction.note).toBe('[redacted-secret]');
    expect(secretLikePaths(brokenPemRedaction)).toEqual([]);
  });

  it('fails timestamp measurements closed for invalid, future and reversed values',()=>{
    const now=Date.parse('2026-08-21T12:00:00.000Z');
    expect(strictMinuteDifference('2026-08-21T11:30:00.000Z','2026-08-21T11:00:00.000Z',now)).toBe(30);
    expect(()=>strictMinuteDifference('invalid','2026-08-21T11:00:00.000Z',now)).toThrowError(/dr_timestamp_invalid/);
    expect(()=>strictMinuteDifference('2026-08-21T12:01:00.000Z','2026-08-21T11:00:00.000Z',now)).toThrowError(/dr_timestamp_future/);
    expect(()=>strictMinuteDifference('2026-08-21T10:00:00.000Z','2026-08-21T11:00:00.000Z',now)).toThrowError(/dr_timestamp_order_invalid/);
  });

  it('validates restore-chain continuity, catalog completeness and payload summaries',()=>{
    const full=manifestFixture();
    const incremental=manifestFixture({
      backup_id:'backup-incremental',snapshot_type:'INCREMENTAL',checkpoint_from:full.checkpoint_to,
      checkpoint_to:'2026-08-21T11:00:00.000Z',created_at:'2026-08-21T11:00:00.000Z',
      previous_manifest_path:full.manifest_path,base_full_manifest_path:full.manifest_path,
    });
    const options={source_app_id:'6a16288b833b3c26d7ac1fab',source_environment:'prod',entity_catalog_version:'test-catalog-v1',entity_catalog_count:2,entity_catalog:testCatalog,excluded_entities:['OAuthState'],now_ms:Date.parse('2026-08-21T12:00:00.000Z')};
    expect(validateRestoreManifestChain([full,incremental],options)).toHaveLength(2);
    expect(validateSnapshotManifestIdentity(full,payloadFixture(full),{entity_catalog:testCatalog})).toMatchObject({backup_id:'backup-full'});
    expect(()=>validateRestoreManifestChain([full,{...incremental,checkpoint_from:'2026-08-21T10:30:00.000Z'}],options)).toThrowError(/continuity/);
    expect(()=>validateRestoreManifestChain([{...full,entity_counts:{Brand:full.entity_counts.Brand}}],options)).toThrowError(/catalog/);
    expect(()=>validateSnapshotManifestIdentity(full,payloadFixture(full,{entities:{}}),{entity_catalog:testCatalog})).toThrowError(/membership/);
    expect(()=>validateSnapshotManifestIdentity(full,payloadFixture(full,{entities:{Brand:{records:[{id:'brand-1'}],tombstones:[]},Extra:{records:[],tombstones:[]}}}),{entity_catalog:testCatalog})).toThrowError(/membership/);
    expect(()=>validateSnapshotManifestIdentity({...full,attachments:{...full.attachments,count:1}},payloadFixture(full),{entity_catalog:testCatalog})).toThrowError(/summary/);
    expect(()=>validateSnapshotManifestIdentity({...full,release_version:'forged'},payloadFixture(full),{entity_catalog:testCatalog})).toThrowError(/release_version_mismatch/);
    expect(()=>validateSnapshotManifestIdentity(full,payloadFixture(full,{entity_totals:{...full.entity_totals,source:99}}),{entity_catalog:testCatalog})).toThrowError(/authenticated_summary/);
    const incompleteFull=manifestFixture({
      entity_counts:{...full.entity_counts,Brand:{...full.entity_counts.Brand,source:2,included:1}},
      entity_totals:{...full.entity_totals,source:2,included:1},
    });
    expect(()=>validateSnapshotManifestIdentity(incompleteFull,payloadFixture(incompleteFull),{entity_catalog:testCatalog})).toThrowError(/full_semantics/);
    const excludedSourceFull=manifestFixture({
      entity_counts:{...full.entity_counts,OAuthState:{...full.entity_counts.OAuthState,source:99}},
      entity_totals:{...full.entity_totals,source:100},
    });
    expect(()=>validateRestoreManifestChain([excludedSourceFull],options)).toThrowError(/full_semantics/);
    expect(()=>validateSnapshotManifestIdentity(excludedSourceFull,payloadFixture(excludedSourceFull),{entity_catalog:testCatalog})).toThrowError(/full_semantics/);
    const duplicateFull=manifestFixture({
      entity_counts:{...full.entity_counts,Brand:{...full.entity_counts.Brand,source:2,included:2}},
      entity_totals:{...full.entity_totals,source:2,included:2},
    });
    expect(()=>validateSnapshotManifestIdentity(duplicateFull,payloadFixture(duplicateFull,{entities:{Brand:{records:[{id:'duplicate'},{id:'duplicate'}],tombstones:[]}}}),{entity_catalog:testCatalog})).toThrowError(/record_identity/);
    const attachmentManifestBase=manifestFixture({attachments:{count:2,original_bytes:2,encrypted_bytes:4,attachment_verification:'digested_after_fetch_only'}});
    const attachment=(ordinal,source='https://media.base44.com/file.bin')=>({source_ref:source,source_ref_sha256:'3'.repeat(64),file_name:'file.bin',content_type:'application/octet-stream',storage_path:`Daily/${attachmentManifestBase.backup_id}/attachments/${ordinal}-file.bin.gz.aes256gcm`,aad:`${attachmentManifestBase.backup_id}|attachment|${ordinal}`,original_bytes:1,compressed_bytes:1,encrypted_bytes:2,plaintext_sha256:'4'.repeat(64),encrypted_sha256:'5'.repeat(64)});
    const duplicateAttachments=[attachment('00001'),attachment('00002')],attachmentManifest={...attachmentManifestBase,attachment_items:duplicateAttachments};
    expect(()=>validateSnapshotManifestIdentity(attachmentManifest,payloadFixture(attachmentManifest,{attachments:duplicateAttachments}),{entity_catalog:testCatalog})).toThrowError(/attachment_identity/);
    expect(()=>validateRestoreManifestChain([full,{...incremental,backup_id:full.backup_id,manifest_path:full.manifest_path}],options)).toThrowError(/duplicate/);
    const checkpoint={schema_version:full.schema_version,catalog_version:full.entity_catalog_version,backup_id:full.backup_id,checkpoint_to:full.checkpoint_to,entities:{Brand:{records:{'brand-1':'a'.repeat(64)}}}};
    expect(validateLatestCheckpointIdentity(full,checkpoint)).toMatchObject({backup_id:full.backup_id});
    expect(()=>validateLatestCheckpointIdentity(full,{...checkpoint,backup_id:'wrong'})).toThrowError(/identity_mismatch/);
    expect(()=>validateLatestCheckpointIdentity(full,{...checkpoint,entities:{}})).toThrowError(/catalog_mismatch/);
    expect(assertAttachmentByteLengths({encrypted_bytes:30,compressed_bytes:20,original_bytes:10},{encrypted:30,compressed:20,original:10})).toBe(true);
    for(const lengths of [{encrypted:29,compressed:20,original:10},{encrypted:30,compressed:19,original:10},{encrypted:30,compressed:20,original:9}]){
      expect(()=>assertAttachmentByteLengths({encrypted_bytes:30,compressed_bytes:20,original_bytes:10},lengths)).toThrowError(/dr_attachment_size_mismatch/);
    }
  });

  it('accepts an internally valid older catalog only as a full-backup rebase anchor',()=>{
    const current=manifestFixture();
    expect(classifyCheckpointCatalog(current,'test-catalog-v1',testCatalog)).toMatchObject({
      status:'CURRENT',current:true,requires_full_rebase:false,
      checkpoint_catalog_count:2,current_catalog_count:2,
    });
    const legacy=manifestFixture({
      entity_catalog_version:'test-catalog-v0',
      entity_catalog_count:1,
      entity_counts:{Brand:current.entity_counts.Brand},
    });
    expect(classifyCheckpointCatalog(legacy,'test-catalog-v1',testCatalog)).toMatchObject({
      status:'LEGACY_COMPATIBLE',current:false,requires_full_rebase:true,
      checkpoint_catalog_version:'test-catalog-v0',checkpoint_catalog_count:1,
      current_catalog_version:'test-catalog-v1',current_catalog_count:2,
    });
    expect(()=>classifyCheckpointCatalog({...legacy,entity_catalog_count:2},'test-catalog-v1',testCatalog)).toThrowError(/catalog_identity_invalid/);
  });

  it('accepts only complete authenticated restore evidence with real targets and finite ordered metrics',()=>{
    const selected=manifestFixture(),completed='2026-08-21T10:20:00.000Z',target='dev';
    const evidence={
      schema_version:'cambra-dr-restore-evidence-v1',dr_version:'cambra-dr-1.2.0',evidence_hash:'e'.repeat(64),
      exercise_key:`real-restore:${selected.backup_id}:${target}:${completed}`,status:'PASS',
      source_environment:'prod',source_app_id:selected.source_app_id,source_release_version:selected.release_version,
      source_git_sha:selected.git_sha,source_tree_hash:selected.source_tree_hash,source_tree_hash_algorithm:selected.source_tree_hash_algorithm,
      target_environment:target,target_isolated:true,target_production:false,restored_target_ref:`base44:${selected.source_app_id}:data-env:${target}`,
      manifest_path:selected.manifest_path,manifest_hash:selected.manifest_hash,backup_id:selected.backup_id,backup_checkpoint_at:selected.checkpoint_to,
      snapshot_encrypted_sha256:selected.snapshot.encrypted_sha256,snapshot_payload_sha256:selected.snapshot.payload_sha256,
      chain:[{backup_id:selected.backup_id,manifest_path:selected.manifest_path,manifest_hash:selected.manifest_hash,snapshot_type:'FULL',checkpoint_from:null,checkpoint_to:selected.checkpoint_to}],
      started_at:'2026-08-21T10:10:00.000Z',completed_at:completed,rpo_target_minutes:1440,rpo_observed_minutes:10,rto_target_minutes:480,rto_observed_minutes:10,
      integrity:{pass:true},wiped_counts:{Brand:0},created_counts:{Brand:1},user_identity_reconciliation:{source:0,matched:0,missing:0},
      attachments:{count:0,pass:true,items:[]},security:{backup_encryption_verified:true,ciphertext_hashes_verified:true,evidence_authentication:'AES-256-GCM'},conducted_by:'operator@example.test',
    };
    const input={source_app_id:selected.source_app_id,now_ms:Date.parse('2026-08-21T12:00:00.000Z')};
    expect(validateRestoreEvidenceAttestation(evidence,selected,[selected],input)).toMatchObject({target:'dev',rpo_minutes:10,rto_minutes:10});
    expect(restoreEvidenceAad(evidence)).toBe(`cambra-dr-1.2.0|restore-evidence|${evidence.exercise_key}|${selected.manifest_hash}`);
    for(const bad of [
      {...evidence,rpo_observed_minutes:null},
      {...evidence,rpo_observed_minutes:Number.NaN},
      {...evidence,rpo_observed_minutes:-1},
      {...evidence,completed_at:'2026-08-21T12:01:00.000Z'},
      {...evidence,started_at:'2026-08-21T09:59:00.000Z'},
      {...evidence,target_environment:'prod',restored_target_ref:`base44:${selected.source_app_id}:data-env:prod`},
    ])expect(()=>validateRestoreEvidenceAttestation(bad,selected,[selected],input)).toThrow();
  });

  it('read-backs unique latest probe/gate authority and compensates gate-first on every failure',async()=>{
    const operations=(fail='')=>{
      const events=[],failed=new Set(),probeRows=[],gateRows=[],exerciseRows=[{id:'exercise',exercise_key:'exercise-key',status:'BLOCKED'}],markers=[],targets=new Set(String(fail).split(',').filter(Boolean));
      const shouldFail=(name)=>targets.has(name)&&!failed.has(name)&&(failed.add(name),true);
      const step=async(name,value)=>{events.push(name);if(shouldFail(name))throw new Error(`fail:${name}`);return value};
      const row=(id,gate_key,status,observed_at)=>({id,evidence_key:`${gate_key}:${id}`,gate_key,status,identity_status:'COMPLETE',evidence_hash:`hash:${id}`,observed_at});
      const latest=(rows)=>[...rows].sort((a,b)=>Date.parse(b.observed_at)-Date.parse(a.observed_at)).slice(0,2);
      const get=(rows,id)=>rows.find((item)=>item.id===id)||null;
      return {events,probeRows,gateRows,exerciseRows,markers,ops:{
        record_probe:async()=>{const value=await step('record_probe',row('probe-pass','REAL_RESTORE_ATTESTATION_PROBE','PASS','2026-08-21T10:00:00.000Z'));probeRows.push(value);return value},
        read_probe:async(value)=>{const readback=await step('read_probe',get(probeRows,value.id));return shouldFail('probe_projection_conflict')?{...readback,source:'tampered'}:readback},
        read_latest_probe:async()=>{events.push('read_latest_probe');if(shouldFail('read_latest_probe'))throw new Error('fail:read_latest_probe');const rows=latest(probeRows);return shouldFail('probe_latest_conflict')?[row('probe-conflict','REAL_RESTORE_ATTESTATION_PROBE',rows[0]?.status||'PASS',rows[0]?.observed_at||'2026-08-21T10:00:00.000Z'),...rows].slice(0,2):rows},
        verify_probe:()=>{events.push('verify_probe');return {ok:!shouldFail('verify_probe')}},
        block_probe:async()=>{const value=await step('block_probe',row(`probe-block-${probeRows.length}`,'REAL_RESTORE_ATTESTATION_PROBE','BLOCKED','2026-08-21T10:00:00.001Z'));probeRows.push(value);return value},
        verify_blocked_probe:()=>{events.push('verify_blocked_probe');return {ok:!shouldFail('verify_blocked_probe')}},
        promote_exercise:async()=>{const value=await step('promote_exercise',{id:'exercise',exercise_key:'exercise-key',status:'PASS'});exerciseRows[0]=value;return value},
        read_exercise:(value)=>step('read_exercise',get(exerciseRows,value.id)),
        read_latest_exercise:async()=>{events.push('read_latest_exercise');if(shouldFail('read_latest_exercise'))throw new Error('fail:read_latest_exercise');const rows=[...exerciseRows];return shouldFail('exercise_latest_conflict')?[{id:'exercise-racer',exercise_key:'exercise-key',status:rows[0]?.status||'PASS'},...rows].slice(0,2):rows},
        readback_valid:(value)=>{events.push('readback_valid');return value?.status==='PASS'&&!shouldFail('readback_valid')},
        record_gate:async()=>{const value=await step('record_gate',row('gate-pass','REAL_RESTORE','PASS','2026-08-21T10:00:01.000Z'));gateRows.push(value);return value},
        read_gate:async(value)=>{const readback=await step('read_gate',get(gateRows,value.id));return shouldFail('gate_projection_conflict')?{...readback,source:'tampered'}:readback},
        read_latest_gate:async()=>{events.push('read_latest_gate');if(shouldFail('read_latest_gate'))throw new Error('fail:read_latest_gate');const rows=latest(gateRows);return shouldFail('gate_latest_conflict')?[row('gate-conflict','REAL_RESTORE',rows[0]?.status||'PASS',rows[0]?.observed_at||'2026-08-21T10:00:01.000Z'),...rows].slice(0,2):rows},
        verify_gate:()=>{events.push('verify_gate');return {ok:!shouldFail('verify_gate')}},
        block_gate:async()=>{const value=await step('block_gate',row(`gate-block-${gateRows.length}`,'REAL_RESTORE','BLOCKED','2026-08-21T10:00:01.001Z'));gateRows.push(value);return value},
        verify_blocked_gate:()=>{events.push('verify_blocked_gate');return {ok:!shouldFail('verify_blocked_gate')}},
        block_exercise:async()=>{const value=await step('block_exercise',{id:'exercise',exercise_key:'exercise-key',status:'BLOCKED'});exerciseRows[0]=value;return value},
        blocked_exercise_valid:(value)=>{events.push('blocked_exercise_valid');return value?.status==='BLOCKED'&&!shouldFail('blocked_exercise_valid')},
        persist_compensation_ambiguity:async()=>{const value=await step('persist_compensation_ambiguity',{id:'incident',status:'open'});markers.push(value);return value},
        compensation_failed:(stage)=>events.push(`compensation_failed:${stage}`),
      }};
    };
    const success=operations();
    await expect(persistRestoreAttestationAuthority(success.ops)).resolves.toMatchObject({exercise:{status:'PASS'},gate:{status:'PASS'},probe_closure:{status:'BLOCKED'}});
    expect(success.events).toEqual(['record_probe','read_probe','read_latest_probe','verify_probe','block_probe','read_probe','read_latest_probe','verify_blocked_probe','promote_exercise','read_exercise','read_latest_exercise','readback_valid','readback_valid','record_gate','read_gate','read_latest_gate','verify_gate']);
    for(const stage of ['promote_exercise','read_exercise','read_latest_exercise','exercise_latest_conflict','readback_valid','record_gate','read_gate','gate_projection_conflict','read_latest_gate','gate_latest_conflict','verify_gate']){
      const run=operations(stage);
      await expect(persistRestoreAttestationAuthority(run.ops)).rejects.toMatchObject({code:'DR_RESTORE_RUNTIME_GATE_BLOCKED'});
      const gateBlock=run.events.indexOf('block_gate'),exerciseBlock=run.events.indexOf('block_exercise');
      expect(gateBlock).toBeGreaterThan(-1);expect(exerciseBlock).toBeGreaterThan(gateBlock);
      expect(run.events.slice(gateBlock,exerciseBlock)).toEqual(expect.arrayContaining(['read_gate','read_latest_gate','verify_blocked_gate']));
      expect(run.events.slice(exerciseBlock)).toEqual(expect.arrayContaining(['read_exercise','read_latest_exercise','blocked_exercise_valid']));
    }
    for(const stage of ['record_probe','read_probe','probe_projection_conflict','read_latest_probe','probe_latest_conflict','verify_probe']){
      const run=operations(stage);
      await expect(persistRestoreAttestationAuthority(run.ops)).rejects.toMatchObject({code:'DR_RESTORE_RUNTIME_GATE_BLOCKED'});
      expect(run.events).toContain('block_probe');
      expect(run.events).not.toContain('promote_exercise');
    }
    const duplicateExercise=operations('exercise_latest_conflict');
    await expect(persistRestoreAttestationAuthority(duplicateExercise.ops)).rejects.toMatchObject({code:'DR_RESTORE_RUNTIME_GATE_BLOCKED'});
    expect(duplicateExercise.events).not.toContain('record_gate');
    expect(duplicateExercise.gateRows.at(-1)?.status).toBe('BLOCKED');
    const ambiguous=operations('verify_gate,block_gate');
    await expect(persistRestoreAttestationAuthority(ambiguous.ops)).rejects.toMatchObject({code:'DR_RESTORE_COMPENSATION_AMBIGUOUS',compensation_failures:[{stage:'gate'}]});
    expect(ambiguous.events).toContain('persist_compensation_ambiguity');
    expect(ambiguous.events).not.toContain('block_exercise');
    expect(ambiguous.exerciseRows[0].status).toBe('PASS');
    expect(ambiguous.gateRows.at(-1).status).toBe('PASS');
    expect(ambiguous.markers).toHaveLength(1);
    const markerUnavailable=operations('verify_gate,block_gate,persist_compensation_ambiguity');
    await expect(persistRestoreAttestationAuthority(markerUnavailable.ops)).rejects.toMatchObject({
      code:'DR_RESTORE_COMPENSATION_AMBIGUOUS',
      compensation_failures:[{stage:'gate'},{stage:'gate_ambiguity_marker'}],
    });
    expect(markerUnavailable.events).not.toContain('block_exercise');
    expect(markerUnavailable.exerciseRows[0].status).toBe('PASS');
    expect(markerUnavailable.markers).toHaveLength(0);
  });

  it('builds full and incremental change journals including tombstones',async()=>{
    const old=[{id:'a',value:1},{id:'b',value:2}],current=[{id:'a',value:3},{id:'c',value:4}];
    const oldIndex=await indexRecords(old),currentIndex=await indexRecords(current);
    expect(diffRecords(current,currentIndex,oldIndex,'INCREMENTAL')).toEqual({records:current,tombstones:['b']});
    expect(diffRecords(current,currentIndex,oldIndex,'FULL')).toEqual({records:current,tombstones:[]});
  });

  it('forces a full snapshot for first, weekly and monthly runs',()=>{
    expect(backupTier(new Date('2026-08-01T01:00:00Z'))).toBe('Monthly');
    expect(backupTier(new Date('2026-08-02T01:00:00Z'))).toBe('Weekly');
    expect(snapshotType('AUTO','Daily',false)).toBe('FULL');
    expect(snapshotType('AUTO','Weekly',true)).toBe('FULL');
    expect(snapshotType('AUTO','Daily',true)).toBe('INCREMENTAL');
    const runtime=read('base44/shared/disasterRecoveryRuntime.ts');
    expect(runtime).toContain("checkpoint_from:type==='FULL'?null:anchor.checkpoint_to");
    expect(runtime).toContain("previousManifestPath=operation.snapshot_type==='FULL'?null");
  });

  it('stages the complete catalog through durable bounded resumable invocations before sealing one snapshot',()=>{
    const runtime=read('base44/shared/disasterRecoveryRuntime.ts');
    expect(runtime).toContain('const BACKUP_ENTITY_BATCH_SIZE=24');
    expect(runtime).toContain('const BACKUP_STAGE_READ_CONCURRENCY=1');
    expect(runtime).toContain('const BACKUP_STAGE_CHUNKS_PER_INVOCATION=3');
    expect(runtime).toContain("const BACKUP_OPERATION_PATH='Manifests/pending.backup.json.gz.aes256gcm'");
    expect(runtime).toContain('async function readBackupOperation(storage:any,key:Uint8Array)');
    expect(runtime).toContain('async function writeBackupOperation(storage:any,key:Uint8Array,operation:any,expected:any=null)');
    expect(runtime).toContain("status:nextIndex===operation.total_chunks?'PENDING_FINALIZE':'STAGING'");
    expect(runtime).toContain("if(!operation&&!allowStart)return{ok:true,completed:false,status:'IDLE'");
    expect(runtime).not.toContain('BACKUP_STAGE_INVOKE_CONCURRENCY');
    expect(runtime).toContain('mapLimitDrained(pairs,BACKUP_STAGE_READ_CONCURRENCY');
    expect(runtime).toContain("hash=createHash('sha256')");
    expect(runtime).toContain("stream=new CompressionStream('gzip')");
    expect(runtime).toContain('for(const chunk of jsonValueChunks(value))');
    expect(runtime).not.toContain('encoder.encode(JSON.stringify(value))');
    expect(runtime.indexOf('const indexArtifact=await')).toBeLessThan(runtime.indexOf('const snapshotArtifact=await'));
    expect(runtime).toContain('for(const row of entityResults)row.index={}');
    expect(runtime).toContain('entityResults.length=0;allFiles.clear()');
    expect(runtime).toContain('attachment_items:attachments');
    expect(runtime).toContain("await verifyPublishedJsonArtifact(storage,manifest.snapshot,key,'snapshot')");
    expect(runtime).toContain("await verifyPublishedJsonArtifact(storage,latest.manifest.snapshot,key,'latest_snapshot')");
    expect(runtime).toContain('latest_checkpoint:latestCheckpoint');
    expect(runtime).not.toContain("source:'dr_status_scheduler',limit:20");
    expect(runtime).toContain("invokeInternal(base44,'getMaintenanceCenter',{action:'dr_backup_chunk'");
    expect(runtime).toContain("code:'DR_BACKUP_CHUNK_RESPONSE_INVALID'");
    expect(runtime).toContain("reason:'artifact_contract_mismatch'");
    expect(runtime).toContain("event:'disaster_recovery_backup_chunk_completed'");
    expect(runtime).toContain("headers.delete('Base44-Functions-Version')");
    expect(runtime).toContain('executeBackup(req,createLatestFunctionsClient(req),service,body,actor)');
    expect(runtime).toContain('export async function handleDisasterRecoveryBackupChunk(req:Request)');
    const maintenanceRead=read('base44/functions/getMaintenanceCenter/entry.ts');
    expect(maintenanceRead).toContain("routed.action === 'dr_backup_chunk'");
    expect(maintenanceRead).toContain('if (!chunkGate.isInternal)');
    expect(maintenanceRead).toContain('return handleDisasterRecoveryBackupChunk(req)');
    expect(runtime).toContain("if(!gate.isInternal)throw Object.assign(new Error('dr_backup_chunk_internal_authority_required')");
    expect(runtime).toContain("stage_version:BACKUP_STAGE_VERSION");
    expect(runtime).toContain('loadBackupStage(storage,key,artifact,coordinates)');
    expect(runtime).toContain("exactTextArray(rows.map((row:any)=>row.entity_name),DISASTER_RECOVERY_ENTITY_CATALOG)");
    expect(runtime).toContain('await cleanupBackupStage(storage,operation.retention_tier,operation.backup_id)');
    expect(runtime).toContain("await sha256Hex(bytes)!==artifact.encrypted_sha256");
    expect(runtime).toContain("await sha256Hex(plain)!==artifact.payload_sha256");
    expect(runtime).toContain('fetchTrustedBase44File(url,drMaxFileBytes())');
    expect(runtime).toContain("if(await storage.downloadIfExists(`Manifests/${canonicalId}.manifest.json`))return{deleted:false,manifested:true");
    expect(runtime).toContain("input.confirmation!=='DELETE_UNMANIFESTED_BACKUP'");
    expect(runtime).toContain('removeUnmanifestedBackup(storage,operation.retention_tier,operation.backup_id,key)');
    expect(runtime).toContain('await publishLatestPointers(storage,key,operation,published)');
    expect(runtime).toContain('await deleteBackupOperation(storage,key,operation)');
    expect(runtime).toContain("remote={ok:true,read_only:true,identity:storage.identity");
  });

  it('hard-rejects restore outside an explicit isolated Base44 data environment',()=>{
    const dev=new Request('https://example.test',{headers:{'X-Data-Env':'dev'}});
    expect(assertIsolatedRestoreTarget(dev,'RESTORE_TO_ISOLATED_NON_PRODUCTION')).toBe('dev');
    const prod=new Request('https://example.test',{headers:{'X-Data-Env':'prod'}});
    expect(()=>assertIsolatedRestoreTarget(prod,'RESTORE_TO_ISOLATED_NON_PRODUCTION')).toThrowError(/non_production/);
    expect(()=>assertIsolatedRestoreTarget(dev,'wrong')).toThrowError(/confirmation/);
  });

  it('fails preflight closed for missing credentials and ambiguous SharePoint site selectors',()=>{
    const missing=readSharePointBackupConfiguration(env({}));
    expect(missing.ok).toBe(false);
    expect(missing.missing).toEqual(expect.arrayContaining([
      'MS_GRAPH_TENANT_ID','MS_GRAPH_CLIENT_ID','MS_GRAPH_CLIENT_SECRET',
      'DR_SHAREPOINT_SITE_ID_or_DR_SHAREPOINT_SITE_PATH',
    ]));
    const ambiguous=readSharePointBackupConfiguration(env({
      MS_GRAPH_TENANT_ID:'tenant',MS_GRAPH_CLIENT_ID:'client',MS_GRAPH_CLIENT_SECRET:'secret',
      DR_SHAREPOINT_SITE_ID:'site-id',DR_SHAREPOINT_SITE_PATH:'sites/infrastructure',
      DR_SHAREPOINT_DRIVE_ID:'drive-id',
    }));
    expect(ambiguous.ok).toBe(false);
    expect(ambiguous.invalid).toContain('DR_SHAREPOINT_SITE_ID_and_DR_SHAREPOINT_SITE_PATH_are_mutually_exclusive');
  });

  it('authenticates relative/absolute Graph calls without leaking the bearer token to upload-session URLs',()=>{
    expect(graphAuthorizationHeaders('token','/sites/site-id')).toEqual({Authorization:'Bearer token'});
    expect(graphAuthorizationHeaders('token','https://graph.microsoft.com/v1.0/sites/site-id')).toEqual({Authorization:'Bearer token'});
    expect(graphAuthorizationHeaders('token','https://tenant.sharepoint.com/upload-session')).toEqual({});
    expect(graphAuthorizationHeaders('token','https://graph.microsoft.com.evil.example/v1.0/sites/site-id')).toEqual({});
    expect(isMicrosoftUploadSessionUrl('https://tenant.sharepoint.com/upload-session?tempauth=opaque')).toBe(true);
    expect(isMicrosoftUploadSessionUrl('https://region.up.1drv.com/upload-session?tempauth=opaque')).toBe(true);
    expect(isMicrosoftStorageCapabilityUrl('https://region.files.1drv.com/download?tempauth=opaque')).toBe(true);
    for(const rejected of [
      'https://evil.example/upload-session',
      'https://tenant.sharepoint.com.evil.example/upload-session',
      'https://127.0.0.1/upload-session',
      'https://user:password@tenant.sharepoint.com/upload-session',
      'http://tenant.sharepoint.com/upload-session',
    ])expect(isMicrosoftUploadSessionUrl(rejected)).toBe(false);
  });

  it('follows exactly one trusted Graph content redirect without forwarding bearer auth',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(input)=>{
      const url=String(input);
      if(url.includes('login.microsoftonline.com'))return Response.json({access_token:'graph-token'});
      if(url.includes('/drives/'))return Response.json({id:DR_CANONICAL_SHAREPOINT_DRIVE_ID,name:'CAMBRA INFRASTRUCTURE'});
      if(url.includes('/sites/'))return Response.json({id:DR_CANONICAL_SHAREPOINT_SITE_ID,displayName:'Root'});
      throw new Error('unexpected open request');
    }));
    const storage=await openSharePointBackupStorage(env(validRuntimeEnv()),{requireCanonicalTarget:true});
    let redirectCancelled=false;
    const downloadUrl='https://region.files.1drv.com/download?tempauth=opaque',fetchMock=vi.fn(async(input,_init={})=>{
      if(String(input).startsWith('https://graph.microsoft.com/'))return new Response(new ReadableStream({
        start(controller){controller.enqueue(new TextEncoder().encode('redirect'));},
        cancel(){redirectCancelled=true;},
      }),{status:302,headers:{location:downloadUrl}});
      if(String(input)===downloadUrl)return new Response(new Uint8Array([1,2,3]));
      throw new Error('unexpected download request');
    });
    vi.stubGlobal('fetch',fetchMock);
    await expect(storage.download('Daily/stage.bin')).resolves.toEqual(new Uint8Array([1,2,3]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({redirect:'manual',headers:{Authorization:'Bearer graph-token'}});
    expect(fetchMock.mock.calls[1][1]).toEqual({method:'GET',redirect:'manual',headers:{Accept:'application/octet-stream'}});
    expect(redirectCancelled).toBe(true);
  });

  it('rejects untrusted and chained Graph content redirects',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(input)=>{
      const url=String(input);
      if(url.includes('login.microsoftonline.com'))return Response.json({access_token:'graph-token'});
      if(url.includes('/drives/'))return Response.json({id:DR_CANONICAL_SHAREPOINT_DRIVE_ID,name:'CAMBRA INFRASTRUCTURE'});
      if(url.includes('/sites/'))return Response.json({id:DR_CANONICAL_SHAREPOINT_SITE_ID,displayName:'Root'});
      throw new Error('unexpected open request');
    }));
    const storage=await openSharePointBackupStorage(env(validRuntimeEnv()),{requireCanonicalTarget:true});
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(null,{status:302,headers:{location:'https://evil.example/download'}})));
    await expect(storage.download('Daily/untrusted.bin')).rejects.toMatchObject({graphCode:'download_redirect_url_invalid'});
    const trusted='https://region.files.1drv.com/download?tempauth=opaque';
    vi.stubGlobal('fetch',vi.fn(async(input)=>new Response(null,{status:302,headers:{location:String(input).startsWith('https://graph.microsoft.com/')?trusted:'https://other.files.1drv.com/second'}})));
    await expect(storage.download('Daily/chained.bin')).rejects.toMatchObject({graphCode:'download_redirect_chain_rejected'});
  });

  it('paginates the complete drive collection with Graph auth on every page',async()=>{
    const second='https://graph.microsoft.com/v1.0/sites/site-id/drives?$skiptoken=next';
    const fetchMock=vi.fn(async(input,_init={})=>{
      const url=String(input);
      if(url===second)return Response.json({value:[{id:'drive-2',name:'Second'}]});
      return Response.json({value:[{id:'drive-1',name:'First'}],'@odata.nextLink':second});
    });
    vi.stubGlobal('fetch',fetchMock);
    await expect(listSharePointSiteDrives('graph-token','site-id')).resolves.toEqual([
      {id:'drive-1',name:'First'},{id:'drive-2',name:'Second'},
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for(const [,init] of fetchMock.mock.calls){
      expect(init.headers.Authorization).toBe('Bearer graph-token');
    }
  });

  it('detects same-name drives across pagination instead of choosing the first page',async()=>{
    const second='https://graph.microsoft.com/v1.0/sites/site-id/drives?$skiptoken=next';
    vi.stubGlobal('fetch',vi.fn(async(input)=>{
      const url=String(input);
      if(url.includes('login.microsoftonline.com'))return Response.json({access_token:'graph-token'});
      if(url.includes('/sites/site-id?'))return Response.json({id:'site-id',displayName:'Root'});
      if(url===second)return Response.json({value:[{id:'drive-2',name:'Target'}]});
      if(url.includes('/sites/site-id/drives?'))return Response.json({value:[{id:'drive-1',name:'Target'}],'@odata.nextLink':second});
      throw new Error('unexpected mock request');
    }));
    await expect(openSharePointBackupStorage(env({
      MS_GRAPH_TENANT_ID:'tenant',MS_GRAPH_CLIENT_ID:'client',MS_GRAPH_CLIENT_SECRET:'secret',
      DR_SHAREPOINT_SITE_ID:'site-id',DR_SHAREPOINT_DRIVE_NAME:'Target',
    }))).rejects.toMatchObject({code:'DR_SHAREPOINT_DRIVE_TARGET_AMBIGUOUS',matched_count:2});
  });

  it('opens the canonical target read-only and rejects a resolved ID mismatch',async()=>{
    const canonicalFetch=(resolvedDriveId=DR_CANONICAL_SHAREPOINT_DRIVE_ID,resolvedSiteId=DR_CANONICAL_SHAREPOINT_SITE_ID)=>vi.fn(async(input)=>{
      const url=String(input);
      if(url.includes('login.microsoftonline.com'))return Response.json({access_token:'graph-token'});
      if(url.includes('/drives/'))return Response.json({id:resolvedDriveId,name:'CAMBRA INFRASTRUCTURE'});
      if(url.includes('/sites/'))return Response.json({id:resolvedSiteId,displayName:'Root'});
      throw new Error('unexpected mock request');
    });
    const fetchMock=canonicalFetch();
    vi.stubGlobal('fetch',fetchMock);
    const storage=await openSharePointBackupStorage(env(validRuntimeEnv()),{requireCanonicalTarget:true});
    expect(storage.identity).toMatchObject({
      site_id:DR_CANONICAL_SHAREPOINT_SITE_ID,drive_id:DR_CANONICAL_SHAREPOINT_DRIVE_ID,
      drive_name:'CAMBRA INFRASTRUCTURE',root_folder:'Production Backups',
    });
    expect(fetchMock.mock.calls.some(([input])=>String(input).includes('/children'))).toBe(false);
    expect(fetchMock.mock.calls.slice(1).every(([,init])=>!init?.method||init.method==='GET')).toBe(true);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method:'POST',redirect:'manual',body:expect.any(String),
    });
    expect(fetchMock.mock.calls[0][1].body).toBe(
      'client_id=client&client_secret=secret&scope=https%3A%2F%2Fgraph.microsoft.com%2F.default&grant_type=client_credentials',
    );
    expect(fetchMock.mock.calls.slice(1).every(([,init])=>init?.redirect==='manual')).toBe(true);
    vi.stubGlobal('fetch',canonicalFetch());
    const verification=await verifySharePointBackupStorage(env(validRuntimeEnv()),{requireCanonicalTarget:true});
    expect(verification).toHaveProperty('list');
    expect(verification).not.toHaveProperty('upload');
    expect(verification).not.toHaveProperty('ensureFolder');
    expect(verification).not.toHaveProperty('deleteById');
    vi.stubGlobal('fetch',canonicalFetch('wrong-resolved-drive'));
    await expect(openSharePointBackupStorage(env(validRuntimeEnv()),{requireCanonicalTarget:true}))
      .rejects.toMatchObject({code:'DR_SHAREPOINT_DRIVE_IDENTITY_MISMATCH'});
    vi.stubGlobal('fetch',canonicalFetch(DR_CANONICAL_SHAREPOINT_DRIVE_ID,'wrong-resolved-site'));
    await expect(openSharePointBackupStorage(env(validRuntimeEnv()),{requireCanonicalTarget:true}))
      .rejects.toMatchObject({invalid:['DR_SHAREPOINT_RESOLVED_SITE_ID_CANONICAL_MISMATCH']});
  });

  it('rejects token redirects without forwarding the client secret',async()=>{
    let cancelled=false;
    const body=new ReadableStream({
      start(controller){controller.enqueue(new TextEncoder().encode('redirect'));},
      cancel(){cancelled=true;},
    });
    const fetchMock=vi.fn(async()=>new Response(body,{
      status:307,
      headers:{location:'https://untrusted.example/token'},
    }));
    vi.stubGlobal('fetch',fetchMock);
    await expect(openSharePointBackupStorage(env(validRuntimeEnv()),{requireCanonicalTarget:true}))
      .rejects.toMatchObject({status:502,graphCode:'token_redirect_rejected'});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({redirect:'manual'});
    expect(cancelled).toBe(true);
  });

  it('rejects Graph redirects without following them',async()=>{
    let cancelled=false;
    const redirectedBody=new ReadableStream({
      start(controller){controller.enqueue(new TextEncoder().encode('redirect'));},
      cancel(){cancelled=true;},
    });
    const fetchMock=vi.fn(async(input)=>{
      if(String(input).includes('login.microsoftonline.com')){
        return Response.json({access_token:'graph-token'});
      }
      return new Response(redirectedBody,{
        status:307,
        headers:{location:'https://untrusted.example/graph'},
      });
    });
    vi.stubGlobal('fetch',fetchMock);
    await expect(openSharePointBackupStorage(env(validRuntimeEnv()),{requireCanonicalTarget:true}))
      .rejects.toMatchObject({status:502,graphCode:'graph_redirect_rejected'});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([,init])=>init?.redirect==='manual')).toBe(true);
    expect(cancelled).toBe(true);
  });

  it('cancels allowed 404/409 bodies before folder recovery and forbids redirects',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(input)=>{
      const url=String(input);
      if(url.includes('login.microsoftonline.com'))return Response.json({access_token:'graph-token'});
      if(url.includes('/drives/'))return Response.json({id:DR_CANONICAL_SHAREPOINT_DRIVE_ID,name:'CAMBRA INFRASTRUCTURE'});
      if(url.includes('/sites/'))return Response.json({id:DR_CANONICAL_SHAREPOINT_SITE_ID,displayName:'Root'});
      throw new Error('unexpected open request');
    }));
    const storage=await openSharePointBackupStorage(env(validRuntimeEnv()),{requireCanonicalTarget:true});
    let cancelled404=false,cancelled409=false,manifestReads=0;
    const pendingBody=(status,onCancel)=>new Response(new ReadableStream({
      start(controller){controller.enqueue(new TextEncoder().encode('{}'));},
      cancel(){onCancel();},
    }),{status});
    const fetchMock=vi.fn(async(input,init={})=>{
      expect(init.redirect).toBe('manual');
      const url=String(input);
      if(url.includes('Production%20Backups/Manifests?')){
        manifestReads++;
        return manifestReads===1
          ?pendingBody(404,()=>{cancelled404=true;})
          :Response.json({id:'manifest-folder'});
      }
      if(url.includes('Production%20Backups?'))return Response.json({id:'backup-root'});
      if(url.includes('/items/backup-root/children'))return pendingBody(409,()=>{cancelled409=true;});
      throw new Error(`unexpected folder request: ${url}`);
    });
    vi.stubGlobal('fetch',fetchMock);
    await expect(storage.ensureFolder('Manifests')).resolves.toMatchObject({id:'manifest-folder'});
    expect({cancelled404,cancelled409,manifestReads}).toEqual({cancelled404:true,cancelled409:true,manifestReads:2});
  });

  it('cancels retryable Graph error bodies and parses only the bounded terminal receipt',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(input)=>{
      const url=String(input);
      if(url.includes('login.microsoftonline.com'))return Response.json({access_token:'graph-token'});
      if(url.includes('/drives/'))return Response.json({id:DR_CANONICAL_SHAREPOINT_DRIVE_ID,name:'CAMBRA INFRASTRUCTURE'});
      if(url.includes('/sites/'))return Response.json({id:DR_CANONICAL_SHAREPOINT_SITE_ID,displayName:'Root'});
      throw new Error('unexpected mock request');
    }));
    const storage=await openSharePointBackupStorage(env(validRuntimeEnv()),{requireCanonicalTarget:true});
    let attempts=0,cancelled=0;
    vi.stubGlobal('fetch',vi.fn(async()=>{
      attempts++;
      const body=new ReadableStream({
        start(controller){controller.enqueue(new TextEncoder().encode('{"error":{"code":"server_error"}}'));controller.close();},
        cancel(){cancelled++;},
      });
      return new Response(body,{status:500,headers:{'content-type':'application/json'}});
    }));
    vi.useFakeTimers();
    try{
      const assertion=expect(storage.download('Manifests/retry.json'))
        .rejects.toMatchObject({status:500,graphCode:'server_error'});
      await vi.runAllTimersAsync();
      await assertion;
    }finally{
      vi.useRealTimers();
    }
    expect(attempts).toBe(5);
    expect(cancelled).toBe(4);
  });

  it('rejects an upload artifact above DR_MAX_FILE_BYTES before network transfer',async()=>{
    const fetchMock=vi.fn(async(input)=>{
      const url=String(input);
      if(url.includes('login.microsoftonline.com'))return Response.json({access_token:'graph-token'});
      if(url.includes('/drives/'))return Response.json({id:DR_CANONICAL_SHAREPOINT_DRIVE_ID,name:'CAMBRA INFRASTRUCTURE'});
      if(url.includes('/sites/'))return Response.json({id:DR_CANONICAL_SHAREPOINT_SITE_ID,displayName:'Root'});
      throw new Error('unexpected upload request');
    });
    vi.stubGlobal('fetch',fetchMock);
    const storage=await openSharePointBackupStorage(
      env(validRuntimeEnv({DR_MAX_FILE_BYTES:'2'})),
      {requireCanonicalTarget:true},
    );
    const callsBefore=fetchMock.mock.calls.length;
    await expect(Promise.resolve().then(()=>storage.upload(
      'Manifests/oversized.bin',
      new Uint8Array(3),
    ))).rejects.toMatchObject({code:'DR_OWNED_FILE_TOO_LARGE',bytes:3,max:2});
    expect(fetchMock).toHaveBeenCalledTimes(callsBefore);
  });

  it('rejects malformed 2xx receipts for small Graph uploads and verifies exact size',async()=>{
    let receipt={};
    vi.stubGlobal('fetch',vi.fn(async(input)=>{
      const url=String(input);
      if(url.includes('login.microsoftonline.com'))return Response.json({access_token:'graph-token'});
      if(url.includes(':/content'))return Response.json(receipt);
      if(url.includes('/drives/'))return Response.json({id:DR_CANONICAL_SHAREPOINT_DRIVE_ID,name:'CAMBRA INFRASTRUCTURE'});
      if(url.includes('/sites/'))return Response.json({id:DR_CANONICAL_SHAREPOINT_SITE_ID,displayName:'Root'});
      throw new Error('unexpected mock request');
    }));
    const storage=await openSharePointBackupStorage(env(validRuntimeEnv()),{requireCanonicalTarget:true});
    const bytes=new Uint8Array([1,2,3]);
    await expect(storage.upload('Manifests/small.json',bytes,'application/json')).rejects.toMatchObject({graphCode:'upload_small_receipt_invalid'});
    receipt={id:'drive-item-1',size:2};
    await expect(storage.upload('Manifests/small.json',bytes,'application/json')).rejects.toMatchObject({graphCode:'upload_small_receipt_invalid'});
    for(const malformed of [{id:{},size:3},{id:'drive-item-1',size:'3'},{id:'drive-item-1',size:3.1},{id:'  ',size:3}]){
      receipt=malformed;
      await expect(storage.upload('Manifests/small.json',bytes,'application/json')).rejects.toMatchObject({graphCode:'upload_small_receipt_invalid'});
    }
    receipt={id:'drive-item-1',size:3};
    await expect(storage.upload('Manifests/small.json',bytes,'application/json')).resolves.toMatchObject({id:'drive-item-1',size:3});
  });

  it('requires coherent 202 ranges and a strict final receipt for chunked Graph uploads',async()=>{
    const uploadUrl='https://tenant.sharepoint.com/upload-session';
    let intermediateStatus=202;
    let intermediateReceipt={nextExpectedRanges:[`${DR_GRAPH_CHUNK_BYTES}-`]};
    let finalReceipt={id:'drive-item-chunked',size:DR_GRAPH_CHUNK_BYTES+1};
    let chunk=0;
    vi.stubGlobal('fetch',vi.fn(async(input)=>{
      const url=String(input);
      if(url.includes('login.microsoftonline.com'))return Response.json({access_token:'graph-token'});
      if(url.includes('createUploadSession')){chunk=0;return Response.json({uploadUrl});}
      if(url===uploadUrl){
        chunk++;
        return chunk%2===1
          ?Response.json(intermediateReceipt,{status:intermediateStatus})
          :Response.json(finalReceipt,{status:201});
      }
      if(url.includes('/root:/Production%20Backups/Manifests?'))return Response.json({id:'manifest-folder'});
      if(url.includes('/drives/'))return Response.json({id:DR_CANONICAL_SHAREPOINT_DRIVE_ID,name:'CAMBRA INFRASTRUCTURE'});
      if(url.includes('/sites/'))return Response.json({id:DR_CANONICAL_SHAREPOINT_SITE_ID,displayName:'Root'});
      throw new Error(`unexpected mock request: ${url}`);
    }));
    const storage=await openSharePointBackupStorage(env(validRuntimeEnv()),{requireCanonicalTarget:true});
    const bytes=new Uint8Array(DR_GRAPH_CHUNK_BYTES+1);
    intermediateStatus=200;
    await expect(storage.upload('Manifests/chunked.bin',bytes)).rejects.toMatchObject({graphCode:'upload_chunk_receipt_invalid'});
    intermediateStatus=202;
    intermediateReceipt={nextExpectedRanges:[`${DR_GRAPH_CHUNK_BYTES+1}-`]};
    await expect(storage.upload('Manifests/chunked.bin',bytes)).rejects.toMatchObject({graphCode:'upload_chunk_receipt_invalid'});
    intermediateReceipt={nextExpectedRanges:[`${DR_GRAPH_CHUNK_BYTES}-`]};
    finalReceipt={id:{},size:bytes.byteLength};
    await expect(storage.upload('Manifests/chunked.bin',bytes)).rejects.toMatchObject({graphCode:'upload_final_receipt_invalid'});
    for(const malformed of [
      {id:'  ',size:bytes.byteLength},
      {id:'drive-item-chunked',size:String(bytes.byteLength)},
      {id:'drive-item-chunked',size:Number.MAX_SAFE_INTEGER+1},
      {id:'drive-item-chunked',size:bytes.byteLength-1},
    ]){
      finalReceipt=malformed;
      await expect(storage.upload('Manifests/chunked.bin',bytes)).rejects.toMatchObject({graphCode:'upload_final_receipt_invalid'});
    }
    intermediateReceipt={};
    finalReceipt={id:'drive-item-chunked',size:bytes.byteLength};
    await expect(storage.upload('Manifests/chunked.bin',bytes)).rejects.toMatchObject({graphCode:'upload_chunk_receipt_invalid'});
    intermediateReceipt={nextExpectedRanges:[`${DR_GRAPH_CHUNK_BYTES}-`]};
    await expect(storage.upload('Manifests/chunked.bin',bytes)).resolves.toMatchObject(finalReceipt);
    intermediateReceipt={nextExpectedRanges:[]};
    await expect(storage.upload('Manifests/chunked.bin',bytes)).rejects.toMatchObject({graphCode:'upload_chunk_receipt_invalid'});
  });

  it('sanitizes Graph error codes and keeps capability URLs out of errors/logging',()=>{
    const capability='https://tenant.sharepoint.com/upload?tempauth=top-secret';
    expect(sanitizeMicrosoftGraphCode(capability,'upload_transport_failed')).toBe('upload_transport_failed');
    const error=new MicrosoftGraphError(502,capability);
    expect(error.graphCode).toBe('unknown');
    expect(error.message).not.toContain('sharepoint.com');
    expect(error.message).not.toContain('top-secret');
    const runtime=read('base44/shared/disasterRecoveryRuntime.ts');
    expect(runtime).not.toMatch(/console\.error\([^\n]*,\s*(?:error|recordError)\b/);
    expect(runtime).toContain("console.error(JSON.stringify({level:'error',event,error_code:drErrorCode(error)}))");
  });

  it('selects the canonical DR library/root and rejects a duplicate root target',()=>{
    const canonical=readSharePointBackupConfiguration(env({
      MS_GRAPH_TENANT_ID:'tenant',MS_GRAPH_CLIENT_ID:'client',MS_GRAPH_CLIENT_SECRET:'secret',
      DR_SHAREPOINT_SITE_ID:'site-id',DR_SHAREPOINT_DRIVE_ID:'drive-id',
    }));
    expect(canonical.ok).toBe(true);
    expect(canonical.configuration).toMatchObject({
      driveName:'CAMBRA INFRASTRUCTURE',rootFolder:'Production Backups',
    });
    expect(canonical.target).toMatchObject({
      site_resolution:'EXACT_ID',drive_resolution:'EXACT_ID',canonical_root:true,
    });
    const duplicateRoot=readSharePointBackupConfiguration(env({
      MS_GRAPH_TENANT_ID:'tenant',MS_GRAPH_CLIENT_ID:'client',MS_GRAPH_CLIENT_SECRET:'secret',
      DR_SHAREPOINT_SITE_ID:'site-id',DR_SHAREPOINT_DRIVE_ID:'drive-id',
      DR_SHAREPOINT_ROOT_FOLDER:'Production Backups Copy',
    }));
    expect(duplicateRoot.ok).toBe(false);
    expect(duplicateRoot.invalid).toContain('DR_SHAREPOINT_ROOT_FOLDER_must_equal_Production Backups');
  });

  it('requires exact canonical resource IDs in production and validates key/release formats',()=>{
    const valid=readDisasterRecoveryPreflightConfiguration(env(validRuntimeEnv()),{requireCanonicalTarget:true});
    expect(valid).toMatchObject({
      ok:true,target:{site_resolution:'EXACT_ID',drive_resolution:'EXACT_ID',canonical_target:true},
      encryption_key:{configured:true,valid_aes256_base64:true},
      file_size_limit:{configured:false,valid:true,max_bytes:100*1024*1024},
      release_identity:{release_version:'0.98.0',release_version_format:'VALID',git_sha_format:'SHA40',source_tree_hash_format:'SHA256_TREE_V1'},
    });
    const unsafe=readDisasterRecoveryPreflightConfiguration(env(validRuntimeEnv({
      DR_SHAREPOINT_SITE_ID:'wrong-site',DR_SHAREPOINT_DRIVE_ID:'',
      DR_SHAREPOINT_SITE_PATH:'sites/diagnostic',DR_BACKUP_AES256_KEY_B64:'not-base64',
      CAMBRA_RELEASE_VERSION:'bad version!',CAMBRA_GIT_SHA:'abc',CAMBRA_SOURCE_TREE_HASH:'def',DR_MAX_FILE_BYTES:'NaN',
    })),{requireCanonicalTarget:true});
    expect(unsafe.ok).toBe(false);
    expect(unsafe.invalid).toEqual(expect.arrayContaining([
      'DR_SHAREPOINT_PRODUCTION_SITE_REQUIRES_EXACT_ID',
      'DR_SHAREPOINT_PRODUCTION_DRIVE_REQUIRES_EXACT_ID',
      'DR_SHAREPOINT_SITE_ID_CANONICAL_MISMATCH',
      'DR_SHAREPOINT_DRIVE_ID_CANONICAL_MISMATCH',
      'DR_BACKUP_AES256_KEY_B64_INVALID','CAMBRA_RELEASE_VERSION_INVALID','CAMBRA_GIT_SHA_INVALID','CAMBRA_SOURCE_TREE_HASH_INVALID','DR_MAX_FILE_BYTES_INVALID',
    ]));
    expect(parseDrMaxFileBytes('1048576')).toBe(1048576);
    for(const invalid of ['NaN','0','-1','1.5',String(1024*1024*1024+1)])expect(()=>parseDrMaxFileBytes(invalid)).toThrowError(/dr_max_file_bytes_invalid/);
  });

  it('bounds attachment downloads before and during streaming and verifies the real byte count',async()=>{
    let headerCancelled=false;
    const declaredOversized=new ReadableStream({
      start(controller){controller.enqueue(new Uint8Array(1));},
      cancel(){headerCancelled=true;},
    });
    await expect(readBoundedDrResponseBytes(new Response(declaredOversized,{
      headers:{'content-length':'11'},
    }),10)).rejects.toMatchObject({code:'DR_OWNED_FILE_TOO_LARGE',bytes:11,max:10});
    expect(headerCancelled).toBe(true);

    let cancelled=false;
    const oversized=new ReadableStream({
      start(controller){
        controller.enqueue(new Uint8Array([1,2,3,4,5,6]));
        controller.enqueue(new Uint8Array([7,8,9,10,11,12]));
      },
      cancel(){cancelled=true;},
    });
    await expect(readBoundedDrResponseBytes(new Response(oversized),10))
      .rejects.toMatchObject({code:'DR_OWNED_FILE_TOO_LARGE',bytes:12,max:10});
    expect(cancelled).toBe(true);

    const exact=await readBoundedDrResponseBytes(new Response(new Uint8Array([1,2,3]),{
      headers:{'content-length':'3'},
    }),3);
    expect([...exact]).toEqual([1,2,3]);
    await expect(readBoundedDrResponseBytes(new Response(new Uint8Array([1,2,3]),{
      headers:{'content-length':'2'},
    }),3)).rejects.toMatchObject({code:'DR_OWNED_FILE_CONTENT_LENGTH_MISMATCH',declared:2,observed:3});

    const storageSource=read('base44/shared/sharePointBackupStorage.ts');
    const coreSource=read('base44/shared/disasterRecoveryCore.ts');
    const runtimeSource=read('base44/shared/disasterRecoveryRuntime.ts');
    expect(storageSource).not.toMatch(/download(?:IfExists)?:[\s\S]{0,500}arrayBuffer\(/);
    expect(storageSource).not.toContain('.json()');
    expect(coreSource).not.toContain('arrayBuffer()');
    expect(runtimeSource).not.toContain('check.arrayBuffer()');
    expect(runtimeSource).toContain('fetchTrustedBase44File(url,drMaxFileBytes())');
    expect(runtimeSource).toContain("if(rawBytes>max)throw Object.assign(new Error('dr_owned_file_exceeds_configured_limit')");
    expect(runtimeSource).toContain('readBoundedDrResponseBytes(new Response(stream.readable),max)');
    expect(runtimeSource).toContain("assertDrPayloadWithinLimit(envelope,'encrypted_envelope')");
  });

  it('accepts only CAMBRA public file routes and exact Base44 media redirects',()=>{
    const stable='https://base44.app/api/apps/6a16288b833b3c26d7ac1fab/files/mp/public/6a16288b833b3c26d7ac1fab/file.txt';
    const media='https://media.base44.com/files/public/file.txt';
    expect(trustedBase44FileUrl(stable)).toBe(stable);
    expect(trustedBase44FileUrl(media)).toBe(media);
    expect(trustedBase44FileRedirectUrl(media)).toBe(media);
    for(const rejected of [
      'http://base44.app/api/apps/6a16288b833b3c26d7ac1fab/files/public/file.txt',
      'https://base44.app/api/apps/different-app/files/public/file.txt',
      'https://base44.app/api/apps/6a16288b833b3c26d7ac1fab/functions/file.txt',
      'https://base44.app.evil.example/api/apps/6a16288b833b3c26d7ac1fab/files/public/file.txt',
      'https://user:password@media.base44.com/files/public/file.txt',
      'https://media.base44.com.evil.example/files/public/file.txt',
      'https://media.base44.com/files/public/file.txt#fragment',
    ])expect(trustedBase44FileUrl(rejected)).toBeNull();
    expect(trustedBase44FileRedirectUrl(stable)).toBeNull();
  });

  it('follows one Base44 file redirect without auth and rejects untrusted or chained redirects',async()=>{
    const stable='https://base44.app/api/apps/6a16288b833b3c26d7ac1fab/files/mp/public/6a16288b833b3c26d7ac1fab/file.txt';
    const media='https://media.base44.com/files/public/file.txt';
    let firstCancelled=false;
    const fetchMock=vi.fn(async(input)=>String(input)===stable
      ? new Response(new ReadableStream({cancel(){firstCancelled=true;}}),{status:302,headers:{location:media}})
      : new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'text/plain','content-length':'3'}}));
    await expect(fetchTrustedBase44File(stable,3,fetchMock)).resolves.toEqual({bytes:new Uint8Array([1,2,3]),contentType:'text/plain'});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([,init])=>init.redirect==='manual'&&init.headers.Authorization===undefined)).toBe(true);
    expect(firstCancelled).toBe(true);

    const untrusted=vi.fn(async()=>new Response(null,{status:302,headers:{location:'https://evil.example/file'}}));
    await expect(fetchTrustedBase44File(stable,3,untrusted)).rejects.toMatchObject({code:'DR_OWNED_FILE_REDIRECT_REJECTED'});
    expect(untrusted).toHaveBeenCalledTimes(1);

    const chained=vi.fn(async(input)=>new Response(null,{status:302,headers:{location:String(input)===stable?media:'https://media.base44.com/files/public/second'}}));
    await expect(fetchTrustedBase44File(stable,3,chained)).rejects.toMatchObject({code:'DR_OWNED_FILE_REDIRECT_CHAIN_REJECTED'});
    expect(chained).toHaveBeenCalledTimes(2);
  });

  it('reports an inactive/stale DR scheduler from durable scheduled-attempt evidence',()=>{
    const now=Date.parse('2026-08-21T12:00:00.000Z');
    expect(evaluateDisasterRecoveryScheduler([],now)).toMatchObject({
      status:'INACTIVE_OR_UNOBSERVED',observed_active:false,healthy:false,inactive_or_stale:true,
    });
    const stale=evaluateDisasterRecoveryScheduler([{
      record_kind:'ATTEMPT',worker_key:'disasterRecoveryBackup',invocation_kind:'SCHEDULED',
      claim_acquired:true,cadence_seconds:86400,
      status:'COMPLETED',started_at:'2026-08-18T00:00:00.000Z',completed_at:'2026-08-18T01:00:00.000Z',
    }],now);
    expect(stale).toMatchObject({status:'INACTIVE_OR_STALE',observed_active:false,healthy:false,inactive_or_stale:true});
    const healthy=evaluateDisasterRecoveryScheduler([{
      record_kind:'ATTEMPT',worker_key:'disasterRecoveryBackup',invocation_kind:'SCHEDULED',
      claim_acquired:true,cadence_seconds:86400,
      status:'COMPLETED',started_at:'2026-08-21T01:30:00.000Z',completed_at:'2026-08-21T02:00:00.000Z',
    }],now);
    expect(healthy).toMatchObject({status:'HEALTHY',observed_active:true,healthy:true,inactive_or_stale:false});
    const failedAndStale=evaluateDisasterRecoveryScheduler([{
      record_kind:'ATTEMPT',worker_key:'disasterRecoveryBackup',invocation_kind:'SCHEDULED',
      claim_acquired:true,cadence_seconds:86400,
      status:'FAILED',started_at:'2026-08-18T00:00:00.000Z',
    }],now);
    expect(failedAndStale).toMatchObject({status:'FAILED',observed_active:false,healthy:false,inactive_or_stale:true});
    const continuation=evaluateDisasterRecoveryScheduler([{
      record_kind:'ATTEMPT',worker_key:'disasterRecoveryBackupContinuation',invocation_kind:'SCHEDULED',
      claim_acquired:true,cadence_seconds:600,status:'COMPLETED',started_at:'2026-08-21T11:50:00.000Z',completed_at:'2026-08-21T11:51:00.000Z',
    }],now,{worker_key:'disasterRecoveryBackupContinuation',cadence_seconds:600,freshness_seconds:1800});
    expect(continuation).toMatchObject({worker_key:'disasterRecoveryBackupContinuation',expected_cadence_seconds:600,status:'HEALTHY'});
  });

  it('enforces the 24h RPO boundary and rejects incomplete/future/hung scheduler evidence',()=>{
    const now=Date.parse('2026-08-21T12:00:00.000Z');
    const run=(values)=>({record_kind:'ATTEMPT',worker_key:'disasterRecoveryBackup',invocation_kind:'SCHEDULED',claim_acquired:true,cadence_seconds:86400,...values});
    expect(evaluateDisasterRecoveryScheduler([run({
      status:'COMPLETED',started_at:'2026-08-20T12:00:00.000Z',completed_at:'2026-08-20T12:30:00.000Z',
    })],now)).toMatchObject({status:'HEALTHY',age_seconds:86400,observed_active:true});
    expect(evaluateDisasterRecoveryScheduler([run({
      status:'COMPLETED',started_at:'2026-08-20T11:59:59.999Z',completed_at:'2026-08-20T12:30:00.000Z',
    })],now)).toMatchObject({status:'INACTIVE_OR_STALE',observed_active:false});
    expect(evaluateDisasterRecoveryScheduler([run({
      status:'COMPLETED',started_at:'2026-08-20T11:00:00.000Z',completed_at:'2026-08-21T11:00:00.000Z',
    })],now)).toMatchObject({status:'INACTIVE_OR_STALE',observed_active:false});
    expect(evaluateDisasterRecoveryScheduler([run({
      status:'COMPLETED',started_at:'2026-08-21T10:00:00.000Z',
    })],now)).toMatchObject({status:'UNVERIFIABLE',reason:'latest_completed_attempt_requires_valid_completed_at',observed_active:false});
    expect(evaluateDisasterRecoveryScheduler([run({
      status:'COMPLETED',started_at:'2026-08-21T13:00:00.000Z',completed_at:'2026-08-21T13:01:00.000Z',
    })],now)).toMatchObject({status:'UNVERIFIABLE',reason:'latest_scheduled_attempt_timestamp_future',observed_active:false});
    expect(evaluateDisasterRecoveryScheduler([run({
      claim_acquired:undefined,status:'COMPLETED',started_at:'2026-08-21T10:00:00.000Z',completed_at:'2026-08-21T10:30:00.000Z',
    })],now)).toMatchObject({status:'UNVERIFIABLE',reason:'latest_scheduled_attempt_claim_not_acquired',observed_active:false});
    expect(evaluateDisasterRecoveryScheduler([run({
      claim_acquired:false,status:'COMPLETED',started_at:'2026-08-21T10:00:00.000Z',completed_at:'2026-08-21T10:30:00.000Z',
    })],now)).toMatchObject({status:'UNVERIFIABLE',reason:'latest_scheduled_attempt_claim_not_acquired',observed_active:false});
    expect(evaluateDisasterRecoveryScheduler([run({
      cadence_seconds:3600,status:'COMPLETED',started_at:'2026-08-21T10:00:00.000Z',completed_at:'2026-08-21T10:30:00.000Z',
    })],now)).toMatchObject({status:'UNVERIFIABLE',reason:'latest_scheduled_attempt_cadence_mismatch',observed_active:false});
    expect(evaluateDisasterRecoveryScheduler([run({
      record_kind:'CONTROL',status:'COMPLETED',started_at:'2026-08-21T10:00:00.000Z',completed_at:'2026-08-21T10:30:00.000Z',
    })],now)).toMatchObject({status:'UNVERIFIABLE',reason:'latest_scheduled_record_is_not_attempt',observed_active:false});
    expect(evaluateDisasterRecoveryScheduler([run({
      status:'RUNNING',started_at:'2026-08-21T11:50:00.000Z',heartbeat_at:'2026-08-21T11:59:00.000Z',
    })],now)).toMatchObject({status:'UNVERIFIABLE',reason:'running_scheduled_attempt_lease_required',observed_active:false});
    expect(evaluateDisasterRecoveryScheduler([run({
      status:'RUNNING',started_at:'2026-08-21T11:50:00.000Z',lease_expires_at:'2026-08-21T12:10:00.000Z',
    })],now)).toMatchObject({status:'UNVERIFIABLE',reason:'running_scheduled_attempt_heartbeat_required',observed_active:false});
    expect(evaluateDisasterRecoveryScheduler([run({
      status:'RUNNING',started_at:'2026-08-21T11:50:00.000Z',heartbeat_at:'2026-08-21T11:59:00.000Z',lease_expires_at:'not-a-date',
    })],now)).toMatchObject({status:'UNVERIFIABLE',reason:'running_scheduled_attempt_lease_invalid',observed_active:false});
    expect(evaluateDisasterRecoveryScheduler([run({
      status:'RUNNING',started_at:'2026-08-21T10:00:00.000Z',heartbeat_at:'2026-08-21T11:30:00.000Z',lease_expires_at:'2026-08-21T11:45:00.000Z',
    })],now)).toMatchObject({status:'HUNG',observed_active:false});
    const active=evaluateDisasterRecoveryScheduler([run({
      status:'RUNNING',started_at:'2026-08-21T11:50:00.000Z',heartbeat_at:'2026-08-21T11:59:00.000Z',lease_expires_at:'2026-08-21T12:10:00.000Z',attempt_token:'secret-attempt',controlToken:'secret-control',
    })],now);
    expect(active).toMatchObject({status:'RUNNING',observed_active:true});
    expect(active.latest_run).not.toHaveProperty('attempt_token');
    expect(active.latest_run).not.toHaveProperty('controlToken');
    expect(evaluateDisasterRecoveryScheduler([run({
      status:'RUNNING',started_at:'2026-08-21T11:50:00.000Z',heartbeat_at:'2026-08-21T12:01:00.000Z',lease_expires_at:'2026-08-21T12:10:00.000Z',
    })],now)).toMatchObject({status:'UNVERIFIABLE',reason:'latest_scheduler_heartbeat_timestamp_future',observed_active:false});
    for(const status of ['FAILED','REVIEW_REQUIRED','DUPLICATE_BLOCKED','SOMETHING_NEW']){
      expect(evaluateDisasterRecoveryScheduler([run({status,started_at:'2026-08-21T11:59:00.000Z'})],now).observed_active).toBe(false);
    }
  });

  it('declares exactly one active daily DR automation in the checked-in Base44 configuration',()=>{
    const config=JSON.parse(read('base44/functions/maintenanceEngine/function.jsonc'));
    const rows=config.automations.filter((row)=>row.function_args?.host_action==='disaster_recovery_backup');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      is_active:true,schedule_mode:'recurring',schedule_type:'simple',repeat_unit:'days',repeat_interval:1,
    });
    const continuation=config.automations.filter((row)=>row.function_args?.host_action==='disaster_recovery_backup_continue');
    expect(continuation).toHaveLength(1);
    expect(continuation[0]).toMatchObject({
      is_active:true,schedule_mode:'recurring',schedule_type:'simple',repeat_unit:'minutes',repeat_interval:10,
      function_args:{hosted_worker:'disasterRecoveryBackupContinuation'},
    });
  });

  it('keeps restore PASS fail-closed behind runtime identity, exact readback and compensation',()=>{
    const runtime=read('base44/shared/disasterRecoveryRuntime.ts');
    const attest=runtime.slice(runtime.indexOf('async function attestRestore'),runtime.indexOf('function errorResponse'));
    const probe=attest.indexOf("gate_key:'REAL_RESTORE_ATTESTATION_PROBE'");
    const promote=attest.indexOf("status:'PASS',data_integrity_checks_json");
    const readback=attest.indexOf('DisasterRecoveryExercise.get(promoted.id)');
    const finalGate=attest.indexOf("gate_key:'REAL_RESTORE',environment:'production'",probe+1);
    expect(probe).toBeGreaterThan(-1);
    expect(promote).toBeGreaterThan(probe);
    expect(readback).toBeGreaterThan(promote);
    expect(finalGate).toBeGreaterThan(readback);
    expect(attest).toContain("status:'BLOCKED'");
    expect(attest).toContain('disasterRecovery.attest_restore.compensation');
    expect(attest).toContain('exercise_projection_verified:true');
    expect(attest).toContain('runtime_gate_pending:false');
    expect(attest).toContain('runtime_gate_ready:true');
    expect(attest).not.toContain('finalize_exercise');
    const core=read('base44/shared/disasterRecoveryCore.ts'),authority=core.slice(core.indexOf('export async function persistRestoreAttestationAuthority'),core.indexOf('export function stableValue'));
    expect(core).not.toContain('operations.finalize_exercise');
    expect(authority.indexOf('operations.record_gate')).toBeLessThan(authority.indexOf('operations.read_gate'));
    expect(authority.indexOf('operations.read_gate')).toBeLessThan(authority.indexOf('operations.read_latest_gate'));
    expect(authority.indexOf('operations.read_latest_gate')).toBeLessThan(authority.indexOf('operations.verify_gate'));
    expect(authority.indexOf('operations.verify_gate')).toBeLessThan(authority.indexOf('return {probe:probeReadback'));
    expect(runtime).toContain("RuntimeGateEvidence.get(gate.id)");
    expect(runtime).toContain("RuntimeGateEvidence.filter({gate_key:gateKey},'-observed_at',2)");
    expect(runtime).toContain("evidence_authentication:'AES-256-GCM'");
    expect(runtime).toContain('.json.gz.aes256gcm');
    expect(runtime).toContain('await verifyManifest(manifest)');
    expect(runtime).not.toContain("status:pass?'PASS':'FAIL',rpo_target_minutes");
    expect(read('base44/shared/runtimeEvidence.ts')).toContain('real_restore_exercise_projection_unverified');
  });

  it('remaps exact IDs recursively so Base44-generated target IDs preserve relationships',()=>{
    const mapping=new Map([['old-brand','new-brand'],['old-provider','new-provider']]);
    expect(deepRemap({brand_id:'old-brand',nested:{provider:'old-provider'},ids:['old-brand','literal']},mapping)).toEqual({brand_id:'new-brand',nested:{provider:'new-provider'},ids:['new-brand','literal']});
  });

  it('covers every checked-in entity and uses the required SharePoint structure without a new physical function',()=>{
    const entityFiles=fs.readdirSync(path.join(root,'base44/entities')).filter((name)=>name.endsWith('.jsonc')).map((name)=>name.slice(0,-6)).sort();
    expect([...DISASTER_RECOVERY_ENTITY_CATALOG].sort()).toEqual(entityFiles);
    expect([...DR_FOLDERS]).toEqual(['Daily','Weekly','Monthly','Manifests','Restore Evidence']);
    const host=read('base44/functions/maintenanceEngine/entry.ts'),config=read('base44/functions/maintenanceEngine/function.jsonc'),runtime=read('base44/shared/disasterRecoveryRuntime.ts'),core=read('base44/shared/disasterRecoveryCore.ts'),storage=read('base44/shared/sharePointBackupStorage.ts');
    expect(host).toContain("String(routed.host_action||'').startsWith('disaster_recovery_backup')");
    expect(host).toContain('"disaster_recovery_backup_continue":{"worker_key":"disasterRecoveryBackupContinuation","cadence_seconds":600}');
    expect(host).toContain("String(routed.action||'').startsWith('dr_')");
    expect(config).toContain('Encrypted SharePoint disaster-recovery backup');
    expect(core).toContain('DR_RESTORE_PRODUCTION_FORBIDDEN');
    expect(runtime).toContain('DR_PRODUCTION_CONTROL_PLANE_REQUIRED');
    expect(runtime).toContain('source_secrets_restored:false');
    expect(runtime).toContain('deployment_identity:runtimeDeploymentIdentity()');
    expect(runtime).toContain("latest&&!latest.catalog.current?'FULL'");
    expect(runtime).toContain("readLatestCheckpoint(storage,key,{requireCurrentCatalog:false})");
    expect(runtime).toContain('...releaseIdentity,checkpoint_from');
    expect(runtime).not.toContain("release_version:'0.97.0'");
    expect(storage).toContain('client_credentials');
    expect(core).toContain('globalcambra.sharepoint.com');
    expect(core).toContain('CAMBRA INFRASTRUCTURE');
    expect(storage).toContain('DR_SHAREPOINT_DRIVE_TARGET_AMBIGUOUS');
    expect(runtime).toContain('dr_status_scheduler');
    expect(storage).toContain('upload_final_receipt_invalid');
    expect(storage).toContain('upload_final_receipt_missing');
    expect(storage).toContain('upload_small_receipt_invalid');
    expect(storage).not.toContain('response.json().catch(()=>null)');
    expect(fs.existsSync(path.join(root,'base44/functions/disasterRecoveryBackup'))).toBe(false);
  });
});
