import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from './internalGate.ts';
import { realRestoreExerciseProjectionHash, recordRuntimeGateEvidence, runtimeDeploymentIdentity, verifyRuntimeGateEvidence } from './runtimeEvidence.ts';
import { DISASTER_RECOVERY_ENTITY_CATALOG, DISASTER_RECOVERY_ENTITY_CATALOG_VERSION } from './generated/disasterRecoveryEntityCatalog.ts';
import {
  DISASTER_RECOVERY_VERSION, DISASTER_RECOVERY_SCHEMA_VERSION, DR_EPHEMERAL_SECRET_ENTITIES,
  DR_NON_RESTORABLE_ENTITIES, DR_PAGE_SIZE, DR_RETENTION_DAYS, DR_RPO_TARGET_MINUTES,
  DR_RTO_TARGET_MINUTES, assertAttachmentByteLengths, assertIsolatedRestoreTarget, backupTier, collectExactReferences,
  collectOwnedFileReferences, decryptEnvelope, deepRemap, diffRecords, encryptEnvelope,
  evaluateDisasterRecoveryScheduler,
  gzipBytes, gunzipBytes, indexRecords, parseAes256Key, parseDrMaxFileBytes, readBoundedDrResponseBytes, redactSecrets, retentionCutoff,
  restoreEnvironment, restoreEvidenceAad, safeFileName, secretLikePaths, sha256Hex, snapshotType,
  stableJson, strictMinuteDifference, stripSystemFields, persistRestoreAttestationAuthority, validateLatestCheckpointIdentity,
  validateRestoreEvidenceAttestation, validateRestoreManifestChain, validateSnapshotManifestIdentity,
} from './disasterRecoveryCore.ts';
import {
  createSharePointBackupStorage, DisasterRecoveryConfigurationError, MicrosoftGraphError,
  openSharePointBackupStorage, readDisasterRecoveryPreflightConfiguration,
  verifySharePointBackupStorage,
} from './sharePointBackupStorage.ts';
import { readRuntimeRows, requireRuntimeSource, runtimeSourceCoverage } from './runtimeSourceRead.ts';

const encoder=new TextEncoder(),decoder=new TextDecoder();
const APP_ID='6a16288b833b3c26d7ac1fab';
const MAX_ENTITY_ROWS=500_000;
const ENTITY_CONCURRENCY=10;
const RESTORE_BATCH=200;

function now(){return new Date().toISOString()}
function authorityTimestampAfter(...values:any[]){let latest=Date.now();for(const value of values){const parsed=Date.parse(String(value||''));if(Number.isFinite(parsed))latest=Math.max(latest,parsed)}return new Date(latest+1).toISOString()}
function getEnv(name:string){return String(Deno.env.get(name)||'').trim()}
function drMaxFileBytes(){return parseDrMaxFileBytes(getEnv('DR_MAX_FILE_BYTES'))}
function assertDrPayloadWithinLimit(bytes:Uint8Array,representation:string){const max=drMaxFileBytes();if(bytes.byteLength>max)throw Object.assign(new Error('dr_owned_file_exceeds_configured_limit'),{code:'DR_OWNED_FILE_TOO_LARGE',representation,bytes:bytes.byteLength,max});return max}
function drErrorCode(error:any,fallback='DISASTER_RECOVERY_FAILED'){const value=String(error?.code||'').trim();return/^[a-zA-Z0-9_-]{1,120}$/.test(value)?value:fallback}
function drConfigurationNames(values:any){return Array.isArray(values)?[...new Set(values.map((value)=>String(value||'').replace(/[^a-zA-Z0-9_ -]/g,'_').slice(0,160)).filter(Boolean))].slice(0,50):[]}
function logDrFailure(event:string,error:any){console.error(JSON.stringify({level:'error',event,error_code:drErrorCode(error)}))}
function jsonBytes(value:any){return encoder.encode(stableJson(value))}
function jsonFromBytes(bytes:Uint8Array){return JSON.parse(decoder.decode(bytes))}
function pathAllowed(path:any,prefix:string,suffix:string){const value=String(path||'');return value.startsWith(prefix)&&value.endsWith(suffix)&&!value.includes('..')&&/^[a-zA-Z0-9 ./_-]+$/.test(value)}

function assertProductionControlPlane(req:Request,operation:string){
 const environment=restoreEnvironment(req);
 if(environment&&environment!=='prod')throw Object.assign(new Error(`dr_${operation}_requires_production_control_plane`),{code:'DR_PRODUCTION_CONTROL_PLANE_REQUIRED',environment});
 return environment||'prod';
}

async function mapLimit<T,R>(values:readonly T[],limit:number,handler:(value:T,index:number)=>Promise<R>){
 const output=new Array<R>(values.length);let cursor=0;
 const workers=Array.from({length:Math.min(limit,values.length)},async()=>{while(true){const index=cursor++;if(index>=values.length)return;output[index]=await handler(values[index],index)}});
 await Promise.all(workers);return output;
}

function configurationStatus(){
 const graph=readDisasterRecoveryPreflightConfiguration(Deno.env,{requireCanonicalTarget:true});
 return{ok:graph.ok,missing:graph.missing,invalid:graph.invalid,destination:{hostname:graph.configuration.siteHostname,site_id_configured:!!graph.configuration.siteId,site_path_configured:!!graph.configuration.sitePath,site_resolution:graph.target.site_resolution,drive_id_configured:!!graph.configuration.driveId,drive_name:graph.configuration.driveName,drive_resolution:graph.target.drive_resolution,root_folder:graph.configuration.rootFolder,canonical_root:graph.target.canonical_root,canonical_target:graph.target.canonical_target},release_identity:graph.release_identity,encryption_key:graph.encryption_key,file_size_limit:graph.file_size_limit,security:{application_identity:true,least_privilege_required:'Microsoft Graph application permission Sites.Selected plus write grant on the exact root site; the grant covers that site and its libraries',encryption:'AES-256-GCM',compression:'gzip',hash:'SHA-256',secrets_in_payload:false}};
}

async function latestRuntimeGateAuthority(service:any,gateKey:string,source:string){
 return requireRuntimeSource(await readRuntimeRows({source,read:()=>service.entities.RuntimeGateEvidence.filter({gate_key:gateKey},'-observed_at',2)}));
}

function exactExerciseProjection(expected:any,observed:any,id:any){
 if(!observed||String(observed.id||'')!==String(id||''))return false;
 return Object.keys(expected||{}).every((field)=>stableJson(observed[field]??null)===stableJson(expected[field]??null));
}

async function listAll(service:any,entityName:string){
 const rows:any[]=[];
 for(let skip=0;skip<MAX_ENTITY_ROWS;skip+=DR_PAGE_SIZE){
  const page=await service.entities[entityName].list('created_date',DR_PAGE_SIZE,skip);
  if(!Array.isArray(page))throw Object.assign(new Error('dr_entity_list_invalid'),{code:'DR_ENTITY_READ_FAILED',entity:entityName});
  rows.push(...page);if(page.length<DR_PAGE_SIZE)return rows;
 }
 throw Object.assign(new Error('dr_entity_row_limit_exceeded'),{code:'DR_ENTITY_ROW_LIMIT_EXCEEDED',entity:entityName});
}

