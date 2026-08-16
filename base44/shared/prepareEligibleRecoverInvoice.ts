// prepareEligibleRecoverInvoice — CAMBRA v61 (2026-08-06). Audit P0 #1/#2/#3.
//
// PURE preparation/validation core for createEligibleRecoverInvoices. The
// handler loads I/O context (report, activation, mandate, brand, tax) and
// hands it here; this function performs EVERY economic validation — contract
// policy resolution FIRST — and returns a verdict. Stripe may only ever
// receive the validated output of this function:
//
//   • not eligible  → the handler performs ZERO Stripe calls;
//   • conflict      → typed idempotency conflict, ZERO Stripe calls;
//   • resume        → an existing invoice for the SAME report is resumed;
//   • eligible      → amounts, provenance and idempotency identity are frozen
//                     here, BEFORE any side effect.
//
// No `|| 25` fallbacks: a contractual fee of 0 is preserved; a missing fee
// blocks. An unresolvable contract blocks. The live policy is never consulted.
//
// Pure module (no SDK, no I/O, no clock beyond the injected `now`) — runs
// identically in Deno (handler) and vitest (tests).

import {
  resolveContractPolicy,
  buildContractEconomicView,
  type ContractEconomicView,
  type ResolvedContractTerms,
} from './contractPolicySnapshot.ts';
import {
  computeInvoiceAmounts,
  eurToMinor,
  monthBillableWindow,
  type InvoiceAmounts,
} from './recoverBillingMath.ts';
import { isProductionEnabled } from './generated/productPolicy.ts';

export type TaxContext = {
  treatment: string;
  tax_rate_bps: number;
  blockers: string[];
};

export type IdempotencyIdentity = {
  monthly_savings_report_id: string;
  deal_activation_id: string;
  month: string;
  brand_id: string;
  mandate_id: string;
  currency: string;
};

export type PreparedInvoice = {
  eligible: boolean;
  blockers: string[];
  /** Typed idempotency conflict — same activation+month, DIFFERENT report. */
  conflict: {
    code: string;
    existing_invoice_id: string;
    existing_report_id: string | null;
  } | null;
  /** Existing non-void invoice for the SAME report — resume, never duplicate. */
  resume: {
    invoice_id: string;
    invoice_number: string | null;
    fully_issued: boolean;
  } | null;
  economicView: ContractEconomicView | null;
  resolved: ResolvedContractTerms | null;
  amounts: InvoiceAmounts | null;
  amountMinor: number | null;
  currency: string;
  policyVersion: string | null;
  policySource: string | null;
  snapshotHash: string | null;
  idempotencyIdentity: IdempotencyIdentity | null;
  auditContext: Record<string, unknown>;
};

function blocked(blockers: string[], audit: Record<string, unknown>): PreparedInvoice {
  return {
    eligible: false,
    blockers,
    conflict: null,
    resume: null,
    economicView: null,
    resolved: null,
    amounts: null,
    amountMinor: null,
    currency: 'EUR',
    policyVersion: null,
    policySource: null,
    snapshotHash: null,
    idempotencyIdentity: null,
    auditContext: audit,
  };
}

