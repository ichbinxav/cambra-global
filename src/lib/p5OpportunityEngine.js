// P5 Opportunity Engine — deterministic merchant economic decision core.
//
// This module deliberately has no Base44 SDK imports. Repository adapters turn
// P1–P4 records into the small input contracts below; authoritative upstream
// truth remains owned by P1–P4. Monetary values are integer minor units and
// percentage fees are integer ppm (one millionth), never binary percentages.

import { sha256, stableSerialize } from './p3RateIntelligence.js';

export const P5_ENGINE_VERSION = 'p5-opportunity-engine-1.0.0';
export const P5_POLICY_VERSION = 'p5-policy-1.0.0';
export const P5_MODES = Object.freeze(['SHADOW', 'AUTHORITATIVE']);
export const COMPLETENESS_PROVENANCE = Object.freeze(['OBSERVED', 'INFERRED', 'MODELLED', 'MISSING', 'STALE', 'CONTRADICTORY']);
export const MIX_POLICIES = Object.freeze(['STRICT', 'BOUNDED', 'MODELLED']);
export const CANDIDATE_TYPES = Object.freeze(['RENEGOTIATE_CURRENT_PROVIDER', 'CHANGE_PRICING_PLAN', 'MIGRATE_PROVIDER', 'PARTIAL_MIGRATION', 'PAYMENT_METHOD_OPTIMIZATION', 'ROUTING_OPTIMIZATION', 'CONTRACT_OPTIMIZATION', 'NO_ACTION', 'REQUIRE_MORE_INFORMATION']);
export const ELIGIBILITY_STATUSES = Object.freeze(['ELIGIBLE', 'CONDITIONALLY_ELIGIBLE', 'INELIGIBLE', 'UNKNOWN']);
export const OOD_STATES = Object.freeze(['IN_DISTRIBUTION', 'EDGE_OF_DISTRIBUTION', 'OUT_OF_DISTRIBUTION', 'UNKNOWN']);

const COST_COMPONENTS = new Set(['INTERCHANGE', 'SCHEME_FEE', 'PROCESSING_FEE', 'ACQUIRER_MARGIN', 'PROVIDER_MARKUP', 'FIXED_TRANSACTION_FEE', 'FX_FEE', 'CROSS_BORDER_FEE', 'REFUND_FEE', 'CHARGEBACK_FEE', 'MONTHLY_FEE', 'SUBSCRIPTION_FEE', 'MINIMUM_MONTHLY_FEE', 'MINIMUM_COMMITMENT', 'INTERNATIONAL_CARD_UPLIFT', 'COMMERCIAL_CARD_UPLIFT', 'NON_EEA_UPLIFT', 'PREMIUM_CARD_UPLIFT', 'PAYMENT_METHOD_FEE', 'OTHER']);
const MINOR_PER_UNIT = 1_000_000n;

function invariant(condition, code) { if (!condition) throw new Error(code); }
function int(value, code) { invariant(Number.isSafeInteger(value), code); return BigInt(value); }
function minor(value) { return Number(value); }
function divRoundHalfAway(numerator, denominator) {
  invariant(denominator > 0n, 'invalid_denominator');
  if (numerator >= 0n) return (numerator + denominator / 2n) / denominator;
  return -((-numerator + denominator / 2n) / denominator);
}
function rateFee(amountMinor, ppm) { return divRoundHalfAway(int(amountMinor, 'amount_minor_must_be_integer') * int(ppm, 'ppm_must_be_integer'), MINOR_PER_UNIT); }
function sameCurrency(a, b) { return String(a || '').toUpperCase() === String(b || '').toUpperCase(); }
function confidenceFor(completeness, unresolved, ood = 'IN_DISTRIBUTION') {
  if (ood === 'OUT_OF_DISTRIBUTION') return 'LOW';
  if (unresolved.length || completeness?.missing?.length || completeness?.contradictory?.length) return 'LOW';
  if (ood === 'EDGE_OF_DISTRIBUTION' || completeness?.inferred?.length || completeness?.modelled?.length) return 'MEDIUM';
  return 'HIGH';
}

/** Validates the canonical P5 economic snapshot. Unknowns stay represented. */
export function validateMerchantEconomicSnapshot(snapshot) {
  const errors = [];
  if (!snapshot || typeof snapshot !== 'object') return { ok: false, errors: ['INVALID_MERCHANT_ECONOMIC_SNAPSHOT'] };
  for (const key of ['merchantId', 'country', 'currency', 'asOf', 'snapshotVersion']) if (!snapshot[key]) errors.push(`missing_${key}`);
  if (!Number.isSafeInteger(snapshot.annualVolumeMinor) || snapshot.annualVolumeMinor < 0) errors.push('invalid_annual_volume_minor');
  if (!Number.isSafeInteger(snapshot.annualTransactionCount) || snapshot.annualTransactionCount < 0) errors.push('invalid_annual_transaction_count');
  if (!snapshot.completeness || typeof snapshot.completeness !== 'object') errors.push('missing_completeness');
  for (const group of ['missing', 'inferred', 'observed', 'stale', 'contradictory', 'modelled']) if (snapshot.completeness && !Array.isArray(snapshot.completeness[group] || [])) errors.push(`invalid_completeness_${group}`);
  return { ok: errors.length === 0, errors };
}

export function snapshotFingerprint(snapshot) {
  const valid = validateMerchantEconomicSnapshot(snapshot); invariant(valid.ok, valid.errors.join(','));
  return sha256({ ...snapshot, createdAt: undefined, fingerprint: undefined });
}

