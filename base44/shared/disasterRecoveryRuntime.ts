import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from './internalGate.ts';
import { recordRuntimeGateEvidence } from './runtimeEvidence.ts';
import { DISASTER_RECOVERY_ENTITY_CATALOG, DISASTER_RECOVERY_ENTITY_CATALOG_VERSION } from './generated/disasterRecoveryEntityCatalog.ts';
import {
  DISASTER_RECOVERY_VERSION, DISASTER_RECOVERY_SCHEMA_VERSION, DR_EPHEMERAL_SECRET_ENTITIES,
  DR_NON_RESTORABLE_ENTITIES, DR_PAGE_SIZE, DR_RETENTION_DAYS, DR_RPO_TARGET_MINUTES,
  DR_RTO_TARGET_MINUTES, assertIsolatedRestoreTarget, backupTier, collectExactReferences,
  collectOwnedFileReferences, decryptEnvelope, deepRemap, diffRecords, encryptEnvelope,
  gzipBytes, gunzipBytes, indexRecords, parseAes256Key, redactSecrets, retentionCutoff,
  restoreEnvironment, safeFileName, secretLikePaths, sha256Hex, snapshotType, stableJson, stripSystemFields,
} from './disasterRecoveryCore.ts';
import {
  createSharePointBackupStorage, DisasterRecoveryConfigurationError, MicrosoftGraphError,
  readSharePointBackupConfiguration,
} from './sharePointBackupStorage.ts';
import { readRuntimeRows, requireRuntimeSource, runtimeSourceCoverage } from './runtimeSourceRead.ts';

const encoder=new TextEncoder(),decoder=new TextDecoder();
const APP_ID='6a16288b833b3c26d7ac1fab';
const MAX_ENTITY_ROWS=500_000;
const ENTITY_CONCURRENCY=10;
const RESTORE_BATCH=200;

function now(){return new Date().toISOString()}
function getEnv(name:string){return String(Deno.env.get(name)||'').trim()}
function jsonBytes(value:any){return encoder.encode(stableJson(value))}
function jsonFromBytes(bytes:Uint8Array){return JSON.parse(decoder.decode(bytes))}
function minuteDifference(later:any,earlier:any){return Math.max(0,(Date.parse(String(later||''))-Date.parse(String(earlier||'')))/60000)}
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
 const graph=readSharePointBackupConfiguration(Deno.env),missing=[...graph.missing];
 if(!getEnv('DR_BACKUP_AES256_KEY_B64'))missing.push('DR_BACKUP_AES256_KEY_B64');
 if(!getEnv('CAMBRA_GIT_SHA'))missing.push('CAMBRA_GIT_SHA');
 if(!getEnv('CAMBRA_SOURCE_TREE_HASH'))missing.push('CAMBRA_SOURCE_TREE_HASH');
 return{ok:missing.length===0,missing:[...new Set(missing)],destination:{hostname:graph.configuration.siteHostname,site_id_configured:!!graph.configuration.siteId,site_path_configured:!!graph.configuration.sitePath,drive_id_configured:!!graph.configuration.driveId,drive_name:graph.configuration.driveName,root_folder:graph.configuration.rootFolder},security:{application_identity:true,least_privilege_required:'Microsoft Graph application permission Sites.Selected plus site-specific write grant',encryption:'AES-256-GCM',compression:'gzip',hash:'SHA-256',secrets_in_payload:false}};
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
 if(!manifest?.index?.aad||!manifest?.index?.encrypted_sha256)throw Object.assign(new Error('dr_latest_checkpoint_manifest_invalid'),{code:'DR_CHECKPOINT_INVALID'});
 if(await sha256Hex(indexBytes)!==manifest.index.encrypted_sha256)throw Object.assign(new Error('dr_latest_checkpoint_hash_mismatch'),{code:'DR_CHECKPOINT_HASH_MISMATCH'});
 const decrypted=await decryptEnvelope(indexBytes,key,manifest.index.aad);
 const decompressed=await gunzipBytes(decrypted.bytes);
 const index=jsonFromBytes(decompressed);
 if(index.schema_version!==DISASTER_RECOVERY_SCHEMA_VERSION)throw Object.assign(new Error('dr_checkpoint_schema_mismatch'),{code:'DR_CHECKPOINT_SCHEMA_MISMATCH'});
 return{manifest,index};
}

