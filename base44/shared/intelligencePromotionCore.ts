// DASHBOARD-C10 (2026-08-17) — the missing middle of the pricing intelligence chain.
//
// WHAT C10 VERIFIED, correcting C0's INT-2 ("ProviderPricingVersion is written by no
// production path"). The truth is more specific and more useful:
//
//   1. `rateIntelligenceWatchWorker` runs every 6h, detects that a provider's pricing
//      page changed, and writes a `RateChangeCandidate`. It is ALREADY honest: it
//      creates candidates directly in REVIEW_REQUIRED with the reason codes
//      SOURCE_CONTENT_CHANGED and NO_DETERMINISTIC_RATE_EXTRACTION_PROMOTION, and it
//      refuses to derive a price from unstructured text.
//   2. NOTHING READS THOSE CANDIDATES. Not one call site. Change detection has been
//      running into a dead-end table: candidates accumulate in REVIEW_REQUIRED and no
//      path — human or automatic — can resolve one.
//   3. `canAutoPromote` — the predicate that decides whether a candidate may become
//      pricing truth — is exported and tested and called by NO production code. Same
//      shape as the C8 defect where `consolidate` was written and never wired.
//   4. So `ProviderPricingVersion` has no creator except a seed, because the only path
//      that could legitimately create one did not exist.
//
// TWO FINDINGS ABOUT THE FINGERPRINT, which is the rule this whole chain rests on.
// P12_INTELLIGENCE_ARCHITECTURE.md states: "semantic pricing hashes include economic
// dimensions, not presentation/source copy, so copy-only changes do not become pricing
// changes."
//
//   a. The watcher stores the NORMALIZED CONTENT HASH in the candidate's
//      `semantic_fingerprint` field. A content hash is a value from the wrong domain:
//      any copy-only edit changes it, so it cannot answer "did the economics change?".
//   b. `semanticFingerprint` in src/lib/p3RateIntelligence.js includes
//      `source_snapshot_id` in the hashed payload. Two observations with IDENTICAL
//      economics from two different snapshots therefore produce different
//      fingerprints — which defeats exactly the property the doc claims. The existing
//      test only asserts determinism and order-stability, so it does not catch this.
//      There is also no fingerprint function in the backend module at all.
//
// `economicFingerprint` below is the fingerprint the copy-only rule needs. It is
// deliberately a DIFFERENT function with a different name rather than a change to the
// existing one, because the existing value may already be persisted and silently
// redefining a stored hash is its own defect.
//
// THE FAIL-CLOSED CORE: a candidate whose extraction is unstructured can never be
// promoted, by any caller, for any reason. A changed page is not a price.

import { readRuntimeSource } from './runtimeSourceRead.ts';
import { nullableNumber } from './nullableNumber.ts';
import {
  canAutoPromote, stableSerialize, sha256, validateObservation, VERIFIED_STATUSES,
} from './p3RateIntelligence.ts';

export const INTELLIGENCE_PROMOTION_VERSION = 'intelligence-promotion-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();
const READ_LIMIT = 2000;

/** Candidate states that are still open and therefore adjudicable. */
export const OPEN_CANDIDATE_STATES = Object.freeze([
  'DETECTED', 'EXTRACTED', 'VALIDATED', 'AUTO_PROMOTABLE', 'REVIEW_REQUIRED', 'CONFLICT',
] as const);

/** Candidate states that are closed. Adjudicating one again would rewrite a decision. */
export const CLOSED_CANDIDATE_STATES = Object.freeze(['PROMOTED', 'REJECTED', 'FAILED'] as const);

/**
 * The extraction status that can never be promoted.
 *
 * The watcher sets this when all it observed was that the page content changed. There is
 * no number in it. Promoting it would invent a price.
 */
export const UNPROMOTABLE_EXTRACTION = 'UNSTRUCTURED_CHANGE_ONLY';

const normArray = (value: unknown) =>
  [...new Set((Array.isArray(value) ? value : []).filter(Boolean).map(String))].sort();

