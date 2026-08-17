#!/usr/bin/env node
// DASHBOARD-C6 (2026-08-17) — Recover integrity.
import fs from 'node:fs';
import process from 'node:process';

let failures = 0;
const fail = (m) => { console.error(`recover:check FAIL — ${m}`); failures += 1; };
const core = fs.readFileSync('base44/shared/recoverCore.ts', 'utf8');

// 1. The root stays DealActivation, and the forbidden aggregates stay forbidden.
if (!core.includes("RECOVER_ROOT_ENTITY = 'DealActivation'")) {
  fail('the Recover root must remain DealActivation');
}
for (const forbidden of ['RecoverCase', 'RecoverAggregate', 'RecoverStageEvent']) {
  if (fs.existsSync(`base44/entities/${forbidden}.jsonc`)) {
    fail(`${forbidden} exists — C0 and its adversarial pass both ruled it out; DealActivation is the root`);
  }
}

// 2. Recover reports billing ELIGIBILITY and never an invoice or a billable amount.
for (const forbidden of ['billable_savings_minor', 'Invoice.create', 'issueInvoice']) {
  if (core.includes(forbidden)) {
    fail(`recoverCore references ${forbidden} — Recover reports eligibility; invoices are Finance's authority`);
  }
}
if (!core.includes('billingEligibility')) fail('recoverCore must expose billingEligibility');

// 3. A verified figure is required for billing eligibility.
if (!core.includes('verified_savings_unknown')) {
  fail('billing eligibility must refuse when no verified figure exists');
}

// 4. Opening a case must be idempotent and gated on the shared eligibility rules.
if (!core.includes('recover_case_already_exists')) fail('opening a case must detect an existing one');
if (!core.includes("from './auditsCore.ts'") || !core.includes('recoverEligibility')) {
  fail('opening a case must reuse auditsCore recoverEligibility rather than a local copy');
}
if (!core.includes('existing_case_unreadable')) {
  fail('an unreadable existing-case check must refuse, not assume none exists');
}

// 5. Centralised nullable coercion (founder rule).
if (!core.includes("from './nullableNumber.ts'")) {
  fail('recoverCore must use the shared nullable coercion');
}
if (/Number\.isFinite\(parsed\)/.test(core)) {
  fail('recoverCore re-implements nullable coercion locally');
}

// 6. The case is created in the weakest phase.
if (!/status: 'proposed'/.test(core)) {
  fail('a new case must be created in the weakest phase, never already authorized');
}

// 7. The governed Contract handler must keep its allowlist and its protections.
const contract = fs.readFileSync('base44/shared/recoverContractCore.ts', 'utf8');
for (const protectedField of ['user_email', 'deal_activation_id', 'node_revenue_pct', 'estimated_savings_annual', 'status', 'activity_log']) {
  if (!new RegExp(`${protectedField}:`).test(contract)) {
    fail(`recoverContractCore must protect ${protectedField} — it binds a party, a case, economics or lifecycle`);
  }
}
if (!/EDITABLE_FIELDS = Object\.freeze/.test(contract)) fail('recoverContractCore must declare a frozen field allowlist');
if (!contract.includes('reason_required')) fail('a contract correction must require a reason');
if (!contract.includes('field_not_editable')) fail('an unknown field must be refused, not ignored');
// The page must not have regressed to a generic write.
const page = fs.readFileSync('src/pages/admin/AdminContracts.jsx', 'utf8');
if (/base44\.entities\.Contract\.(update|create|delete)\(/.test(page)) {
  fail('AdminContracts writes Contract directly again — the C7 governed handler was bypassed');
}

if (failures) process.exit(1);
console.log(
  'recover:check PASS — root is DealActivation with no competing aggregate, billing eligibility only ' +
  '(no invoice, no billable amount), verified figure required, open-case idempotent and gated on the ' +
  'shared eligibility rules, unreadable existing-case check refuses, nullable coercion centralised, ' +
  'new cases open in the weakest phase, Contract corrections go through the governed allowlist handler',
);