function backupIdentity(){
 const at=now(),suffix=crypto.randomUUID().slice(0,8);
 return{at,backupId:`cambra-dr-${at.replace(/[-:.]/g,'').replace('Z','z')}-${suffix}`};
}

async function uploadEncryptedJson(storage:any,path:string,value:any,key:Uint8Array,aad:string){
 const raw=jsonBytes(value),compressed=await gzipBytes(raw),envelope=await encryptEnvelope(compressed,key,aad);
 await storage.upload(path,envelope,'application/octet-stream');
 return{path,aad,encrypted_bytes:envelope.byteLength,uncompressed_bytes:raw.byteLength,compressed_bytes:compressed.byteLength,encrypted_sha256:await sha256Hex(envelope),payload_sha256:await sha256Hex(raw),compression:'gzip',encryption:'AES-256-GCM',envelope_version:'CAMBRA-DR-AES256GCM-1'};
}

async function fetchOwnedFile(url:string){
 const response=await fetch(url,{redirect:'error',headers:{Accept:'application/octet-stream'}});
 if(!response.ok)throw Object.assign(new Error('dr_owned_file_download_failed'),{code:'DR_OWNED_FILE_DOWNLOAD_FAILED',status:response.status});
 const bytes=new Uint8Array(await response.arrayBuffer());
 const max=Math.max(1,Number(getEnv('DR_MAX_FILE_BYTES')||100*1024*1024));
 if(bytes.byteLength>max)throw Object.assign(new Error('dr_owned_file_exceeds_configured_limit'),{code:'DR_OWNED_FILE_TOO_LARGE',bytes:bytes.byteLength,max});
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
 const at=now(),code=String(error?.code||'DR_BACKUP_FAILED'),dedupe='dr:backup:failure';
 const rows=requireRuntimeSource(await readRuntimeRows({source:'dr_backup_failure_incident',read:()=>service.entities.AutonomyIncident.filter({dedupe_key:dedupe,status:'open'},'-last_seen_at',2)}));
 if(rows.length>1)throw Object.assign(new Error('dr_backup_failure_incident_ambiguous'),{code:'DR_INCIDENT_AUTHORITY_AMBIGUOUS'});
 const old=rows[0];
 const row={dedupe_key:dedupe,domain:'data',severity:'critical',status:'open',subject_type:'DisasterRecoveryExercise',subject_id:'_backup',summary:`Disaster recovery backup blocked: ${code}`,details_json:{code,configuration_required:error instanceof DisasterRecoveryConfigurationError,missing:error?.missing||[]},workflow_state:'human_review',owner_type:'founder',automation_eligibility:'human_required',financial_impact_minor:0,customer_impact:'high',legal_risk:'medium',first_seen_at:old?.first_seen_at||at,last_seen_at:at};
 if(old)await service.entities.AutonomyIncident.update(old.id,row);else await service.entities.AutonomyIncident.create(row);
 await service.entities.OperationalLog.create({event_type:'disaster_recovery_backup_failed',message:code,data_json:{code,missing:error?.missing||[]},actor_email:'disaster_recovery',created_at:at});
}

async function closeBackupFailure(service:any){
 const rows=requireRuntimeSource(await readRuntimeRows({source:'dr_backup_failure_resolution',read:()=>service.entities.AutonomyIncident.filter({dedupe_key:'dr:backup:failure',status:'open'},'-last_seen_at',2)}));
 if(rows.length>1)throw Object.assign(new Error('dr_backup_failure_incident_ambiguous'),{code:'DR_INCIDENT_AUTHORITY_AMBIGUOUS'});
 const old=rows[0];
 if(old)await service.entities.AutonomyIncident.update(old.id,{status:'resolved',workflow_state:'resolved',resolved_at:now(),root_cause:'backup_completed_and_verified',recovery_json:{verified:true}});
}

