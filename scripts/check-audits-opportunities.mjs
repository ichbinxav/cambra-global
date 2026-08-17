#!/usr/bin/env node
// DASHBOARD-C4 (2026-08-17) — Audits & Opportunities integrity.
//
// The separations of section 9.4 are the whole point of this workspace, so the
// gate enforces them structurally rather than trusting a reviewer to notice.
import fs from 'node:fs';
import process from 'node:process';

let failures = 0;
const fail = (m) => { console.error(`audits-opportunities:check FAIL — ${m}`); failures += 1; };
const core = fs.readFileSync('base44/shared/auditsCore.ts', 'utf8');
const entity = (n) => JSON.parse(fs.readFileSync(`base44/entities/${n}.jsonc`, 'utf8'));

// 1. MerchantOpportunity must still carry the six separate figures. If a future
//    migration collapses two of them, this workspace's honesty collapses with it.
const props = entity('MerchantOpportunity').properties || {};
for (const field of [
  'current_annual_cost_minor', 'target_annual_cost_minor', 'gross_theoretical_savings_minor',
  'actionable_savings_minor', 'expected_recoverable_savings_minor', 'annualized_savings_minor',
  'realization_probability_ppm', 'confidence', 'evidence_completeness',
]) {
  if (!props[field]) fail(`MerchantOpportunity is missing ${field} — the section 9.15 truth model is incomplete`);
}

// 2. This workspace must NEVER compute verified or billable savings.
for (const forbidden of ['verified_savings_minor', 'billable_savings_minor', 'collected_revenue']) {
  if (core.includes(forbidden)) {
    fail(`auditsCore references ${forbidden} — verified savings belong to Recover and billable savings to Finance`);
  }
}

// 3. No new audit or opportunity entity may be created: the authorities exist.
for (const forbidden of ['AuditRun', 'OpportunityReviewDecision', 'AuditSourceSnapshot']) {
  if (fs.existsSync(`base44/entities/${forbidden}.jsonc`)) {
    fail(`${forbidden} exists — C0 established that AnalyzerResult, MerchantOpportunity, SavingsEvidence and ReviewCase already cover this`);
  }
}

// 4. The unverifiable audit types must stay unverifiable.
if (!/NEVER_VERIFIED_TYPES[\s\S]{0,200}ANONYMOUS_ESTIMATE/.test(core)) {
  fail('ANONYMOUS_ESTIMATE must be listed in NEVER_VERIFIED_TYPES');
}
if (!core.includes("RECOVER_ELIGIBLE_STATUSES") || !core.includes("'APPROVED_FOR_RECOVER'")) {
  fail('Recover eligibility must be gated on APPROVED_FOR_RECOVER');
}

// 5. The Number(null) trap, now enforced by CENTRALISATION rather than by looking
//    for an inline guard. Number(null) is 0 and Number.isFinite(0) is true, so a
//    naive helper reports an absent figure as a confident zero. That bug was
//    written twice in this repo, so the rule is no longer "each file guards
//    correctly" but "there is exactly one implementation and everyone imports it".
if (!fs.existsSync('base44/shared/nullableNumber.ts')) {
  fail('base44/shared/nullableNumber.ts must exist — nullable coercion lives in one place');
} else {
  const shared = fs.readFileSync('base44/shared/nullableNumber.ts', 'utf8');
  if (!/value === null \|\| value === undefined/.test(shared)) {
    fail('nullableNumber does not guard null');
  }
  if (!/typeof value === 'string' && value\.trim\(\) === ''/.test(shared)) {
    fail('nullableNumber must treat an empty or whitespace string as absent');
  }
  if (!/typeof value === 'boolean'/.test(shared)) {
    fail('nullableNumber must treat a boolean as absent — Number(true) is 1');
  }
}
for (const consumer of ['base44/shared/auditsCore.ts', 'base44/shared/pipelineCore.ts']) {
  const source = fs.readFileSync(consumer, 'utf8');
  if (!source.includes("from './nullableNumber.ts'")) {
    fail(`${consumer} must import the shared nullable coercion instead of writing its own`);
  }
  // A local re-implementation defeats the centralisation.
  if (/Number\.isFinite\(parsed\)/.test(source)) {
    fail(`${consumer} re-implements nullable coercion locally — use nullableNumber`);
  }
}

if (failures) process.exit(1);
console.log(
  'audits-opportunities:check PASS — MerchantOpportunity carries all 9 section-9.15 fields, ' +
  'no verified or billable savings computed here, no duplicate audit authority, ' +
  'ANONYMOUS_ESTIMATE can never be verified, Recover gated on APPROVED_FOR_RECOVER, nullable coercion centralised and imported by both cores',
);