async function readLatestCheckpoint(storage:any,key:Uint8Array){
 const manifestBytes=await storage.downloadIfExists('Manifests/latest.manifest.json');
 const indexBytes=await storage.downloadIfExists('Manifests/latest.index.json.gz.aes256gcm');
 if(!manifestBytes||!indexBytes)return null;
 const manifest=jsonFromBytes(manifestBytes);
 await verifyManifest(manifest);
 if(!manifest?.index?.aad||!manifest?.index?.encrypted_sha256)throw Object.assign(new Error('dr_latest_checkpoint_manifest_invalid'),{code:'DR_CHECKPOINT_INVALID'});
 if(manifest.dr_version!==DISASTER_RECOVERY_VERSION||manifest.source_app_id!==APP_ID||manifest.source_environment!=='prod')throw Object.assign(new Error('dr_latest_checkpoint_source_identity_mismatch'),{code:'DR_CHECKPOINT_IDENTITY_MISMATCH'});
 const expectedCatalog=[...DISASTER_RECOVERY_ENTITY_CATALOG].sort(),observedCatalog=Object.keys(manifest.entity_counts||{}).sort();if(manifest.entity_catalog_version!==DISASTER_RECOVERY_ENTITY_CATALOG_VERSION||manifest.entity_catalog_count!==expectedCatalog.length||observedCatalog.length!==expectedCatalog.length||observedCatalog.some((name,index)=>name!==expectedCatalog[index]))throw Object.assign(new Error('dr_latest_checkpoint_catalog_mismatch'),{code:'DR_CHECKPOINT_IDENTITY_MISMATCH'});
 if(await sha256Hex(indexBytes)!==manifest.index.encrypted_sha256)throw Object.assign(new Error('dr_latest_checkpoint_hash_mismatch'),{code:'DR_CHECKPOINT_HASH_MISMATCH'});
 const decrypted=await decryptEnvelope(indexBytes,key,manifest.index.aad);
 const decompressed=await gunzipBytes(decrypted.bytes,drMaxFileBytes());
 if(await sha256Hex(decompressed)!==manifest.index.payload_sha256)throw Object.assign(new Error('dr_latest_checkpoint_payload_hash_mismatch'),{code:'DR_CHECKPOINT_HASH_MISMATCH'});
 const index=jsonFromBytes(decompressed);
 validateLatestCheckpointIdentity(manifest,index);
 return{manifest,index};
}

function backupIdentity(){
 const at=now(),suffix=crypto.randomUUID().slice(0,8);
 return{at,backupId:`cambra-dr-${at.replace(/[-:.]/g,'').replace('Z','z')}-${suffix}`};
}

async function uploadEncryptedJson(storage:any,path:string,value:any,key:Uint8Array,aad:string){
 const raw=jsonBytes(value),max=assertDrPayloadWithinLimit(raw,'json'),compressed=await gzipBytes(raw,max),envelope=await encryptEnvelope(compressed,key,aad);assertDrPayloadWithinLimit(envelope,'encrypted_envelope');
 await storage.upload(path,envelope,'application/octet-stream');
 return{path,aad,encrypted_bytes:envelope.byteLength,uncompressed_bytes:raw.byteLength,compressed_bytes:compressed.byteLength,encrypted_sha256:await sha256Hex(envelope),payload_sha256:await sha256Hex(raw),compression:'gzip',encryption:'AES-256-GCM',envelope_version:'CAMBRA-DR-AES256GCM-1'};
}

async function fetchOwnedFile(url:string){
  const response=await fetch(url,{redirect:'error',headers:{Accept:'application/octet-stream'}});
  if(!response.ok){await response.body?.cancel('dr_owned_file_download_failed').catch(()=>undefined);throw Object.assign(new Error('dr_owned_file_download_failed'),{code:'DR_OWNED_FILE_DOWNLOAD_FAILED',status:response.status})}
 const max=drMaxFileBytes();
 const bytes=await readBoundedDrResponseBytes(response,max);
 return{bytes,contentType:String(response.headers.get('content-type')||'application/octet-stream')};
}

async function applyRetention(storage:any){
 const deleted:any[]=[];
 for(const folder of Object.keys(DR_RETENTION_DAYS) as Array<keyof typeof DR_RETENTION_DAYS>){
  const cutoff=retentionCutoff(folder),items=await storage.list(folder);
  for(const item of items){
   if(['latest.manifest.json','latest.index.json.gz.aes256gcm'].includes(String(item.name)))continue;
   const created=String(item.createdDateTime||item.lastModifiedDateTime||'');
   if(created&&created<cutoff){await storage.deleteById(String(item.id));deleted.push({folder,name:item.name,created_at:created})}
  }
 }
 return{deleted_count:deleted.length,deleted:deleted.slice(0,200),policy_days:DR_RETENTION_DAYS};
}

async function recordBackupFailure(service:any,error:any){
 const at=now(),code=drErrorCode(error,'DR_BACKUP_FAILED'),providerCode=error instanceof MicrosoftGraphError?error.graphCode:null,dedupe='dr:backup:failure',missing=drConfigurationNames(error?.missing),invalid=drConfigurationNames(error?.invalid);
 const rows=requireRuntimeSource(await readRuntimeRows({source:'dr_backup_failure_incident',read:()=>service.entities.AutonomyIncident.filter({dedupe_key:dedupe,status:'open'},'-last_seen_at',2)}));
 if(rows.length>1)throw Object.assign(new Error('dr_backup_failure_incident_ambiguous'),{code:'DR_INCIDENT_AUTHORITY_AMBIGUOUS'});
 const old=rows[0];
 const row={dedupe_key:dedupe,domain:'data',severity:'critical',status:'open',subject_type:'DisasterRecoveryExercise',subject_id:'_backup',summary:`Disaster recovery backup blocked: ${code}`,details_json:{code,provider_code:providerCode,configuration_required:error instanceof DisasterRecoveryConfigurationError,missing,invalid},workflow_state:'human_review',owner_type:'founder',automation_eligibility:'human_required',financial_impact_minor:0,customer_impact:'high',legal_risk:'medium',first_seen_at:old?.first_seen_at||at,last_seen_at:at};
 if(old)await service.entities.AutonomyIncident.update(old.id,row);else await service.entities.AutonomyIncident.create(row);
 await service.entities.OperationalLog.create({event_type:'disaster_recovery_backup_failed',message:code,data_json:{code,provider_code:providerCode,missing,invalid},actor_email:'disaster_recovery',created_at:at});
}

async function closeBackupFailure(service:any){
 const rows=requireRuntimeSource(await readRuntimeRows({source:'dr_backup_failure_resolution',read:()=>service.entities.AutonomyIncident.filter({dedupe_key:'dr:backup:failure',status:'open'},'-last_seen_at',2)}));
 if(rows.length>1)throw Object.assign(new Error('dr_backup_failure_incident_ambiguous'),{code:'DR_INCIDENT_AUTHORITY_AMBIGUOUS'});
 const old=rows[0];
 if(old)await service.entities.AutonomyIncident.update(old.id,{status:'resolved',workflow_state:'resolved',resolved_at:now(),root_cause:'backup_completed_and_verified',recovery_json:{verified:true}});
}

async function persistRestoreCompensationAmbiguity(service:any,input:any){
 const at=now(),dedupe=String(input.dedupe_key||''),exerciseKey=String(input.exercise_key||'');
 if(!dedupe||!exerciseKey)throw Object.assign(new Error('dr_restore_compensation_marker_identity_missing'),{code:'DR_RESTORE_COMPENSATION_AMBIGUOUS'});
 const before=requireRuntimeSource(await readRuntimeRows({source:'dr_restore_compensation_incident_before',read:()=>service.entities.AutonomyIncident.filter({dedupe_key:dedupe},'-last_seen_at',2)}));
 if(before.length>1)throw Object.assign(new Error('dr_restore_compensation_marker_ambiguous'),{code:'DR_RESTORE_COMPENSATION_AMBIGUOUS'});
 const row={dedupe_key:dedupe,domain:'data',severity:'critical',status:'open',subject_type:'DisasterRecoveryExercise',subject_id:String(input.exercise_id||exerciseKey),summary:'REAL_RESTORE compensation is ambiguous; residual PASS evidence must not be trusted',details_json:{exercise_key:exerciseKey,exercise_id:String(input.exercise_id||''),runtime_gate_id:String(input.gate_id||''),failure_code:drErrorCode(input.compensation_error),original_error_code:drErrorCode(input.error),evidence_hash:String(input.evidence_hash||''),evidence_path:String(input.evidence_path||'')},first_seen_at:before[0]?.first_seen_at||at,last_seen_at:at,workflow_state:'human_review',owner_type:'founder',automation_eligibility:'human_required',financial_impact_minor:0,customer_impact:'high',legal_risk:'medium'};
 const stored=before[0]?await service.entities.AutonomyIncident.update(before[0].id,row):await service.entities.AutonomyIncident.create(row);
 const readback=await service.entities.AutonomyIncident.get(stored.id);
 const after=requireRuntimeSource(await readRuntimeRows({source:'dr_restore_compensation_incident_after',read:()=>service.entities.AutonomyIncident.filter({dedupe_key:dedupe},'-last_seen_at',2)}));
 if(after.length!==1||String(after[0]?.id||'')!==String(readback?.id||'')||readback?.dedupe_key!==dedupe||readback?.status!=='open'||readback?.severity!=='critical'||readback?.details_json?.exercise_key!==exerciseKey)throw Object.assign(new Error('dr_restore_compensation_marker_readback_mismatch'),{code:'DR_RESTORE_COMPENSATION_AMBIGUOUS'});
 return readback;
}