async function executeBackup(req:Request,service:any,input:any,actor:string){
 const sourceEnvironment=assertProductionControlPlane(req,'backup');
 const config=configurationStatus();if(!config.ok)throw new DisasterRecoveryConfigurationError(config.missing);
 const key=parseAes256Key(getEnv('DR_BACKUP_AES256_KEY_B64')),storage=await createSharePointBackupStorage(),identity=backupIdentity(),tier=String(input.retention_tier||backupTier(new Date(identity.at))) as any;
 if(!['Daily','Weekly','Monthly'].includes(tier))throw Object.assign(new Error('dr_retention_tier_invalid'),{code:'DR_RETENTION_TIER_INVALID'});
 const latest=await readLatestCheckpoint(storage,key),type=snapshotType(input.backup_mode,tier,!!latest),checkpointFrom=latest?.index?.checkpoint_to||null,checkpointTo=identity.at;
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
  const compressed=await gzipBytes(fetched.bytes),envelope=await encryptEnvelope(compressed,key,aad);await storage.upload(path,envelope,'application/octet-stream');
  attachments.push({source_ref:sourceUrl,source_ref_sha256:await sha256Hex(sourceUrl),file_name:name,content_type:fetched.contentType,storage_path:path,aad,original_bytes:fetched.bytes.byteLength,compressed_bytes:compressed.byteLength,encrypted_bytes:envelope.byteLength,plaintext_sha256:await sha256Hex(fetched.bytes),encrypted_sha256:await sha256Hex(envelope)});
 }
 const entityPayload=Object.fromEntries(entityResults.filter((row:any)=>!row.excluded).map((row:any)=>[row.entity_name,{records:row.records,tombstones:row.tombstones}]));
 const counts=Object.fromEntries(entityResults.map((row:any)=>[row.entity_name,{source:row.source_count,included:row.records.length,tombstones:row.tombstones.length,excluded:row.excluded,restorable:row.restorable!==false,redacted_fields:row.redacted_fields}]));
 const manifestPath=`Manifests/${identity.backupId}.manifest.json`,previousManifestPath=latest?.manifest?.manifest_path||null,baseFullManifestPath=type==='FULL'?manifestPath:(latest?.manifest?.base_full_manifest_path||null);
 const payload={schema_version:DISASTER_RECOVERY_SCHEMA_VERSION,dr_version:DISASTER_RECOVERY_VERSION,backup_id:identity.backupId,snapshot_type:type,retention_tier:tier,source_environment:sourceEnvironment,source_app_id:APP_ID,checkpoint_from:checkpointFrom,checkpoint_to:checkpointTo,created_at:identity.at,entities:entityPayload,attachments,security:{raw_secrets_included:false,redaction_policy:'secret-like keys removed recursively; ephemeral OAuth state/code entities excluded',redacted_field_count:entityResults.reduce((sum:any,row:any)=>sum+Number(row.redacted_fields||0),0)}};
 const snapshotPath=`${backupRoot}/snapshot.json.gz.aes256gcm`,snapshotAad=`${identity.backupId}|snapshot`,snapshotArtifact=await uploadEncryptedJson(storage,snapshotPath,payload,key,snapshotAad);
 const checkpointIndex={schema_version:DISASTER_RECOVERY_SCHEMA_VERSION,catalog_version:DISASTER_RECOVERY_ENTITY_CATALOG_VERSION,backup_id:identity.backupId,checkpoint_to:checkpointTo,entities:Object.fromEntries(entityResults.filter((row:any)=>!row.excluded).map((row:any)=>[row.entity_name,{records:row.index}]))};
 const indexPath=`Manifests/${identity.backupId}.index.json.gz.aes256gcm`,indexAad=`${identity.backupId}|index`,indexArtifact=await uploadEncryptedJson(storage,indexPath,checkpointIndex,key,indexAad);
 const manifestCore={schema_version:DISASTER_RECOVERY_SCHEMA_VERSION,dr_version:DISASTER_RECOVERY_VERSION,manifest_path:manifestPath,backup_id:identity.backupId,snapshot_type:type,retention_tier:tier,source_environment:sourceEnvironment,source_app_id:APP_ID,release_version:'0.97.0',git_sha:getEnv('CAMBRA_GIT_SHA'),source_tree_hash:getEnv('CAMBRA_SOURCE_TREE_HASH'),source_tree_hash_algorithm:'sha256-tree-v1',entity_catalog_version:DISASTER_RECOVERY_ENTITY_CATALOG_VERSION,entity_catalog_count:DISASTER_RECOVERY_ENTITY_CATALOG.length,checkpoint_from:checkpointFrom,checkpoint_to:checkpointTo,previous_manifest_path:previousManifestPath,base_full_manifest_path:baseFullManifestPath,created_at:identity.at,created_by:actor,storage_identity:storage.identity,backup_root_path:backupRoot,snapshot:snapshotArtifact,index:indexArtifact,entity_counts:counts,entity_totals:{source:entityResults.reduce((sum:any,row:any)=>sum+Number(row.source_count||0),0),included:entityResults.reduce((sum:any,row:any)=>sum+Number(row.records?.length||0),0),tombstones:entityResults.reduce((sum:any,row:any)=>sum+Number(row.tombstones?.length||0),0),excluded_entities:entityResults.filter((row:any)=>row.excluded).map((row:any)=>row.entity_name),non_restorable_entities:[...DR_NON_RESTORABLE_ENTITIES],redacted_fields:entityResults.reduce((sum:any,row:any)=>sum+Number(row.redacted_fields||0),0)},attachments:{count:attachments.length,original_bytes:attachments.reduce((sum,row)=>sum+row.original_bytes,0),encrypted_bytes:attachments.reduce((sum,row)=>sum+row.encrypted_bytes,0),all_verified_before_upload:true},retention_policy_days:DR_RETENTION_DAYS,security:{compression:'gzip',encryption:'AES-256-GCM',authentication_tag_bits:128,hash:'SHA-256',key_material_persisted:false,raw_secrets_included:false,github_production_data:false}};
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
 const bytes=await storage.download(path),manifest=jsonFromBytes(bytes);await verifyManifest(manifest);return manifest;
}