export function prepareEligibleRecoverInvoice(input: {
  report: any;
  activation: any;
  mandate: any;
  brand: any;
  taxContext: TaxContext;
  billingMode: 'test' | 'live';
  /** Non-void invoices already stored for (activation, month). */
  existingInvoices: any[];
  now?: Date;
}): PreparedInvoice {
  const { report, activation, mandate, brand, taxContext, billingMode } = input;
  const now = input.now ?? new Date();
  const audit: Record<string, unknown> = {
    report_id: report?.id ?? null,
    deal_activation_id: activation?.id ?? null,
    mandate_id: mandate?.id ?? null,
    brand_id: brand?.id ?? null,
    month: report?.month ?? null,
    billing_mode: billingMode,
  };

  // ── 1. Context present ───────────────────────────────────────────────
  if (!report || !activation || !mandate || !brand) {
    return blocked(['context_missing'], audit);
  }

  // ── 2. Relations — cross-tenant / cross-record guards ────────────────
  const rel: string[] = [];
  if (String(report.deal_activation_id) !== String(activation.id)) rel.push('relation_report_activation_mismatch');
  if (String(mandate.deal_activation_id) !== String(activation.id)) rel.push('relation_mandate_activation_mismatch');
  if (String(activation.brand_id) !== String(brand.id)) rel.push('relation_activation_brand_mismatch');
  if (report.brand_id && String(report.brand_id) !== String(brand.id)) rel.push('cross_tenant_report_brand_mismatch');
  if (rel.length) return blocked(rel, audit);

  if (mandate.status !== 'active') return blocked(['mandate_not_active'], audit);

  // ── 3. Product scope (backend gate, not just UI) ─────────────────────
  const vertical = String(activation.vertical || report.vertical || '');
  if (!isProductionEnabled(vertical)) {
    return blocked([`product_scope_blocked:${vertical || 'unknown'}`], audit);
  }

  // ── 4. Contractual calendar ──────────────────────────────────────────
  if (!activation.conditions_activated_at) {
    return blocked(['calendar:conditions_activated_at_missing'], audit);
  }
  const window = monthBillableWindow(String(report.month), String(activation.conditions_activated_at), now);
  if (!window.billable) return blocked([`calendar:${(window as any).reason}`], audit);

  // ── 5. Approval gate ─────────────────────────────────────────────────
  if (report.billing_eligibility_status !== 'eligible') {
    return blocked(['report_not_approved'], audit);
  }

  // ── 6. Currency ──────────────────────────────────────────────────────
  // FX-2 Fase B (2026-08-16) — report.currency is now derived from the real
  // measurement source (it used to be a hardcoded "EUR" literal upstream, so
  // this lock could never fire). Two consequences here:
  //   1. A missing/null currency is a BLOCKER, not a silent EUR: it means the
  //      report was held as review_required (or predates the field without
  //      the legacy literal) and must never be invoiced on an assumption.
  //   2. The non-EUR branch is genuinely reachable now — a Stripe account
  //      settling in PLN produces currency:'PLN' and stops here.
  if (report.status === 'review_required') return blocked(['report_review_required'], audit);
  const currencyRaw = report.currency;
  if (currencyRaw === null || currencyRaw === undefined || String(currencyRaw).trim() === '') {
    return blocked(['currency_indeterminable'], audit);
  }
  const currency = String(currencyRaw).toUpperCase();
  if (currency !== 'EUR') return blocked([`currency_mismatch:${currency}`], audit);

  // ── 7. Fiscal state ──────────────────────────────────────────────────
  if (taxContext.blockers.length) {
    return blocked([`tax_blocked:${taxContext.blockers.join(',')}`], audit);
  }

  // ── 8. Payment method / Stripe customer ─────────────────────────────
  if (!brand.stripe_customer_id || (brand.stripe_billing_mode && brand.stripe_billing_mode !== billingMode)) {
    return blocked(['stripe_customer_missing_or_mode_mismatch'], audit);
  }
  if (activation.payment_method_status !== 'ready' || !activation.stripe_payment_method_id) {
    return blocked(['payment_method_not_ready'], audit);
  }

  // ── 9. Contract policy — resolved BEFORE any amount/side effect ─────
  const resolved = resolveContractPolicy({ mandate, report });
  if (!resolved.resolvable) {
    return blocked(['contract_policy_unresolvable'], { ...audit, resolution_warnings: resolved.warnings });
  }
  const economicView = buildContractEconomicView({ resolvedContractPolicy: resolved, mandate, report });

  // Frozen-terms consistency: the report's persisted provenance must match
  // what the mandate resolves to. A mismatch means the terms drifted between
  // generation/approval and issuance — block, never re-price.
  if (report.policy_version && resolved.policyVersion && String(report.policy_version) !== String(resolved.policyVersion)) {
    return blocked(['policy_version_mismatch'], { ...audit, report_policy: report.policy_version, resolved_policy: resolved.policyVersion });
  }
  if (report.snapshot_hash && resolved.snapshotHash && String(report.snapshot_hash) !== String(resolved.snapshotHash)) {
    return blocked(['snapshot_hash_mismatch'], audit);
  }

  // ── 10. Frozen fee — NO || 25. A contractual 0 stays 0. ─────────────
  const standardFeePct = Number(report.standard_fee_pct);
  const effectiveFeePct = Number(report.effective_fee_pct);
  if (!Number.isFinite(standardFeePct)) return blocked(['standard_fee_missing_reapprove'], audit);
  if (!Number.isFinite(effectiveFeePct)) return blocked(['effective_fee_missing_reapprove'], audit);

  // ── 11. Deterministic amounts, cross-checked against approval ───────
  const amounts = computeInvoiceAmounts({
    savings_eur: Number(report.savings || 0),
    standard_fee_pct: standardFeePct,
    effective_fee_pct: effectiveFeePct,
    tax_rate_bps: taxContext.tax_rate_bps,
  });
  const storedFeeMinor = Number.isFinite(Number(report.fee_net_amount)) ? eurToMinor(report.fee_net_amount) : null;
  if (storedFeeMinor === null || amounts.fee_net_minor !== storedFeeMinor) {
    return blocked(['calculation_mismatch_reapprove'], { ...audit, computed_fee_minor: amounts.fee_net_minor, stored_fee_minor: storedFeeMinor });
  }
  // Characterized existing behavior preserved: a fee that rounds to zero does
  // not generate an invoice. (The protection added is that 0 never became 25.)
  if (amounts.fee_net_minor <= 0) return blocked(['fee_rounds_to_zero'], audit);

  // ── 12. Idempotency — canonical identity keyed on the REPORT ────────
  const identity: IdempotencyIdentity = {
    monthly_savings_report_id: String(report.id),
    deal_activation_id: String(activation.id),
    month: String(report.month),
    brand_id: String(brand.id),
    mandate_id: String(mandate.id),
    currency,
  };

  let resume: PreparedInvoice['resume'] = null;
  for (const inv of input.existingInvoices || []) {
    if (!inv || inv.status === 'void') continue;
    const invReport = inv.monthly_savings_report_id ? String(inv.monthly_savings_report_id) : null;
    if (invReport === String(report.id)) {
      resume = {
        invoice_id: String(inv.id),
        invoice_number: inv.invoice_number || null,
        fully_issued: !!inv.invoice_number,
      };
      continue;
    }
    // Same activation+month, different (or unattributed) report: TYPED
    // conflict. Never silently reuse, never repair cross pointers.
    return {
      ...blocked([], audit),
      conflict: {
        code: invReport ? 'idempotency_conflict_different_report' : 'idempotency_conflict_unattributed_invoice',
        existing_invoice_id: String(inv.id),
        existing_report_id: invReport,
      },
      blockers: [invReport ? 'idempotency_conflict_different_report' : 'idempotency_conflict_unattributed_invoice'],
      idempotencyIdentity: identity,
    };
  }

  return {
    eligible: true,
    blockers: [],
    conflict: null,
    resume,
    economicView,
    resolved,
    amounts,
    amountMinor: amounts.fee_net_minor,
    currency,
    policyVersion: resolved.policyVersion || null,
    policySource: resolved.policySource || null,
    snapshotHash: resolved.snapshotHash || mandate.acceptance_snapshot_hash || null,
    idempotencyIdentity: identity,
    auditContext: { ...audit, provenance: resolved.provenance, warnings: resolved.warnings },
  };
}