/**
 * A fingerprint over ECONOMIC dimensions only.
 *
 * Excludes `source_snapshot_id`, the source url, retrieval timestamps and every
 * presentation field, so two observations that mean the same money produce the same
 * fingerprint no matter which snapshot they came from. That is the whole point of the
 * copy-only rule, and it is why this is not `semanticFingerprint`.
 */
export async function economicFingerprint(input: {
  observation: any;
  components?: any[];
  conditions?: any[];
}): Promise<string> {
  const o = input.observation || {};
  const normalized = {
    provider_id: o.provider_id || null,
    provider_slug: o.provider_slug || null,
    provider_legal_entity_id: o.provider_legal_entity_id || null,
    provider_product_id: o.provider_product_id || null,
    market: o.market || o.country || null,
    channel: o.channel || null,
    payment_method_id: o.payment_method_id || null,
    pricing_plan_id: o.pricing_plan_id || null,
    card_scope_id: o.card_scope_id || null,
    pricing_model: o.pricing_model || null,
    pricing_visibility: o.pricing_visibility || null,
    scope_type: o.scope_type || null,
    applicable_markets: normArray(o.applicable_markets),
    excluded_markets: normArray(o.excluded_markets),
    effective_from: o.effective_from || null,
    effective_to: o.effective_to || null,
    currency: o.currency || null,
    variable_rate_bps: nullableNumber(o.variable_rate_bps),
    fixed_fee_minor: nullableNumber(o.fixed_fee_minor),
    monthly_fee_minor: nullableNumber(o.monthly_fee_minor),
    components: [...(input.components || [])].map((c: any) => ({
      component_type: c.component_type, fee_layer: c.fee_layer || null,
      percentage_ppm: nullableNumber(c.percentage_ppm), amount_minor: nullableNumber(c.amount_minor),
      currency: c.currency || null,
      minimum_amount_minor: nullableNumber(c.minimum_amount_minor),
      maximum_amount_minor: nullableNumber(c.maximum_amount_minor),
      unit_basis: c.unit_basis || null, value_mode: c.value_mode || null,
      condition_json: c.condition_json || null,
    })).sort((a, b) => stableSerialize(a).localeCompare(stableSerialize(b))),
    conditions: [...(input.conditions || [])].map((c: any) => ({
      condition_type: c.condition_type, operator: c.operator || null,
      value_json: c.value_json || null, normalized_text: c.normalized_text || null,
    })).sort((a, b) => stableSerialize(a).localeCompare(stableSerialize(b))),
  };
  return sha256(normalized);
}

export type CandidateClassification = {
  candidate_id: string;
  state: 'REVIEW_REQUIRED' | 'AUTO_PROMOTABLE' | 'REJECTED' | 'CONFLICT' | 'CLOSED';
  /** Whether a promotion may be attempted at all. Never true without extracted economics. */
  promotable: boolean;
  copy_only: boolean;
  reason_codes: string[];
  /** What the adjudicator is being asked to decide, in words. */
  decision_note: string;
  extracted_observation: any | null;
  economic_fingerprint: string | null;
  current_version_id: string | null;
  current_is_verified: boolean;
};

/**
 * Classifies one candidate against the current pricing version.
 *
 * Order matters and is deliberate: the unstructured refusal comes FIRST, before any
 * validation or promotion logic, so no later branch can reach a promotable verdict for
 * a candidate that contains no numbers.
 */
