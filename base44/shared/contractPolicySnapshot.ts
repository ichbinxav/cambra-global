// contractPolicySnapshot — CAMBRA v60.2 (2026-08-05).
//
// THE CONTRACT POLICY WIRING. This module is the single place where a
// contractual obligation is BUILT from the canonical policy, RESOLVED back
// from a stored record, and marked as LEGACY when it predates the registry.
//
// PRINCIPLE (v60.1): the policy in force TODAY creates new obligations only.
// Once a merchant accepts Recover, their economic terms are FROZEN in a
// snapshot. Every later operation — BillingRule, MonthlySavingsReport, invoice,
// PDF, email, reconciliation — reads from that snapshot, never from the live
// policy. A future policy version cannot recalculate a historical obligation.
//
// v60.2 CHANGES (gap closure):
//  • The resolver no longer uses `|| 25`, `|| 75`, `|| 24` fallbacks that
//    silently replace a contractual 0 with the policy default. Number.isFinite
//    checks preserve a contractual value of 0 and warn when a field is missing.
//  • A `resolvable: boolean` flag on ResolvedContractTerms lets callers BLOCK
//    invoice/PDF/email generation when a contract cannot be resolved safely,
//    instead of silently applying the live policy.
//  • `buildContractEconomicView` produces the single economic structure that
//    PDF, email and invoice metadata consume — no second resolver, no local
//    fallback inside the document builders.
//
// This module is pure (no SDK, no I/O) so it runs identically in Deno (backend)
// and in vitest (node). Backend callers inject `currentPolicy` from the
// generated artifact; tests inject a mock.

export const SNAPSHOT_SCHEMA_VERSION = 1;
export const LEGACY_POLICY_SOURCE = 'legacy_pre_policy_registry';
export const POLICY_SOURCE_REGISTRY = 'product_policy_registry';

export type ContractOverride = {
  hasOverride: boolean;
  fields: string[] | null;
  reason: string | null;
  authorisedBy: string | null;
  authorisedAt: string | null;
};

export type ContractPolicySnapshot = {
  snapshotSchemaVersion: number;
  policyVersion: string;
  policyEffectiveDate: string;
  policySource: string;
  currency: string;
  economicTerms: {
    analyzerPriceEur: number;
    successFeeRate: number;
    successFeePct: number;
    merchantShareRate: number;
    merchantSharePct: number;
    feeDurationMonths: number;
    feeBase: string;
    recoveryOptional: boolean;
  };
  referralTerms: {
    startRate: number;
    stepRate: number;
    floorRate: number;
  };
  productScope: { payments: boolean };
  integrationStatusAtAcceptance: { stripe: string };
  contract: {
    templateVersion: string;
    documentVersion: string;
    country: string;
    mandateId: string;
    brandId: string;
  };
  overrides: ContractOverride;
};

export type ResolvedContractTerms = {
  successFeePct: number;
  merchantSharePct: number;
  feeDurationMonths: number;
  feeBase: string;
  currency: string;
  policyVersion: string;
  policySource: string;
  snapshotHash: string | null;
  templateVersion: string | null;
  documentVersion: string | null;
  isLegacy: boolean;
  hasOverride: boolean;
  warnings: string[];
  provenance: string;
  // v60.2 — false when the contract cannot be resolved safely. Callers MUST
  // block invoice/PDF/email generation when this is false; they must NOT
  // silently apply the live policy.
  resolvable: boolean;
};

// ── Contract Economic View (v60.2) ────────────────────────────────────────
// The single economic structure consumed by PDF, email and invoice metadata.
// Built from resolveContractPolicy + the mandate record. The PDF and email
// never construct the fee, duration or share independently — they read this.
export type ContractEconomicView = {
  successFeePct: number;
  standardFeePct: number;
  discountPct: number;
  merchantSharePct: number;
  feeDurationMonths: number;
  feeBase: string;
  currency: string;
  policyVersion: string;
  policySource: string;
  snapshotHash: string | null;
  templateVersion: string | null;
  documentVersion: string | null;
  isLegacy: boolean;
  hasOverride: boolean;
  resolvable: boolean;
  warnings: string[];
  provenance: string;
  mandateId: string;
  brandId: string;
  country: string;
};

