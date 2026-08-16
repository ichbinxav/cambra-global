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

import { recoveryEconomicsSnapshot } from './recoveryEconomicsV2.ts';
import { PRODUCT_POLICY, getSuccessFeePct, getMerchantSharePct, getFeeDurationMonths } from './generated/productPolicy.ts';
import { RECOVER_CONTRACT_TEMPLATE_VERSION } from './recoverContractTemplates.ts';
import { SNAPSHOT_SCHEMA_VERSION, POLICY_SOURCE_REGISTRY } from './contractPolicySnapshot.ts';
import { requireCriticalOperation } from './criticalExecution.ts';

export const MANDATE_DOCUMENT_VERSION = 'recover-mandate-v1';

// Activation states from which a Recover mandate may be accepted. 'authorized'
// and beyond are already authorized — accepting again would be a supersession,
// which is handled explicitly, not by re-running the first acceptance.
export const ACCEPTABLE_ACTIVATION_STATES = ['activated', 'awaiting_authorization'];

export function recoverCasUpdatedCount(result: any): number | null {
  if (!result || typeof result !== 'object') return null;
  if (
    Object.prototype.hasOwnProperty.call(result, 'success') &&
    result.success !== true
  ) return null;
  if (
    Object.prototype.hasOwnProperty.call(result, 'ok') &&
    result.ok !== true
  ) return null;
  const counters = ['updated', 'modified_count', 'matched_count']
    .filter((key) => Object.prototype.hasOwnProperty.call(result, key))
    .map((key) => Number(result[key]));
  if (!counters.length || counters.some((value) => !Number.isInteger(value) || value < 0)) return null;
  if (counters.some((value) => value !== counters[0])) return null;
  return counters[0];
}

export function recoverCasUpdatedExactlyOne(result: any): boolean {
  return recoverCasUpdatedCount(result) === 1;
}

async function exactRow(entity: any, filter: any, operation: string) {
  const rows = await requireCriticalOperation(operation, () => entity.filter(filter, '-created_date', 2));
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error(`${operation}_ambiguous`);
  return rows[0];
}

/** Serializes the legal-authorization edge on one activation. */
export async function claimRecoverAcceptanceAuthority(
  svc: any,
  input: { activationId: string; mandateId: string; now: string },
) {
  let activation = await exactRow(
    svc.entities.DealActivation,
    { id: input.activationId },
    'recover_acceptance_activation_authority_read',
  );
  if (activation.status === 'activated') {
    const changed = await requireCriticalOperation(
      'recover_acceptance_activation_authority_cas',
      () => svc.entities.DealActivation.updateMany({
        id: input.activationId,
        status: 'activated',
      }, { $set: {
        status: 'awaiting_authorization',
        authorization_mandate_id: input.mandateId,
        last_updated: input.now,
      } }),
    );
    activation = await exactRow(
      svc.entities.DealActivation,
      { id: input.activationId },
      'recover_acceptance_activation_authority_readback',
    );
    const updatedCount = recoverCasUpdatedCount(changed);
    if (updatedCount === null || updatedCount > 1) {
      throw new Error('activation_acceptance_claim_authority_ambiguous');
    }
    if (
      activation.status === 'awaiting_authorization' &&
      activation.authorization_mandate_id === input.mandateId
    ) return { claimed: updatedCount === 1, resumed: updatedCount === 0, activation };
    throw new Error('activation_acceptance_claimed_concurrently');
  }
  if (
    activation.status === 'awaiting_authorization' &&
    activation.authorization_mandate_id === input.mandateId
  ) return { claimed: false, resumed: true, activation };
  if (activation.status === 'awaiting_authorization' && !activation.authorization_mandate_id) {
    throw new Error('activation_authorization_binding_missing_review_required');
  }
  throw new Error(
    activation.status === 'awaiting_authorization'
      ? 'activation_acceptance_claimed_by_other_mandate'
      : 'activation_not_accepting_mandate',
  );
}