export async function classifyCandidate(input: {
  candidate: any;
  currentVersion?: any | null;
  components?: any[];
  conditions?: any[];
}): Promise<CandidateClassification> {
  const candidate = input.candidate || {};
  const state = text(candidate.state).toUpperCase();
  const existingReasons = (Array.isArray(candidate.reason_codes) ? candidate.reason_codes : []).map(text);
  const current = input.currentVersion || null;
  const currentVerified = Boolean(current)
    && (VERIFIED_STATUSES as readonly string[]).includes(text(current.verification_status).toUpperCase());

  const base = {
    candidate_id: text(candidate.id),
    extracted_observation: null as any,
    economic_fingerprint: null as string | null,
    current_version_id: current ? text(current.id) : null,
    current_is_verified: currentVerified,
  };

  if ((CLOSED_CANDIDATE_STATES as readonly string[]).includes(state)) {
    return {
      ...base, state: 'CLOSED', promotable: false, copy_only: false,
      reason_codes: [...existingReasons, 'candidate_already_closed'],
      decision_note: `This candidate was already resolved as ${state}. Re-adjudicating it would rewrite a recorded decision.`,
    };
  }

  const payload = candidate.candidate_observation_json || {};
  const extractionStatus = text(payload.semantic_extraction_status).toUpperCase();

  // FAIL-CLOSED, FIRST. A changed page is not a price.
  if (extractionStatus === UNPROMOTABLE_EXTRACTION || !payload.observation) {
    return {
      ...base, state: 'REVIEW_REQUIRED', promotable: false, copy_only: false,
      reason_codes: [...new Set([...existingReasons, 'no_deterministic_extraction'])],
      decision_note: 'The source page changed but no pricing was extracted from it. '
        + 'This candidate carries no numbers, so it can only be researched or dismissed — '
        + 'never promoted. Promoting it would invent a price.',
    };
  }

  const observation = payload.observation;
  const components = input.components || payload.components || [];
  const conditions = input.conditions || payload.conditions || [];

  const validation = validateObservation(observation, components);
  const fingerprint = await economicFingerprint({ observation, components, conditions });

  if (!validation.ok) {
    return {
      ...base, extracted_observation: observation, economic_fingerprint: fingerprint,
      state: 'REVIEW_REQUIRED', promotable: false, copy_only: false,
      reason_codes: [...new Set([...existingReasons, ...validation.errors.map((e: string) => `invalid:${e}`)])],
      decision_note: `The extracted observation does not validate (${validation.errors.length} problem(s)). It cannot become pricing truth until it does.`,
    };
  }

  // The copy-only rule. Same economics means no pricing change happened, whatever the
  // page did. This is the check the content-hash fingerprint could never perform.
  const currentFingerprint = current
    ? await economicFingerprint({
      observation: current, components: input.components || [], conditions: input.conditions || [],
    })
    : null;

  if (currentFingerprint && currentFingerprint === fingerprint) {
    return {
      ...base, extracted_observation: observation, economic_fingerprint: fingerprint,
      state: 'REJECTED', promotable: false, copy_only: true,
      reason_codes: [...new Set([...existingReasons, 'copy_only_change'])],
      decision_note: 'The economics are identical to the current version. The page changed its wording, '
        + 'not its prices, so nothing is promoted and the current version stands.',
    };
  }

  const promotable = canAutoPromote({
    source_authority: payload.source_authority,
    market_unambiguous: payload.market_unambiguous,
    product_unambiguous: payload.product_unambiguous,
    channel_unambiguous: payload.channel_unambiguous,
    currency_valid: payload.currency_valid,
    temporal_valid: payload.temporal_valid,
    parser_confidence: payload.parser_confidence,
    no_conflict: payload.no_conflict,
    invariants_ok: payload.invariants_ok,
  } as any);

  // A change to VERIFIED pricing is a review point by doctrine, not an automatic write,
  // however clean the signals look.
  if (currentVerified) {
    return {
      ...base, extracted_observation: observation, economic_fingerprint: fingerprint,
      state: 'CONFLICT', promotable: true, copy_only: false,
      reason_codes: [...new Set([...existingReasons, 'supersedes_verified_pricing'])],
      decision_note: 'This would supersede pricing that is currently VERIFIED. The historical fact is never '
        + 'mutated; promoting records a new version and marks the old one superseded, and raises a conflict '
        + 'for impact review.',
    };
  }

  return {
    ...base, extracted_observation: observation, economic_fingerprint: fingerprint,
    state: promotable ? 'AUTO_PROMOTABLE' : 'REVIEW_REQUIRED',
    promotable: true, copy_only: false,
    reason_codes: promotable
      ? [...new Set([...existingReasons, 'signals_unambiguous'])]
      : [...new Set([...existingReasons, 'signals_insufficient_for_automatic_promotion'])],
    decision_note: promotable
      ? 'Primary source, unambiguous scope, valid currency and temporal bounds, no conflict. Promotable.'
      : 'The extracted pricing validates, but the promotion signals do not meet the automatic bar. '
        + 'An operator may promote it explicitly; nothing promotes on its own.',
  };
}

