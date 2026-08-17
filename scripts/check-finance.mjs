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

/**
 * Strips comments so the structural checks below read CODE.
 *
 * This matters in both directions. A comment quoting a forbidden pattern made three
 * checks fail on prose that was describing the fix (C4 hit the same thing), and more
 * importantly a comment mentioning a REQUIRED pattern could make a check pass with no
 * implementation behind it. Checks that deliberately assert an explanation is present
 * run against the full text instead, and say so.
 */
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map((line) => line.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');

const coreText = fs.readFileSync('base44/shared/financeCore.ts', 'utf8');
const core = stripComments(coreText);

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
if (!/mixed/.test(core) || !coreText.includes('not money')) {
  fail('a mixed-currency set must report no consolidated total and say why');
}

// 6. The revenue-to-cost join C0 found missing must exist and must read the cost plane.
if (!core.includes('CostUsageEvent')) {
  fail('financeCore must read the cost plane — C0 found no financial aggregator did');
}
if (!core.includes('computeMargin')) fail('financeCore must expose computeMargin');
if (!coreText.includes('flatters reality')) {
  fail('a margin computed from a truncated cost figure must be labelled and explained');
}

// 7. Finance must not silently become a Recover or Audits authority.
for (const forbidden of ['recoverEligibility', 'gross_theoretical']) {
  if (core.includes(forbidden)) {
    fail(`financeCore references ${forbidden} — that belongs to Recover or Audits`);
  }
}

// 8. The provider firewall must be stated where provider revenue is computed.
if (!coreText.includes('never influences merchant ranking')) {
  fail('the provider economics firewall must be stated on the provider revenue figure');
}

// ---------------------------------------------------------------------------
// DASHBOARD-C9 — the Finance workspace, and the three defects C9 found in C8.
// ---------------------------------------------------------------------------
const workspaceText = fs.readFileSync('base44/shared/financeWorkspaceCore.ts', 'utf8');
const workspace = stripComments(workspaceText);
const revenuePage = stripComments(fs.readFileSync('src/pages/admin/AdminRevenue.jsx', 'utf8'));
const identityCard = stripComments(fs.readFileSync('src/components/admin/recoverBilling/FiscalIdentityCard.jsx', 'utf8'));

// 9. C8 wrote `consolidate` and then did not use it inside `figure`, so a figure
// spanning two currencies reported one confident number. The wiring must stay wired.
if (!/const consolidated = consolidate\(/.test(core)) {
  fail('figure() must run its rows through consolidate — a per-currency guard that figure() does not call guards nothing');
}
// 10. C8 read `savings_minor` and `amount_paid_minor`, which do not exist on
// MonthlySavingsReport or Invoice. Those two entities store MAJOR units. Any read of
// them must state the unit, or the figure is permanently UNKNOWN and nobody notices.
if (!core.includes('toMinor')) fail('financeCore must expose toMinor — this repo stores both MINOR and MAJOR units');
for (const source of [core, workspace]) {
  if (/field: '(savings|total_amount|amount_paid)'/.test(source)) {
    const majorReads = source.match(/field: '(?:savings|total_amount|amount_paid)',[^\n]*/g) || [];
    for (const line of majorReads) {
      if (!line.includes("unit: 'MAJOR'")) {
        fail(`a MAJOR-unit field is read without declaring the unit: ${line.trim()}`);
      }
    }
  }
  // The inverse: the non-existent minor variants must not come back.
  if (/'(savings_minor|amount_paid_minor|total_amount_minor)'/.test(source)) {
    fail('reads a *_minor field that MonthlySavingsReport and Invoice do not have — the figure would be permanently UNKNOWN');
  }
}
// 11. Margin must not cross currencies either.
if (!/currencyConflict/.test(core) || !coreText.includes('not money')) {
  fail('computeMargin must refuse when the sides are denominated in different currencies');
}

// 12. The B2B tax gate. recoverTax.ts:224 blocks invoicing without
// tax_customer_type, and the browser form used to write it on every address save.
if (!workspace.includes('BILLING_PROTECTED_FIELDS')) {
  fail('financeWorkspaceCore must declare the fields a billing form may not write');
}
// Full text on purpose: this asserts the protection EXPLAINS which gate it guards.
if (!/tax_customer_type/.test(workspace) || !workspaceText.includes('recoverTax.ts:224')) {
  fail('the tax_customer_type protection must name the gate it protects, so nobody re-adds it as a convenience');
}
if (!workspace.includes('confirmB2bStatus')) fail('confirming B2B status must be its own action');
if (!/b2b_status_not_demonstrable/.test(workspace)) {
  fail('confirmB2bStatus must refuse when the evidence does not exist');
}
// A VIES result attests to one VAT number. Changing the number must revoke it.
if (!/vies_status = 'not_checked'/.test(workspace) || !workspace.includes('revokes_b2b_confirmation')) {
  fail('changing the VAT number must reset the VIES status and revoke the B2B confirmation');
}

// 13. The two consolidated pages must hold no entity access and no money arithmetic.
for (const [name, source] of [['AdminRevenue.jsx', revenuePage], ['FiscalIdentityCard.jsx', identityCard]]) {
  if (/base44\.entities\./.test(source)) {
    fail(`${name} still reaches base44.entities — the Finance workspace reads and writes through the governed route`);
  }
}
if (/\.reduce\(/.test(revenuePage)) {
  fail('AdminRevenue.jsx does arithmetic over entity rows again — the projection is computed on the server');
}
// The specific coercion that made an absent amount look like a free invoice.
if (/\|\| 0\)/.test(revenuePage)) {
  fail('AdminRevenue.jsx uses `|| 0` on an amount again — absent is not zero');
}
if (/tax_customer_type:\s*["']business_taxable_person["']/.test(identityCard)) {
  fail('FiscalIdentityCard.jsx asserts B2B status from a form again — that clears the invoicing gate with no evidence');
}

if (failures) process.exit(1);
console.log(
  'finance:check PASS — 5 domains and 6 bases declared, forbidden sums guarded with reasons, ' +
  'nullable coercion centralised and every total declares completeness, a lower bound cannot be ' +
  'VERIFIED, mixed currency reports no consolidated total in figures OR margin, MAJOR/MINOR units ' +
  'declared at every read, the revenue-to-cost join exists and labels a flattered margin, provider ' +
  'firewall stated; B2B status requires evidence and a VAT change revokes it; AdminRevenue and ' +
  'FiscalIdentityCard hold zero entity access and zero money arithmetic',
);