async function readRestoreExerciseConsumerAuthority(service:any,exerciseKey:string,incidentKey:string,source:string){
 const [exerciseRead,markerRead]=await Promise.all([
  readRuntimeRows({source:`${source}_exercise`,limit:2,read:()=>service.entities.DisasterRecoveryExercise.filter({exercise_key:exerciseKey},'-updated_date',2)}),
  readRuntimeRows({source:`${source}_compensation`,limit:2,read:()=>service.entities.AutonomyIncident.filter({dedupe_key:incidentKey},'-last_seen_at',2)}),
 ]);
 return{available:exerciseRead.status==='COMPLETE'&&markerRead.status==='COMPLETE',exact_query:true,rows:exerciseRead.value,compensation_markers:markerRead.value,blockers:[...exerciseRead.blockers,...markerRead.blockers]};
}

async function executeBackup(req:Request,service:any,input:any,actor:string){
 const sourceEnvironment=assertProductionControlPlane(req,'backup');
 const config=configurationStatus();if(!config.ok)throw new DisasterRecoveryConfigurationError(config.missing,config.invalid);
 const key=parseAes256Key(getEnv('DR_BACKUP_AES256_KEY_B64')),storage=await createSharePointBackupStorage(Deno.env,{requireCanonicalTarget:true,initializeFolders:true}),identity=backupIdentity(),tier=String(input.retention_tier||backupTier(new Date(identity.at))) as any;
 if(!['Daily','Weekly','Monthly'].includes(tier))throw Object.assign(new Error('dr_retention_tier_invalid'),{code:'DR_RETENTION_TIER_INVALID'});
 const latest=await readLatestCheckpoint(storage,key),type=snapshotType(input.backup_mode,tier,!!latest),checkpointFrom=type==='FULL'?null:(latest?.index?.checkpoint_to||null),checkpointTo=identity.at;
 const previousEntityIndexes=latest?.index?.entities||{};
 const entityResults=await mapLimit(DISASTER_RECOVERY_ENTITY_CATALOG,ENTITY_CONCURRENCY,async(entityName)=>{
  if(DR_EPHEMERAL_SECRET_ENTITIES.has(entityName))return{entity_name:entityName,excluded:true,exclusion_reason:'ephemeral_auth_material_not_recoverable_or_required',source_count:0,records:[],tombstones:[],index:{},redacted_fields:0};
  const raw=await listAll(service,entityName),redaction={fields:0,paths:[] as string[]},records=raw.map((row:any)=>redactSecrets(row,[entityName],redaction).value);
  const remaining=secretLikePaths(records);if(remaining.length)throw Object.assign(new Error('dr_secret_redaction_incomplete'),{code:'DR_SECRET_REDACTION_INCOMPLETE',entity:entityName,paths:remaining.slice(0,20)});
  const index=await indexRecords(records),diff=diffRecords(records,index,previousEntityIndexes?.[entityName]?.records,type);
  return{entity_name:entityName,excluded:false,restorable:!DR_NON_RESTORABLE_ENTITIES.has(entityName),source_count:records.length,records:diff.records,tombstones:diff.tombstones,index,redacted_fields:redaction.fields,redacted_paths:redaction.paths};
 });
 const allFiles=new Set<string>();for(const result of entityResults)for(const url of collectOwnedFileReferences(result.records))allFiles.add(url);
 const backupRoot=`${tier}/${identity.backupId}`;await storage.ensureFolder(backupRoot);await storage.ensureFolder(`${backupRoot}/attachments`);
 const attachments:any[]=[];let attachmentIndex=0;
 for(const sourceUrl of [...allFiles].sort()){
  const fetched=await fetchOwnedFile(sourceUrl),number=String(++attachmentIndex).padStart(5,'0'),name=safeFileName(new URL(sourceUrl).pathname.split('/').pop(),`attachment-${number}.bin`),path=`${backupRoot}/attachments/${number}-${name}.gz.aes256gcm`,aad=`${identity.backupId}|attachment|${number}`;
  const max=assertDrPayloadWithinLimit(fetched.bytes,'attachment_plaintext'),compressed=await gzipBytes(fetched.bytes,max),envelope=await encryptEnvelope(compressed,key,aad);assertDrPayloadWithinLimit(envelope,'attachment_envelope');await storage.upload(path,envelope,'application/octet-stream');
  attachments.push({source_ref:sourceUrl,source_ref_sha256:await sha256Hex(sourceUrl),file_name:name,content_type:fetched.contentType,storage_path:path,aad,original_bytes:fetched.bytes.byteLength,compressed_bytes:compressed.byteLength,encrypted_bytes:envelope.byteLength,plaintext_sha256:await sha256Hex(fetched.bytes),encrypted_sha256:await sha256Hex(envelope)});
 }
 const entityPayload=Object.fromEntries(entityResults.filter((row:any)=>!row.excluded).map((row:any)=>[row.entity_name,{records:row.records,tombstones:row.tombstones}]));
 const counts=Object.fromEntries(entityResults.map((row:any)=>[row.entity_name,{source:row.source_count,included:row.records.length,tombstones:row.tombstones.length,excluded:row.excluded,restorable:!row.excluded&&row.restorable!==false,redacted_fields:row.redacted_fields}]));
 const entityTotals={source:entityResults.reduce((sum:any,row:any)=>sum+Number(row.source_count||0),0),included:entityResults.reduce((sum:any,row:any)=>sum+Number(row.records?.length||0),0),tombstones:entityResults.reduce((sum:any,row:any)=>sum+Number(row.tombstones?.length||0),0),excluded_entities:entityResults.filter((row:any)=>row.excluded).map((row:any)=>row.entity_name),non_restorable_entities:[...DR_NON_RESTORABLE_ENTITIES],redacted_fields:entityResults.reduce((sum:any,row:any)=>sum+Number(row.redacted_fields||0),0)};
 const attachmentsSummary={count:attachments.length,original_bytes:attachments.reduce((sum,row)=>sum+row.original_bytes,0),encrypted_bytes:attachments.reduce((sum,row)=>sum+row.encrypted_bytes,0),attachment_verification:'digested_after_fetch_only'};
 const deploymentIdentity=runtimeDeploymentIdentity(),releaseIdentity={release_version:deploymentIdentity.release_version,git_sha:deploymentIdentity.git_sha,source_tree_hash:deploymentIdentity.source_tree_hash,source_tree_hash_algorithm:'sha256-tree-v1'};
 const manifestPath=`Manifests/${identity.backupId}.manifest.json`,previousManifestPath=type==='FULL'?null:(latest?.manifest?.manifest_path||null),baseFullManifestPath=type==='FULL'?manifestPath:(latest?.manifest?.base_full_manifest_path||null);
 const payload={schema_version:DISASTER_RECOVERY_SCHEMA_VERSION,dr_version:DISASTER_RECOVERY_VERSION,backup_id:identity.backupId,snapshot_type:type,retention_tier:tier,source_environment:sourceEnvironment,source_app_id:APP_ID,...releaseIdentity,checkpoint_from:checkpointFrom,checkpoint_to:checkpointTo,created_at:identity.at,entity_counts:counts,entity_totals:entityTotals,entities:entityPayload,attachments,attachments_summary:attachmentsSummary,security:{raw_secrets_included:false,redaction_policy:'secret-like keys removed recursively; ephemeral OAuth state/code entities excluded',redacted_field_count:entityResults.reduce((sum:any,row:any)=>sum+Number(row.redacted_fields||0),0)}};
 const snapshotPath=`${backupRoot}/snapshot.json.gz.aes256gcm`,snapshotAad=`${identity.backupId}|snapshot`,snapshotArtifact=await uploadEncryptedJson(storage,snapshotPath,payload,key,snapshotAad);
 const checkpointIndex={schema_version:DISASTER_RECOVERY_SCHEMA_VERSION,catalog_version:DISASTER_RECOVERY_ENTITY_CATALOG_VERSION,backup_id:identity.backupId,checkpoint_to:checkpointTo,entities:Object.fromEntries(entityResults.filter((row:any)=>!row.excluded).map((row:any)=>[row.entity_name,{records:row.index}]))};
 const indexPath=`Manifests/${identity.backupId}.index.json.gz.aes256gcm`,indexAad=`${identity.backupId}|index`,indexArtifact=await uploadEncryptedJson(storage,indexPath,checkpointIndex,key,indexAad);
 const manifestCore={schema_version:DISASTER_RECOVERY_SCHEMA_VERSION,dr_version:DISASTER_RECOVERY_VERSION,manifest_path:manifestPath,backup_id:identity.backupId,snapshot_type:type,retention_tier:tier,source_environment:sourceEnvironment,source_app_id:APP_ID,...releaseIdentity,entity_catalog_version:DISASTER_RECOVERY_ENTITY_CATALOG_VERSION,entity_catalog_count:DISASTER_RECOVERY_ENTITY_CATALOG.length,checkpoint_from:checkpointFrom,checkpoint_to:checkpointTo,previous_manifest_path:previousManifestPath,base_full_manifest_path:baseFullManifestPath,created_at:identity.at,created_by:actor,storage_identity:storage.identity,backup_root_path:backupRoot,snapshot:snapshotArtifact,index:indexArtifact,entity_counts:counts,entity_totals:entityTotals,/* AUDIT P2-06 (2026-08-17): this used to be `all_verified_before_upload: true`, sealed into the
   backup manifest with no verification behind it. Nothing in executeBackup compares an attachment
   against an independent reference: fetchOwnedFile checks only response.ok and a size ceiling,
   and the sha256 on each row is a digest of the fetched copy itself, not a check against a source-
   side digest. So the field asserted a property the code did not deliver. Replaced by an
   attachment_verification note that describes what actually happened. */
attachments:attachmentsSummary,retention_policy_days:DR_RETENTION_DAYS,security:{compression:'gzip',encryption:'AES-256-GCM',authentication_tag_bits:128,hash:'SHA-256',key_material_persisted:false,raw_secrets_included:false,github_production_data:false}};
 const manifest={...manifestCore,manifest_hash:await sha256Hex(stableJson(manifestCore))},manifestBytes=jsonBytes(manifest);
 await storage.upload(manifestPath,manifestBytes,'application/json');
 await storage.upload('Manifests/latest.index.json.gz.aes256gcm',await storage.download(indexPath),'application/octet-stream');
 await storage.upload('Manifests/latest.manifest.json',manifestBytes,'application/json');
 const retention=await applyRetention(storage);
 await service.entities.OperationalLog.create({event_type:'disaster_recovery_backup_completed',message:`${type} backup ${identity.backupId}`,data_json:{backup_id:identity.backupId,manifest_path:manifestPath,manifest_hash:manifest.manifest_hash,snapshot_hash:snapshotArtifact.encrypted_sha256,checkpoint_to:checkpointTo,source_count:manifest.entity_totals.source,included_count:manifest.entity_totals.included,attachments:attachments.length,retention_deleted:retention.deleted_count},actor_email:actor||'disaster_recovery',created_at:now()});
 await closeBackupFailure(service);
 return{ok:true,backup_id:identity.backupId,manifest_path:manifestPath,manifest_hash:manifest.manifest_hash,snapshot_type:type,retention_tier:tier,checkpoint_from:checkpointFrom,checkpoint_to:checkpointTo,entity_totals:manifest.entity_totals,attachments:manifest.attachments,storage_identity:storage.identity,retention};
}

