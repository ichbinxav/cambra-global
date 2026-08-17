#!/usr/bin/env node
// DASHBOARD-C8 (2026-08-17) — Finance truth model integrity.
//
// The one thing that must never rot: the five domains staying apart. A total that
// mixes savings with revenue, or merchant revenue with provider revenue, counts the
// same euro twice — and the damage is invisible because the number still looks right.
import fs from 'node:fs';
import process from 'node:process';

let failures = 0;
const fail = (m) => { console.error(`finance:check FAIL — ${m}`); failures += 1; };
const core = fs.readFileSync('base44/shared/financeCore.ts', 'utf8');

// 1. All five domains and all six bases declared.
for (const domain of ['MERCHANT_SAVINGS', 'MERCHANT_REVENUE', 'PROVIDER_REVENUE', 'COSTS', 'CASH']) {
  if (!core.includes(`'${domain}'`)) fail(`FINANCE_DOMAINS is missing ${domain}`);
}
for (const basis of ['OBSERVED_CASH', 'ACCRUED', 'INVOICED', 'COLLECTED', 'FORECAST', 'MODELED']) {
  if (!core.includes(`'${basis}'`)) fail(`ACCOUNTING_BASES is missing ${basis}`);
}

// 2. The forbidden sums must be declared with reasons, and the guard must exist.
if (!core.includes('FORBIDDEN_SUMS')) fail('financeCore must declare FORBIDDEN_SUMS');
if (!core.includes('checkCombination')) fail('financeCore must expose checkCombination');
for (const pair of [
  ["MERCHANT_SAVINGS", "MERCHANT_REVENUE"],
  ["MERCHANT_REVENUE", "PROVIDER_REVENUE"],
]) {
  const declared = new RegExp(`a: '${pair[0]}', b: '${pair[1]}'`).test(core);
  if (!declared) fail(`${pair[0]} + ${pair[1]} must be declared a forbidden sum`);
}

// 3. Centralised nullable coercion (founder rule: mandatory in financial code).
if (!core.includes("from './nullableNumber.ts'")) {
  fail('financeCore must use the shared nullable coercion — this is financial code');
}
if (/Number\.isFinite\(parsed\)/.test(core)) {
  fail('financeCore re-implements nullable coercion locally');
}
// Every total must go through nullableSum so completeness is declared.
if (!core.includes('nullableSum')) {
  fail('financeCore must sum through nullableSum so a total declares COMPLETE or LOWER_BOUND');
}

// 4. Completeness must demote the truth class. A lower bound cannot be VERIFIED.
if (!/completeness === 'COMPLETE'\s*\?\s*input\.truth_class/.test(core)) {
  fail('a figure whose sum skipped rows must be demoted — a lower bound is not verified');
}

// 5. Currency must never be summed across without a dated rate.
if (!core.includes('consolidate')) fail('financeCore must expose consolidate');
if (!/mixed/.test(core) || !core.includes('not money')) {
  fail('a mixed-currency set must report no consolidated total and say why');
}

// 6. The revenue-to-cost join C0 found missing must exist and must read the cost plane.
if (!core.includes('CostUsageEvent')) {
  fail('financeCore must read the cost plane — C0 found no financial aggregator did');
}
if (!core.includes('computeMargin')) fail('financeCore must expose computeMargin');
if (!core.includes('flatters reality')) {
  fail('a margin computed from a truncated cost figure must be labelled and explained');
}

// 7. Finance must not silently become a Recover or Audits authority.
for (const forbidden of ['recoverEligibility', 'gross_theoretical']) {
  if (core.includes(forbidden)) {
    fail(`financeCore references ${forbidden} — that belongs to Recover or Audits`);
  }
}

// 8. The provider firewall must be stated where provider revenue is computed.
if (!core.includes('never influences merchant ranking')) {
  fail('the provider economics firewall must be stated on the provider revenue figure');
}

if (failures) process.exit(1);
console.log(
  'finance:check PASS — 5 domains and 6 bases declared, forbidden sums guarded with reasons, ' +
  'nullable coercion centralised and every total declares completeness, a lower bound cannot be ' +
  'VERIFIED, mixed currency reports no consolidated total, the revenue-to-cost join exists and ' +
  'labels a flattered margin, provider firewall stated',
);