/**
 * Reads the open candidates and classifies each one.
 *
 * This is the surface that did not exist. Without it the watcher's output was
 * unreachable: candidates accumulated and nothing could act on them.
 */
export async function buildPromotionQueue(input: {
  svc: any;
  limit?: number;
}) {
  const limit = Math.min(Math.max(Number(input.limit) || 100, 1), READ_LIMIT);
  const candidatesRead = await readRuntimeSource<any[]>({
    source: 'RateChangeCandidate',
    read: () => input.svc.entities.RateChangeCandidate.list('-detected_at', limit),
    fallback: [], limit,
  });

  const rows = candidatesRead.status === 'UNAVAILABLE' ? [] : (candidatesRead.value || []);
  const open = rows.filter((row: any) => !(CLOSED_CANDIDATE_STATES as readonly string[])
    .includes(text(row.state).toUpperCase()));

  const classified = [];
  for (const candidate of open) {
    let current: any = null;
    if (text(candidate.current_observation_id)) {
      try {
        const found = await input.svc.entities.ProviderPricingVersion.filter(
          { id: text(candidate.current_observation_id) }, '-created_date', 1,
        );
        current = Array.isArray(found) ? found[0] : null;
      } catch {
        // An unreadable current version is not an absent one, and classifying against
        // "no current version" would look like a first observation rather than a change.
        classified.push({
          candidate_id: text(candidate.id), state: 'REVIEW_REQUIRED', promotable: false,
          copy_only: false, reason_codes: ['current_version_unreadable'],
          decision_note: 'The current pricing version could not be read, so this change cannot be assessed against it.',
          extracted_observation: null, economic_fingerprint: null,
          current_version_id: text(candidate.current_observation_id), current_is_verified: false,
        });
        continue;
      }
    }
    classified.push(await classifyCandidate({ candidate, currentVersion: current }));
  }

  return {
    ok: true as const,
    source_status: candidatesRead.status,
    // null, not 0, when the source could not be read.
    candidates_read: candidatesRead.status === 'UNAVAILABLE' ? null : rows.length,
    open_count: candidatesRead.status === 'UNAVAILABLE' ? null : open.length,
    truncated: candidatesRead.truncated,
    rows: classified,
    promotable_count: classified.filter((row) => row.promotable).length,
    unpromotable_reason_summary: summarizeReasons(classified),
  };
}

function summarizeReasons(rows: Array<{ promotable: boolean; reason_codes: string[] }>) {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (row.promotable) continue;
    for (const code of row.reason_codes) counts[code] = (counts[code] || 0) + 1;
  }
  return counts;
}

/**
 * Previews a promotion.
 *
 * Refuses before it computes anything if the candidate is not promotable, so the refusal
 * cannot be bypassed by calling apply directly with a hand-made hash.
 */