function verifyManifest(manifest:any){
 if(!manifest||manifest.schema_version!==DISASTER_RECOVERY_SCHEMA_VERSION||!manifest.manifest_hash)throw Object.assign(new Error('dr_manifest_invalid'),{code:'DR_MANIFEST_INVALID'});
 const{manifest_hash,...core}=manifest;return sha256Hex(stableJson(core)).then((hash)=>{if(hash!==manifest_hash)throw Object.assign(new Error('dr_manifest_hash_mismatch'),{code:'DR_MANIFEST_HASH_MISMATCH'});return manifest});
}

async function loadManifest(storage:any,path:string){
 if(!pathAllowed(path,'Manifests/','.manifest.json'))throw Object.assign(new Error('dr_manifest_path_invalid'),{code:'DR_MANIFEST_PATH_INVALID'});
 const bytes=await storage.download(path),manifest=jsonFromBytes(bytes);await verifyManifest(manifest);if(manifest.manifest_path!==path)throw Object.assign(new Error('dr_manifest_path_identity_mismatch'),{code:'DR_MANIFEST_IDENTITY_MISMATCH'});return manifest;
}

async function loadRestoreChain(storage:any,selectedPath:string){
 const reverse:any[]=[];let path=selectedPath;
 for(let step=0;step<100;step++){
  const manifest=await loadManifest(storage,path);reverse.push(manifest);
  if(manifest.snapshot_type==='FULL')break;
  path=String(manifest.previous_manifest_path||'');if(!path)throw Object.assign(new Error('dr_incremental_chain_missing_full'),{code:'DR_INCREMENTAL_CHAIN_INVALID'});
 }
 if(!reverse.length||reverse.at(-1)?.snapshot_type!=='FULL')throw Object.assign(new Error('dr_restore_chain_too_long_or_missing_full'),{code:'DR_INCREMENTAL_CHAIN_INVALID'});
 const chain=reverse.reverse();
 validateRestoreManifestChain(chain,{source_app_id:APP_ID,source_environment:'prod',entity_catalog_version:DISASTER_RECOVERY_ENTITY_CATALOG_VERSION,entity_catalog_count:DISASTER_RECOVERY_ENTITY_CATALOG.length,entity_catalog:DISASTER_RECOVERY_ENTITY_CATALOG,excluded_entities:[...DR_EPHEMERAL_SECRET_ENTITIES],non_restorable_entities:[...DR_NON_RESTORABLE_ENTITIES]});
 return chain;
}

async function loadSnapshot(storage:any,manifest:any,key:Uint8Array){
 const bytes=await storage.download(String(manifest.snapshot.path));
 if(await sha256Hex(bytes)!==manifest.snapshot.encrypted_sha256)throw Object.assign(new Error('dr_snapshot_ciphertext_hash_mismatch'),{code:'DR_SNAPSHOT_HASH_MISMATCH',backup_id:manifest.backup_id});
 const decrypted=await decryptEnvelope(bytes,key,String(manifest.snapshot.aad)),plain=await gunzipBytes(decrypted.bytes,drMaxFileBytes());
 if(await sha256Hex(plain)!==manifest.snapshot.payload_sha256)throw Object.assign(new Error('dr_snapshot_plaintext_hash_mismatch'),{code:'DR_SNAPSHOT_HASH_MISMATCH',backup_id:manifest.backup_id});
 const payload=jsonFromBytes(plain);validateSnapshotManifestIdentity(manifest,payload,{entity_catalog:DISASTER_RECOVERY_ENTITY_CATALOG});
 for(const attachment of payload.attachments||[])if(await sha256Hex(String(attachment.source_ref||''))!==String(attachment.source_ref_sha256||''))throw Object.assign(new Error('dr_attachment_source_reference_hash_mismatch'),{code:'DR_SNAPSHOT_ATTACHMENT_INVALID',backup_id:manifest.backup_id});
 return payload;
}