async function loadRestoreChain(storage:any,selectedPath:string){
 const reverse:any[]=[];let path=selectedPath;
 for(let step=0;step<100;step++){
  const manifest=await loadManifest(storage,path);reverse.push(manifest);
  if(manifest.snapshot_type==='FULL')break;
  path=String(manifest.previous_manifest_path||'');if(!path)throw Object.assign(new Error('dr_incremental_chain_missing_full'),{code:'DR_INCREMENTAL_CHAIN_INVALID'});
 }
 if(!reverse.length||reverse.at(-1)?.snapshot_type!=='FULL')throw Object.assign(new Error('dr_restore_chain_too_long_or_missing_full'),{code:'DR_INCREMENTAL_CHAIN_INVALID'});
 return reverse.reverse();
}

async function loadSnapshot(storage:any,manifest:any,key:Uint8Array){
 const bytes=await storage.download(String(manifest.snapshot.path));
 if(await sha256Hex(bytes)!==manifest.snapshot.encrypted_sha256)throw Object.assign(new Error('dr_snapshot_ciphertext_hash_mismatch'),{code:'DR_SNAPSHOT_HASH_MISMATCH',backup_id:manifest.backup_id});
 const decrypted=await decryptEnvelope(bytes,key,String(manifest.snapshot.aad)),plain=await gunzipBytes(decrypted.bytes);
 if(await sha256Hex(plain)!==manifest.snapshot.payload_sha256)throw Object.assign(new Error('dr_snapshot_plaintext_hash_mismatch'),{code:'DR_SNAPSHOT_HASH_MISMATCH',backup_id:manifest.backup_id});
 const payload=jsonFromBytes(plain);if(payload.backup_id!==manifest.backup_id||payload.schema_version!==DISASTER_RECOVERY_SCHEMA_VERSION)throw Object.assign(new Error('dr_snapshot_identity_mismatch'),{code:'DR_SNAPSHOT_IDENTITY_MISMATCH'});
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
  const decrypted=await decryptEnvelope(encrypted,key,String(attachment.aad)),bytes=await gunzipBytes(decrypted.bytes);if(await sha256Hex(bytes)!==attachment.plaintext_sha256)throw Object.assign(new Error('dr_attachment_plaintext_hash_mismatch'),{code:'DR_ATTACHMENT_HASH_MISMATCH'});
  const file=new File([bytes],String(attachment.file_name||'restored.bin'),{type:String(attachment.content_type||'application/octet-stream')});
  const uploaded=await service.integrations.Core.UploadFile({file});const targetUrl=String(uploaded?.file_url||'');if(!targetUrl)throw Object.assign(new Error('dr_attachment_target_upload_failed'),{code:'DR_ATTACHMENT_RESTORE_FAILED'});
  const check=await fetch(targetUrl,{redirect:'error'}),targetBytes=new Uint8Array(await check.arrayBuffer());if(!check.ok||await sha256Hex(targetBytes)!==attachment.plaintext_sha256)throw Object.assign(new Error('dr_attachment_target_verification_failed'),{code:'DR_ATTACHMENT_RESTORE_FAILED'});
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
 const config=configurationStatus();if(!config.ok)throw new DisasterRecoveryConfigurationError(config.missing);
 const started=now(),key=parseAes256Key(getEnv('DR_BACKUP_AES256_KEY_B64')),storage=await createSharePointBackupStorage();
 let selectedPath=String(input.manifest_path||'');if(!selectedPath){const latest=await storage.download('Manifests/latest.manifest.json');selectedPath=String(jsonFromBytes(latest).manifest_path||'')}
 const chain=await loadRestoreChain(storage,selectedPath),selected=chain.at(-1),desired=await desiredStateFromChain(storage,chain,key);
 const sourceUser=desired.entities.get('User'),users=await targetUserMapping(service,sourceUser);if(users.missing.length)throw Object.assign(new Error('dr_restore_target_users_missing'),{code:'DR_RESTORE_TARGET_USERS_MISSING',missing_count:users.missing.length,missing_user_hashes:await Promise.all(users.missing.map((item)=>sha256Hex(item)))});
 const entityNames=[...desired.entities.keys()].filter((name)=>!DR_NON_RESTORABLE_ENTITIES.has(name)&&!DR_EPHEMERAL_SECRET_ENTITIES.has(name));
 const wiped=await wipeRestoreTarget(service,entityNames),attachments=await restoreAttachments(service,storage,desired.attachments,key),created=await createRestoredRecords(service,desired.entities,users.mapping),mapping=new Map([...created.idMapping,...attachments.mapping]);
 await remapRestoredRecords(service,created.recordsByEntity,mapping);
 const integrity=await validateRestoredState(service,desired.entities,mapping,created.recordsByEntity),completed=now(),rpo=minuteDifference(started,selected.checkpoint_to),rto=minuteDifference(completed,started),pass=integrity.pass&&rpo<=DR_RPO_TARGET_MINUTES&&rto<=DR_RTO_TARGET_MINUTES&&attachments.evidence.every((row)=>row.verified);
 const exerciseKey=`real-restore:${selected.backup_id}:${environment}:${completed}`,evidenceCore={schema_version:'cambra-dr-restore-evidence-v1',dr_version:DISASTER_RECOVERY_VERSION,exercise_key:exerciseKey,status:pass?'PASS':'FAIL',source_environment:'prod',source_app_id:APP_ID,target_environment:environment,target_isolated:true,target_production:false,manifest_path:selected.manifest_path,manifest_hash:selected.manifest_hash,backup_id:selected.backup_id,backup_checkpoint_at:selected.checkpoint_to,chain:chain.map((row)=>({backup_id:row.backup_id,manifest_path:row.manifest_path,manifest_hash:row.manifest_hash,snapshot_type:row.snapshot_type})),started_at:started,completed_at:completed,rpo_target_minutes:DR_RPO_TARGET_MINUTES,rpo_observed_minutes:rpo,rto_target_minutes:DR_RTO_TARGET_MINUTES,rto_observed_minutes:rto,integrity,wiped_counts:wiped,created_counts:created.createdByEntity,user_identity_reconciliation:{source:users.source,matched:users.matched,missing:0},attachments:{count:attachments.evidence.length,pass:attachments.evidence.every((row)=>row.verified),items:attachments.evidence},security:{source_secrets_restored:false,secret_material_required_after_disaster:'provider/OAuth/webhook credentials must be reconnected or rotated; they are intentionally absent from backups',backup_encryption_verified:true,ciphertext_hashes_verified:true},conducted_by:actor};
 const evidence={...evidenceCore,evidence_hash:await sha256Hex(stableJson(evidenceCore))},evidenceBytes=jsonBytes(evidence),evidencePath=`Restore Evidence/${safeFileName(exerciseKey)}.json`,evidenceFileHash=await sha256Hex(evidenceBytes);await storage.upload(evidencePath,evidenceBytes,'application/json');
 await service.entities.DisasterRecoveryExercise.create({exercise_key:exerciseKey,environment,exercise_type:'REAL_RESTORE',status:pass?'PASS':'FAIL',rpo_target_minutes:DR_RPO_TARGET_MINUTES,rpo_observed_minutes:rpo,rto_target_minutes:DR_RTO_TARGET_MINUTES,rto_observed_minutes:rto,backup_snapshot_ref:selected.manifest_path,restored_target_ref:`base44:${APP_ID}:data-env:${environment}`,data_integrity_checks_json:{...integrity,attachments:evidence.attachments,evidence_hash:evidence.evidence_hash,evidence_file_sha256:evidenceFileHash},evidence_refs:[evidencePath],conducted_by:actor,started_at:started,completed_at:completed});
 return{ok:pass,status:pass?'PASS':'FAIL',exercise_key:exerciseKey,evidence_path:evidencePath,evidence_file_sha256:evidenceFileHash,evidence_hash:evidence.evidence_hash,rpo_observed_minutes:rpo,rto_observed_minutes:rto,integrity,attachments:evidence.attachments,target_environment:environment,next_action:pass?'attest_restore_evidence_in_production':'resolve_integrity_failure_and_repeat'};
}