/** Maps P3 rate components to a P5 commercial terms package without creating rate truth. */
export function adaptP3Terms({ providerId, productId, currency, pricingVersion, evidenceReferences = [], components = [], validity = {} }) {
  return {
    providerId, productId, currency, pricingVersion, evidenceReferences,
    validFrom: validity.from || null, validTo: validity.to || null,
    components: components.map(component => ({
      kind: component.component_type === 'MONTHLY_FEE' ? 'MONTHLY_FEE' : component.component_type === 'SUBSCRIPTION_FEE' ? 'SUBSCRIPTION_FEE' : component.component_type === 'MINIMUM_MONTHLY_FEE' ? 'MINIMUM_MONTHLY_FEE' : component.component_type,
      ppm: component.percentage_ppm ?? null,
      amountMinor: component.amount_minor ?? null,
      minimumAmountMinor: component.minimum_amount_minor ?? null,
      maximumAmountMinor: component.maximum_amount_minor ?? null,
      currency: component.currency || currency,
      valueMode: component.value_mode || 'KNOWN',
      unitBasis: component.unit_basis || 'PER_TRANSACTION',
      condition: component.condition_json || null,
    })),
  };
}

export function validateCommercialTerms(terms) {
  const errors = [];
  if (!terms?.providerId || !terms?.currency || !terms?.pricingVersion) errors.push('INCONSISTENT_COMMERCIAL_TERMS');
  for (const c of terms?.components || []) {
    if (!COST_COMPONENTS.has(c.kind) && !['TERMINAL_RENTAL', 'PAYMENT_METHOD_FEE'].includes(c.kind)) errors.push(`unsupported_component_${c.kind}`);
    if (c.valueMode === 'KNOWN' && c.ppm == null && c.amountMinor == null && c.minimumAmountMinor == null) errors.push('known_component_requires_value');
    if (c.ppm != null && (!Number.isSafeInteger(c.ppm) || c.ppm < 0 || c.ppm > 1_000_000)) errors.push('invalid_ppm');
    for (const k of ['amountMinor', 'minimumAmountMinor', 'maximumAmountMinor']) if (c[k] != null && (!Number.isSafeInteger(c[k]) || c[k] < 0)) errors.push(`invalid_${k}`);
    if (c.currency && !sameCurrency(c.currency, terms?.currency)) errors.push('CURRENCY_MISMATCH');
  }
  return { ok: errors.length === 0, errors };
}

function conditionApplies(condition, snapshot) {
  if (!condition) return true;
  if (condition.field === 'internationalCardMix') {
    if (snapshot.internationalCardMix == null) return null;
    return condition.gte == null || snapshot.internationalCardMix >= condition.gte;
  }
  return null; // A condition unknown to P5 must not silently apply.
}

/**
 * Applies terms to one annual merchant snapshot. It only supports deterministic
 * aggregated fees; unsupported/missing information is returned as unresolved.
 */
export function evaluateMerchantCost(snapshot, terms, { mixPolicy = 'STRICT' } = {}) {
  invariant(MIX_POLICIES.includes(mixPolicy), 'invalid_mix_policy');
  const snapshotValid = validateMerchantEconomicSnapshot(snapshot); invariant(snapshotValid.ok, snapshotValid.errors.join(','));
  const termsValid = validateCommercialTerms(terms); invariant(termsValid.ok, termsValid.errors.join(','));
  invariant(sameCurrency(snapshot.currency, terms.currency), 'CURRENCY_MISMATCH');
  const breakdown = {}; const unresolved = []; const assumptions = []; let total = 0n;
  for (const component of terms.components || []) {
    if (component.valueMode !== 'KNOWN') { unresolved.push({ component: component.kind, reason: 'unknown_component_value' }); continue; }
    const applies = conditionApplies(component.condition, snapshot);
    if (applies === null) {
      if (mixPolicy === 'STRICT') { unresolved.push({ component: component.kind, reason: 'missing_material_mix' }); continue; }
      assumptions.push({ component: component.kind, policy: mixPolicy, input: 'internationalCardMix' });
      if (mixPolicy === 'BOUNDED') { unresolved.push({ component: component.kind, reason: 'bounded_mix_requires_scenario' }); continue; }
    }
    if (applies === false) continue;
    let fee = 0n;
    if (component.ppm != null) fee += rateFee(snapshot.annualVolumeMinor, component.ppm);
    if (component.amountMinor != null) {
      if (['PER_TRANSACTION', 'PER_AUTHORIZATION'].includes(component.unitBasis)) fee += int(component.amountMinor, 'amount_minor_must_be_integer') * int(snapshot.annualTransactionCount, 'transaction_count_must_be_integer');
      else if (['PER_MONTH', 'PER_ACCOUNT', 'PER_TERMINAL'].includes(component.unitBasis)) fee += int(component.amountMinor, 'amount_minor_must_be_integer') * 12n;
      else fee += int(component.amountMinor, 'amount_minor_must_be_integer');
    }
    if (component.minimumAmountMinor != null) fee = fee < BigInt(component.minimumAmountMinor) ? BigInt(component.minimumAmountMinor) : fee;
    if (component.maximumAmountMinor != null) fee = fee > BigInt(component.maximumAmountMinor) ? BigInt(component.maximumAmountMinor) : fee;
    total += fee; breakdown[component.kind] = (breakdown[component.kind] || 0) + minor(fee);
  }
  // A monthly contract minimum compares against the otherwise-modelled monthly total.
  const annualMinimum = (terms.annualMinimumMinor ?? (terms.monthlyMinimumMinor == null ? null : terms.monthlyMinimumMinor * 12));
  if (annualMinimum != null) {
    invariant(Number.isSafeInteger(annualMinimum) && annualMinimum >= 0, 'invalid_minimum_commitment');
    if (total < BigInt(annualMinimum)) { breakdown.MINIMUM_COMMITMENT = (breakdown.MINIMUM_COMMITMENT || 0) + minor(BigInt(annualMinimum) - total); total = BigInt(annualMinimum); }
  }
  const totalMinor = minor(total);
  return {
    totalMinor, currency: snapshot.currency, costBreakdown: breakdown,
    effectiveRatePpm: snapshot.annualVolumeMinor ? minor(divRoundHalfAway(total * MINOR_PER_UNIT, BigInt(snapshot.annualVolumeMinor))) : null,
    costPerTransactionMinor: snapshot.annualTransactionCount ? minor(divRoundHalfAway(total, BigInt(snapshot.annualTransactionCount))) : null,
    unresolvedComponents: unresolved, assumptions,
    confidence: confidenceFor(snapshot.completeness, unresolved),
  };
}