async function desiredStateFromChain(storage:any,chain:any[],key:Uint8Array){
 const entities=new Map<string,Map<string,any>>(),attachments=new Map<string,any>();
 for(const manifest of chain){
  const payload=await loadSnapshot(storage,manifest,key);
  for(const[entityName,change]of Object.entries(payload.entities||{}) as any){
   const state=entities.get(entityName)||new Map<string,any>();
   for(const id of change.tombstones||[])state.delete(String(id));
   for(const record of change.records||[]){if(!record?.id)throw Object.assign(new Error('dr_snapshot_record_id_missing'),{code:'DR_SNAPSHOT_RECORD_INVALID',entity:entityName});state.set(String(record.id),record)}
   entities.set(entityName,state);
  }
  for(const attachment of payload.attachments||[])attachments.set(String(attachment.source_ref),attachment);
 }
 return{entities,attachments:[...attachments.values()]};
}

async function wipeRestoreTarget(service:any,entityNames:string[]){
 const result:any={};
 for(const entityName of entityNames){let deleted=0;for(let pass=0;pass<2000;pass++){const rows=await service.entities[entityName].list('created_date',DR_PAGE_SIZE,0,['id']);if(!rows.length)break;const ids=rows.map((row:any)=>row.id).filter(Boolean);if(!ids.length)break;const response=await service.entities[entityName].deleteMany({id:{$in:ids}});deleted+=Number(response?.deleted||ids.length);if(rows.length<DR_PAGE_SIZE)break}result[entityName]=deleted}
 return result;
}

async function restoreAttachments(service:any,storage:any,attachments:any[],key:Uint8Array){
 const mapping=new Map<string,string>(),evidence:any[]=[];
 for(const attachment of attachments){
  const encrypted=await storage.download(String(attachment.storage_path));if(await sha256Hex(encrypted)!==attachment.encrypted_sha256)throw Object.assign(new Error('dr_attachment_ciphertext_hash_mismatch'),{code:'DR_ATTACHMENT_HASH_MISMATCH'});
  const decrypted=await decryptEnvelope(encrypted,key,String(attachment.aad)),bytes=await gunzipBytes(decrypted.bytes,drMaxFileBytes());assertAttachmentByteLengths(attachment,{encrypted:encrypted.byteLength,compressed:decrypted.bytes.byteLength,original:bytes.byteLength});if(await sha256Hex(bytes)!==attachment.plaintext_sha256)throw Object.assign(new Error('dr_attachment_plaintext_hash_mismatch'),{code:'DR_ATTACHMENT_HASH_MISMATCH'});
  const fileBuffer=new ArrayBuffer(bytes.byteLength);new Uint8Array(fileBuffer).set(bytes);const file=new File([fileBuffer],String(attachment.file_name||'restored.bin'),{type:String(attachment.content_type||'application/octet-stream')});
  const uploaded=await service.integrations.Core.UploadFile({file});const targetUrl=String(uploaded?.file_url||'');if(!targetUrl)throw Object.assign(new Error('dr_attachment_target_upload_failed'),{code:'DR_ATTACHMENT_RESTORE_FAILED'});
  const check=await fetch(targetUrl,{redirect:'error'});if(!check.ok){await check.body?.cancel('dr_attachment_target_verification_failed').catch(()=>undefined);throw Object.assign(new Error('dr_attachment_target_verification_failed'),{code:'DR_ATTACHMENT_RESTORE_FAILED'})}const max=drMaxFileBytes(),targetBytes=await readBoundedDrResponseBytes(check,max);if(targetBytes.byteLength!==bytes.byteLength||await sha256Hex(targetBytes)!==attachment.plaintext_sha256)throw Object.assign(new Error('dr_attachment_target_verification_failed'),{code:'DR_ATTACHMENT_RESTORE_FAILED'});
  mapping.set(String(attachment.source_ref),targetUrl);evidence.push({source_ref_sha256:attachment.source_ref_sha256,target_ref_sha256:await sha256Hex(targetUrl),plaintext_sha256:attachment.plaintext_sha256,bytes:bytes.byteLength,verified:true});
 }
 return{mapping,evidence};
}

async function createRestoredRecords(service:any,desired:Map<string,Map<string,any>>,userMapping:Map<string,string>){
 const idMapping=new Map<string,string>(userMapping),createdByEntity:any={},recordsByEntity=new Map<string,Array<{source:any;target:any}>>();
 for(const[entityName,state]of desired){
  if(DR_NON_RESTORABLE_ENTITIES.has(entityName)||DR_EPHEMERAL_SECRET_ENTITIES.has(entityName))continue;
  const source=[...state.values()],pairs:Array<{source:any;target:any}>=[];
  for(let offset=0;offset<source.length;offset+=RESTORE_BATCH){const batch=source.slice(offset,offset+RESTORE_BATCH),created=await service.entities[entityName].bulkCreate(batch.map(stripSystemFields));if(!Array.isArray(created)||created.length!==batch.length)throw Object.assign(new Error('dr_restore_bulk_create_count_mismatch'),{code:'DR_RESTORE_CREATE_FAILED',entity:entityName});for(let index=0;index<batch.length;index++){idMapping.set(String(batch[index].id),String(created[index].id));pairs.push({source:batch[index],target:created[index]})}}
  createdByEntity[entityName]=pairs.length;recordsByEntity.set(entityName,pairs);
 }
 return{idMapping,createdByEntity,recordsByEntity};
}

async function remapRestoredRecords(service:any,recordsByEntity:Map<string,Array<{source:any;target:any}>>,mapping:Map<string,string>){
 for(const[entityName,pairs]of recordsByEntity){for(let offset=0;offset<pairs.length;offset+=RESTORE_BATCH){const batch=pairs.slice(offset,offset+RESTORE_BATCH).map(({source,target})=>({id:target.id,...deepRemap(stripSystemFields(source),mapping)}));if(batch.length)await service.entities[entityName].bulkUpdate(batch)}}
}

async function targetUserMapping(service:any,userState:Map<string,any>|undefined){
 const mapping=new Map<string,string>(),missing:string[]=[];if(!userState)return{mapping,missing,matched:0,source:0};
 const target=await service.entities.User.list('created_date',5000),byEmail=new Map(target.map((row:any)=>[String(row.email||'').toLowerCase(),String(row.id)]));
 for(const source of userState.values()){const email=String(source.email||'').toLowerCase(),id=byEmail.get(email);if(id)mapping.set(String(source.id),String(id));else missing.push(email||String(source.id))}
 return{mapping,missing,matched:mapping.size,source:userState.size};
}

async function validateRestoredState(service:any,desired:Map<string,Map<string,any>>,mapping:Map<string,string>,recordsByEntity:Map<string,Array<{source:any;target:any}>>){
 const oldIds=new Set<string>();for(const state of desired.values())for(const id of state.keys())oldIds.add(id);
 const counts:any={},hashes:any={};let unresolvedReferences=0,expectedReferences=0;
 for(const[entityName,state]of desired){
  if(DR_NON_RESTORABLE_ENTITIES.has(entityName)||DR_EPHEMERAL_SECRET_ENTITIES.has(entityName))continue;
  const target=await listAll(service,entityName),expected=[...state.values()].map((row)=>deepRemap(stripSystemFields(row),mapping)),actual=target.map(stripSystemFields);
  counts[entityName]={expected:expected.length,actual:actual.length,pass:expected.length===actual.length};
  const expectedHashes=(await Promise.all(expected.map((row)=>sha256Hex(stableJson(row))))).sort(),actualHashes=(await Promise.all(actual.map((row)=>sha256Hex(stableJson(row))))).sort();
  const pass=expectedHashes.length===actualHashes.length&&expectedHashes.every((hash,index)=>hash===actualHashes[index]);hashes[entityName]={pass,expected_hash:await sha256Hex(expectedHashes.join('\n')),actual_hash:await sha256Hex(actualHashes.join('\n'))};
  for(const row of state.values())expectedReferences+=collectExactReferences(stripSystemFields(row),oldIds).length;
  for(const row of actual)unresolvedReferences+=collectExactReferences(row,oldIds).length;
 }
 const countPass=Object.values(counts).every((row:any)=>row.pass),hashPass=Object.values(hashes).every((row:any)=>row.pass);
 return{pass:countPass&&hashPass&&unresolvedReferences===0,counts,hashes,relationships:{pass:unresolvedReferences===0,source_references:expectedReferences,unresolved_old_id_references:unresolvedReferences,mapped_ids:mapping.size},created_entities:[...recordsByEntity.keys()].length};
}

