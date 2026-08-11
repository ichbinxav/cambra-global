import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SENDING_PROFILE_REVIEW_REASON, automaticFollowUpCandidate, legacyResolutionPatch,
  resolveLegacySendingProfile, sendingProfileIsValid, validateCanaryPolicy,
} from '../../base44/shared/commercialActivation.ts';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const source=(file)=>fs.readFileSync(path.join(ROOT,file),'utf8');
const resend={profile_key:'resend:contact.cambra.global',provider:'resend',domain:'contact.cambra.global',from_address:'payments@contact.cambra.global',status:'warming',current_daily_cap:10,target_daily_cap:50};
const outlook={profile_key:'outlook:xavi@cambra.global',provider:'outlook',domain:'cambra.global',from_address:'xavi@cambra.global',status:'active',current_daily_cap:10,target_daily_cap:15};
const thread={id:'t1',status:'awaiting_counterparty',next_action_at:'2026-08-12T09:00:00.000Z',automation_paused:false};

describe('commercial pre-GO activation seal',()=>{
  it('resolves a legacy thread only from exact historical message evidence',()=>{
    const result=resolveLegacySendingProfile({thread,messages:[{direction:'outbound',sending_profile_key:resend.profile_key}],profiles:[resend,outlook],policy:null});
    expect(result).toMatchObject({status:'RESOLVED',profile_key:resend.profile_key,reason:'historical_message_profile'});
  });

  it('uses one explicit policy profile but never guesses among multiple profiles',()=>{
    expect(resolveLegacySendingProfile({thread,messages:[],profiles:[resend,outlook],policy:{sending_profile_keys:[outlook.profile_key]}})).toMatchObject({status:'RESOLVED',profile_key:outlook.profile_key,reason:'single_policy_profile'});
    expect(resolveLegacySendingProfile({thread,messages:[],profiles:[resend,outlook],policy:{sending_profile_keys:[resend.profile_key,outlook.profile_key]}})).toMatchObject({status:'REVIEW_REQUIRED',profile_key:null,reason:'policy_profiles_ambiguous'});
    expect(resolveLegacySendingProfile({thread,messages:[],profiles:[resend,outlook],policy:null})).toMatchObject({status:'REVIEW_REQUIRED',profile_key:null,reason:'no_deterministic_profile_evidence'});
  });

  it('keeps invalid legacy evidence stable while pausing it for review',()=>{
    const legacy={...thread,sending_profile_key:'resend:retired.example'};
    const first=resolveLegacySendingProfile({thread:legacy,messages:[],profiles:[resend],policy:null});
    const patched={...legacy,...legacyResolutionPatch(first,'migration','2026-08-11T12:00:00.000Z',legacy)};
    expect(patched).toMatchObject({sending_profile_key:'resend:retired.example',sending_profile_resolution_status:'REVIEW_REQUIRED',automation_paused:true});
    expect(resolveLegacySendingProfile({thread:patched,messages:[],profiles:[resend],policy:null})).toMatchObject({status:first.status,reason:first.reason});
  });

  it('No legacy thread eligible for automatic follow-up may lack a valid sending_profile_key; unresolved legacy threads are explicitly surfaced',()=>{
    expect(automaticFollowUpCandidate(thread)).toBe(true);
    const unresolved=resolveLegacySendingProfile({thread,messages:[],profiles:[resend],policy:null});
    const patch=legacyResolutionPatch(unresolved,'migration','2026-08-11T12:00:00.000Z',thread);
    const migrated={...thread,...patch};
    expect(patch).toMatchObject({sending_profile_resolution_status:'REVIEW_REQUIRED',automation_paused:true,pause_reason:SENDING_PROFILE_REVIEW_REASON,sending_profile_key:null});
    expect(automaticFollowUpCandidate(migrated)).toBe(false);
    expect(sendingProfileIsValid(resend)).toBe(true);
  });

  it('requires a bounded CANARY policy with explicit ready markets and profiles',()=>{
    const valid={engine:'merchant_acquisition',status:'active',mode:'CANARY',daily_send_limit:10,min_lead_score:70,min_opportunity_score:60,min_confidence:.7,risk_controls_json:{provider_ai_reply:false},countries:['ES','DE'],sending_profile_keys:[resend.profile_key]};
    expect(validateCanaryPolicy(valid)).toMatchObject({ok:true,blockers:[]});
    expect(validateCanaryPolicy({...valid,daily_send_limit:0}).blockers).toContain('daily_send_limit_must_be_1_to_15');
    expect(validateCanaryPolicy({...valid,daily_send_limit:16}).blockers).toContain('daily_send_limit_must_be_1_to_15');
    expect(validateCanaryPolicy({...valid,min_lead_score:69}).blockers).toContain('min_lead_score_must_be_70_to_100');
    expect(validateCanaryPolicy({...valid,countries:[]}).blockers).toContain('ready_markets_required');
  });

  it('defaults drafts to inert market selection and 10/day, without France-first',()=>{
    const admin=source('base44/functions/commercialPolicyAdmin/entry.ts');
    expect(admin).toContain("const countries = Array.isArray(body?.countries)");
    expect(admin).toContain(" : [];");
    expect(admin).toContain("body?.daily_send_limit === undefined ? 10");
    expect(admin).not.toContain("['FR','ES']");
    expect(admin).toContain('validateCanaryPolicy({...policy,status:\'active\'})');
    expect(source('base44/functions/autonomousCommercialWorker/entry.ts')).not.toContain("||'France'");
    expect(source('base44/functions/autonomousPartnerWorker/entry.ts')).not.toContain("?policy.countries:['FR','ES']");
  });

  it('makes start depend on a matching fresh hash and an immediate recomputation',()=>{
    const control=source('base44/functions/outboundControlAdmin/entry.ts');
    expect(control).toMatch(/confirmation\s*!==\s*["']START_CANARY_OUTBOUND["']/);
    expect(control).toMatch(/error:\s*["']preflight_hash_required["']/);
    expect(control).toMatch(/control\.preflight_status\s*!==\s*["']PASS["']/);
    expect(control).toContain('evaluateCommercialGoLiveReadiness');
    expect(control).toMatch(/error:\s*["']preflight_state_changed["']/);
  });

  it('checks P10/P11, credentials and the legacy invariant before GO',()=>{
    const runtime=source('base44/shared/commercialActivationRuntime.ts');
    expect(runtime).toContain('evaluateLegalExecution');
    expect(runtime).toContain("Deno.env.get('RESEND_API_KEY')");
    expect(runtime).toContain("getConnection('outlook')");
    expect(runtime).toContain('eligible_legacy_threads_without_valid_profile');
    expect(runtime).toContain('legacy_thread_coverage_truncated');
    expect(runtime).toContain("return {merchant_acquisition:['resend','instantly'],partner_acquisition:['outlook']}");
    expect(runtime).toContain("Deno.env.get('INSTANTLY_API_KEY')");
    expect(runtime).toContain('instantly_authenticated_webhook_configuration_required');
    expect(runtime).toContain('policy_ids:policyIds');
    expect(source('base44/functions/outboundVolumeWorker/entry.ts')).toContain('policy.sending_profile_keys||[]');
    expect(source('base44/functions/autonomousPartnerWorker/entry.ts')).toContain('policy.sending_profile_keys||[]');
  });

  it('stops a bad follow-up before policy, history and LLM work',()=>{
    const worker=source('base44/functions/commercialFollowUpWorker/entry.ts');
    const gate=worker.indexOf('if(!sendingProfileIsValid(sendingProfile))');
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(worker.indexOf('CommercialPolicy.filter'));
    expect(gate).toBeLessThan(worker.indexOf('CommunicationMessage.filter'));
    expect(gate).toBeLessThan(worker.lastIndexOf('claude(svc,prompt'));
    expect(worker).toContain("sending_profile_resolution_status:'REVIEW_REQUIRED'");
  });

  it('keeps the backfill dry-run by default and apply explicitly confirmed',()=>{
    const migration=source('base44/functions/backfillLegacySendingProfiles/entry.ts');
    expect(migration).toContain("const apply=body?.apply===true");
    expect(migration).toContain("confirmation!=='BACKFILL_LEGACY_SENDING_PROFILES'");
    expect(migration).toContain('resolveLegacySendingProfile');
    expect(migration).toContain('eligible_after_without_valid_profile');
  });
});