export function merchantEconomicBaseline(snapshot, currentTerms, options) { const evaluation = evaluateMerchantCost(snapshot, currentTerms, options); return { ...evaluation, annualCurrentCostMinor: evaluation.totalMinor }; }

export function createCandidate(input) {
  invariant(CANDIDATE_TYPES.includes(input?.type), 'invalid_candidate_type');
  if (input.type === 'MIGRATE_PROVIDER') invariant(input.providerId && input.productId, 'migration_destination_required');
  if (input.type === 'RENEGOTIATE_CURRENT_PROVIDER') invariant(input.providerId, 'current_provider_required');
  return Object.freeze({ ...input, candidateId: input.candidateId || sha256({ type: input.type, providerId: input.providerId || null, productId: input.productId || null, planId: input.planId || null }) });
}

export function generateCandidates({ currentProviderId, currentProductId, alternatives = [], includeRenegotiation = true }) {
  const all = [];
  if (includeRenegotiation && currentProviderId) all.push(createCandidate({ type: 'RENEGOTIATE_CURRENT_PROVIDER', providerId: currentProviderId, productId: currentProductId }));
  for (const x of alternatives) all.push(createCandidate({ type: 'MIGRATE_PROVIDER', providerId: x.providerId, productId: x.productId }));
  const seen = new Set(); return all.filter(x => !seen.has(x.candidateId) && seen.add(x.candidateId));
}

/** P2 facts are injected; UNKNOWN deliberately stays UNKNOWN. */
export function assessEligibility(candidate, { marketAvailability, currencySupport, merchantEligibility, authorization }) {
  const reasons = [];
  const state = (v, ineligible, unknown, reason) => { if (ineligible.includes(v)) reasons.push(reason); else if (unknown.includes(v)) reasons.push(`UNKNOWN_${reason}`); };
  state(marketAvailability?.availability, ['UNAVAILABLE'], ['UNKNOWN', 'NOT_RESEARCHED', undefined], 'PROVIDER_NOT_AVAILABLE_IN_MARKET');
  state(currencySupport?.support_state, ['UNSUPPORTED'], ['UNKNOWN', 'NOT_RESEARCHED', undefined], 'CURRENCY_UNSUPPORTED');
  state(merchantEligibility?.eligibility_state, ['INELIGIBLE'], ['UNKNOWN', 'NOT_RESEARCHED', undefined], 'BUSINESS_MODEL_INELIGIBLE');
  state(authorization?.status, ['UNAUTHORIZED', 'REVOKED'], ['UNKNOWN', undefined], 'PROVIDER_AUTHORIZATION');
  const status = reasons.some(r => !r.startsWith('UNKNOWN_')) ? 'INELIGIBLE' : reasons.length ? 'UNKNOWN' : (marketAvailability?.availability === 'LIMITED' || merchantEligibility?.eligibility_state === 'LIMITED' ? 'CONDITIONALLY_ELIGIBLE' : 'ELIGIBLE');
  return { candidateId: candidate.candidateId, status, reasonCodes: reasons };
}

export function counterfactualEconomics({ snapshot, currentTerms, candidateTerms, transitionCostMinor = null, implementationCostMinor = null, mixPolicy = 'STRICT' }) {
  const current = evaluateMerchantCost(snapshot, currentTerms, { mixPolicy });
  const counterfactual = evaluateMerchantCost(snapshot, candidateTerms, { mixPolicy });
  const unresolved = [...current.unresolvedComponents, ...counterfactual.unresolvedComponents];
  const grossModeledSavingsMinor = current.totalMinor - counterfactual.totalMinor;
  const knownTransitionMinor = transitionCostMinor == null ? null : transitionCostMinor + (implementationCostMinor || 0);
  return {
    currentEconomics: current, counterfactualEconomics: counterfactual,
    grossModeledSavingsMinor, transitionCostMinor: knownTransitionMinor,
    netModeledSavingsMinor: knownTransitionMinor == null ? null : grossModeledSavingsMinor - knownTransitionMinor,
    year1ValueMinor: knownTransitionMinor == null ? null : grossModeledSavingsMinor - knownTransitionMinor,
    year2ValueMinor: grossModeledSavingsMinor,
    twentyFourMonthValueMinor: knownTransitionMinor == null ? null : grossModeledSavingsMinor * 2 - knownTransitionMinor,
    unresolvedComponents: unresolved,
  };
}