/** CASes acceptance_started -> active and proves the caller's token survived. */
export async function commitRecoverMandateAcceptance(
  svc: any,
  input: {
    mandateId: string;
    snapshotHash: string;
    commitToken: string;
    signedByEmail: string;
    patch: Record<string, unknown>;
  },
) {
  const changed = await requireCriticalOperation(
    'recover_acceptance_mandate_cas',
    () => svc.entities.Mandate.updateMany({
      id: input.mandateId,
      status: 'acceptance_started',
      acceptance_snapshot_hash: input.snapshotHash,
    }, { $set: {
      ...input.patch,
      status: 'active',
      acceptance_commit_token: input.commitToken,
    } }),
  );
  const mandate = await exactRow(
    svc.entities.Mandate,
    { id: input.mandateId },
    'recover_acceptance_mandate_readback',
  );
  if (
    !recoverCasUpdatedExactlyOne(changed) ||
    mandate.status !== 'active' ||
    mandate.acceptance_commit_token !== input.commitToken ||
    mandate.acceptance_snapshot_hash !== input.snapshotHash ||
    mandate.signed_by_email !== input.signedByEmail
  ) throw new Error('mandate_changed_concurrently');
  return mandate;
}

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

  const hiddenDenial = { ok: false, status: 404, error: 'activation_not_found' } as const;
  const unavailable = { ok: false, status: 503, error: 'tenant_authority_unavailable' } as const;
  const ambiguous = { ok: false, status: 503, error: 'tenant_authority_ambiguous' } as const;

  // .filter({ id }) THROWS "Object not found" on this platform for an unknown id —
  // it does not return []. Without the catch, a bad id surfaces as a 500.
  let rows: any[];
  try {
    rows = await requireCriticalOperation(
      'recover_activation_authority_read',
      () => svc.entities.DealActivation.filter({ id: dealActivationId }, '-created_date', 2),
    );
  } catch {
    return unavailable;
  }
  if (!Array.isArray(rows) || rows.length > 1) return ambiguous;
  const activation = rows[0] || null;
  if (!activation || String(activation.id || '') !== String(dealActivationId)) return hiddenDenial;

  if (!activation.brand_id) return hiddenDenial;
  let brandRows: any[];
  try {
    brandRows = await requireCriticalOperation(
      'recover_brand_ownership_read',
      () => svc.entities.Brand.filter({ id: activation.brand_id }, '-created_date', 2),
    );
  } catch {
    return unavailable;
  }
  if (!Array.isArray(brandRows) || brandRows.length > 1) return ambiguous;
  const brand = brandRows[0] || null;
  if (!brand || String(brand.id || '') !== String(activation.brand_id)) return hiddenDenial;

  const email = String(user?.email || '').trim().toLowerCase();
  const owns =
    user?.role === 'admin' ||
    (Boolean(email) && (
      String(activation.user_email || '').trim().toLowerCase() === email ||
      String(brand.contact_email || '').trim().toLowerCase() === email ||
      String(brand.created_by || '').trim().toLowerCase() === email
    ));

  // A caller cannot distinguish another tenant's activation from an unknown one.
  if (!owns) return hiddenDenial;

  return { ok: true, activation, brand, ownerEmail: email };
}

/** The current verified baseline for an activation, or null when none qualifies. */
export async function findVerifiedBaseline(svc: any, activation: any) {
  const queries: any[] = [{ deal_activation_id: activation.id }];
  if (activation.brand_id) queries.push({ brand_id: activation.brand_id });

  for (const q of queries) {
    const rows = await requireCriticalOperation('recover_verified_baseline_read', () => svc.entities.Baseline.filter(q, '-created_date', 25));
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
export function buildAcceptanceSnapshot({ activation, baseline, fee, month, evidenceBinding = null, brand = null }: any) {
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
    // Recover Economics V2 — frozen for NEW acceptances only. Historical Mandate snapshots are never rewritten.
    recovery_economics: {
      ...recoveryEconomicsSnapshot(),
      referral_discount_at_acceptance_pct: Math.max(0, getSuccessFeePct() - Number(fee.pct)),
    },
    jurisdiction: String(brand?.country || brand?.billing_country || '').toUpperCase() || null,
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