// ── Canonical serialization ──────────────────────────────────────────────
// Same algorithm as recoverAcceptance.stableStringify: sorted keys, stable
// output. The acceptance flow's hashSnapshot uses this exact convention, so a
// contract snapshot hashed here is byte-compatible with the mandate's
// acceptance_snapshot_hash.
export function canonicalStringify(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(',')}}`;
}

export async function hashContractPolicySnapshot(snapshot: any): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalStringify(snapshot));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Builder (new acceptances) ────────────────────────────────────────────
// Reads ONLY from the generated policy (server-sourced) and an optional
// backend-authorised override. The frontend never calls this; it is invoked
// inside startRecoverAcceptance / acceptRecoverMandate.
export function buildContractPolicySnapshot(input: {
  currentPolicy: any;
  contractContext: {
    templateVersion: string;
    documentVersion: string;
    country?: string;
    mandateId?: string;
    brandId?: string;
  };
  authorisedOverride?: ContractOverride;
}): ContractPolicySnapshot {
  const p = input.currentPolicy;
  if (!p || !p.policyVersion) throw new Error('policy_required');
  if (!p.economicTerms || !p.referralTerms) throw new Error('policy_shape_invalid');

  const et = p.economicTerms;
  const rt = p.referralTerms;

  return {
    snapshotSchemaVersion: SNAPSHOT_SCHEMA_VERSION,
    policyVersion: p.policyVersion,
    policyEffectiveDate: p.effectiveDate,
    policySource: POLICY_SOURCE_REGISTRY,
    currency: p.currency || 'EUR',
    economicTerms: {
      analyzerPriceEur: Number(et.analyzerPriceEur) || 0,
      successFeeRate: Number(et.successFeeRate),
      successFeePct: Math.round(Number(et.successFeeRate) * 100),
      merchantShareRate: Number(et.merchantShareRate),
      merchantSharePct: Math.round(Number(et.merchantShareRate) * 100),
      feeDurationMonths: Number(et.feeDurationMonths),
      feeBase: String(et.feeBase || 'positive_verified_savings'),
      recoveryOptional: !!et.recoveryOptional,
    },
    referralTerms: {
      startRate: Number(rt.startRate),
      stepRate: Number(rt.stepRate),
      floorRate: Number(rt.floorRate),
    },
    productScope: {
      payments: !!p.productScope?.payments?.productionEnabled,
    },
    integrationStatusAtAcceptance: {
      stripe: p.integrationStatus?.stripe || 'unknown',
    },
    contract: {
      templateVersion: input.contractContext.templateVersion,
      documentVersion: input.contractContext.documentVersion,
      country: input.contractContext.country || '',
      mandateId: input.contractContext.mandateId || '',
      brandId: input.contractContext.brandId || '',
    },
    overrides: input.authorisedOverride || {
      hasOverride: false,
      fields: null,
      reason: null,
      authorisedBy: null,
      authorisedAt: null,
    },
  };
}

// ── Resolver (billing, invoices, PDF, email) ──────────────────────────────
// Precedence (STRICT):
//   1. mandate acceptance_snapshot_json with policy_version → snapshot wins
//   2. BillingRule (contractual fee, optionally with policy_version)
//   3. MonthlySavingsReport (effective_fee_pct already persisted)
//   4. legacy fallback (explicit, marked, never silent)
// The LIVE policy is NEVER used to bill an accepted contract.
//
// v60.2: `||` fallbacks that replaced a contractual 0 with 25/75/24 are gone.
// A missing fee_pct in a policy-enriched snapshot now falls through to the
// next precedence level (with a warning) instead of silently becoming 25.
export function resolveContractPolicy(input: {
  mandate?: any;
  billingRule?: any;
  report?: any;
  invoice?: any;
}): ResolvedContractTerms {
  const warnings: string[] = [];

  // 1 — explicit, policy-enriched mandate snapshot.
  // v60.2: Number.isFinite preserves a contractual 0; a missing fee_pct falls
  // through instead of defaulting to 25.
  const snap = input.mandate?.acceptance_snapshot_json;
  if (snap && typeof snap === 'object' && (snap.policy_version || snap.snapshotSchemaVersion)) {
    const feePct = Number(snap.fee_pct ?? snap.economicTerms?.successFeePct);
    if (!Number.isFinite(feePct)) {
      warnings.push('mandate_snapshot_fee_pct_missing');
      // Fall through to BillingRule / report / legacy.
    } else {
      const sharePct = Number(snap.merchant_share_pct ?? snap.economicTerms?.merchantSharePct);
      const durMonths = Number(snap.fee_duration_months ?? snap.economicTerms?.feeDurationMonths);
      // v61 (audit #9) — a MODERN snapshot missing required economic fields is
      // UNRESOLVABLE. It is never silently completed with 75/24: an incomplete
      // modern snapshot means the acceptance record is damaged, and creating a
      // new economic obligation from it would misrepresent the accepted terms.
      if (!Number.isFinite(sharePct) || !Number.isFinite(durMonths)) {
        if (!Number.isFinite(sharePct)) warnings.push('mandate_snapshot_share_missing');
        if (!Number.isFinite(durMonths)) warnings.push('mandate_snapshot_duration_missing');
        return {
          successFeePct: 0,
          merchantSharePct: 0,
          feeDurationMonths: 0,
          feeBase: 'unknown',
          currency: snap.currency ?? snap.baseline_currency ?? 'EUR',
          policyVersion: String(snap.policy_version ?? snap.policyVersion ?? ''),
          policySource: String(snap.policy_source ?? POLICY_SOURCE_REGISTRY),
          snapshotHash: input.mandate.acceptance_snapshot_hash ?? null,
          templateVersion: snap.template_version ?? snap.contract?.templateVersion ?? null,
          documentVersion: input.mandate.document_version ?? null,
          isLegacy: false,
          hasOverride: !!(snap.override?.hasOverride ?? snap.overrides?.hasOverride),
          warnings: [...warnings, 'unresolvable: modern snapshot incomplete'],
          provenance: 'mandate_snapshot_incomplete',
          resolvable: false,
        };
      }
      return {
        successFeePct: feePct,
        merchantSharePct: sharePct,
        feeDurationMonths: durMonths,
        feeBase: snap.fee_base ?? snap.economicTerms?.feeBase ?? 'positive_verified_savings',
        currency: snap.currency ?? snap.baseline_currency ?? 'EUR',
        policyVersion: String(snap.policy_version ?? snap.policyVersion ?? ''),
        policySource: String(snap.policy_source ?? POLICY_SOURCE_REGISTRY),
        snapshotHash: input.mandate.acceptance_snapshot_hash ?? null,
        templateVersion: snap.template_version ?? snap.contract?.templateVersion ?? null,
        documentVersion: input.mandate.document_version ?? null,
        isLegacy: false,
        hasOverride: !!(snap.override?.hasOverride ?? snap.overrides?.hasOverride),
        warnings,
        provenance: 'mandate_snapshot',
        resolvable: true,
      };
    }
  }

  // 2 — BillingRule (contractual fee over a date window)
  if (input.billingRule && input.billingRule.node_share_percent != null) {
    const hasPolicy = !!input.billingRule.policy_version;
    return {
      successFeePct: Number(input.billingRule.node_share_percent),
      merchantSharePct: 75,
      feeDurationMonths: 24,
      feeBase: 'positive_verified_savings',
      currency: input.billingRule.currency || 'EUR',
      policyVersion: hasPolicy ? input.billingRule.policy_version : LEGACY_POLICY_SOURCE,
      policySource: hasPolicy ? POLICY_SOURCE_REGISTRY : LEGACY_POLICY_SOURCE,
      snapshotHash: null,
      templateVersion: input.billingRule.terms_version || null,
      documentVersion: null,
      isLegacy: !hasPolicy,
      hasOverride: false,
      warnings,
      provenance: 'billing_rule',
      resolvable: true,
    };
  }

  // 3 — MonthlySavingsReport (effective_fee_pct already resolved at report time)
  if (input.report && input.report.effective_fee_pct != null) {
    const hasPolicy = !!input.report.policy_version;
    return {
      successFeePct: Number(input.report.effective_fee_pct),
      merchantSharePct: 75,
      feeDurationMonths: 24,
      feeBase: 'positive_verified_savings',
      currency: input.report.currency || 'EUR',
      policyVersion: hasPolicy ? input.report.policy_version : LEGACY_POLICY_SOURCE,
      policySource: hasPolicy ? POLICY_SOURCE_REGISTRY : LEGACY_POLICY_SOURCE,
      snapshotHash: input.report.snapshot_hash ?? null,
      templateVersion: null,
      documentVersion: null,
      isLegacy: !hasPolicy,
      hasOverride: false,
      warnings,
      provenance: 'monthly_report',
      resolvable: true,
    };
  }

  // 4 — legacy / unresolvable
  return resolveLegacyContractTerms(input.mandate || input.billingRule || input.report || input.invoice);
}

// ── Legacy resolver ──────────────────────────────────────────────────────
// For records created before the policy registry (no policyVersion on the
// snapshot, no policy_version on the BillingRule). Reads recoverable values
// from the old snapshot / BillingRule, marks policySource as legacy, emits a
// warning, and NEVER invents a policyVersion or changes an amount.
export function resolveLegacyContractTerms(record: any): ResolvedContractTerms {
  const warnings = ['legacy_pre_policy_registry: no policyVersion on record'];
  const snap = record?.acceptance_snapshot_json;

  if (snap && typeof snap === 'object' && snap.fee_pct != null) {
    return {
      successFeePct: Number(snap.fee_pct),
      merchantSharePct: 75,
      feeDurationMonths: 24,
      feeBase: 'positive_verified_savings',
      currency: snap.baseline_currency || 'EUR',
      policyVersion: LEGACY_POLICY_SOURCE,
      policySource: LEGACY_POLICY_SOURCE,
      snapshotHash: record?.acceptance_snapshot_hash ?? null,
      templateVersion: null,
      documentVersion: record?.document_version ?? null,
      isLegacy: true,
      hasOverride: false,
      warnings,
      provenance: 'legacy_snapshot',
      resolvable: true,
    };
  }

  if (record?.node_share_percent != null) {
    return {
      successFeePct: Number(record.node_share_percent),
      merchantSharePct: 75,
      feeDurationMonths: 24,
      feeBase: 'positive_verified_savings',
      currency: record.currency || 'EUR',
      policyVersion: LEGACY_POLICY_SOURCE,
      policySource: LEGACY_POLICY_SOURCE,
      snapshotHash: null,
      templateVersion: record.terms_version || null,
      documentVersion: null,
      isLegacy: true,
      hasOverride: false,
      warnings,
      provenance: 'legacy_billing_rule',
      resolvable: true,
    };
  }

  if (record?.effective_fee_pct != null) {
    return {
      successFeePct: Number(record.effective_fee_pct),
      merchantSharePct: 75,
      feeDurationMonths: 24,
      feeBase: 'positive_verified_savings',
      currency: record.currency || 'EUR',
      policyVersion: LEGACY_POLICY_SOURCE,
      policySource: LEGACY_POLICY_SOURCE,
      snapshotHash: null,
      templateVersion: null,
      documentVersion: null,
      isLegacy: true,
      hasOverride: false,
      warnings,
      provenance: 'legacy_report',
      resolvable: true,
    };
  }

  return {
    successFeePct: 0,
    merchantSharePct: 0,
    feeDurationMonths: 0,
    feeBase: 'unknown',
    currency: 'EUR',
    policyVersion: LEGACY_POLICY_SOURCE,
    policySource: LEGACY_POLICY_SOURCE,
    snapshotHash: null,
    templateVersion: null,
    documentVersion: null,
    isLegacy: true,
    hasOverride: false,
    warnings: [...warnings, 'unresolvable: no fee found on record'],
    provenance: 'unresolvable',
    resolvable: false,
  };
}

// ── Contract Economic View builder (v60.2) ──────────────────────────────
// The SINGLE economic structure consumed by PDF, email and invoice metadata.
// The standard fee is read from the snapshot safely (Number.isFinite, NOT ||)
// so a contractual 0 is preserved. When the standard is absent, the effective
// fee is used as the standard (no discount). When the contract is unresolvable,
// resolvable=false propagates so callers block generation.
export function buildContractEconomicView(input: {
  resolvedContractPolicy: ResolvedContractTerms;
  mandate?: any;
  billingRule?: any;
  report?: any;
  invoice?: any;
}): ContractEconomicView {
  const r = input.resolvedContractPolicy;
  const mandate = input.mandate;
  const snap = mandate?.acceptance_snapshot_json;

  // Standard fee: read from the snapshot without a `||` fallback. A
  // contractual standard of 0 is preserved. When absent, the effective fee
  // IS the standard (no discount to show).
  const stdRaw = Number(snap?.standard_fee_pct);
  const standardFeePct = Number.isFinite(stdRaw) ? stdRaw : r.successFeePct;

  return {
    successFeePct: r.successFeePct,
    standardFeePct,
    discountPct: Math.max(standardFeePct - r.successFeePct, 0),
    merchantSharePct: r.merchantSharePct,
    feeDurationMonths: r.feeDurationMonths,
    feeBase: r.feeBase,
    currency: r.currency,
    policyVersion: r.policyVersion,
    policySource: r.policySource,
    snapshotHash: r.snapshotHash,
    templateVersion: r.templateVersion,
    documentVersion: r.documentVersion,
    isLegacy: r.isLegacy,
    hasOverride: r.hasOverride,
    resolvable: r.resolvable,
    warnings: r.warnings,
    provenance: r.provenance,
    mandateId: String(mandate?.id || mandate?._id || ''),
    brandId: String(mandate?.brand_id || snap?.organization_id || snap?.brandId || ''),
    country: String(mandate?.country || snap?.country || ''),
  };
}

// ── Frontend payload guard ───────────────────────────────────────────────
// Backend acceptance functions call this to PROVE the client payload carries
// no economic-term keys. If any forbidden key is present, the acceptance is
// rejected. The frontend may never choose or modify standard terms.
const FORBIDDEN_CLIENT_KEYS = [
  'successFeeRate',
  'successFeePct',
  'merchantShareRate',
  'merchantSharePct',
  'feeDurationMonths',
  'feeBase',
  'policyVersion',
  'policyEffectiveDate',
  'policy_version',
  'policy_effective_date',
  'standard_fee_pct',
  'merchant_share_pct',
  'fee_duration_months',
  'snapshot_hash',
  'acceptance_snapshot_hash',
  // v61 Checkpoint E (2026-08-06) — the snake_case names the BACKEND actually
  // persists were missing, so a payload carrying `fee_pct` (the exact key inside
  // acceptance_snapshot_json) sailed past the guard. Found by probing the live
  // handler, not by reading the list: startRecoverAcceptance answered
  // "activation not found" for a payload with fee_pct instead of rejecting it.
  // A guard that only blocks the camelCase spelling of a field stored in
  // snake_case is decoration, not a boundary.
  'fee_pct',
  'effective_fee_pct',
  'applied_fee_pct',
  'discount_pct',
  'node_share_percent',
  'policy_source',
];

export function rejectClientTerms(clientPayload: any): { ok: true } | { ok: false; keys: string[] } {
  if (!clientPayload || typeof clientPayload !== 'object') return { ok: true };
  const found = FORBIDDEN_CLIENT_KEYS.filter((k) => k in clientPayload);
  return found.length ? { ok: false, keys: found } : { ok: true };
}