async function executeRestore(req:Request,service:any,input:any,actor:string){
 const environment=assertIsolatedRestoreTarget(req,input.confirmation);if(input.wipe_target!==true)throw Object.assign(new Error('dr_restore_requires_clean_target_confirmation'),{code:'DR_RESTORE_WIPE_CONFIRMATION_REQUIRED'});
 const config=configurationStatus();if(!config.ok)throw new DisasterRecoveryConfigurationError(config.missing,config.invalid);
 const started=now(),key=parseAes256Key(getEnv('DR_BACKUP_AES256_KEY_B64')),storage=await openSharePointBackupStorage(Deno.env,{requireCanonicalTarget:true});
 let selectedPath=String(input.manifest_path||'');if(!selectedPath){const latest=await storage.download('Manifests/latest.manifest.json');selectedPath=String(jsonFromBytes(latest).manifest_path||'')}
 const chain=await loadRestoreChain(storage,selectedPath),selected=chain.at(-1),desired=await desiredStateFromChain(storage,chain,key);
 const sourceUser=desired.entities.get('User'),users=await targetUserMapping(service,sourceUser);if(users.missing.length)throw Object.assign(new Error('dr_restore_target_users_missing'),{code:'DR_RESTORE_TARGET_USERS_MISSING',missing_count:users.missing.length,missing_user_hashes:await Promise.all(users.missing.map((item)=>sha256Hex(item)))});
 const entityNames=[...desired.entities.keys()].filter((name)=>!DR_NON_RESTORABLE_ENTITIES.has(name)&&!DR_EPHEMERAL_SECRET_ENTITIES.has(name));
 const wiped=await wipeRestoreTarget(service,entityNames),attachments=await restoreAttachments(service,storage,desired.attachments,key),created=await createRestoredRecords(service,desired.entities,users.mapping),mapping=new Map([...created.idMapping,...attachments.mapping]);
 await remapRestoredRecords(service,created.recordsByEntity,mapping);
 const integrity=await validateRestoredState(service,desired.entities,mapping,created.recordsByEntity),completed=now(),measurementNow=Date.now();
 const rpo=strictMinuteDifference(started,selected.checkpoint_to,measurementNow),rto=strictMinuteDifference(completed,started,measurementNow),attachmentsPass=attachments.evidence.every((row)=>row.verified),pass=integrity.pass&&rpo<=DR_RPO_TARGET_MINUTES&&rto<=DR_RTO_TARGET_MINUTES&&attachmentsPass;
 const exerciseKey=`real-restore:${selected.backup_id}:${environment}:${completed}`,restoredTargetRef=`base44:${APP_ID}:data-env:${environment}`;
 const evidenceCore={schema_version:'cambra-dr-restore-evidence-v1',dr_version:DISASTER_RECOVERY_VERSION,exercise_key:exerciseKey,status:pass?'PASS':'FAIL',source_environment:String(selected.source_environment),source_app_id:String(selected.source_app_id),source_release_version:String(selected.release_version),source_git_sha:String(selected.git_sha),source_tree_hash:String(selected.source_tree_hash),source_tree_hash_algorithm:String(selected.source_tree_hash_algorithm),target_environment:environment,target_isolated:true,target_production:false,restored_target_ref:restoredTargetRef,manifest_path:selected.manifest_path,manifest_hash:selected.manifest_hash,backup_id:selected.backup_id,backup_checkpoint_at:selected.checkpoint_to,snapshot_encrypted_sha256:selected.snapshot.encrypted_sha256,snapshot_payload_sha256:selected.snapshot.payload_sha256,chain:chain.map((row)=>({backup_id:row.backup_id,manifest_path:row.manifest_path,manifest_hash:row.manifest_hash,snapshot_type:row.snapshot_type,checkpoint_from:row.checkpoint_from??null,checkpoint_to:row.checkpoint_to})),started_at:started,completed_at:completed,rpo_target_minutes:DR_RPO_TARGET_MINUTES,rpo_observed_minutes:rpo,rto_target_minutes:DR_RTO_TARGET_MINUTES,rto_observed_minutes:rto,integrity,wiped_counts:wiped,created_counts:created.createdByEntity,user_identity_reconciliation:{source:users.source,matched:users.matched,missing:0},attachments:{count:attachments.evidence.length,pass:attachmentsPass,items:attachments.evidence},security:{source_secrets_restored:false,secret_material_required_after_disaster:'provider/OAuth/webhook credentials must be reconnected or rotated; they are intentionally absent from backups',backup_encryption_verified:true,ciphertext_hashes_verified:true,evidence_authentication:'AES-256-GCM'},conducted_by:actor};
 const evidence={...evidenceCore,evidence_hash:await sha256Hex(stableJson(evidenceCore))},evidenceAad=restoreEvidenceAad(evidence),evidencePlain=jsonBytes(evidence),evidenceMax=assertDrPayloadWithinLimit(evidencePlain,'restore_evidence_json'),evidenceEnvelope=await encryptEnvelope(await gzipBytes(evidencePlain,evidenceMax),key,evidenceAad),evidencePath=`Restore Evidence/${safeFileName(exerciseKey)}.json.gz.aes256gcm`;assertDrPayloadWithinLimit(evidenceEnvelope,'restore_evidence_envelope');const evidenceFileHash=await sha256Hex(evidenceEnvelope);
 await storage.upload(evidencePath,evidenceEnvelope,'application/octet-stream');
 await service.entities.DisasterRecoveryExercise.create({exercise_key:exerciseKey,environment,exercise_type:'REAL_RESTORE',status:pass?'BLOCKED':'FAIL',rpo_target_minutes:DR_RPO_TARGET_MINUTES,rpo_observed_minutes:rpo,rto_target_minutes:DR_RTO_TARGET_MINUTES,rto_observed_minutes:rto,backup_snapshot_ref:selected.manifest_path,restored_target_ref:restoredTargetRef,data_integrity_checks_json:{...integrity,attachments:evidence.attachments,evidence_hash:evidence.evidence_hash,evidence_file_sha256:evidenceFileHash,evidence_aad:evidenceAad,production_attestation_pending:pass},evidence_refs:[evidencePath],conducted_by:actor,started_at:started,completed_at:completed});
 return{ok:pass,status:pass?'PENDING_PRODUCTION_ATTESTATION':'FAIL',evidence_status:evidence.status,exercise_key:exerciseKey,evidence_path:evidencePath,evidence_file_sha256:evidenceFileHash,evidence_hash:evidence.evidence_hash,rpo_observed_minutes:rpo,rto_observed_minutes:rto,integrity,attachments:evidence.attachments,target_environment:environment,next_action:pass?'attest_restore_evidence_in_production':'resolve_integrity_failure_and_repeat'};
}

