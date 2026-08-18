import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  captureEmergencyEpoch,
  guardedEmergencyEffect,
  normalizeTransportContainment,
} from '../../base44/shared/operationalControl.ts';
import { requireAcceptedCommercialSendResponse } from '../../base44/shared/commercialSendSafety.ts';

const root=process.cwd();
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');

describe('R2 emergency material-boundary failure matrix',()=>{
  it('blocks every R2 material capability before provider or economic work when authority is unreadable',async()=>{
    const svc={entities:{EmergencyControl:{filter:async()=>{throw new Error('authority_offline')}}}};
    let providerCalls=0,economicCommits=0;
    for(const capability of ['communications','negotiations','migrations','billing_issuance','paid_discovery']){
      await expect((async()=>{
        await captureEmergencyEpoch(svc,capability);
        providerCalls++;
        economicCommits++;
      })()).rejects.toMatchObject({code:'EMERGENCY_CONTROL_PAUSED',status:409});
    }
    expect({providerCalls,economicCommits}).toEqual({providerCalls:0,economicCommits:0});
  });

  it('blocks before a stale effect and makes a raced provider success REVIEW_REQUIRED with no second effect',async()=>{
    let revision=7,providerCalls=0,containments=0;
    const svc={entities:{EmergencyControl:{filter:async()=>[{id:'emergency-global',control_key:'global',control_revision:revision,safe_mode:false,communications_paused:false,negotiations_paused:false,migrations_paused:false,billing_issuance_paused:false,paid_discovery_paused:false,resume_check_required:false}]}}};
    const claim=await captureEmergencyEpoch(svc,'communications');
    revision=8;
    await expect(guardedEmergencyEffect(svc,{claim,effect_key:'stale',effect:async()=>{providerCalls++;}})).rejects.toMatchObject({code:'EMERGENCY_CONTROL_EPOCH_CHANGED'});
    expect(providerCalls).toBe(0);
    revision=9;
    const racedClaim=await captureEmergencyEpoch(svc,'communications');
    await expect(guardedEmergencyEffect(svc,{
      claim:racedClaim,effect_key:'raced',
      effect:async()=>{providerCalls++;revision=10;return{provider_receipt:'accepted'};},
      contain:async()=>{containments++;return{ok:true};},
    })).rejects.toMatchObject({code:'EMERGENCY_EFFECT_AMBIGUOUS',review_required:true,containment:{ok:true}});
    expect({providerCalls,containments}).toEqual({providerCalls:1,containments:1});
  });

  it('uses the exact durable transport vocabulary and keeps Outlook/Resend locally blocked only',()=>{
    const result=normalizeTransportContainment([
      {transport:'outlook',configured:true,local_blocked:true,remote_pause_supported:false,remote_verified_paused:false},
      {transport:'resend',configured:true,local_blocked:true,remote_pause_supported:false,remote_verified_paused:false},
      {transport:'instantly',configured:true,local_blocked:true,remote_pause_supported:true,remote_verified_paused:false},
    ]);
    expect(result).toMatchObject({containment_status:'CONTAINMENT_INCOMPLETE',transports:[
      {transport:'outlook',status:'LOCALLY_BLOCKED'},
      {transport:'resend',status:'LOCALLY_BLOCKED'},
      {transport:'instantly',status:'UNVERIFIED'},
    ]});
  });

  it('forbids post-boundary webhook retry and Anthropic fallback and returns non-2xx for incomplete stop containment',()=>{
    const webhook=read('base44/functions/dispatchWebhook/entry.ts');
    expect(webhook).not.toContain('RETRY_DELAYS_MS');
    expect(webhook).not.toContain('pending_retry');
    expect(webhook.match(/deliverOnce\(/g)).toHaveLength(2);
    expect(webhook).toContain('claim_state: "REVIEW_REQUIRED"');
    const webhookClaim=read('base44/shared/webhookDeadLetterClaim.ts');
    expect(webhookClaim).toContain('claim_effects_started: true');
    expect(webhook).toContain('markWebhookClaimReviewRequired');
    const model=read('base44/shared/commercialModelRouter.ts');
    expect(model).not.toContain("invoke(standard,'fallback')");
    expect(model).toContain('PROVIDER_EFFECT_REVIEW_REQUIRED');
    expect(model).toContain("ambiguity_state:'REVIEW_REQUIRED'");
    expect(model).toContain('transport.started=true');
    // FCTRL-J: the emergencyControlAdmin handler lives in the shared core; the
    // entry is a thin Deno.serve wrapper. The invariant covers both files.
    const admin=read('base44/functions/emergencyControlAdmin/entry.ts')+read('base44/shared/emergencyControlAdminCore.ts');
    expect(admin).toContain('{status:containmentComplete?200:503}');
    expect(admin).toContain('containment_blockers:transportEvidence.blockers');
    expect(admin).toContain('{status:incompleteStop?503:200}');
  });

  it('requires an explicit accepted commercial-send response with a durable message receipt',()=>{
    for(const value of [undefined,{}, {ok:false}, {ok:true}, {ok:true,message_id:'m1',provider:'resend'}]){
      expect(()=>requireAcceptedCommercialSendResponse(value,'test_send')).toThrowError(/response_unverified/);
    }
    expect(requireAcceptedCommercialSendResponse({data:{ok:true,message_id:'m1',provider:'outlook',queued:false}},'test_send')).toMatchObject({ok:true,message_id:'m1',provider:'outlook',queued:false});
    expect(requireAcceptedCommercialSendResponse({ok:true,message_id:'m2',provider:'resend',duplicate:true},'test_send')).toMatchObject({duplicate:true,message_id:'m2'});
  });

  it('fails closed on migration Brand authority and complete sequential-task inventory',()=>{
    const start=read('base44/functions/startPaymentsMigration/entry.ts');
    expect(start).toMatch(/requireCriticalOperation\(\s*["']payments_migration_brand_authority_read["']/);
    expect(start).toMatch(/error:\s*["']payments_migration_brand_authority_unavailable["']/);
    expect(start).not.toMatch(/Brand\.get\(String\(activation\.brand_id\s*\|\|\s*["']["']\)\)\.catch/);
    expect(start).toMatch(/["']order["'],\s*101/);
    expect(start).toContain('readCompleteMigrationTaskInventory');
    expect(start).not.toMatch(/MigrationTask\.filter\([^\n]+\)\.catch/);
    const update=read('base44/functions/updatePaymentsMigrationTask/entry.ts');
    expect(update).toMatch(/requireCriticalOperation\(\s*["']payments_migration_task_inventory_read["']/);
    expect(update).toMatch(/["']order["'],\s*101/);
    expect(update).toMatch(/error:\s*["']payments_migration_task_inventory_incomplete["']/);
    for(const file of [
      'base44/functions/providerNegotiationAgent/entry.ts',
      'base44/functions/collectiveNegotiationAgent/entry.ts',
      'base44/functions/providerMonetizationAgent/entry.ts',
    ]){
      const source=read(file);
      expect(source).toContain('requireAcceptedCommercialSendResponse');
      expect(source).toMatch(/\?\.review_required === true/);
    }
  });
});