/** P4 benchmark adapter. A benchmark is evidence, never an automatic offer. */
export function estimateAchievableTerms({ benchmark, proposedTerms, scenario = 'EXPECTED' }) {
  invariant(['CONSERVATIVE', 'EXPECTED', 'TARGET', 'UPSIDE'].includes(scenario), 'invalid_achievability_scenario');
  const ood = benchmark?.oodState || 'UNKNOWN';
  const sampleSize = Number(benchmark?.sampleSize || 0);
  if (!benchmark || ood === 'OUT_OF_DISTRIBUTION' || !benchmark.modelVersion || sampleSize < 10) return { status: 'INSUFFICIENT_EVIDENCE', scenario, oodState: ood, confidence: 'LOW', terms: null, reason: sampleSize < 10 ? 'P4_MINIMUM_DISTINCT_MERCHANT_THRESHOLD_NOT_MET' : 'P4_MODEL_OR_DISTRIBUTION_UNAVAILABLE' };
  return { status: 'ESTIMATED', scenario, oodState: ood, confidence: benchmark.sampleSize >= 10 && ood === 'IN_DISTRIBUTION' ? 'HIGH' : 'MEDIUM', terms: proposedTerms || null, benchmarkReference: benchmark.reference || null, modelVersion: benchmark.modelVersion, uncertaintyPpm: benchmark.uncertaintyPpm ?? null };
}

/**
 * Strict P4 statistical-output adapter. P4 stays statistical inference: the
 * returned object is benchmark evidence only and can never create P3 rate truth
 * or a complete CommercialTermsPackage by itself.
 */
export function adaptP4StatisticalEstimate({ estimate, interval = null, targetSpec, modelManifest, knownAt, evaluationAsOf, expectedTargetSpecId, expectedFeePerimeter, expectedPopulation }) {
  const unavailable = reason => ({ status: 'INSUFFICIENT_EVIDENCE', reason, modelVersion: estimate?.model_version_id || null });
  if (!estimate || !targetSpec || !modelManifest) return unavailable('p4_versioned_artifact_required');
  if (!['VALID', 'FALLBACK'].includes(estimate.status)) return unavailable(`p4_status_${String(estimate.status || 'UNKNOWN').toLowerCase()}`);
  if (targetSpec.unit !== 'BPS') return unavailable('p4_target_not_rate_compatible');
  if (expectedTargetSpecId && estimate.target_spec_id !== expectedTargetSpecId) return unavailable('p4_target_spec_mismatch');
  if (expectedFeePerimeter && targetSpec.fee_perimeter !== expectedFeePerimeter) return unavailable('p4_fee_perimeter_mismatch');
  if (expectedPopulation && (estimate.estimand_population || targetSpec.source_population) !== expectedPopulation) return unavailable('p4_population_mismatch');
  if (estimate.model_version_id !== modelManifest.model_version_id) return unavailable('p4_model_manifest_mismatch');
  if (!knownAt || !evaluationAsOf || Number.isNaN(Date.parse(knownAt)) || Number.isNaN(Date.parse(evaluationAsOf))) return unavailable('p4_known_at_required');
  if (Date.parse(knownAt) > Date.parse(evaluationAsOf)) return unavailable('p4_future_model_leakage');
  const p4Ood = estimate.ood?.status || 'OUT_OF_DISTRIBUTION';
  const oodState = ({ IN_DISTRIBUTION: 'IN_DISTRIBUTION', BORDERLINE: 'EDGE_OF_DISTRIBUTION', OUT_OF_DISTRIBUTION: 'OUT_OF_DISTRIBUTION' })[p4Ood] || 'UNKNOWN';
  const lower = interval?.lower, upper = interval?.upper;
  const uncertaintyPpm = Number.isFinite(lower) && Number.isFinite(upper) ? Math.round((upper - lower) * 100) : null; // 1 BPS = 100 PPM
  return {
    status: 'AVAILABLE', modelVersion: estimate.model_version_id, targetSpecId: estimate.target_spec_id,
    asOf: estimate.as_of, knownAt, trainingCutoff: estimate.training_cutoff || modelManifest.training_cutoff || null,
    expiresAt: estimate.expires_at || null, oodState, sampleSize: estimate.support?.unique_merchants ?? 0,
    effectiveSampleSize: estimate.support?.n_eff ?? 0, uncertaintyPpm, calibrated: interval?.calibrated ?? false,
    reference: estimate.lineage_hash, warnings: estimate.warnings || [], quantilesBps: estimate.quantiles || {},
    provenance: 'P4_STATISTICAL_INFERENCE_NOT_P3_RATE_TRUTH',
  };
}

export function paretoFilter(opportunities) {
  return opportunities.filter(a => !opportunities.some(b => b !== a && (b.expectedValueMinor ?? -Infinity) >= (a.expectedValueMinor ?? -Infinity) && (b.confidenceRank ?? 0) >= (a.confidenceRank ?? 0) && (b.frictionRank ?? Infinity) <= (a.frictionRank ?? Infinity) && ((b.expectedValueMinor ?? -Infinity) > (a.expectedValueMinor ?? -Infinity) || (b.confidenceRank ?? 0) > (a.confidenceRank ?? 0) || (b.frictionRank ?? Infinity) < (a.frictionRank ?? Infinity))));
}

