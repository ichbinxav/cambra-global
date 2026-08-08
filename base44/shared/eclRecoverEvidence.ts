// ECL P5 — Recover evidence materialization (v0.64.0)
//
// Bridges CAMBRA's already-verified Stripe measurements into the canonical ECL
// engine WITHOUT copying ECL scoring/persistence logic. This module may create
// the raw SavingsEvidence envelope, but eclProcessEvidence remains the one
// authority that classifies it and writes lifecycle/confidence state.
//
// The source is always server-resolved. Client payloads never supply a rate,
// confidence, checksum or source row. We prefer PaymentsAnalysisVerified (which
// carries source_charges_hash + an audit window); a connected StripeConnection
// is the explicit fallback when the verified-materialization row is not yet
// present. Both paths require fresh, finite measured data.
import {
  buildAttestationIntent,
  sha256Hex,
  stableSerialize,
} from './generated/eclDomain.ts';
import { createOnce } from './eclPersistence.ts';
import { invokeInternal } from './invokeInternal.ts';

export const RECOVER_ECL_SOURCE_MAX_AGE_DAYS = 35;
const DAY_MS = 86400000;

function nonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function dateOnly(v: unknown): string | null {
  if (!nonEmpty(v) || Number.isNaN(Date.parse(v))) return null;
  return new Date(Date.parse(v)).toISOString().slice(0, 10);
}

function ageDays(iso: unknown, now: string): number {
  if (!nonEmpty(iso) || Number.isNaN(Date.parse(iso))) return Infinity;
  return Math.max(0, (Date.parse(now) - Date.parse(iso)) / DAY_MS);
}

function toMinor(major: number): number {
  return Math.round(major * 100);
}

function safeBps(v: number): number {
  return Math.round(v);
}

function evidenceMetricsFromSource(source: any) {
  const grossAmountMinor = toMinor(source.gmvMajor);
  const feeRateBps = safeBps(source.currentBps);
  const feesAmountMinor = Math.round((grossAmountMinor * feeRateBps) / 10000);
  return {
    grossAmountMinor,
    feesAmountMinor,
    netAmountMinor: Math.max(0, grossAmountMinor - feesAmountMinor),
    feeRateBps,
    ...(Number.isInteger(source.transactionCount) && source.transactionCount >= 0
      ? { transactionCount: source.transactionCount }
      : {}),
  };
}

