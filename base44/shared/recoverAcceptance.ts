// recoverAcceptance — RECOVER-1 (2026-08-03).
//
// Shared core of the "Recover Margin" electronic mandate acceptance. Imported by
// getRecoverAcceptanceContext, startRecoverAcceptance and acceptRecoverMandate so
// the eligibility criterion, the frozen snapshot and its hash are defined EXACTLY
// once — three copies of "what counts as a verified baseline" is precisely the
// duplication this module exists to prevent.
//
// ══ Load-bearing decisions (see Decision_Log_RECOVER1.md) ═══════════════════
//
//  • organization_id = Brand.id. Today organization = brand; ownership resolves
//    through Brand.contact_email / created_by and DealActivation.user_email.
//
//  • VERIFIED BASELINE = locked && verified_at && verified_by, WITHOUT restricting
//    `source`. verified_at/verified_by are the proof; `source` is only provenance.
//    Requiring source==='api' would exclude every merchant verified through the
//    reviewed-statement path, which we built on purpose.
//
//  • Baseline RLS is admin/created_by, so the merchant cannot read their own row.
//    Callers pass a SERVICE-ROLE client here and this module applies the criterion
//    before anything is returned. Baseline's RLS is deliberately untouched.
//
//  • No transactions exist on this platform. Safety comes from: a persisted
//    idempotency key claimed before any state change, a re-read of the current
//    state immediately before every write, and a snapshot hash re-verified at
//    signature so a fee change mid-popup refuses the acceptance instead of
//    silently binding the merchant to different terms.

import { PRODUCT_POLICY, getSuccessFeePct, getMerchantSharePct, getFeeDurationMonths } from './generated/productPolicy.ts';
import { RECOVER_CONTRACT_TEMPLATE_VERSION } from './recoverContractTemplates.ts';
import { SNAPSHOT_SCHEMA_VERSION, POLICY_SOURCE_REGISTRY } from './contractPolicySnapshot.ts';

export const MANDATE_DOCUMENT_VERSION = 'recover-mandate-v1';

// Activation states from which a Recover mandate may be accepted. 'authorized'
// and beyond are already authorized — accepting again would be a supersession,
// which is handled explicitly, not by re-running the first acceptance.
export const ACCEPTABLE_ACTIVATION_STATES = ['activated', 'awaiting_authorization'];

/** The canonical verified-baseline criterion. Provenance-agnostic on purpose. */
export function isVerifiedBaseline(b: any): boolean {
  return Boolean(b && b.locked === true && b.verified_at && b.verified_by);
}

/** Deterministic JSON — key order can never change the hash. */
function stableStringify(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

export async function hashSnapshot(snapshot: any): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(snapshot));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function currentMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/**
 * Resolve the activation the caller is accepting for, and prove they own it.
 * Returns { ok:false, status, error } instead of throwing so callers can map it
 * straight onto a Response.
 */
export async function resolveOwnedActivation(svc: any, user: any, dealActivationId: string) {
  if (!dealActivationId) return { ok: false, status: 400, error: 'deal_activation_id required' };

  // .filter({ id }) THROWS "Object not found" on this platform for an unknown id —
  // it does not return []. Without the catch, a bad id surfaces as a 500.
  const rows = await svc.entities.DealActivation.filter({ id: dealActivationId }, '-created_date', 1).catch(() => []);
  const activation = rows?.[0];
  if (!activation) return { ok: false, status: 404, error: 'activation not found' };

  const brandRows = activation.brand_id
    ? await svc.entities.Brand.filter({ id: activation.brand_id }, '-created_date', 1).catch(() => [])
    : [];
  const brand = brandRows?.[0] || null;

  const email = String(user?.email || '').toLowerCase();
  const owns =
    user?.role === 'admin' ||
    String(activation.user_email || '').toLowerCase() === email ||
    String(brand?.contact_email || '').toLowerCase() === email ||
    String(brand?.created_by || '').toLowerCase() === email;

  if (!owns) return { ok: false, status: 403, error: 'forbidden' };

  return { ok: true, activation, brand, ownerEmail: email };
}