async function attestRestore(req:Request,service:any,input:any,actor:string){
 assertProductionControlPlane(req,'restore_attestation');
 const config=configurationStatus();if(!config.ok)throw new DisasterRecoveryConfigurationError(config.missing,config.invalid);
 const path=String(input.evidence_path||'');if(!pathAllowed(path,'Restore Evidence/','.json.gz.aes256gcm'))throw Object.assign(new Error('dr_restore_evidence_path_invalid'),{code:'DR_RESTORE_EVIDENCE_PATH_INVALID'});
 const key=parseAes256Key(getEnv('DR_BACKUP_AES256_KEY_B64')),storage=await openSharePointBackupStorage(Deno.env,{requireCanonicalTarget:true}),bytes=await storage.download(path),fileHash=await sha256Hex(bytes);if(fileHash!==String(input.evidence_file_sha256||'').trim().toLowerCase())throw Object.assign(new Error('dr_restore_evidence_file_hash_mismatch'),{code:'DR_RESTORE_EVIDENCE_HASH_MISMATCH'});
 const opened=await decryptEnvelope(bytes,key),plain=await gunzipBytes(opened.bytes,drMaxFileBytes()),evidence=jsonFromBytes(plain),{evidence_hash,...core}=evidence;if(await sha256Hex(stableJson(core))!==evidence_hash)throw Object.assign(new Error('dr_restore_evidence_payload_hash_mismatch'),{code:'DR_RESTORE_EVIDENCE_HASH_MISMATCH'});
 if(opened.aad!==restoreEvidenceAad(evidence))throw Object.assign(new Error('dr_restore_evidence_aad_mismatch'),{code:'DR_RESTORE_EVIDENCE_AUTHENTICATION_FAILED'});
 const chain=await loadRestoreChain(storage,String(evidence.manifest_path||'')),selected=chain.at(-1);
 for(const manifest of chain)await loadSnapshot(storage,manifest,key);
 if(evidence.snapshot_encrypted_sha256!==selected.snapshot.encrypted_sha256||evidence.snapshot_payload_sha256!==selected.snapshot.payload_sha256)throw Object.assign(new Error('dr_restore_evidence_snapshot_anchor_mismatch'),{code:'DR_RESTORE_EVIDENCE_ANCHOR_MISMATCH'});
 const attestation=validateRestoreEvidenceAttestation(evidence,selected,chain,{source_app_id:APP_ID}),target=attestation.target;
 const existingRows=requireRuntimeSource(await readRuntimeRows({source:'dr_restore_exercise_authority',read:()=>service.entities.DisasterRecoveryExercise.filter({exercise_key:evidence.exercise_key},'-updated_date',2)}));if(existingRows.length>1)throw Object.assign(new Error('dr_restore_exercise_authority_ambiguous'),{code:'DR_RESTORE_EXERCISE_AUTHORITY_AMBIGUOUS'});const existing=existingRows[0],row={exercise_key:evidence.exercise_key,environment:`production-boundary-to-${target}`,exercise_type:'REAL_RESTORE',rpo_target_minutes:evidence.rpo_target_minutes,rpo_observed_minutes:evidence.rpo_observed_minutes,rto_target_minutes:evidence.rto_target_minutes,rto_observed_minutes:evidence.rto_observed_minutes,backup_snapshot_ref:evidence.manifest_path,restored_target_ref:`base44:${APP_ID}:data-env:${target}`,data_integrity_checks_json:{...evidence.integrity,attachments:evidence.attachments,evidence_hash,evidence_file_sha256:fileHash,independently_downloaded_from_sharepoint:true},evidence_refs:[path],conducted_by:actor,started_at:evidence.started_at,completed_at:evidence.completed_at};
 const blockedRow={...row,status:'BLOCKED',data_integrity_checks_json:{...row.data_integrity_checks_json,authenticated_aes256gcm_evidence:true,manifest_chain_reverified:true,runtime_gate_pending:true}};
 let exercise=existing?await service.entities.DisasterRecoveryExercise.update(existing.id,blockedRow):await service.entities.DisasterRecoveryExercise.create(blockedRow),gitSha=getEnv('CAMBRA_GIT_SHA');
 const compensationIncidentKey=`dr:restore:compensation:${(await sha256Hex(evidence.exercise_key)).slice(0,32)}`,gateDetails={exercise_id:exercise.id,exercise_key:evidence.exercise_key,compensation_incident_key:compensationIncidentKey,evidence_hash,evidence_file_sha256:fileHash,target_environment:target,manifest_path:evidence.manifest_path,manifest_hash:evidence.manifest_hash,backup_id:evidence.backup_id,source_app_id:evidence.source_app_id,source_environment:evidence.source_environment,source_release_version:evidence.source_release_version,source_git_sha:evidence.source_git_sha,source_tree_hash:evidence.source_tree_hash,rpo_observed_minutes:evidence.rpo_observed_minutes,rto_observed_minutes:evidence.rto_observed_minutes,integrity:evidence.integrity,attachments:evidence.attachments,authenticated_aes256gcm_evidence:true,manifest_chain_reverified:true};
 let probeObservedAt='',gateObservedAt='',expectedPassProjection:any=null,expectedBlockedProjection:any=null;
 const authority=await persistRestoreAttestationAuthority({
  record_probe:async()=>{const at=now();probeObservedAt=at;return recordRuntimeGateEvidence(service,{gate_key:'REAL_RESTORE_ATTESTATION_PROBE',environment:'production',git_sha:gitSha,status:'PASS',evidence_kind:'OPERATOR_EXERCISE',source:'disasterRecovery.attest_restore.preflight',evidence_refs:[path],details_json:{...gateDetails,exercise_projection_required_status:'PASS'},observed_at:at,expires_at:new Date(Date.parse(at)+15*60000).toISOString(),recorded_by:actor})},
  read_probe:(probe:any)=>service.entities.RuntimeGateEvidence.get(probe.id),
  read_latest_probe:()=>latestRuntimeGateAuthority(service,'REAL_RESTORE_ATTESTATION_PROBE','dr_restore_probe_authority'),
  verify_probe:(probe:any)=>verifyRuntimeGateEvidence(probe,{environment:'production',max_age_hours:1}),
  block_probe:async({error,reason,probe}:any)=>{const at=authorityTimestampAfter(probeObservedAt,probe?.observed_at);return recordRuntimeGateEvidence(service,{gate_key:'REAL_RESTORE_ATTESTATION_PROBE',environment:'production',git_sha:gitSha,status:'BLOCKED',evidence_kind:'OPERATOR_EXERCISE',source:'disasterRecovery.attest_restore.preflight_closure',evidence_refs:[path],details_json:{...gateDetails,exercise_projection_verified:false,compensates_runtime_gate_id:probe?.id||null,closure_reason:String(reason||'preflight_failed'),failure_code:error?drErrorCode(error):null},observed_at:at,expires_at:new Date(Date.parse(at)+15*60000).toISOString(),recorded_by:actor})},
  verify_blocked_probe:(probe:any)=>verifyRuntimeGateEvidence(probe,{environment:'production',max_age_hours:1,expected_status:'BLOCKED'}),
  promote_exercise:async(probe:any)=>{expectedPassProjection={...row,status:'PASS',data_integrity_checks_json:{...row.data_integrity_checks_json,authenticated_aes256gcm_evidence:true,manifest_chain_reverified:true,runtime_gate_pending:false,runtime_gate_ready:true,runtime_gate_probe_status:'PASS',runtime_gate_identity_status:'COMPLETE',runtime_gate_probe_id:probe.id}};exercise=await service.entities.DisasterRecoveryExercise.update(exercise.id,expectedPassProjection);return exercise},
  read_exercise:(promoted:any)=>service.entities.DisasterRecoveryExercise.get(promoted.id),
  read_latest_exercise:async()=>requireRuntimeSource(await readRuntimeRows({source:'dr_restore_exercise_exact_authority',read:()=>service.entities.DisasterRecoveryExercise.filter({exercise_key:evidence.exercise_key},'-updated_date',2)})),
  readback_valid:(readback:any)=>exactExerciseProjection(expectedPassProjection,readback,exercise.id),
  record_gate:async(_promoted:any,readback:any)=>{const at=now();gateObservedAt=at;return recordRuntimeGateEvidence(service,{gate_key:'REAL_RESTORE',environment:'production',git_sha:gitSha,status:'PASS',evidence_kind:'OPERATOR_EXERCISE',source:'disasterRecovery.attest_restore',evidence_refs:[path],details_json:{...gateDetails,exercise_projection_verified:true,exercise_projection_status:'PASS',exercise_projection_readback_id:readback.id,exercise_projection_hash:await realRestoreExerciseProjectionHash(readback)},observed_at:at,expires_at:new Date(Date.parse(at)+90*86400000).toISOString(),recorded_by:actor})},
  read_gate:(gate:any)=>service.entities.RuntimeGateEvidence.get(gate.id),
  read_latest_gate:()=>latestRuntimeGateAuthority(service,'REAL_RESTORE','dr_restore_runtime_gate_authority'),
  verify_gate:async(gate:any)=>verifyRuntimeGateEvidence(gate,{environment:'production',max_age_hours:1,real_restore_exercise_authority:await readRestoreExerciseConsumerAuthority(service,evidence.exercise_key,compensationIncidentKey,'dr_restore_gate_verify')}),
  block_gate:async({error,gate}:any)=>{const at=authorityTimestampAfter(gateObservedAt,gate?.observed_at);return recordRuntimeGateEvidence(service,{gate_key:'REAL_RESTORE',environment:'production',git_sha:gitSha,status:'BLOCKED',evidence_kind:'OPERATOR_EXERCISE',source:'disasterRecovery.attest_restore.compensation',evidence_refs:[path],details_json:{...gateDetails,exercise_projection_verified:false,compensates_runtime_gate_id:gate?.id||null,failure_code:drErrorCode(error)},observed_at:at,expires_at:new Date(Date.parse(at)+15*60000).toISOString(),recorded_by:actor})},
  verify_blocked_gate:(gate:any)=>verifyRuntimeGateEvidence(gate,{environment:'production',max_age_hours:1,expected_status:'BLOCKED'}),
  block_exercise:async({error}:any)=>{expectedBlockedProjection={...blockedRow,data_integrity_checks_json:{...blockedRow.data_integrity_checks_json,runtime_gate_pending:false,runtime_gate_status:'BLOCKED',runtime_gate_failure_code:drErrorCode(error)}};exercise=await service.entities.DisasterRecoveryExercise.update(exercise.id,expectedBlockedProjection);return exercise},
  blocked_exercise_valid:(readback:any)=>exactExerciseProjection(expectedBlockedProjection,readback,exercise.id),
  persist_compensation_ambiguity:({error,compensation_error,exercise:failedExercise,gate:failedGate}:any)=>persistRestoreCompensationAmbiguity(service,{dedupe_key:compensationIncidentKey,exercise_key:evidence.exercise_key,exercise_id:failedExercise?.id||exercise?.id,gate_id:failedGate?.id,error,compensation_error,evidence_hash,evidence_path:path}),
  compensation_failed:(stage:string,error:any)=>logDrFailure(`disaster_recovery_restore_${stage}_compensation_failed`,error),
 });
 exercise=authority.exercise;const gateEvidence=authority.gate;
 try{await service.entities.OperationalLog.create({event_type:'disaster_recovery_restore_attested',message:evidence.exercise_key,data_json:{exercise_id:exercise.id,evidence_path:path,evidence_hash,file_sha256:fileHash,target_environment:target,runtime_gate_evidence_id:gateEvidence.id},actor_email:actor,created_at:now()})}catch(logError){logDrFailure('disaster_recovery_restore_attestation_log_failed',logError)}
 return{ok:true,status:'PASS',exercise_id:exercise.id,runtime_gate_evidence_id:gateEvidence.id,evidence_path:path,evidence_hash,file_sha256:fileHash,rpo_observed_minutes:evidence.rpo_observed_minutes,rto_observed_minutes:evidence.rto_observed_minutes};
}

