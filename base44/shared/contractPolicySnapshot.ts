// contractPolicySnapshot — CAMBRA v60.1 (2026-08-05).
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
export function resolveContractPolicy(input: {
  mandate?: any;
  billingRule?: any;
  report?: any;
  invoice?: any;
}): ResolvedContractTerms {
  const warnings: string[] = [];

  // 1 — explicit, policy-enriched mandate snapshot
  const snap = input.mandate?.acceptance_snapshot_json;
  if (snap && typeof snap === 'object' && (snap.policy_version || snap.snapshotSchemaVersion)) {
    const feePct = Number(snap.fee_pct ?? snap.economicTerms?.successFeePct);
    return {
      successFeePct: Number.isFinite(feePct) ? feePct : 25,
      merchantSharePct: Number(snap.merchant_share_pct ?? snap.economicTerms?.merchantSharePct) || 75,
      feeDurationMonths: Number(snap.fee_duration_months ?? snap.economicTerms?.feeDurationMonths) || 24,
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
    };
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
];

export function rejectClientTerms(clientPayload: any): { ok: true } | { ok: false; keys: string[] } {
  if (!clientPayload || typeof clientPayload !== 'object') return { ok: true };
  const found = FORBIDDEN_CLIENT_KEYS.filter((k) => k in clientPayload);
  return found.length ? { ok: false, keys: found } : { ok: true };
}