async function attestRestore(req:Request,service:any,input:any,actor:string){
 assertProductionControlPlane(req,'restore_attestation');
 const path=String(input.evidence_path||'');if(!pathAllowed(path,'Restore Evidence/','.json'))throw Object.assign(new Error('dr_restore_evidence_path_invalid'),{code:'DR_RESTORE_EVIDENCE_PATH_INVALID'});
 const storage=await createSharePointBackupStorage(),bytes=await storage.download(path),fileHash=await sha256Hex(bytes);if(fileHash!==String(input.evidence_file_sha256||''))throw Object.assign(new Error('dr_restore_evidence_file_hash_mismatch'),{code:'DR_RESTORE_EVIDENCE_HASH_MISMATCH'});
 const evidence=jsonFromBytes(bytes),{evidence_hash,...core}=evidence;if(await sha256Hex(stableJson(core))!==evidence_hash)throw Object.assign(new Error('dr_restore_evidence_payload_hash_mismatch'),{code:'DR_RESTORE_EVIDENCE_HASH_MISMATCH'});
 const target=String(evidence.target_environment||'').toLowerCase(),fresh=Date.now()-Date.parse(evidence.completed_at||'')<7*86400000,integrityPass=evidence.integrity?.pass===true&&evidence.attachments?.pass===true,within=Number(evidence.rpo_observed_minutes)<=Number(evidence.rpo_target_minutes)&&Number(evidence.rto_observed_minutes)<=Number(evidence.rto_target_minutes),pass=evidence.status==='PASS'&&evidence.source_environment==='prod'&&['dev','test','staging','sandbox'].includes(target)&&evidence.target_production===false&&fresh&&integrityPass&&within;
 if(!pass)throw Object.assign(new Error('dr_restore_evidence_not_eligible_for_pass'),{code:'DR_RESTORE_EVIDENCE_NOT_ELIGIBLE'});
 const existingRows=requireRuntimeSource(await readRuntimeRows({source:'dr_restore_exercise_authority',read:()=>service.entities.DisasterRecoveryExercise.filter({exercise_key:evidence.exercise_key},'-completed_at',2)}));if(existingRows.length>1)throw Object.assign(new Error('dr_restore_exercise_authority_ambiguous'),{code:'DR_RESTORE_EXERCISE_AUTHORITY_AMBIGUOUS'});const existing=existingRows[0],row={exercise_key:evidence.exercise_key,environment:`production-boundary-to-${target}`,exercise_type:'REAL_RESTORE',status:'PASS',rpo_target_minutes:evidence.rpo_target_minutes,rpo_observed_minutes:evidence.rpo_observed_minutes,rto_target_minutes:evidence.rto_target_minutes,rto_observed_minutes:evidence.rto_observed_minutes,backup_snapshot_ref:evidence.manifest_path,restored_target_ref:`base44:${APP_ID}:data-env:${target}`,data_integrity_checks_json:{...evidence.integrity,attachments:evidence.attachments,evidence_hash,evidence_file_sha256:fileHash,independently_downloaded_from_sharepoint:true},evidence_refs:[path],conducted_by:actor,started_at:evidence.started_at,completed_at:evidence.completed_at};
 const exercise=existing?await service.entities.DisasterRecoveryExercise.update(existing.id,row):await service.entities.DisasterRecoveryExercise.create(row),gitSha=getEnv('CAMBRA_GIT_SHA');
 await recordRuntimeGateEvidence(service,{gate_key:'REAL_RESTORE',environment:'production',git_sha:gitSha,status:'PASS',evidence_kind:'OPERATOR_EXERCISE',source:'disasterRecovery.attest_restore',evidence_refs:[path],details_json:{exercise_id:exercise.id,evidence_hash,evidence_file_sha256:fileHash,target_environment:target,rpo_observed_minutes:evidence.rpo_observed_minutes,rto_observed_minutes:evidence.rto_observed_minutes,integrity:evidence.integrity,attachments:evidence.attachments},observed_at:evidence.completed_at,expires_at:new Date(Date.parse(evidence.completed_at)+90*86400000).toISOString(),recorded_by:actor});
 await service.entities.OperationalLog.create({event_type:'disaster_recovery_restore_attested',message:evidence.exercise_key,data_json:{exercise_id:exercise.id,evidence_path:path,evidence_hash,file_sha256:fileHash,target_environment:target},actor_email:actor,created_at:now()});
 return{ok:true,status:'PASS',exercise_id:exercise.id,evidence_path:path,evidence_hash,file_sha256:fileHash,rpo_observed_minutes:evidence.rpo_observed_minutes,rto_observed_minutes:evidence.rto_observed_minutes};
}

