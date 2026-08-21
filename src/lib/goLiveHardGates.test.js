import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { costReservationDecision, costReservationStateForReconfiguration, costRuntimeSnapshot, nextCostReservationState, reservationUsageFromControl, selectSingleActiveCostBudget, summarizeCostUsage, validateCostBudget } from '../../base44/shared/costGovernance.ts';
import { evaluateGoLiveHardGates, GO_LIVE_GATE_REQUIREMENTS } from '../../base44/shared/goLiveHardGates.ts';
import { evaluateSchedulerEvidence, GO_CRITICAL_SCHEDULERS } from '../../base44/shared/schedulerRun.ts';
import { EXPECTED_BASE44_LOGICAL_ROUTES, EXPECTED_BASE44_PHYSICAL_FUNCTIONS, realRestoreExerciseProjectionHash, runtimeDeploymentIdentity, runtimeGateEvidencePayload, verifyFinalRealRestoreGateAuthority } from '../../base44/shared/runtimeEvidence.ts';
import { sha256Canonical } from '../../base44/shared/legalExecution.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const NOW = Date.parse('2026-08-11T12:00:00.000Z');
const SHA = '0123456789abcdef0123456789abcdef01234567';
const HASH='a'.repeat(64);
const IDENTITY_ENV={CAMBRA_ENVIRONMENT:'production',CAMBRA_RELEASE_VERSION:'0.97.0',CAMBRA_RELEASE_BUILD_ID:'ci-42',CAMBRA_GIT_SHA:SHA,CAMBRA_SOURCE_TREE_HASH:HASH,CAMBRA_SOURCE_TREE_FILE_COUNT:'2500',CAMBRA_BASE44_BUNDLE_HASH:HASH,CAMBRA_BASE44_BUNDLE_FILE_COUNT:'2400',CAMBRA_DEPLOYMENT_TOPOLOGY_HASH:HASH,CAMBRA_SCHEDULER_INVENTORY_HASH:HASH,CAMBRA_PHYSICAL_FUNCTION_COUNT:String(EXPECTED_BASE44_PHYSICAL_FUNCTIONS),CAMBRA_LOGICAL_ROUTE_COUNT:String(EXPECTED_BASE44_LOGICAL_ROUTES)};
const RESTORE_EXERCISE={id:'exercise-1',exercise_key:'real-restore:backup-1:dev:2026-08-11T10:30:00.000Z',environment:'production-boundary-to-dev',exercise_type:'REAL_RESTORE',status:'PASS',rpo_target_minutes:1440,rpo_observed_minutes:10,rto_target_minutes:480,rto_observed_minutes:20,backup_snapshot_ref:'Manifests/backup-1.manifest.json',restored_target_ref:'base44:app-1:data-env:dev',data_integrity_checks_json:{pass:true},evidence_refs:['test://receipt'],conducted_by:'operator',started_at:'2026-08-11T10:10:00.000Z',completed_at:'2026-08-11T10:30:00.000Z'};
const restoreAuthority=async()=>({available:true,exact_query:true,rows:[RESTORE_EXERCISE],compensation_markers:[]});
const restoreGateAuthority=async(row)=>({available:true,exact_query:true,latest_query:true,exact_rows:[row],latest_rows:[row]});
const evaluate=(input)=>evaluateGoLiveHardGates({...input,resolve_real_restore_exercise_authority:input.resolve_real_restore_exercise_authority||restoreAuthority,resolve_real_restore_gate_authority:input.resolve_real_restore_gate_authority||restoreGateAuthority});

