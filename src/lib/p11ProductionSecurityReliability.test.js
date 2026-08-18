import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { evaluateProductionSeal, evaluateSlo } from '../../base44/shared/productionReadiness.ts';
import { SERVICE_LEVEL_RUNTIME_VERSION, SERVICE_LEVEL_TARGETS } from '../../base44/shared/serviceLevelCatalog.ts';

const read = (path) => fs.readFileSync(path, 'utf8');
const json = (path) => JSON.parse(read(path));
const greenChecks = Object.fromEntries(['clean','policy','markets','locales','ecl','durability','documentation','lint','typecheck_critical','typecheck_full','tests','build','release'].map((x) => [x,'PASS']));
const SHA='0123456789abcdef0123456789abcdef01234567';
const IDENTITY_HASH='a'.repeat(64);
const greenSlos=SERVICE_LEVEL_TARGETS.map((target)=>({slo_key:target.slo_key,service_class:target.service_class,status:'MET',coverage_status:'COMPLETE',coverage_blockers:[],sample_count:100,success_count:100,latency_p95_ms:100,availability_target:target.availability_target,latency_target_ms:target.latency_p95_ms,source_entity:target.source_entity,source_record_count:100,source_records_hash:'b'.repeat(64),snapshot_hash:'c'.repeat(64),snapshot_integrity:'VERIFIED',methodology_version:SERVICE_LEVEL_RUNTIME_VERSION,runtime_identity_hash:IDENTITY_HASH,git_sha:SHA,coverage_epoch:'2026-07-12T12:00:00.000Z',window_from:'2026-07-12T12:00:00.000Z',window_to:'2026-08-11T12:00:00.000Z',calculated_at:'2026-08-11T12:00:00.000Z'}));