function errorResponse(error:any){
 if(error instanceof DisasterRecoveryConfigurationError)return Response.json({ok:false,error:'dr_configuration_required',missing:error.missing,required_consent:'Microsoft Graph application permission Sites.Selected with admin consent, followed by a site-specific write grant on CAMBRA INFRASTRUCTURE. Store values only in Base44 secrets.'},{status:409});
 if(error instanceof MicrosoftGraphError)return Response.json({ok:false,error:'microsoft_graph_authorization_or_storage_failed',graph_status:error.status,graph_code:error.graphCode,required_consent:'Sites.Selected (Application) + site-specific write role on CAMBRA INFRASTRUCTURE'},{status:409});
 const code=String(error?.code||'DISASTER_RECOVERY_FAILED');console.error('disasterRecovery failed',code,error);return Response.json({ok:false,error:code.toLowerCase()},{status:code.includes('FORBIDDEN')?403:code.includes('CONFIRMATION')||code.includes('INVALID')?400:409});
}

export async function handleDisasterRecovery(req:Request){
 let body:any;try{body=await req.clone().json();}catch{return Response.json({ok:false,error:'invalid_json_body'},{status:400});}const base44=createClientFromRequest(req),gate=await requireAdminOrInternal(req,base44,body);if(!gate.ok)return gate.response;
 const service=base44.asServiceRole,actor=String(gate.user?.email||body.actor_email||'internal'),routed=body.host_action==='disaster_recovery_backup',action=routed?'backup':String(body.action||'status').replace(/^dr_/,'');
 try{
  if(action==='status'){
   const[exerciseRead,logRead]=await Promise.all([readRuntimeRows({source:'dr_status_exercises',limit:20,read:()=>service.entities.DisasterRecoveryExercise.list('-completed_at',20)}),readRuntimeRows({source:'dr_status_events',limit:50,read:()=>service.entities.OperationalLog.filter({event_type:{$in:['disaster_recovery_backup_completed','disaster_recovery_backup_failed','disaster_recovery_restore_attested']}},'-created_at',50)})]);const exercises=exerciseRead.value,logs=logRead.value,sourceCoverage=runtimeSourceCoverage({exercises:exerciseRead,events:logRead});
   const config=configurationStatus();let remote:any=null;if(body.verify_remote===true&&config.ok){const storage=await createSharePointBackupStorage();remote={ok:true,identity:storage.identity,folders:Object.fromEntries(await Promise.all(['Daily','Weekly','Monthly','Manifests','Restore Evidence'].map(async(folder)=>[folder,(await storage.list(folder)).length])))};}
   return Response.json({ok:true,version:DISASTER_RECOVERY_VERSION,data_status:sourceCoverage.status,source_coverage:sourceCoverage,configuration:config,remote,latest_exercises:exercises,latest_events:logs,rpo_target_minutes:DR_RPO_TARGET_MINUTES,rto_target_minutes:DR_RTO_TARGET_MINUTES,restore_boundary:'X-Data-Env must be dev/test/staging/sandbox; default/prod is rejected'});
  }
  if(action==='backup')return Response.json(await executeBackup(req,service,body,actor));
  if(action==='restore')return Response.json(await executeRestore(req,service,body,actor));
  if(action==='attest_restore')return Response.json(await attestRestore(req,service,body,actor));
  return Response.json({ok:false,error:'dr_action_unsupported'},{status:400});
 }catch(error){if(action==='backup'){try{await recordBackupFailure(service,error)}catch(recordError){console.error('disasterRecovery failure evidence persistence failed',recordError);}}return errorResponse(error)}
}