async function signedEvidence(requirement,overrides={}){
  const identity=runtimeDeploymentIdentity();
  const kind=requirement.key==='REAL_RESTORE'?'OPERATOR_EXERCISE':requirement.kinds[0];
  const runtime=['REAL_RUNTIME','OPERATOR_EXERCISE'].includes(kind);
  const restoreDetails=requirement.key==='REAL_RESTORE'?{exercise_id:RESTORE_EXERCISE.id,exercise_key:RESTORE_EXERCISE.exercise_key,exercise_projection_hash:await realRestoreExerciseProjectionHash(RESTORE_EXERCISE),compensation_incident_key:'dr:restore:compensation:controlled',exercise_projection_verified:true,exercise_projection_status:'PASS',exercise_projection_readback_id:RESTORE_EXERCISE.id,authenticated_aes256gcm_evidence:true,manifest_chain_reverified:true,evidence_hash:HASH,evidence_file_sha256:HASH,target_environment:'dev',manifest_hash:HASH,manifest_path:RESTORE_EXERCISE.backup_snapshot_ref,backup_id:'backup-1',source_app_id:'app-1',source_environment:'prod',source_release_version:'0.97.0',source_git_sha:SHA,source_tree_hash:HASH}:{proof:'controlled'};
  const row={gate_key:requirement.key,status:'PASS',evidence_kind:kind,source:'test-runtime',git_sha:requirement.sha_bound?SHA:'',evidence_refs:['test://receipt'],details_json:restoreDetails,observed_at:new Date(NOW-60_000).toISOString(),expires_at:new Date(NOW+3600_000).toISOString(),recorded_by:'test',...(runtime?{...identity,identity_status:'COMPLETE',identity_blockers:[],identity_hash:await sha256Canonical(identity)}:{}),...overrides};
  return {id:`runtime-gate-${requirement.key.toLowerCase()}`,evidence_key:`${requirement.key}:${row.observed_at}:controlled`,...row,evidence_hash:await sha256Canonical(runtimeGateEvidencePayload(row))};
}

const budget = {
  status:'active', currency:'EUR', version:'founder-v1', daily_total_limit_minor:1000, monthly_total_limit_minor:10000,
  category_limits_json:Object.fromEntries(['ai','api','enrichment','email'].map(category => [category, { daily_limit_minor:400, monthly_limit_minor:4000 }])),
  anomaly_warning_pct:70, hard_stop_pct:95, emergency_stop_active:false,
  reservation_revision:0,reservation_day_key:'2026-08-11',reservation_month_key:'2026-08',reserved_daily_total_minor:0,reserved_monthly_total_minor:0,reserved_category_json:Object.fromEntries(['ai','api','enrichment','email'].map(category=>[category,{daily_minor:0,monthly_minor:0}])),reservation_recent_event_keys:[],
};