describe('P11 production security and reliability', () => {
  it('has a concrete threat model for every required attack family', () => {
    const model = json('config/p11-threat-model.json');
    expect(model.threats).toHaveLength(15);
    for (const term of ['tenant_escape_idor','privilege_escalation','secret_exposure','prompt_injection_document','ssrf_upload_fetch','xss_untrusted_content','csrf_replay','injection_query_or_external','malicious_or_oversized_upload','webhook_spoof_or_replay','oauth_token_leak_or_scope','api_model_cost_abuse','money_duplicate_or_reconciliation_loss','backup_or_restore_failure','dependency_supply_chain']) expect(model.threats.some((x) => x.threat === term)).toBe(true);
    for (const threat of model.threats) for (const ref of threat.control_refs) expect(fs.existsSync(ref)).toBe(true);
  });

  it('blocks critical/high findings and failed local checks', () => {
    const result = evaluateProductionSeal({ findings:[{ finding_id:'P11-001',severity:'HIGH',status:'OPEN' }],local_checks:{ ...greenChecks,tests:'FAIL' },final_sha:'abc' });
    expect(result).toMatchObject({ status:'P11_BLOCKED_NOT_SEALED',technically_complete:false,sealed:false,internal_blockers:['P11-001'],failed_local_checks:['tests'] });
  });

  it('keeps accepted HIGH/CRITICAL findings blocking until they are resolved', () => {
    const accepted = evaluateProductionSeal({
      findings:[{ finding_id:'P11-RISK',severity:'CRITICAL',status:'ACCEPTED' }],
      local_checks:greenChecks,
    });
    expect(accepted.internal_blockers).toEqual(['P11-RISK']);
    expect(accepted.technically_complete).toBe(false);
    const resolved = evaluateProductionSeal({
      findings:[{ finding_id:'P11-RISK',severity:'CRITICAL',status:'RESOLVED' }],
      local_checks:greenChecks,
    });
    expect(resolved.internal_blockers).toEqual([]);
  });

  it('keeps external evidence separate from local technical completion', () => {
    const result = evaluateProductionSeal({ findings:[],local_checks:greenChecks,final_sha:'abc',remote_ci:{ status:'NOT_RUN' },base44_runtime:{ status:'NOT_RUN' },restore_exercise:{ status:'NOT_RUN' },document_extraction_eval:{ status:'NOT_RUN' },dependency_monitor:{ status:'NOT_RUN' } });
    expect(result.technically_complete).toBe(true);
    expect(result.sealed).toBe(false);
    expect(result.external_blockers.map((x) => x.code)).toEqual(expect.arrayContaining(['REMOTE_CI_FINAL_SHA_REQUIRED','BASE44_RUNTIME_PROOF_REQUIRED','REAL_RESTORE_EXERCISE_REQUIRED','REAL_DOCUMENT_GOLDEN_CORPUS_REQUIRED','DEPENDENCY_ALERT_PROOF_REQUIRED']));
  });

  it('only seals when remote evidence is tied to the final SHA and every gate passes', () => {
    const result = evaluateProductionSeal({ findings:[],local_checks:greenChecks,final_sha:SHA,remote_ci:{ status:'PASS',git_sha:SHA,evidence_integrity:'VERIFIED' },base44_runtime:{ status:'PASS',evidence_integrity:'VERIFIED' },restore_exercise:{ status:'PASS',evidence_integrity:'VERIFIED' },document_extraction_eval:{ status:'PASS',evidence_integrity:'VERIFIED' },dependency_monitor:{ status:'PASS',evidence_integrity:'VERIFIED' },runtime_identity:{status:'PASS',identity_hash:IDENTITY_HASH},service_levels:greenSlos,source_coverage:{status:'COMPLETE'},now_ms:Date.parse('2026-08-11T12:00:00.000Z') });
    expect(result).toMatchObject({ status:'P11_PASS_SEALED',technically_complete:true,sealed:true });
  });

  it('treats undersampled SLOs as unknown and reports real breaches', () => {
    const target = { availability_target:.99,latency_p95_ms:5000 };
    expect(evaluateSlo(target, { sample_count:10,success_count:10,latency_p95_ms:100 })).toMatchObject({ status:'INSUFFICIENT_EVIDENCE',met:false });
    expect(evaluateSlo(target, { sample_count:100,success_count:98,latency_p95_ms:4000 })).toMatchObject({ status:'BREACHED',met:false,availability_met:false });
    expect(evaluateSlo(target, { sample_count:100,success_count:100,latency_p95_ms:4000 })).toMatchObject({ status:'MET',met:true });
  });

  it('hardens the invoice/document path before financial projection', () => {
    const extractor = read('base44/functions/processUploadedFile/entry.ts'); const core = read('base44/shared/documentExtraction.ts'); const create = read('base44/functions/createDocument/entry.ts'); const link = read('base44/functions/linkDocument/entry.ts');
    expect(extractor).toContain('readResponseWithLimit');
    expect(extractor).toContain('crossValidateCandidates(primary, secondary)');
    expect(core).toContain('field_evidence_required');
    expect(core).toContain('statement_period_is_not_monthly');
    expect(create).toContain("TRUSTED_UPLOAD_HOSTS = new Set(['media.base44.com'])");
    expect(create).toContain('MAX_DOCUMENT_BYTES');
    expect(link).toContain("target_type === 'statement_import'");
    expect(link).toContain('rows[0].brand_id === brandId');
    expect(link).toContain('Target not found or access denied');
  });

  it('runs the complete local drift gates in authoritative CI', () => {
    for (const path of ['.github/workflows/ci.yml','ci/github-workflow-ci.yml']) {
      const ci = read(path);
      for (const command of ['markets:check','locales:check','ecl:check','durability:check','documentation:check','ci:check','release:check:ci']) expect(ci).toContain(command);
    }
  });

  it('models findings, SLOs, restore evidence, external verification and readiness snapshots', () => {
    for (const name of ['ProductionFinding','ServiceLevelSnapshot','DisasterRecoveryExercise','ReleaseVerification','ProductionReadinessSnapshot']) expect(fs.existsSync(`base44/entities/${name}.jsonc`)).toBe(true);
    expect(json('base44/functions/productionReadinessWorker/function.jsonc').automations[0].is_active).toBe(true);
    expect(json('base44/entities/ProductionFinding.jsonc').rls.write.user_condition.role).toBe('__service_role_only__');
  });

  it('does not let the runtime worker invent external proof', () => {
    const worker = read('base44/shared/logical/productionReadinessWorker.ts');
    expect(worker).toMatch(/verification\(["']GITHUB_ACTIONS["']\)/);
    expect(worker).toMatch(/gate_key:\s*["']BASE44_RUNTIME_PARITY["']/);
    expect(worker).toContain('runtimeDeploymentIdentity()');
    expect(worker).toContain('produceServiceLevelSnapshots');
    expect(worker).not.toMatch(/body\.final_sha/);
    expect(worker).not.toMatch(/body\.local_checks/);
    expect(worker).toMatch(/exercise_type:\s*["']REAL_RESTORE["']/);
    expect(worker).toMatch(
      /["']OPEN["']\s*,\s*["']REMEDIATING["']\s*,\s*["']ACCEPTED["']/,
    );
    expect(worker).not.toMatch(/ReleaseVerification\.create/);
    expect(worker).not.toMatch(/DisasterRecoveryExercise\.create/);
  });
});