function errorResponse(error:any){
 if(error instanceof DisasterRecoveryConfigurationError)return Response.json({ok:false,error:'dr_configuration_required',missing:error.missing,invalid:error.invalid,required_consent:'Microsoft Graph application permission Sites.Selected with admin consent, followed by a write grant on the exact root site (covering its libraries). Store credentials only in Base44 secrets; configure exact site/drive resource IDs as environment values.'},{status:409});
 if(error instanceof MicrosoftGraphError)return Response.json({ok:false,error:'microsoft_graph_authorization_or_storage_failed',graph_status:error.status,graph_code:error.graphCode,required_consent:'Sites.Selected (Application) + write role on the exact root site; CAMBRA INFRASTRUCTURE is a document library, not the grant target'},{status:409});
 const code=drErrorCode(error);logDrFailure('disaster_recovery_failed',error);return Response.json({ok:false,error:code.toLowerCase()},{status:code.includes('FORBIDDEN')?403:code.includes('CONFIRMATION')||code.includes('INVALID')?400:409});
}

export async function handleDisasterRecovery(req:Request){
 let body:any;try{body=await req.clone().json();}catch{return Response.json({ok:false,error:'invalid_json_body'},{status:400});}const base44=createClientFromRequest(req),gate=await requireAdminOrInternal(req,base44,body);if(!gate.ok)return gate.response;
 const service=base44.asServiceRole,actor=String(gate.user?.email||body.actor_email||'internal'),routed=body.host_action==='disaster_recovery_backup',action=routed?'backup':String(body.action||'status').replace(/^dr_/,'');
 try{
  if(action==='status'){
   if(body.verify_remote===true)assertProductionControlPlane(req,'status_remote');
   const[exerciseRead,logRead,schedulerRead]=await Promise.all([readRuntimeRows({source:'dr_status_exercises',limit:20,read:()=>service.entities.DisasterRecoveryExercise.list('-completed_at',20)}),readRuntimeRows({source:'dr_status_events',limit:50,read:()=>service.entities.OperationalLog.filter({event_type:{$in:['disaster_recovery_backup_completed','disaster_recovery_backup_failed','disaster_recovery_restore_attested']}},'-created_at',50)}),readRuntimeRows({source:'dr_status_scheduler',limit:20,read:()=>service.entities.SchedulerRun.filter({worker_key:'disasterRecoveryBackup',invocation_kind:'SCHEDULED'},'-started_at',20)})]);const exercises=exerciseRead.value,logs=logRead.value,scheduler=evaluateDisasterRecoveryScheduler(schedulerRead.value),sourceCoverage=runtimeSourceCoverage({exercises:exerciseRead,events:logRead,scheduler:schedulerRead});
   const config=configurationStatus();let remote:any=null;if(body.verify_remote===true){if(!config.ok)throw new DisasterRecoveryConfigurationError(config.missing,config.invalid);const storage=await verifySharePointBackupStorage(Deno.env,{requireCanonicalTarget:true});remote={ok:true,read_only:true,identity:storage.identity,folders:Object.fromEntries(await Promise.all(['Daily','Weekly','Monthly','Manifests','Restore Evidence'].map(async(folder)=>[folder,(await storage.list(folder)).length])))};}
   return Response.json({ok:true,version:DISASTER_RECOVERY_VERSION,data_status:sourceCoverage.status,source_coverage:sourceCoverage,configuration:config,scheduler,remote,latest_exercises:exercises,latest_events:logs,rpo_target_minutes:DR_RPO_TARGET_MINUTES,rto_target_minutes:DR_RTO_TARGET_MINUTES,restore_boundary:'X-Data-Env must be dev/test/staging/sandbox; default/prod is rejected'});
  }
  if(action==='backup')return Response.json(await executeBackup(req,service,body,actor));
  if(action==='restore')return Response.json(await executeRestore(req,service,body,actor));
  if(action==='attest_restore')return Response.json(await attestRestore(req,service,body,actor));
  return Response.json({ok:false,error:'dr_action_unsupported'},{status:400});
 }catch(error){if(action==='backup'){try{await recordBackupFailure(service,error)}catch(recordError){logDrFailure('disaster_recovery_failure_evidence_persistence_failed',recordError)}}return errorResponse(error)}
}