async function resolveStripeSource(svc: any, brandId: string, now: string) {
  const [verifiedRows, stripeRows] = await Promise.all([
    svc.entities.PaymentsAnalysisVerified.filter({ brand_id: brandId }, '-created_date', 10),
    svc.entities.StripeConnection.filter({ brand_id: brandId, connection_status: 'connected' }, '-data_as_of', 10),
  ]);
  const stripe = (stripeRows || []).find((r: any) =>
    finite(r?.monthly_volume) && r.monthly_volume > 0 &&
    finite(r?.effective_fee_pct) && r.effective_fee_pct >= 0 &&
    nonEmpty(r?.currency) &&
    ageDays(r?.data_as_of || r?.last_sync_at, now) <= RECOVER_ECL_SOURCE_MAX_AGE_DAYS
  ) || null;

  const verified = (verifiedRows || []).find((r: any) => {
    const from = dateOnly(r?.measurement_window?.from);
    const to = dateOnly(r?.measurement_window?.to);
    return finite(r?.measured_current_bps) && r.measured_current_bps >= 0 &&
      finite(r?.sample_metrics?.gmv_eur) && r.sample_metrics.gmv_eur > 0 &&
      nonEmpty(r?.source_charges_hash) && from && to &&
      ageDays(r?.measurement_window?.to, now) <= RECOVER_ECL_SOURCE_MAX_AGE_DAYS;
  }) || null;

  if (verified && stripe?.currency) {
    const source = {
      kind: 'payments_analysis_verified',
      sourceId: verified.id,
      checksum: verified.source_charges_hash,
      sourceVersion: verified.engine_version || 'payments-analysis-verified',
      currency: String(stripe.currency).toUpperCase(),
      periodStart: dateOnly(verified.measurement_window?.from),
      periodEnd: dateOnly(verified.measurement_window?.to),
      observedAt: verified.measurement_window?.to,
      gmvMajor: Number(verified.sample_metrics.gmv_eur),
      currentBps: Number(verified.measured_current_bps),
      transactionCount: Number.isInteger(verified.sample_metrics?.tx_count) ? verified.sample_metrics.tx_count : null,
      referenceFeeRateBps: finite(verified.engine_result?.achievable_effective_bps)
        ? safeBps(verified.engine_result.achievable_effective_bps)
        : undefined,
      metadata: {
        payments_analysis_verified_id: verified.id,
        integration_id: verified.integration_id || null,
        engine_version: verified.engine_version || null,
        measurement_window: verified.measurement_window || null,
        source_charges_hash: verified.source_charges_hash,
        rounding: 'major_to_minor_half_up_nearest_cent; measured_bps_nearest_integer',
      },
    };
    return { ok: true, source };
  }

  if (stripe) {
    const sourceSnapshot = {
      kind: 'stripe_connection_snapshot',
      stripe_account_id: stripe.stripe_account_id || null,
      data_as_of: stripe.data_as_of || stripe.last_sync_at,
      monthly_volume: stripe.monthly_volume,
      effective_fee_pct: stripe.effective_fee_pct,
      total_transactions: stripe.total_transactions ?? null,
      currency: stripe.currency,
    };
    const observed = stripe.data_as_of || stripe.last_sync_at;
    // StripeConnection is a rolling aggregate rather than a persisted charge
    // set. Hash the exact server-side snapshot we consume so later mutation is
    // detectable in the SavingsEvidence metadata.
    const checksum = sha256Hex(stableSerialize(sourceSnapshot));
    const end = dateOnly(observed);
    if (!end) return { ok: false, code: 'ecl_source_window_unavailable' };
    const endMs = Date.parse(`${end}T00:00:00.000Z`);
    const start = new Date(endMs - 29 * DAY_MS).toISOString().slice(0, 10);
    return {
      ok: true,
      source: {
        kind: 'stripe_connection_snapshot',
        sourceId: stripe.id,
        checksum,
        sourceVersion: 'stripe-connection-aggregate-v1',
        currency: String(stripe.currency).toUpperCase(),
        periodStart: start,
        periodEnd: end,
        observedAt: observed,
        gmvMajor: Number(stripe.monthly_volume),
        currentBps: Number(stripe.effective_fee_pct) * 100,
        transactionCount: Number.isInteger(stripe.total_transactions) ? stripe.total_transactions : null,
        referenceFeeRateBps: undefined,
        metadata: { source_snapshot: sourceSnapshot, rounding: 'major_to_minor_half_up_nearest_cent; measured_bps_nearest_integer' },
      },
    };
  }

  return { ok: false, code: 'ecl_verified_payment_source_unavailable' };
}

/** Read-only source readiness check used by the acceptance context. */
export async function inspectRecoverEvidenceSource({ svc, activation, now }: any) {
  if (!activation?.brand_id) return { ok: false, code: 'ecl_activation_brand_missing' };
  if (activation.vertical && activation.vertical !== 'payments') return { ok: false, code: 'ecl_source_vertical_unsupported' };
  return resolveStripeSource(svc, activation.brand_id, now);
}

/**
 * Ensure one raw SavingsEvidence row exists for the freshest authoritative
 * Stripe measurement, then route it through the canonical eclProcessEvidence.
 */