export function validateOpportunityGraph(graph) {
  const edges = graph?.edges || []; const nodes = new Set(graph?.nodes || []); const errors = [];
  for (const edge of edges) { if (!nodes.has(edge.from) || !nodes.has(edge.to)) errors.push('graph_edge_unknown_node'); if (!['MUTUALLY_EXCLUSIVE', 'OVERLAPS_WITH', 'DEPENDENT_ON', 'COMPLEMENTARY', 'SUPERSEDES', 'CAN_SEQUENCE_AFTER', 'REQUIRES'].includes(edge.type)) errors.push('graph_edge_invalid_type'); }
  const sequence = edges.filter(e => ['DEPENDENT_ON', 'CAN_SEQUENCE_AFTER', 'REQUIRES'].includes(e.type)); const adj = new Map();
  for (const e of sequence) adj.set(e.from, [...(adj.get(e.from) || []), e.to]);
  const seen = new Set(), active = new Set(); const visit = node => { if (active.has(node)) return true; if (seen.has(node)) return false; seen.add(node); active.add(node); const cycle = (adj.get(node) || []).some(visit); active.delete(node); return cycle; };
  if ([...nodes].some(visit)) errors.push('impossible_strategy_cycle'); return { ok: !errors.length, errors };
}

export function decideOpportunity({ opportunities = [], graph = { nodes: [], edges: [] }, policy = {}, informationGaps = [], oodState = 'IN_DISTRIBUTION' }) {
  const graphCheck = validateOpportunityGraph(graph); if (!graphCheck.ok) return { decision: 'ABSTAIN', reasonCodes: graphCheck.errors };
  if (oodState === 'OUT_OF_DISTRIBUTION') return { decision: 'ABSTAIN', reasonCodes: ['OUT_OF_DISTRIBUTION'] };
  if (informationGaps.some(g => g.decisionImpact === 'MATERIAL')) return { decision: 'COLLECT_DATA', reasonCodes: ['DECISION_CRITICAL_INFORMATION_GAP'], informationGaps };
  const eligible = opportunities.filter(x => x.eligibility?.status === 'ELIGIBLE' || x.eligibility?.status === 'CONDITIONALLY_ELIGIBLE');
  const minBenefit = policy.minimumExpectedValueMinor ?? 0;
  const viable = paretoFilter(eligible.filter(x => x.expectedValueMinor != null && x.expectedValueMinor >= minBenefit && x.confidence !== 'LOW'));
  if (!viable.length) return { decision: 'DO_NOTHING', reasonCodes: ['NO_SUFFICIENT_RISK_ADJUSTED_MERCHANT_VALUE'], alternatives: eligible };
  const best = [...viable].sort((a, b) => (b.expectedValueMinor - a.expectedValueMinor) || String(a.candidateId).localeCompare(String(b.candidateId)))[0];
  return { decision: best.decision || (best.candidate?.type === 'MIGRATE_PROVIDER' ? 'MIGRATE' : 'NEGOTIATE'), selected: best, alternatives: viable.filter(x => x !== best) };
}

export function createDecisionTrace({ snapshot, eligibleCandidates, evaluations, achievability, graph, decision }) { return { engineVersion: P5_ENGINE_VERSION, snapshotFingerprint: snapshotFingerprint(snapshot), eligibleCandidates, evaluations, achievability, graph, decision }; }
export function createVersionBundle(input = {}) { return { countryIntelligenceVersion: input.countryIntelligenceVersion || null, providerIntelligenceVersion: input.providerIntelligenceVersion || null, rateIntelligenceVersion: input.rateIntelligenceVersion || null, benchmarkIntelligenceVersion: input.benchmarkIntelligenceVersion || null, costEngineVersion: P5_ENGINE_VERSION, policyVersion: input.policyVersion || P5_POLICY_VERSION }; }
export function evaluationFingerprint({ snapshot, candidate, versionBundle }) { return sha256(stableSerialize({ snapshotFingerprint: snapshotFingerprint(snapshot), candidate, versionBundle, engineVersion: P5_ENGINE_VERSION })); }

// P5.4–P5.8: decision primitives. These have no I/O by design; adapters own
// storage, upstream queries and execution. The separation makes each decision
// replayable from a recorded snapshot/version bundle.
export function estimateProbability({ providerAcceptance, merchantAcceptance, technicalFeasibility, implementationCompletion, savingsRealization, method = 'heuristic-v1' }) {
  const components = { providerAcceptance, merchantAcceptance, technicalFeasibility, implementationCompletion, savingsRealization };
  const values = Object.values(components);
  if (values.some(x => x == null)) return { band: 'UNKNOWN', range: null, components, method, dependencyAssumption: 'aggregate_not_computed_with_missing_components' };
  for (const x of values) invariant(Number.isFinite(x) && x >= 0 && x <= 1, 'invalid_probability');
  // The lower bound is intentionally conservative. It never asserts
  // independence or manufactures a false point probability.
  const lower = Math.min(...values), upper = Math.max(...values);
  const point = values.reduce((sum, x) => sum + x, 0) / values.length;
  return { point, range: { lower, upper }, band: point >= .75 ? 'HIGH' : point >= .4 ? 'MEDIUM' : 'LOW', components, method, dependencyAssumption: 'components_are_correlated; arithmetic_mean_is_not_joint_probability' };
}