export async function previewPromotion(input: {
  svc: any;
  candidate_id: string;
  sha256: (value: unknown) => Promise<string>;
}) {
  const candidateId = text(input.candidate_id);
  if (!candidateId) return { ok: false, error: 'candidate_id_required' };

  let candidate: any = null;
  try {
    const found = await input.svc.entities.RateChangeCandidate.filter({ id: candidateId }, '-created_date', 1);
    candidate = Array.isArray(found) ? found[0] : null;
  } catch {
    return { ok: false, error: 'candidate_unreadable' };
  }
  if (!candidate) return { ok: false, error: 'candidate_not_found' };

  let current: any = null;
  if (text(candidate.current_observation_id)) {
    try {
      const found = await input.svc.entities.ProviderPricingVersion.filter(
        { id: text(candidate.current_observation_id) }, '-created_date', 1,
      );
      current = Array.isArray(found) ? found[0] : null;
    } catch {
      return { ok: false, error: 'current_version_unreadable' };
    }
  }

  const classification = await classifyCandidate({ candidate, currentVersion: current });
  if (!classification.promotable) {
    return {
      ok: false,
      error: 'candidate_not_promotable',
      reason: classification.decision_note,
      reason_codes: classification.reason_codes,
      classification,
    };
  }

  const preview = {
    candidate_id: candidateId,
    creates_version: {
      pricing_key: text(classification.extracted_observation.pricing_key)
        || `p3:${text(candidate.provider_id)}:${text(candidate.market)}`,
      provider_slug: text(classification.extracted_observation.provider_slug),
      market: text(classification.extracted_observation.market || classification.extracted_observation.country),
      // A promoted observation is never born VERIFIED. Verification is a separate act
      // with its own evidence.
      knowledge_state: 'observed',
      status: 'CURRENT',
      truth_level: 'observed',
      verification_status: 'RESEARCHED',
      semantic_fingerprint: classification.economic_fingerprint,
    },
    supersedes: classification.current_version_id,
    supersedes_verified: classification.current_is_verified,
    raises_conflict: classification.current_is_verified,
    mutates_history: false,
    reason_codes: classification.reason_codes,
    decision_note: classification.decision_note,
  };

  return { ok: true, preview, preview_hash: await input.sha256(preview), classification };
}

/**
 * Applies a previewed promotion.
 *
 * Creates a NEW version and marks the old one superseded. The old row's economics are
 * never touched: superseding is additive, and a corrected price does not erase the price
 * that was true last month — decisions were made on it.
 */