export async function ensureRecoverSavingsEvidence({ base44, svc, activation, baseline, ownerEmail, now }: any) {
  if (!activation?.id || !activation?.brand_id) return { ok: false, code: 'ecl_activation_identity_missing' };
  if (!baseline?.id || baseline.locked !== true) return { ok: false, code: 'ecl_verified_baseline_unavailable' };
  if (!nonEmpty(ownerEmail)) return { ok: false, code: 'ecl_owner_unavailable' };

  const selected = await resolveStripeSource(svc, activation.brand_id, now);
  if (!selected.ok) return selected;
  const source = selected.source;
  const metrics = evidenceMetricsFromSource(source);
  if (!source.periodStart || !source.periodEnd || !nonEmpty(source.currency)) {
    return { ok: false, code: 'ecl_source_envelope_incomplete' };
  }

  const sameRows = await svc.entities.SavingsEvidence.filter({
    brand_id: activation.brand_id,
    deal_activation_id: activation.id,
    checksum: source.checksum,
  }, 'created_date', 10);
  let row = (sameRows || [])[0] || null;

  if (!row) {
    const currentPct = source.currentBps / 100;
    const baselinePct = Number(baseline.baseline_value);
    const created = await svc.entities.SavingsEvidence.create({
      brand_id: activation.brand_id,
      deal_activation_id: activation.id,
      provider_id: activation.provider_id || '',
      baseline_id: baseline.id,
      period_start: source.periodStart,
      period_end: source.periodEnd,
      source_type: 'api',
      evidence_type: 'api_metric',
      value_type: 'rate',
      before_value: Number.isFinite(baselinePct) ? baselinePct : undefined,
      after_value: currentPct,
      delta_value: Number.isFinite(baselinePct) ? baselinePct - currentPct : undefined,
      methodology_used: 'recover_ecl_stripe_measurement_v1',
      confidence_level: 0.95,
      verification_status: 'accepted',
      checksum: source.checksum,
      owner_email: ownerEmail,
      metadata_json: {
        source_kind: source.kind,
        source_id: source.sourceId,
        source_observed_at: source.observedAt,
        source_version: source.sourceVersion,
        source_audit: source.metadata,
      },
    });

    // Collapse a concurrent same-source create deterministically. Base44 has no
    // unique index on SavingsEvidence.checksum, so the oldest row wins.
    const afterCreate = await svc.entities.SavingsEvidence.filter({
      brand_id: activation.brand_id,
      deal_activation_id: activation.id,
      checksum: source.checksum,
    }, 'created_date', 10);
    row = (afterCreate || [])[0] || created;
    for (const dup of afterCreate || []) {
      if (dup?.id && row?.id && dup.id !== row.id && dup.id === created?.id) {
        await svc.entities.SavingsEvidence.delete(dup.id).catch(() => null);
      }
    }
  }

  if (!row?.id) return { ok: false, code: 'ecl_savings_evidence_create_failed' };

  if (!row.confidence_result_hash || !row.evidence_status) {
    const processed = await invokeInternal(base44, 'eclProcessEvidence', {
      action: 'process',
      evidenceEntityType: 'savings_evidence',
      evidenceId: row.id,
      domain: 'payments',
      evidence: {
        evidenceType: 'api_metric',
        sourceType: 'api',
        checksum: source.checksum,
        importId: source.sourceId,
        parserVersion: source.sourceVersion,
        currency: source.currency,
        periodStart: source.periodStart,
        periodEnd: source.periodEnd,
        ...metrics,
      },
      ...(finite(source.referenceFeeRateBps) && source.referenceFeeRateBps > 0
        ? { referenceFeeRateBps: source.referenceFeeRateBps }
        : {}),
    });
    if (!processed.ok || processed.data?.ok !== true) {
      return { ok: false, code: processed.data?.code || 'ecl_process_failed', detail: processed.data?.error || null, evidenceId: row.id };
    }
    row = await svc.entities.SavingsEvidence.get(row.id);
  }

  return { ok: true, evidence: row, sourceKind: source.kind };
}

/**
 * Persist the merchant's explicit Recover evidence declaration. The exact text
 * is server-resolved by the caller from the shared mandate-copy module; the
 * client supplies only the explicit boolean that they ticked it.
 */
export async function createRecoverEvidenceAttestation({
  svc, user, activation, baseline, ownerEmail, legalText, legalTextVersion, language,
}: any) {
  if (!user?.id || !nonEmpty(ownerEmail)) return { ok: false, code: 'ecl_attestor_unavailable' };
  const rows = await svc.entities.SavingsEvidence.filter({
    brand_id: activation.brand_id,
    deal_activation_id: activation.id,
  }, '-created_date', 10);
  const evidence = (rows || [])[0] || null;
  if (!evidence?.id || !nonEmpty(evidence.checksum)) return { ok: false, code: 'ecl_attestable_evidence_unavailable' };

  const declaredMetrics: Record<string, number> = {};
  const baselineRate = Number(baseline?.baseline_value);
  const currentRate = Number(evidence.after_value);
  const deltaRate = Number(evidence.delta_value);
  if (Number.isFinite(baselineRate)) declaredMetrics.baseline_rate_pct = baselineRate;
  if (Number.isFinite(currentRate)) declaredMetrics.current_rate_pct = currentRate;
  if (Number.isFinite(deltaRate)) declaredMetrics.delta_rate_pct = deltaRate;
  if (Object.keys(declaredMetrics).length === 0) return { ok: false, code: 'ecl_attestation_metrics_unavailable' };

  const intent = buildAttestationIntent({
    attestorUserId: user.id,
    brandId: activation.brand_id,
    ownerEmail,
    evidenceEntityType: 'savings_evidence',
    evidenceId: evidence.id,
    declaredMetrics,
    legalTextVersion,
    legalText,
    language,
    declaredPeriodStart: evidence.period_start || undefined,
    declaredPeriodEnd: evidence.period_end || undefined,
    declaredSource: 'CAMBRA verified payment-cost evidence',
    evidenceChecksum: evidence.checksum,
  });
  const persisted = await createOnce(svc, 'EvidenceAttestation', intent.idempotencyKey, intent.record);
  return { ok: true, attestationId: persisted.id, evidenceId: evidence.id, created: persisted.created, legalTextHash: intent.legalTextHash };
}