export function assessFriction(input = {}) {
  const dimensions = ['directMonetaryCostMinor', 'engineeringComplexity', 'merchantOperationalEffort', 'migrationComplexity', 'contractualFriction', 'downtimeRisk', 'integrationUncertainty', 'reversibility'];
  const unknown = dimensions.filter(k => input[k] == null);
  const time = {
    expectedTimeToOfferDays: input.expectedTimeToOfferDays ?? null,
    expectedTimeToDecisionDays: input.expectedTimeToDecisionDays ?? null,
    expectedTimeToImplementationDays: input.expectedTimeToImplementationDays ?? null,
    expectedTimeToSavingsDays: input.expectedTimeToSavingsDays ?? null,
  };
  for (const value of Object.values(time)) if (value != null) invariant(Number.isSafeInteger(value) && value >= 0, 'invalid_time_to_value');
  const knownScores = dimensions.filter(k => typeof input[k] === 'number' && k !== 'directMonetaryCostMinor').map(k => input[k]);
  return { dimensions: Object.fromEntries(dimensions.map(k => [k, input[k] ?? null])), unknownDimensions: unknown, frictionBand: unknown.length ? 'UNKNOWN' : (knownScores.reduce((a, b) => a + b, 0) / Math.max(knownScores.length, 1) >= 6 ? 'HIGH' : 'LOW'), timeToValue: time };
}

export function classifyInformationGap({ field, plausibleOutcomes = [], currentBestCandidateId = null }) {
  invariant(field, 'information_gap_field_required');
  const choices = new Set(plausibleOutcomes.map(x => x.optimalCandidateId).filter(Boolean));
  const decisionImpact = choices.size > 1 || (currentBestCandidateId && choices.size === 1 && !choices.has(currentBestCandidateId)) ? 'MATERIAL' : 'NON_MATERIAL';
  return { field, decisionImpact, plausibleOutcomes, recommendation: decisionImpact === 'MATERIAL' ? 'COLLECT_DATA' : 'OPTIONAL_DATA_COLLECTION' };
}

/** Rate (ppm) at which retaining the incumbent equals the alternative after switching cost. */
export function economicIndifferencePoint({ annualVolumeMinor, incumbentNonRateCostMinor = 0, alternativeAnnualCostMinor, switchingCostMinor = 0 }) {
  invariant(Number.isSafeInteger(annualVolumeMinor) && annualVolumeMinor > 0, 'invalid_annual_volume_minor');
  for (const x of [incumbentNonRateCostMinor, alternativeAnnualCostMinor, switchingCostMinor]) invariant(Number.isSafeInteger(x) && x >= 0, 'invalid_indifference_cost');
  const target = BigInt(alternativeAnnualCostMinor) + BigInt(switchingCostMinor) - BigInt(incumbentNonRateCostMinor);
  return { equivalentIncumbentRatePpm: minor(divRoundHalfAway(target * MINOR_PER_UNIT, BigInt(annualVolumeMinor))), horizonMonths: 12, switchingCostIncluded: switchingCostMinor };
}

export function selectBATNA(opportunities) {
  const candidates = paretoFilter((opportunities || []).filter(x => x.eligibility?.status === 'ELIGIBLE' && x.achievability?.status === 'ESTIMATED' && x.expectedValueMinor != null && x.confidence !== 'LOW'));
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => (b.expectedValueMinor - a.expectedValueMinor) || (a.frictionRank ?? Infinity) - (b.frictionRank ?? Infinity) || String(a.candidateId).localeCompare(String(b.candidateId)))[0];
}

export function buildNegotiationBoundary({ expectedTerms, targetTerms, conservativeTerms, batna, indifferencePoint, minimumAcceptableImprovementMinor }) {
  invariant(expectedTerms && targetTerms && conservativeTerms, 'negotiation_terms_required');
  return { anchorTarget: targetTerms, targetTerms, expectedSettlementTerms: expectedTerms, minimumAcceptableImprovementMinor: minimumAcceptableImprovementMinor ?? null, walkAwayThreshold: indifferencePoint, bestAlternative: batna || null, economicIndifferencePoint: indifferencePoint, boundaryConfidence: batna?.confidence || 'LOW' };
}

export function incrementalOpportunityValue({ baselineCostMinor, combinedStrategyCostMinor, standaloneOpportunityValues = [] }) {
  invariant(Number.isSafeInteger(baselineCostMinor) && baselineCostMinor >= 0, 'invalid_baseline_cost');
  invariant(Number.isSafeInteger(combinedStrategyCostMinor) && combinedStrategyCostMinor >= 0, 'invalid_strategy_cost');
  const actualIncrementalValueMinor = baselineCostMinor - combinedStrategyCostMinor;
  const naiveSummedStandaloneValueMinor = standaloneOpportunityValues.reduce((sum, x) => sum + x, 0);
  return { actualIncrementalValueMinor, naiveSummedStandaloneValueMinor, overlapPreventedMinor: Math.max(0, naiveSummedStandaloneValueMinor - actualIncrementalValueMinor) };
}

export function buildStrategy({ steps = [], graph }) {
  const check = validateOpportunityGraph(graph); invariant(check.ok, check.errors.join(','));
  const ids = new Set();
  for (const step of steps) {
    invariant(step.stepId && !ids.has(step.stepId), 'strategy_step_id_invalid'); ids.add(step.stepId);
    invariant(step.candidateId && Array.isArray(step.conditions), 'strategy_step_contract_invalid');
    for (const c of step.conditions) invariant(['OFFER_RATE_AT_OR_BELOW', 'OFFER_RATE_ABOVE', 'ELIGIBILITY_CONFIRMED', 'DATA_COLLECTED', 'VALUE_AT_LEAST'].includes(c.type), 'strategy_condition_invalid');
  }
  return { strategyVersion: P5_ENGINE_VERSION, steps, graph, deterministic: true };
}