/** The current verified baseline for an activation, or null when none qualifies. */
export async function findVerifiedBaseline(svc: any, activation: any) {
  const queries: any[] = [{ deal_activation_id: activation.id }];
  if (activation.brand_id) queries.push({ brand_id: activation.brand_id });

  for (const q of queries) {
    const rows = await svc.entities.Baseline.filter(q, '-created_date', 25).catch(() => []);
    const verified = (rows || []).filter(isVerifiedBaseline);
    if (verified.length) {
      const current = verified.find((b: any) => b.is_current !== false);
      return current || verified[0];
    }
  }
  return null;
}

/**
 * Everything shown to the merchant, frozen. The hash of THIS object is what makes
 * a mid-popup fee or baseline change fail loudly at signature.
 */
export function buildAcceptanceSnapshot({ activation, baseline, fee, month, evidenceBinding = null }: any) {
  return {
    document_version: MANDATE_DOCUMENT_VERSION,
    month,
    fee_pct: Number(fee.pct),
    fee_source: fee.source,
    billing_rule_id: fee.rule_id || null,
    deal_activation_id: activation.id,
    organization_id: activation.brand_id || '',
    vertical: activation.vertical || 'payments',
    provider_id: activation.provider_id || '',
    baseline_id: baseline?.id || null,
    baseline_type: baseline?.baseline_type || null,
    baseline_value: baseline?.baseline_value ?? null,
    baseline_currency: baseline?.currency || 'EUR',
    baseline_verified_at: baseline?.verified_at || null,
    projected_savings_annual: activation.projected_savings_annual ?? activation.estimated_savings_yearly ?? null,
    projected_savings_monthly: activation.projected_savings_monthly ?? null,
    // ECL P5 — exact evidence the merchant saw when this snapshot was opened.
    // Optional only for legacy/read-only preflight contexts; startRecoverAcceptance
    // always supplies it before persisting a new Mandate.
    ...(evidenceBinding ? { ecl_evidence_binding: { ...evidenceBinding } } : {}),
    // v60.1 — Contract Policy Snapshot. Additive: these fields enrich the
    // snapshot with the policy terms in force at acceptance. The hash of
    // THIS object (via hashSnapshot) includes these fields for new mandates;
    // existing mandates keep their original hash (they are never rewritten).
    snapshot_schema_version: SNAPSHOT_SCHEMA_VERSION,
    policy_version: PRODUCT_POLICY.policyVersion,
    policy_effective_date: PRODUCT_POLICY.effectiveDate,
    policy_source: POLICY_SOURCE_REGISTRY,
    currency: PRODUCT_POLICY.currency || 'EUR',
    standard_fee_pct: getSuccessFeePct(),
    merchant_share_pct: getMerchantSharePct(),
    fee_duration_months: getFeeDurationMonths(),
    fee_base: PRODUCT_POLICY.economicTerms.feeBase,
    recovery_optional: !!PRODUCT_POLICY.economicTerms.recoveryOptional,
    template_version: RECOVER_CONTRACT_TEMPLATE_VERSION,
    referral_start_pct: Math.round(PRODUCT_POLICY.referralTerms.startRate * 100),
    referral_step_pct: Math.round(PRODUCT_POLICY.referralTerms.stepRate * 100),
    referral_floor_pct: Math.round(PRODUCT_POLICY.referralTerms.floorRate * 100),
  };
}

/** Acceptance evidence. Partial by platform limitation — see Mandate.authenticated_at. */
export function acceptanceEvidence(req: Request, authenticatedAt: string) {
  return {
    authenticated_at: authenticatedAt,
    ip_address:
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('cf-connecting-ip') ||
      '',
    user_agent: req.headers.get('user-agent') || '',
  };
}

/** Stable claim key: one acceptance per (activation, owner, terms hash). */
export function idempotencyKeyFor(activationId: string, ownerEmail: string, snapshotHash: string) {
  return `recover:${activationId}:${ownerEmail}:${snapshotHash}`;
}