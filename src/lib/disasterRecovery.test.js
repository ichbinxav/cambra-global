import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import {
  DR_FOLDERS, assertIsolatedRestoreTarget, backupTier, decryptEnvelope, deepRemap,
  diffRecords, encryptEnvelope, gzipBytes, gunzipBytes, indexRecords, parseAes256Key,
  redactSecrets, secretLikePaths, snapshotType, stableJson,
} from '../../base44/shared/disasterRecoveryCore.ts';
import { DISASTER_RECOVERY_ENTITY_CATALOG } from '../../base44/shared/generated/disasterRecoveryEntityCatalog.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const read=(name)=>fs.readFileSync(path.join(root,name),'utf8');

describe('CAMBRA disaster recovery hard gate',()=>{
  it('round-trips gzip bytes for empty, large and non-owned subarray inputs on Node 24',async()=>{
    const backing=new Uint8Array([91,92,10,20,30,40,93,94]);
    const large=new Uint8Array(2*1024*1024+17);
    for(let index=0;index<large.length;index++)large[index]=(index*31+17)%256;
    for(const source of [new Uint8Array(),large,backing.subarray(2,6)]){
      const compressed=await gzipBytes(source);
      const opened=await gunzipBytes(compressed);
      expect(Buffer.from(opened).equals(Buffer.from(source))).toBe(true);
    }
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
    const input={access_token:'raw',refresh_token:'raw2',client_secret:'raw3',metadata_json:{nested:{api_key:'raw4',token_hash:'safe-hash',secret_present:true}},key_hash:'safe',access_token_expires_at:'2026-09-01T00:00:00Z'};
    const result=redactSecrets(input,['Integration']);
    expect(result.stats.fields).toBe(4);
    expect(result.value).toEqual({metadata_json:{nested:{token_hash:'safe-hash',secret_present:true}},key_hash:'safe',access_token_expires_at:'2026-09-01T00:00:00Z'});
    expect(secretLikePaths(result.value)).toEqual([]);
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
  });

  it('hard-rejects restore outside an explicit isolated Base44 data environment',()=>{
    const dev=new Request('https://example.test',{headers:{'X-Data-Env':'dev'}});
    expect(assertIsolatedRestoreTarget(dev,'RESTORE_TO_ISOLATED_NON_PRODUCTION')).toBe('dev');
    const prod=new Request('https://example.test',{headers:{'X-Data-Env':'prod'}});
    expect(()=>assertIsolatedRestoreTarget(prod,'RESTORE_TO_ISOLATED_NON_PRODUCTION')).toThrowError(/non_production/);
    expect(()=>assertIsolatedRestoreTarget(dev,'wrong')).toThrowError(/confirmation/);
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
    expect(host).toContain("host_action==='disaster_recovery_backup'");
    expect(host).toContain("String(routed.action||'').startsWith('dr_')");
    expect(config).toContain('Encrypted SharePoint disaster-recovery backup');
    expect(core).toContain('DR_RESTORE_PRODUCTION_FORBIDDEN');
    expect(runtime).toContain('DR_PRODUCTION_CONTROL_PLANE_REQUIRED');
    expect(runtime).toContain('source_secrets_restored:false');
    expect(storage).toContain('client_credentials');
    expect(storage).toContain('globalcambra.sharepoint.com');
    expect(storage).toContain('upload_final_receipt_invalid');
    expect(storage).toContain('upload_final_receipt_missing');
    expect(storage).not.toContain('response.json().catch(()=>null)');
    expect(fs.existsSync(path.join(root,'base44/functions/disasterRecoveryBackup'))).toBe(false);
  });
});