export function scoreOpportunity({ expectedValueMinor, probability, friction, confidence, policy = {} }) {
  invariant(Number.isSafeInteger(expectedValueMinor), 'invalid_expected_value');
  const weights = { value: policy.valueWeight ?? 1, probability: policy.probabilityWeight ?? 1, friction: policy.frictionWeight ?? 1, confidence: policy.confidenceWeight ?? 1 };
  for (const weight of Object.values(weights)) invariant(Number.isFinite(weight) && weight >= 0, 'invalid_score_policy');
  const confidenceValue = ({ HIGH: 1, MEDIUM: .5, LOW: 0 })[confidence] ?? 0;
  const probabilityValue = probability?.point ?? ({ HIGH: .75, MEDIUM: .5, LOW: .25 })[probability?.band] ?? 0;
  const frictionValue = ({ LOW: 0, MEDIUM: .5, HIGH: 1, UNKNOWN: 1 })[friction?.frictionBand] ?? 1;
  const score = expectedValueMinor * weights.value + probabilityValue * weights.probability * 1_000 + confidenceValue * weights.confidence * 1_000 - frictionValue * weights.friction * 1_000;
  return { score, scoreVersion: P5_POLICY_VERSION, scoreBreakdown: { expectedValueMinor, probabilityValue, confidenceValue, frictionValue, weights } };
}

export function validateTemporalContext({ asOf, records = [] }) {
  invariant(!Number.isNaN(Date.parse(asOf)), 'invalid_as_of');
  const leaked = records.filter(r => r?.knownAt && Date.parse(r.knownAt) > Date.parse(asOf)).map(r => r.id || r.reference || 'unknown');
  return { ok: leaked.length === 0, asOf, futureKnowledgeReferences: leaked };
}

export function freshnessState({ evaluation, changes = [] }) {
  const dependencies = new Set(evaluation?.dependencyReferences || []);
  const relevant = changes.filter(change => dependencies.has(change.reference));
  return { status: relevant.some(x => x.invalid) ? 'INVALID' : relevant.length ? 'STALE' : 'FRESH', relevantChanges: relevant };
}

export function createEvidencePack({ snapshot, versionBundle, currentEconomics, counterfactuals, eligibility, achievability, probability, friction, strategy, decision, policies = [] }) {
  return { evidencePackVersion: P5_ENGINE_VERSION, createdAt: snapshot.asOf, merchantSnapshot: { fingerprint: snapshotFingerprint(snapshot), sourceReferences: snapshot.sourceReferences || [] }, versionBundle, currentEconomics, counterfactuals, eligibility, achievability, probability, friction, strategy, decision, policies };
}

export function validateOutcome(outcome) {
  const errors = [];
  if (!outcome?.evaluationFingerprint) errors.push('outcome_evaluation_fingerprint_required');
  if (outcome?.realizedSavingsMinor != null && (!Number.isSafeInteger(outcome.realizedSavingsMinor))) errors.push('invalid_realized_savings');
  if (outcome?.realizedAt && Number.isNaN(Date.parse(outcome.realizedAt))) errors.push('invalid_realized_at');
  return { ok: errors.length === 0, errors };
}

function weakestConfidence(...values) {
  const rank = { LOW: 0, MEDIUM: 1, HIGH: 2 };
  return values.filter(Boolean).sort((a, b) => (rank[a] ?? 0) - (rank[b] ?? 0))[0] || 'LOW';
}

function uniqueReferences(values) {
  return [...new Set(values.flat().filter(Boolean).map(String))].sort();
}

/**
 * Builds the canonical P5 representation from explicit P1-P4 inputs.
 * It is deliberately pure: persistence and any P6+ execution remain adapters.
 */