export async function applyPromotion(input: {
  svc: any;
  actor: string;
  candidate_id: string;
  expected_preview_hash: string;
  reason: string;
  now: string;
  sha256: (value: unknown) => Promise<string>;
}) {
  if (!text(input.reason)) return { ok: false, error: 'reason_required' };

  const previewed = await previewPromotion({
    svc: input.svc, candidate_id: input.candidate_id, sha256: input.sha256,
  });
  if (!previewed.ok) return previewed;
  if (previewed.preview_hash !== text(input.expected_preview_hash)) {
    return {
      ok: false, error: 'preview_hash_mismatch',
      reason: 'The candidate or the current version changed since it was previewed.',
      current_preview_hash: previewed.preview_hash,
    };
  }

  const classification = previewed.classification!;
  const observation = classification.extracted_observation;
  const nextVersion = (nullableNumber(observation.version) ?? 0) + 1;

  let created: any = null;
  try {
    created = await input.svc.entities.ProviderPricingVersion.create({
      ...observation,
      pricing_key: previewed.preview!.creates_version.pricing_key,
      knowledge_state: 'observed',
      status: 'CURRENT',
      truth_level: 'observed',
      verification_status: 'RESEARCHED',
      semantic_fingerprint: classification.economic_fingerprint,
      supersedes_observation_id: classification.current_version_id,
      version: nextVersion,
      recorded_at: input.now,
      promotion_policy_version: observation.promotion_policy_version || null,
      manual_override: false,
    });
  } catch (error: any) {
    return { ok: false, error: 'version_create_failed', reason: text(error?.message) || null };
  }

  // Supersede the old version. If this fails the new version exists without the old one
  // being retired, which would leave TWO rows claiming CURRENT — reported, not hidden.
  let supersededOld = true;
  if (classification.current_version_id) {
    try {
      await input.svc.entities.ProviderPricingVersion.update(classification.current_version_id, {
        status: 'SUPERSEDED',
        knowledge_state: 'superseded',
        superseded_by_observation_id: text(created?.id),
        retired_at: input.now,
      });
    } catch {
      supersededOld = false;
    }
  }

  let conflictId: string | null = null;
  if (classification.current_is_verified) {
    try {
      const conflict = await input.svc.entities.KnowledgeConflict.create({
        conflict_key: `p3-promotion:${text(input.candidate_id)}`,
        semantic_key: classification.economic_fingerprint,
        provider_slug: text(observation.provider_slug),
        provider_id: text(observation.provider_id),
        country: text(observation.market || observation.country),
        status: 'OPEN',
        severity: 'HIGH',
        reason: 'A promoted observation supersedes pricing that was VERIFIED. Impact review required.',
        affects_active_operation: true,
        created_at: input.now,
      });
      conflictId = text(conflict?.id) || null;
    } catch {
      conflictId = null;
    }
  }

  try {
    await input.svc.entities.RateChangeCandidate.update(text(input.candidate_id), {
      state: 'PROMOTED',
      current_observation_id: text(created?.id),
      resolved_at: input.now,
      reason_codes: [...classification.reason_codes, 'promoted_by_operator'],
    });
  } catch {
    // The version exists; the candidate could not be closed. Reported so the queue is
    // not silently re-offering a candidate that was already acted on.
    return {
      ok: true, version_id: text(created?.id), candidate_closed: false,
      superseded_previous: supersededOld, conflict_id: conflictId,
      warning: 'candidate_state_not_updated',
      actor: input.actor, at: input.now,
    };
  }

  return {
    ok: true,
    version_id: text(created?.id),
    candidate_closed: true,
    superseded_previous: supersededOld,
    two_rows_claim_current: classification.current_version_id ? !supersededOld : false,
    conflict_id: conflictId,
    conflict_required: classification.current_is_verified,
    // Stated on every promotion: the old fact still exists.
    history_mutated: false,
    actor: input.actor,
    at: input.now,
    reason: text(input.reason),
  };
}

/**
 * Rejects a candidate with a stated reason.
 *
 * The path an unstructured candidate needs: it can never be promoted, so without a way
 * to close it the queue would fill with rows nobody can clear.
 */
export async function rejectCandidate(input: {
  svc: any;
  actor: string;
  candidate_id: string;
  reason: string;
  now: string;
}) {
  if (!text(input.candidate_id)) return { ok: false, error: 'candidate_id_required' };
  if (!text(input.reason)) return { ok: false, error: 'reason_required' };

  let candidate: any = null;
  try {
    const found = await input.svc.entities.RateChangeCandidate.filter({ id: text(input.candidate_id) }, '-created_date', 1);
    candidate = Array.isArray(found) ? found[0] : null;
  } catch {
    return { ok: false, error: 'candidate_unreadable' };
  }
  if (!candidate) return { ok: false, error: 'candidate_not_found' };
  if ((CLOSED_CANDIDATE_STATES as readonly string[]).includes(text(candidate.state).toUpperCase())) {
    return { ok: false, error: 'candidate_already_closed', state: text(candidate.state) };
  }

  try {
    await input.svc.entities.RateChangeCandidate.update(text(input.candidate_id), {
      state: 'REJECTED',
      resolved_at: input.now,
      reason_codes: [
        ...(Array.isArray(candidate.reason_codes) ? candidate.reason_codes : []),
        'rejected_by_operator',
      ],
    });
  } catch (error: any) {
    return { ok: false, error: 'candidate_update_failed', reason: text(error?.message) || null };
  }

  return {
    ok: true, candidate_id: text(input.candidate_id), state: 'REJECTED',
    actor: input.actor, at: input.now, reason: text(input.reason),
    // Rejecting a candidate changes no pricing. Stated so the action is not mistaken
    // for a decision about the price itself.
    pricing_changed: false,
  };
}