/* global process */
describe('final GO-live hard gates', () => {
  it('never returns GO unless every gate has fresh cryptographically valid evidence', async() => {
    const previous=Object.fromEntries(Object.keys(IDENTITY_ENV).map((key)=>[key,process.env[key]]));Object.assign(process.env,IDENTITY_ENV);
    try{
      const evidence = await Promise.all(GO_LIVE_GATE_REQUIREMENTS.map(signedEvidence));
      expect(await evaluate({ evidence, final_sha:SHA, now_ms:NOW })).toMatchObject({ classification:'GO_READY_FOR_CANARY', allowed:true, passed:GO_LIVE_GATE_REQUIREMENTS.length });
      expect(await evaluate({ evidence:evidence.filter(row => row.gate_key !== 'EMERGENCY_STOP'), final_sha:SHA, now_ms:NOW })).toMatchObject({ classification:'NOT_GO_READY', allowed:false });
      const legacy=evidence.map(({evidence_hash,expires_at,...row})=>row);
      expect(await evaluate({evidence:legacy,final_sha:SHA,now_ms:NOW})).toMatchObject({classification:'NOT_GO_READY',allowed:false,passed:0});
    }finally{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
  });

  it('rejects a residual REAL_RESTORE PASS when live Exercise authority is blocked, duplicated or compensation-ambiguous',async()=>{
    const previous=Object.fromEntries(Object.keys(IDENTITY_ENV).map((key)=>[key,process.env[key]]));Object.assign(process.env,IDENTITY_ENV);
    try{
      const evidence=await Promise.all(GO_LIVE_GATE_REQUIREMENTS.map(signedEvidence));
      for(const authority of [
        {available:true,exact_query:true,rows:[{...RESTORE_EXERCISE,status:'BLOCKED'}],compensation_markers:[]},
        {available:true,exact_query:true,rows:[RESTORE_EXERCISE,{...RESTORE_EXERCISE,id:'exercise-racer'}],compensation_markers:[]},
        {available:true,exact_query:true,rows:[RESTORE_EXERCISE],compensation_markers:[{id:'incident',status:'open'}]},
      ]){
        const result=await evaluateGoLiveHardGates({evidence,final_sha:SHA,now_ms:NOW,resolve_real_restore_exercise_authority:async()=>authority,resolve_real_restore_gate_authority:restoreGateAuthority});
        expect(result).toMatchObject({classification:'NOT_GO_READY',allowed:false});
        expect(result.gates.find(row=>row.key==='REAL_RESTORE').status).toBe('BLOCKED');
      }
    }finally{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
  });

  it('re-reads REAL_RESTORE after Exercise/marker authority and rejects an interleaved newer BLOCKED gate',async()=>{
    const previous=Object.fromEntries(Object.keys(IDENTITY_ENV).map((key)=>[key,process.env[key]]));Object.assign(process.env,IDENTITY_ENV);
    try{
      const evidence=await Promise.all(GO_LIVE_GATE_REQUIREMENTS.map(signedEvidence));
      let exerciseAndMarkerRead=false;
      const selected=evidence.find((row)=>row.gate_key==='REAL_RESTORE');
      const blocked={...selected,id:'runtime-gate-real-restore-blocked',evidence_key:'REAL_RESTORE:blocked',status:'BLOCKED',evidence_hash:'b'.repeat(64),observed_at:new Date(NOW-30_000).toISOString()};
      const persistedGateRows=[selected];
      const result=await evaluate({
        evidence,final_sha:SHA,now_ms:NOW,
        resolve_real_restore_exercise_authority:()=>new Promise((resolve)=>{
          exerciseAndMarkerRead=true;
          resolve({available:true,exact_query:true,rows:[RESTORE_EXERCISE],compensation_markers:[]});
          // Simulate compensation committing after the Exercise/marker read
          // resolves but before the consumer's final gate query completes.
          queueMicrotask(()=>persistedGateRows.unshift(blocked));
        }),
        resolve_real_restore_gate_authority:async(row)=>{
          expect(exerciseAndMarkerRead).toBe(true);
          await Promise.resolve();
          expect(persistedGateRows[0].status).toBe('BLOCKED');
          return{available:true,exact_query:true,latest_query:true,exact_rows:persistedGateRows.filter((candidate)=>candidate.evidence_key===row.evidence_key),latest_rows:persistedGateRows.slice(0,2)};
        },
      });
      expect(result).toMatchObject({classification:'NOT_GO_READY',allowed:false});
      expect(result.gates.find((row)=>row.key==='REAL_RESTORE')).toMatchObject({
        status:'BLOCKED',
        blockers:expect.arrayContaining(['evidence_integrity:real_restore_final_gate_not_latest','evidence_integrity:real_restore_final_gate_not_pass']),
      });
    }finally{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
  });

  it('requires one exact row and a uniquely latest identical, freshly verified REAL_RESTORE projection',async()=>{
    const previous=Object.fromEntries(Object.keys(IDENTITY_ENV).map((key)=>[key,process.env[key]]));Object.assign(process.env,IDENTITY_ENV);
    try{
      const row=await signedEvidence(GO_LIVE_GATE_REQUIREMENTS.find((item)=>item.key==='REAL_RESTORE'));
      const verificationInput={now_ms:NOW,environment:'production',max_age_hours:2160,allow_external:true,sha_bound:false,final_sha:SHA,real_restore_exercise_authority:await restoreAuthority()};
      const verify=(exactRows=[row],latestRows=[row])=>verifyFinalRealRestoreGateAuthority(row,{available:true,exact_query:true,latest_query:true,exact_rows:exactRows,latest_rows:latestRows},verificationInput);
      await expect(verify()).resolves.toMatchObject({ok:true,status:'VERIFIED'});

      const staleHash={...row,source:'fresh-read-tampered'};
      await expect(verify([staleHash],[row])).resolves.toMatchObject({
        ok:false,
        blockers:expect.arrayContaining([
          'real_restore_final_gate_exact_mismatch',
          'real_restore_final_gate_exact_hash_mismatch',
        ]),
      });
      await expect(verify([row],[staleHash])).resolves.toMatchObject({
        ok:false,
        blockers:expect.arrayContaining([
          'real_restore_final_gate_latest_mismatch',
          'real_restore_final_gate_latest_hash_mismatch',
          'real_restore_final_gate_not_latest',
        ]),
      });

      const mutate=(field,value)=>{
        if(field==='observed_at')return new Date(Date.parse(value)-1).toISOString();
        if(field==='expires_at')return new Date(Date.parse(value)+1).toISOString();
        if(Array.isArray(value))return [...value,'changed'];
        if(value&&typeof value==='object')return {...value,adversarial_change:true};
        if(typeof value==='number')return value+1;
        if(typeof value==='boolean')return !value;
        return `${String(value)}-changed`;
      };
      for(const [field,value] of Object.entries(runtimeGateEvidencePayload(row))){
        const changed={...row,[field]:mutate(field,value)};
        changed.evidence_hash=await sha256Canonical(runtimeGateEvidencePayload(changed));
        await expect(verify([changed],[row])).resolves.toMatchObject({ok:false,blockers:expect.arrayContaining(['real_restore_final_gate_exact_mismatch'])});
        await expect(verify([row],[changed])).resolves.toMatchObject({ok:false,blockers:expect.arrayContaining(['real_restore_final_gate_latest_mismatch','real_restore_final_gate_not_latest'])});
      }
      for(const [field,value] of [['id','changed'],['evidence_key','changed'],['evidence_hash','b'.repeat(64)]]){
        await expect(verify([{...row,[field]:value}],[row])).resolves.toMatchObject({ok:false,blockers:expect.arrayContaining(['real_restore_final_gate_exact_mismatch'])});
      }
      await expect(verify([row],[row,{...row,id:'older',evidence_key:'older'}])).resolves.toMatchObject({ok:false,blockers:expect.arrayContaining(['real_restore_final_gate_latest_ambiguous'])});
      await expect(verify([row,{...row,id:'duplicate'}],[row])).resolves.toMatchObject({ok:false,blockers:expect.arrayContaining(['real_restore_final_gate_exact_ambiguous'])});
    }finally{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
  });

  it('places the readiness REAL_RESTORE re-fence after async SLO reads and before snapshot persistence',()=>{
    const worker=source('base44/shared/logical/productionReadinessWorker.ts');
    const slo=worker.indexOf('await produceServiceLevelSnapshots');
    const finalFence=worker.indexOf('const finalRestoreGate=await verifiedRuntimeGate');
    const persist=worker.indexOf('persistReadinessSnapshot(svc, snapshotPayload)');
    expect(slo).toBeGreaterThan(-1);
    expect(finalFence).toBeGreaterThan(slo);
    expect(persist).toBeGreaterThan(finalFence);
    expect(worker).toContain("RuntimeGateEvidence.filter({gate_key:'REAL_RESTORE',evidence_key:evidenceKey}");
    expect(worker).toContain("RuntimeGateEvidence.filter({gate_key:'REAL_RESTORE'},'-observed_at',2)");
    const goLiveRuntime=source('base44/shared/goLiveRuntime.ts');
    expect(goLiveRuntime).toContain('resolve_real_restore_gate_authority:resolveRealRestoreGateAuthority');
    expect(goLiveRuntime.indexOf("gate_key:'REAL_RESTORE',evidence_key:evidenceKey")).toBeLessThan(goLiveRuntime.indexOf("gate_key:'REAL_RESTORE'},'-observed_at',2"));
    expect(worker.indexOf("gate_key:'REAL_RESTORE',evidence_key:evidenceKey")).toBeLessThan(worker.indexOf("gate_key:'REAL_RESTORE'},'-observed_at',2"));
  });

  it('serializes concurrent budget reservations through a CAS revision',()=>{
    const at=new Date(NOW);const first=nextCostReservationState(budget,'ai',390,'first',at);const afterFirst={...budget,...first};
    expect(first.reservation_revision).toBe(1);
    expect(reservationUsageFromControl(afterFirst,at).categories.ai.daily_minor).toBe(390);
    expect(costReservationDecision({control:afterFirst,usage:reservationUsageFromControl(afterFirst,at),category:'ai',amount_minor:20})).toMatchObject({allowed:false,reason:'ai_daily_cost_budget_exceeded'});
    expect(afterFirst.reservation_recent_event_keys).toContain('first');
  });

  it('preserves the live reservation journal when the founder changes hard limits',()=>{
    const live={...budget,reservation_revision:7,reservation_day_key:'2026-08-11',reservation_month_key:'2026-08',reserved_daily_total_minor:390,reserved_monthly_total_minor:1390,reserved_category_json:{...budget.reserved_category_json,ai:{daily_minor:390,monthly_minor:1390}},reservation_recent_event_keys:['first','second']};
    expect(costReservationStateForReconfiguration(live,new Date(NOW))).toMatchObject({reservation_revision:7,reserved_daily_total_minor:390,reserved_monthly_total_minor:1390,reservation_recent_event_keys:['first','second']});
    expect(costReservationStateForReconfiguration(live,new Date('2026-08-12T12:00:00.000Z'))).toMatchObject({reservation_revision:7,reserved_daily_total_minor:0,reserved_monthly_total_minor:1390,reservation_recent_event_keys:['first','second']});
    expect(costReservationStateForReconfiguration(live,new Date('2026-09-01T12:00:00.000Z'))).toMatchObject({reservation_revision:7,reserved_daily_total_minor:0,reserved_monthly_total_minor:0,reservation_recent_event_keys:[]});
  });

  it('denies ambiguous active cost authority in runtime instead of picking a row',async()=>{
    expect(selectSingleActiveCostBudget([])).toMatchObject({control:null,blockers:['active_cost_budget_required']});
    expect(selectSingleActiveCostBudget([{id:'a'},{id:'b'}])).toMatchObject({control:null,blockers:['multiple_active_cost_budgets']});
    const controls=[{...budget,id:'a'},{...budget,id:'b'}];
    const svc={entities:{CostBudgetControl:{filter:async()=>controls},CostUsageEvent:{filter:async()=>[]}}};
    const snapshot=await costRuntimeSnapshot(svc);
    expect(snapshot).toMatchObject({control:null,active_control_count:2,validation:{ok:false,blockers:expect.arrayContaining(['multiple_active_cost_budgets'])}});
    expect(snapshot.conflicting_active_control_ids).toEqual(['a','b']);
  });

  it('rejects local assertions, stale proof and proof from a different SHA', async() => {
    const previous=Object.fromEntries(Object.keys(IDENTITY_ENV).map((key)=>[key,process.env[key]]));Object.assign(process.env,IDENTITY_ENV);
    try{
    const requirement = GO_LIVE_GATE_REQUIREMENTS.find(row => row.key === 'BASE44_RUNTIME_PARITY');
    const baseline = await Promise.all(GO_LIVE_GATE_REQUIREMENTS.map(signedEvidence));
    const replace = async(value) => Promise.all(baseline.map(async row => {
      if(row.gate_key!==requirement.key)return row;
      const changed={...row,...value};delete changed.evidence_hash;
      return {...changed,evidence_hash:await sha256Canonical(runtimeGateEvidencePayload(changed))};
    }));
    expect((await evaluate({ evidence:await replace({ evidence_kind:'LOCAL_STATIC' }), final_sha:SHA, now_ms:NOW })).allowed).toBe(false);
    expect((await evaluate({ evidence:await replace({ observed_at:new Date(NOW - 48 * 3600000).toISOString() }), final_sha:SHA, now_ms:NOW })).allowed).toBe(false);
    expect((await evaluate({ evidence:await replace({ git_sha:'different' }), final_sha:SHA, now_ms:NOW })).allowed).toBe(false);
    }finally{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
  });

  it('fails paid execution closed on missing limits and stops a projected overrun', () => {
    expect(validateCostBudget(null).ok).toBe(false);
    const usage = summarizeCostUsage([
      { category:'ai', amount_minor:380, status:'OBSERVED', occurred_at:'2026-08-11T11:00:00.000Z' },
      { category:'ai', amount_minor:10, status:'FAILED', occurred_at:'2026-08-11T11:01:00.000Z' },
      { category:'ai', amount_minor:999, status:'VOID', occurred_at:'2026-08-11T11:02:00.000Z' },
    ], new Date(NOW));
    expect(usage.categories.ai.daily_minor).toBe(390);
    expect(costReservationDecision({ control:budget, usage, category:'ai', amount_minor:20 })).toMatchObject({ allowed:false, reason:'ai_daily_cost_budget_exceeded' });
    expect(costReservationDecision({ control:budget, usage, category:'email', amount_minor:1 })).toMatchObject({ allowed:true });
  });

  it('requires every critical scheduler at cadence and rejects duplicate execution', () => {
    const runs = GO_CRITICAL_SCHEDULERS.map(worker => ({ worker_key:worker.worker_key, cadence_seconds:worker.cadence_seconds, invocation_kind:'SCHEDULED', status:'COMPLETED', run_key:`${worker.worker_key}:slot`, started_at:new Date(NOW - worker.cadence_seconds * 1000).toISOString() }));
    expect(evaluateSchedulerEvidence(runs, NOW)).toMatchObject({ active:true, no_duplicate_execution:true });
    expect(evaluateSchedulerEvidence([...runs, { ...runs[0], started_at:new Date(NOW - 1000).toISOString() }], NOW)).toMatchObject({ no_duplicate_execution:false });
  });

  it('keeps control and external effects behind explicit real-runtime paths', () => {
    const admin = source('base44/shared/logical/goLiveControlAdmin.ts');
    for (const token of ['runtime_git_sha_mismatch','RUN_GLOBAL_EMERGENCY_STOP_DRILL','RUN_COST_KILL_SWITCH_DRILL','CONFIGURE_OUTBOUND_SENDING_PROFILE','ENABLE_SENDING_PROFILE_WARMUP','PAUSE_SENDING_PROFILE','fresh_matching_deliverability_evidence_required','SPF','DKIM','DMARC']) expect(admin.toUpperCase()).toContain(token.toUpperCase());
    for (const file of ['commercialSendMessage','providerRevenueBillingWorker','billApiUsage','createPaymentLink','updatePaymentsMigrationTask']) expect(source(`base44/functions/${file}/entry.ts`)).toContain('emergency_control_paused');
    expect(source('base44/functions/outboundControlAdmin/entry.ts')).toContain('preflight_json?.go_live?.final_sha');
    expect(source('base44/functions/resendInboundWebhook/entry.ts')).toContain("suppressionReason = hardStop === 'unsubscribe' ? 'opt_out'");
    expect(admin).toContain("['active','warming'].includes(String(p.status||''))||Boolean(p.external_campaign_id)");
    expect(admin).toContain('instantly_transport_profile_keys');
    expect(admin).not.toContain("profiles.filter((p:any)=>p.provider==='instantly').every");
    for(const token of ['cost_budget_authority_unavailable','multiple_active_cost_budgets','cost_budget_changed_concurrently','budget_bootstrap_validation_pending','concurrent_budget_bootstrap_conflict','budget_bootstrap_activation_conflict','String(stored.actor_email||\'\')!==actor','costReservationStateForReconfiguration'])expect(admin).toContain(token);
    expect(admin).toContain("{id:active.id,status:'active',version:String(active.version),reservation_revision:expectedRevision}");
  });

  it('guards every known metered provider endpoint with the centralized cost governor', () => {
    const providerPattern = /api\.(?:anthropic|openai|perplexity)|api\.resend|api\.apollo|api\.surferseo|api\.taplio|api\.typefully|api\.instantly|api\.cal\.com|api\.attio/i;
    const guardPattern = /reservePaidOperation|callCambraClaude|paidProviderFetch|sendCostGovernedEmail/;
    const roots = ['base44/functions', 'base44/shared'];
    const files = roots.flatMap(root => fs.readdirSync(path.join(ROOT, root), { recursive:true, withFileTypes:true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.ts'))
      .map(entry => path.join(entry.parentPath, entry.name)));
    const unguarded = files.filter(file => providerPattern.test(fs.readFileSync(file, 'utf8')) && !guardPattern.test(fs.readFileSync(file, 'utf8')));
    expect(unguarded.map(file => path.relative(ROOT, file))).toEqual([]);
  });
});