export function buildCanonicalOpportunity({ snapshot, currentTerms, candidate, candidateTerms, p2Facts, benchmarkEvidence, transitionCostMinor = null, implementationCostMinor = null, realizationProbabilityPpm = null, versionBundle = {}, merchantContextReference, mode = 'SHADOW' }) {
  invariant(P5_MODES.includes(mode), 'invalid_p5_mode');
  invariant(merchantContextReference, 'merchant_context_reference_required');
  const currentEvidence = uniqueReferences([snapshot?.sourceReferences || [], currentTerms?.evidenceReferences || []]);
  if (!currentEvidence.length) return { status: 'NO_OPPORTUNITY', reasonCodes: ['CURRENT_MERCHANT_EVIDENCE_REQUIRED'] };
  if (!candidate || !candidateTerms) return { status: 'NO_OPPORTUNITY', reasonCodes: ['COMPARABLE_TARGET_REQUIRED'] };

  const eligibility = assessEligibility(candidate, p2Facts || {});
  const achievability = estimateAchievableTerms({ benchmark: benchmarkEvidence, proposedTerms: candidateTerms });
  const economics = counterfactualEconomics({ snapshot, currentTerms, candidateTerms, transitionCostMinor, implementationCostMinor });
  if (economics.unresolvedComponents.length) return { status: 'NO_OPPORTUNITY', reasonCodes: ['MATERIAL_RATE_INPUT_UNRESOLVED'], unresolvedComponents: economics.unresolvedComponents };
  if (economics.grossModeledSavingsMinor <= 0) return { status: 'NO_OPPORTUNITY', reasonCodes: ['NO_POSITIVE_THEORETICAL_SAVINGS'] };

  const blockers = [];
  if (eligibility.status !== 'ELIGIBLE') blockers.push(`ELIGIBILITY_${eligibility.status}`);
  if (achievability.status !== 'ESTIMATED' || !achievability.terms) blockers.push('TARGET_NOT_ACTIONABLY_EVIDENCED');
  if (transitionCostMinor == null) blockers.push('TRANSITION_COST_UNKNOWN');
  if (realizationProbabilityPpm == null) blockers.push('REALIZATION_PROBABILITY_UNKNOWN');
  if (realizationProbabilityPpm != null) invariant(Number.isSafeInteger(realizationProbabilityPpm) && realizationProbabilityPpm >= 0 && realizationProbabilityPpm <= 1_000_000, 'invalid_realization_probability_ppm');

  const actionable = blockers.some(code => code.startsWith('ELIGIBILITY_') || ['TARGET_NOT_ACTIONABLY_EVIDENCED', 'TRANSITION_COST_UNKNOWN'].includes(code))
    ? null
    : Math.max(0, economics.netModeledSavingsMinor);
  const recoverable = actionable == null || realizationProbabilityPpm == null ? null : minor(rateFee(actionable, realizationProbabilityPpm));
  const confidence = weakestConfidence(economics.currentEconomics.confidence, economics.counterfactualEconomics.confidence, achievability.confidence, eligibility.status === 'ELIGIBLE' ? 'HIGH' : 'LOW');
  const opportunityType = recoverable != null ? 'RECOVERABLE' : actionable != null ? (candidate.type === 'MIGRATE_PROVIDER' ? 'MIGRATABLE' : 'ACTIONABLE') : candidate.type === 'RENEGOTIATE_CURRENT_PROVIDER' ? 'NEGOTIABLE' : 'THEORETICAL';
  const versions = createVersionBundle(versionBundle);
  const fingerprint = evaluationFingerprint({ snapshot, candidate, versionBundle: versions });
  const evidenceReferences = uniqueReferences([currentEvidence, candidateTerms.evidenceReferences || [], benchmarkEvidence?.reference || []]);
  const dependencyReferences = uniqueReferences([merchantContextReference, evidenceReferences, benchmarkEvidence?.modelVersion || [], currentTerms.pricingVersion || [], candidateTerms.pricingVersion || []]);
  const expectedValueMinor = recoverable ?? actionable ?? economics.grossModeledSavingsMinor;
  const score = scoreOpportunity({ expectedValueMinor, probability: realizationProbabilityPpm == null ? { band: 'UNKNOWN' } : { point: realizationProbabilityPpm / 1_000_000 }, friction: { frictionBand: transitionCostMinor == null ? 'UNKNOWN' : 'LOW' }, confidence });

  return {
    status: 'OPPORTUNITY',
    record: {
      opportunity_key: fingerprint,
      merchant_context_reference: merchantContextReference,
      merchant_snapshot_fingerprint: snapshotFingerprint(snapshot),
      market: snapshot.country,
      currency: snapshot.currency,
      source_provider_id: currentTerms.providerId,
      source_product_id: currentTerms.productId || null,
      source_rate_reference: currentTerms.pricingVersion,
      target_provider_id: candidateTerms.providerId,
      target_product_id: candidateTerms.productId || null,
      target_rate_reference: candidateTerms.pricingVersion,
      benchmark_reference: benchmarkEvidence?.reference || null,
      current_annual_cost_minor: economics.currentEconomics.totalMinor,
      target_annual_cost_minor: economics.counterfactualEconomics.totalMinor,
      gross_theoretical_savings_minor: economics.grossModeledSavingsMinor,
      actionable_savings_minor: actionable,
      expected_recoverable_savings_minor: recoverable,
      annualized_savings_minor: recoverable ?? actionable ?? economics.grossModeledSavingsMinor,
      realization_probability_ppm: realizationProbabilityPpm,
      confidence,
      evidence_completeness: actionable == null ? 'PARTIAL' : 'COMPLETE',
      opportunity_type: opportunityType,
      priority_score: score.score,
      status: mode,
      assumptions: [...economics.currentEconomics.assumptions, ...economics.counterfactualEconomics.assumptions],
      blockers,
      recommended_next_action: blockers.length ? 'RESOLVE_BLOCKERS' : candidate.type === 'MIGRATE_PROVIDER' ? 'REVIEW_MIGRATION' : 'PREPARE_NEGOTIATION',
      evidence_references: evidenceReferences,
      dependency_references: dependencyReferences,
      version_bundle: versions,
      calculation_version: P5_ENGINE_VERSION,
      policy_version: P5_POLICY_VERSION,
      generated_at: snapshot.asOf,
      audit_trail: { eligibility, achievability, economics, candidate, decisionBoundary: 'P5_INTELLIGENCE_ONLY_NO_EXECUTION' },
    },
  };
}

export function buildCanonicalOpportunities({ alternatives = [], ...shared }) {
  const seen = new Set();
  return alternatives.flatMap(alternative => {
    const candidate = alternative.candidate;
    if (!candidate || seen.has(candidate.candidateId)) return [];
    seen.add(candidate.candidateId);
    const result = buildCanonicalOpportunity({ ...shared, ...alternative });
    return result.status === 'OPPORTUNITY' ? [result.record] : [];
  });
}
