import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pending = new Map();
const changed = [];

function read(rel) {
  if (pending.has(rel)) return pending.get(rel);
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function stage(rel, value) {
  if (read(rel) === value) return;
  pending.set(rel, value);
  if (!changed.includes(rel)) changed.push(rel);
}

function replaceUnique(source, needle, replacement, label) {
  const count = typeof needle === "string"
    ? source.split(needle).length - 1
    : [...source.matchAll(new RegExp(needle.source, needle.flags.includes("g") ? needle.flags : `${needle.flags}g`))].length;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(needle, replacement);
}

// Central, fail-closed policy. Revenue calculators also return zero if they are
// called from code that has not yet been retired.
{
  const rel = "base44/shared/providerEconomicsCore.ts";
  let source = read(rel);
  source = source.replace(/^export const PROVIDER_ECONOMICS_VERSION=.*$/m, "export const PROVIDER_ECONOMICS_VERSION='provider-no-compensation-2026-09-10';");
  source = source.replace(
    /^export const PROVIDER_MONETIZATION_PRODUCTION_ALLOWED=.*$/m,
    `export const PSP_COMPENSATION_ACCEPTED=false;
export const PROVIDER_MONETIZATION_PRODUCTION_ALLOWED=false;
export const PROVIDER_COMPENSATION_DISABLED_ERROR='provider_compensation_disabled_by_cambra_policy';
export function providerCompensationDisabledResponse(){return Response.json({ok:false,error:PROVIDER_COMPENSATION_DISABLED_ERROR,provider_compensation_activation_allowed:false,policy:'CAMBRA accepts no commission, referral fee, revenue share or other compensation from a PSP. The PSP contracts with and invoices the merchant directly.'},{status:409})}`,
  );
  source = source.replace(/^export function providerExpectedRevenueMinor\(.*$/m, "export function providerExpectedRevenueMinor(_e:any,_horizonMonths=12){return 0}");
  source = source.replace(/^export function providerEconomicsScore\(.*$/m, "export function providerEconomicsScore(_e:any){return 0}");
  source = source.replace(/^export function providerRevenueAmountMinor\(.*$/m, "export function providerRevenueAmountMinor(_basisValue:number,_terms:any){return 0}");
  stage(rel, source);
}

const disabledEntrypoints = [
  "base44/functions/providerMonetizationAgent/entry.ts",
  "base44/functions/approveProviderMonetizationLegalReview/entry.ts",
  "base44/functions/providerRevenueAttributionWorker/entry.ts",
  "base44/functions/providerRevenueLifecycleWorker/entry.ts",
  "base44/functions/providerRevenueTierWorker/entry.ts",
  "base44/functions/providerRevenueReconciliationWorker/entry.ts",
  "base44/functions/providerRevenueBillingWorker/entry.ts",
  "base44/functions/providerRevenueRecoveryAgent/entry.ts",
  "base44/functions/recordProviderRevenueInvoiceIssued/entry.ts",
  "base44/functions/recordProviderRevenuePayment/entry.ts",
  "base44/functions/providerEconomicsAssessmentWorker/entry.ts",
  "base44/functions/providerEconomicsIntelligenceWorker/entry.ts",
  "base44/functions/getProviderEconomicsCommandCenter/entry.ts",
];

for (const rel of disabledEntrypoints) {
  let source = read(rel);
  if (source.includes("PSP_COMPENSATION_DISABLED_BY_POLICY")) continue;
  const firstNewline = source.indexOf("\n");
  if (firstNewline < 0) throw new Error(`${rel}: no import insertion point`);
  const policyImport = "import { PROVIDER_MONETIZATION_PRODUCTION_ALLOWED as CAMBRA_PSP_COMPENSATION_ALLOWED, providerCompensationDisabledResponse } from '../../shared/providerEconomicsCore.ts';\n";
  source = source.slice(0, firstNewline + 1) + policyImport + source.slice(firstNewline + 1);
  const handlerStartCandidates = [source.indexOf("Deno.serve"), source.indexOf("guardedScheduledServe")].filter((x) => x >= 0);
  if (!handlerStartCandidates.length) throw new Error(`${rel}: handler start not found`);
  const handlerStart = Math.min(...handlerStartCandidates);
  const tryMatch = /\btry\s*\{/.exec(source.slice(handlerStart));
  if (!tryMatch) throw new Error(`${rel}: handler try block not found`);
  const insertion = handlerStart + tryMatch.index + tryMatch[0].length;
  const guard = "\n    // PSP_COMPENSATION_DISABLED_BY_POLICY — fail closed even for legacy approved agreements.\n    if (!CAMBRA_PSP_COMPENSATION_ALLOWED) return providerCompensationDisabledResponse();";
  source = source.slice(0, insertion) + guard + source.slice(insertion);
  stage(rel, source);
}

// A suitable merchant offer now proceeds through the normal merchant-first
// approval flow. It no longer pauses to ask the PSP to pay CAMBRA.
{
  const rel = "base44/functions/collectiveNegotiationAgent/entry.ts";
  let source = read(rel);
  const start = source.indexOf("    const monetizationAlreadyRequested =");
  const end = source.indexOf("    await s.entities.NegotiationCase.update(c.id, {", start);
  if (start < 0 || end < 0 || end <= start) throw new Error(`${rel}: obsolete monetization phase not found`);
  source = source.slice(0, start) + source.slice(end);
  stage(rel, source);
}

// Aggregate agreements may still contain merchant pricing tiers, but never a
// CAMBRA compensation layer or compensation-tier activation.
{
  const rel = "base44/functions/resolveCommercialApproval/entry.ts";
  let source = read(rel);
  source = replaceUnique(
    source,
    `      const providerEconomics =
        bid.provider_economics_json || p.provider_economics || {};`,
    `      const providerEconomics = {}; // PSP compensation is prohibited by CAMBRA policy.`,
    `${rel}:provider economics`,
  );
  source = replaceUnique(
    source,
    `      const compensationTiers = Array.isArray(providerEconomics?.tiers)
        ? providerEconomics.tiers
        : [];`,
    `      const compensationTiers: any[] = [];`,
    `${rel}:compensation tiers`,
  );
  source = replaceUnique(
    source,
    "We have internal approval to proceed on the commercial basis discussed. Please send the final written agreement or rate-card confirmation reflecting the exact merchant pricing, merchant tiers, CAMBRA partnership economics (if any), provider-compensation tiers, activation criteria, rebates, payment terms, clawbacks, term, notice, settlement, implementation and any minimum or exclusivity conditions. Merchant terms and CAMBRA compensation must remain separately stated. This approval does not itself activate provider compensation, create a volume guarantee or execute a contract.",
    "We have internal approval to proceed with the merchant pricing discussed. Please send the final written agreement or rate-card confirmation covering the preferred rate or cohort/tier matrix, underwriting and eligibility criteria, rebates, term, notice, settlement, implementation, support and any minimum or exclusivity conditions. The PSP must contract with and invoice each merchant directly. CAMBRA accepts no PSP commission, referral fee, revenue share or other compensation. This approval does not create a volume guarantee or execute a contract.",
    `${rel}:contract request`,
  );
  const executionTiers = `      const compensationTiers =
        await svc.entities.ProviderCompensationTier.filter(
          { agreement_id: a.id },
          "tier_number",
          100,
        );`;
  source = replaceUnique(source, executionTiers, "      const compensationTiers: any[] = [];", `${rel}:execution compensation tiers`);
  stage(rel, source);
}

// Contract review still checks merchant terms and actively rejects any clause
// that would pay CAMBRA from the PSP.
{
  const rel = "base44/functions/reviewProviderContract/entry.ts";
  let source = read(rel);
  source = source.replace("Compare merchant and provider-compensation terms for ${c.provider_name}", "Review merchant terms and reject PSP-compensation clauses for ${c.provider_name}");
  source = source.replace(
    "Extract BOTH merchant pricing and CAMBRA provider-compensation terms from this contract. They are separate economic layers. Never infer missing numbers. Return ONLY JSON.",
    "Extract merchant pricing and identify any clause that would compensate CAMBRA from the PSP solely so that clause can be rejected. Never infer missing numbers. Return ONLY JSON.",
  );
  const start = source.indexOf("const pe=offer.provider_economics_json||{};");
  const end = source.indexOf("const unusual=", start);
  if (start < 0 || end < 0 || end <= start) throw new Error(`${rel}: provider compensation comparison block not found`);
  const replacement = "const negotiatedProviderCompensation=offer.provider_economics_json||{};if(Object.keys(negotiatedProviderCompensation).length)deltas.push({layer:'provider_compensation',field:'negotiated_terms_prohibited',negotiated:negotiatedProviderCompensation,contract:null,policy:'CAMBRA accepts no PSP compensation'});const extractedProviderCompensation=ex.provider_compensation||{};const prohibitedCompensationDetected=(Array.isArray(extractedProviderCompensation.compensation_types)&&extractedProviderCompensation.compensation_types.length>0)||Number(extractedProviderCompensation.rate_bps||0)>0||Number(extractedProviderCompensation.percentage||0)>0||Number(extractedProviderCompensation.fixed_fee_minor||0)>0||Boolean(String(extractedProviderCompensation.basis||'').trim())||Boolean(String(extractedProviderCompensation.payment_terms||'').trim());if(prohibitedCompensationDetected)deltas.push({layer:'provider_compensation',field:'prohibited_contract_clause',negotiated:'none',contract:extractedProviderCompensation,policy:'Remove all PSP commission, referral fee, revenue share and other compensation to CAMBRA'});";
  source = source.slice(0, start) + replacement + source.slice(end);
  source = source.replace("merchant_and_provider_economics_separate:true", "provider_compensation_prohibited:true");
  stage(rel, source);
}

// Compliance rule now blocks the compensation itself, not merely hidden disclosure.
{
  const rel = "base44/functions/seedComplianceRules/entry.ts";
  let source = read(rel);
  source = source.replace('rule_id: "deal_must_disclose_revenue_share"', 'rule_id: "provider_deal_forbids_psp_compensation"');
  source = source.replace('title: "Provider deals must disclose CAMBRA revenue share"', 'title: "Provider deals must not compensate CAMBRA"');
  source = source.replace(
    '"Every active provider deal must declare CAMBRA\'s success-fee / revenue-share model to the brand before authorization. Hidden remuneration is forbidden."',
    '"Every provider agreement must state that CAMBRA receives no PSP commission, referral fee, revenue share or other compensation. The PSP contracts with and invoices the merchant directly."',
  );
  stage(rel, source);
}

// Founder finance surfaces remain structurally compatible but report the
// provider side as policy-zero and exclude it from CAMBRA revenue totals.
{
  const rel = "base44/functions/getFinancialControlTower/entry.ts";
  let source = read(rel);
  source = source.replace("const providerExpected = nn([providerLedger], () => sum(ledgerRows, 'expected_amount_minor') / 100);", "const providerExpected = 0;");
  source = source.replace("const providerAccrued = nn([providerLedger], () => sum(ledgerRows, 'accrued_amount_minor') / 100);", "const providerAccrued = 0;");
  source = source.replace("const providerPaid = nn([providerLedger], () => sum(ledgerRows.filter((x: any) => x.state === 'paid'), 'paid_amount_minor') / 100);", "const providerPaid = 0;");
  source = source.replace(/    const providerOutstanding = nn\(\[providerInvoices\],[\s\S]*?\/ 100\);/, "    const providerOutstanding = 0;");
  source = source.replace("total_cambra_collected_revenue: (merchantCollected == null || providerPaid == null) ? null : merchantCollected + providerPaid,", "total_cambra_collected_revenue: merchantCollected,");
  source = source.replace("methodology: 'evidence_bounded_dual_sided'", "methodology: 'merchant_success_fee_only'");
  source = source.replace("provider_revenue: 'ProviderRevenueLedger + ProviderRevenueInvoice only'", "provider_revenue: 'disabled by policy — CAMBRA accepts no PSP compensation'");
  source = source.replace("double_counting: 'merchant-side and provider-side ledgers never share revenue events'", "double_counting: 'CAMBRA revenue contains merchant success fees only'");
  stage(rel, source);
}

{
  const rel = "base44/functions/unitEconomicsWorker/entry.ts";
  let source = read(rel);
  source = replaceUnique(source, /providerRevenue=pr\.filter\(\(x:any\)=>x\.state==='paid'\)\.reduce\(\(a:number,x:any\)=>a\+Number\(x\.paid_amount_minor\|\|0\)\/100,0\)/, "providerRevenue=0", `${rel}:provider revenue`);
  source = source.replace("Merchant-side revenue and provider-side revenue are additive but separate. LTV remains null until real retention/payment history exists.", "CAMBRA revenue is merchant success-fee revenue only; PSP compensation is disabled. LTV remains null until real retention/payment history exists.");
  stage(rel, source);
}

{
  const rel = "base44/shared/founderOSData.ts";
  let source = read(rel);
  source = replaceUnique(source, /const merchantCollected=sum\(invoices,'amount_paid'\),providerPaid=.*?;/, "const merchantCollected=sum(invoices,'amount_paid'),providerPaid=0,providerAccrued=0;", `${rel}:provider totals`);
  source = source.replace("const totalCollected=merchantCollected+providerPaid;", "const totalCollected=merchantCollected;");
  source = replaceUnique(source, /const providerOutstanding=providerLedger\.filter\([\s\S]*?\/100;/, "const providerOutstanding=0;", `${rel}:provider outstanding`);
  source = source.replace("collected_revenue:metric(totalCollected,'EUR',['Invoice','ProviderRevenueLedger'],'verified',{merchant:merchantCollected,provider:providerPaid})", "collected_revenue:metric(totalCollected,'EUR',['Invoice'],'verified',{merchant:merchantCollected,provider:0})");
  stage(rel, source);
}

// Admin copy must not describe provider revenue as an available business model.
for (const [rel, replacements] of Object.entries({
  "src/pages/admin/AdminProviderEconomics.jsx": [
    ["Provider Economics", "PSP Compensation Policy"],
    ["CAMBRA-side provider compensation is tracked separately from merchant economics. Merchant ranking remains merchant-outcome-first.", "PSP compensation is disabled. CAMBRA is paid only by merchants from positive verified savings; PSPs contract and invoice merchants directly."],
    ["Provider revenue by provider", "Historical provider-compensation records (inactive)"],
  ],
  "src/pages/admin/AdminProviders.jsx": [
    ["Provider compensation is set through the revenue ledger against a hashed agreement, never from this form.", "PSP compensation is disabled by policy and cannot be activated from this form or any backend workflow."],
  ],
  "src/pages/admin/AdminFinance.jsx": [
    ["Merchant-side and provider-side economics are separate ledgers and are added only for total CAMBRA revenue.", "CAMBRA revenue comes only from merchant success fees on positive verified savings. PSP compensation is disabled."],
  ],
  "src/pages/admin/AdminIntelligenceWorkspace.jsx": [
    ["Pricing truth, markets, routing and benchmarks. Provider compensation never reaches a merchant recommendation.", "Pricing truth, markets, routing and benchmarks. PSP compensation is disabled; recommendations serve the merchant."],
  ],
  "src/pages/admin/AdminFinanceWorkspace.jsx": [
    ["Savings, CAMBRA revenue, provider revenue and costs — kept as separate figures.", "Savings, CAMBRA merchant success-fee revenue and costs — with PSP compensation disabled."],
  ],
})) {
  let source = read(rel);
  for (const [from, to] of replacements) {
    if (rel === "src/pages/admin/AdminProviderEconomics.jsx" && from === "Provider Economics") {
      const count = source.split(from).length - 1;
      if (count !== 2) throw new Error(`${rel}:${from}: expected two matches, found ${count}`);
      source = source.replaceAll(from, to);
    } else {
      source = replaceUnique(source, from, to, `${rel}:${from.slice(0, 24)}`);
    }
  }
  stage(rel, source);
}

// Rewrite the original dual-sided unit test as the permanent no-compensation seal.
{
  const rel = "src/lib/p15ProviderEconomics.test.js";
  const source = `import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PSP_COMPENSATION_ACCEPTED,
  PROVIDER_MONETIZATION_PRODUCTION_ALLOWED,
  providerExpectedRevenueMinor,
  providerEconomicsScore,
  providerRevenueAmountMinor,
} from '../../base44/shared/providerEconomicsCore.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const DISABLED = ${JSON.stringify(disabledEntrypoints, null, 2)};

describe('PSP no-compensation policy', () => {
  it('fails closed at the canonical economics layer', () => {
    expect(PSP_COMPENSATION_ACCEPTED).toBe(false);
    expect(PROVIDER_MONETIZATION_PRODUCTION_ALLOWED).toBe(false);
    expect(providerExpectedRevenueMinor({ percentage: 99 }, 36)).toBe(0);
    expect(providerEconomicsScore({ percentage: 99 })).toBe(0);
    expect(providerRevenueAmountMinor(100_000_000, { rate_bps: 500, percentage: 50, fixed_fee_minor: 1_000_000 })).toBe(0);
  });

  it.each(DISABLED)('%s is guarded before any legacy mutation', (file) => {
    const source = read(file);
    expect(source).toContain('PSP_COMPENSATION_DISABLED_BY_POLICY');
    expect(source).toContain('providerCompensationDisabledResponse');
  });

  it('does not open a provider-monetization phase after merchant pricing', () => {
    const source = read('base44/functions/collectiveNegotiationAgent/entry.ts');
    expect(source).not.toContain("invoke('providerMonetizationAgent'");
    expect(source).not.toContain('request_provider_economics');
  });

  it('stores no provider compensation in newly approved aggregate agreements', () => {
    const source = read('base44/functions/resolveCommercialApproval/entry.ts');
    expect(source).toContain('const providerEconomics = {}');
    expect(source).toContain('CAMBRA accepts no PSP commission');
    expect(source).toContain('const compensationTiers: any[] = []');
  });

  it('treats any PSP-compensation clause as a contract mismatch', () => {
    const source = read('base44/functions/reviewProviderContract/entry.ts');
    expect(source).toContain('prohibitedCompensationDetected');
    expect(source).toContain('prohibited_contract_clause');
  });

  it('keeps historical provider-revenue entities admin-only', () => {
    for (const name of ['ProviderCompensationTier','ProviderRevenueAttribution','ProviderRevenueLedger','ProviderRevenueStatement','ProviderRevenueInvoice','ProviderEconomicAssessment']) {
      expect(json(\`base44/entities/\${name}.jsonc\`).rls.read.user_condition.role).toBe('admin');
    }
  });
});
`;
  stage(rel, source);
}

const dryRun = process.argv.includes("--check");
if (!dryRun) {
  for (const [rel, value] of pending) fs.writeFileSync(path.join(root, rel), value);
}
console.log(JSON.stringify({ changed, count: changed.length, disabledEntrypoints: disabledEntrypoints.length, dryRun }, null, 2));
