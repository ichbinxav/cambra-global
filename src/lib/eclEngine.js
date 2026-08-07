// v62.5 — ECL P3: the Evidence Lifecycle Engine (canonical, pure).
//
// ONE pure function — runEclEngine — takes NormalizedEvidence + the ECL policy
// + an injected context and produces a fully-traceable DECISION: the finalized
// ConfidenceResult (via the P2 gate layer, exclusively), the lifecycle
// transition, and the record INTENTS (events, review cases, strikes) matching
// the P1 schemas. It performs NO I/O and reads NO clock: `now` is injected,
// and replaying the same inputs yields byte-identical outputs and hashes.
//
// FAIL-CLOSED DOCTRINE: any ambiguity, contradiction, unreadable evidence or
// blocked critical gate routes to under_review with a ReviewCase intent.
// Nothing is ever inferred favorably; nothing here touches billing — the
// economic gates stay exactly where P2 put them.
//
// base44/shared/generated/eclDomain.ts is GENERATED from this file.

import { deepFreeze, sha256Hex, stableSerialize, hashConfidenceResult } from "./eclSerialize.js";
import { finalizeConfidenceResult } from "./eclGates.js";
import { buildLifecycleTransition, deriveProvisionalExpiry, resolveExpiry, canTransition, isTerminalStatus } from "./eclLifecycle.js";
import { reconcileEvidence } from "./eclReconcile.js";
import { countActiveStrikesByScope, buildStrikeIntent, scopesRequiringEscalation, strikeScopeForDomain } from "./eclStrikes.js";

export const ECL_ENGINE_VERSION = "ecl-engine-1";
export const ECL_RULESET_VERSION = "ecl-rules-1";

export class EclEngineError extends Error {
  constructor(message) {
    super(message);
    this.name = "EclEngineError";
  }
}

const enRequire = (cond, msg) => {
  if (!cond) throw new EclEngineError(msg);
};
const enNonEmpty = (v) => typeof v === "string" && v.length > 0;

// sourceType → verification method. manual_declaration is independent of
// nothing: with an attestation it is attested_only, without one it is none.
const METHOD_BY_SOURCE = {
  api: "independent_api",
  provider_statement: "independent_document",
  bank_statement: "independent_document",
  commerce_export: "independent_document",
  accounting_export: "independent_document",
  fec: "independent_document",
  manual_declaration: null,
};

const CORE_METRICS_BY_DOMAIN = {
  payments: ["grossAmountMinor", "feesAmountMinor"],
  commerce: ["grossSalesAmountMinor"],
  accounting: [],
};

function deriveVerificationMethod(evidence, hasAttestation) {
  const mapped = METHOD_BY_SOURCE[evidence.sourceType];
  if (mapped) return mapped;
  if (evidence.sourceType === "manual_declaration") return hasAttestation === true ? "attested_only" : "none";
  return "none";
}

/**
 * Deterministic confidence classification (ruleset ecl-rules-1). Every rule
 * that RAN is either in passedRules or failedRules — a rule that could not run
 * (missing reference) is deliberately in neither, so absence is visible.
 */
export function classifyConfidence(evidence, reconciliation, options) {
  const opts = options && typeof options === "object" ? options : {};
  const passedRules = [];
  const failedRules = [];
  const warnings = [...(evidence.normalizationWarnings || [])];

  const invalids = evidence.invalidFields || [];
  if (invalids.length === 0) passedRules.push("E-01_fields_valid");
  else failedRules.push({ id: "E-01_fields_valid", detail: invalids.map((v) => `${v.field}:${v.reason}`).join("; ") });

  const core = CORE_METRICS_BY_DOMAIN[evidence.domain] || [];
  const metrics = evidence.metrics || {};
  const missingCore = core.filter((m) => metrics[m] === undefined);
  const accountingEmpty = evidence.domain === "accounting" && (!Array.isArray(evidence.entries) || evidence.entries.length === 0);
  if (missingCore.length === 0 && !accountingEmpty) passedRules.push("E-02_core_metrics_present");
  else failedRules.push({ id: "E-02_core_metrics_present", detail: accountingEmpty ? "no readable ledger entries" : `missing: ${missingCore.join(", ")}` });

  if (evidence.currency && evidence.periodStart && evidence.periodEnd) passedRules.push("E-03_envelope_complete");
  else failedRules.push({ id: "E-03_envelope_complete", detail: `missing: ${["currency", "periodStart", "periodEnd"].filter((k) => !evidence[k]).join(", ")}` });

  if (reconciliation.contradictions.length === 0) passedRules.push("E-04_no_contradictions");
  else failedRules.push({ id: "E-04_no_contradictions", detail: reconciliation.contradictions.map((c) => c.code).join("; ") });

  if (reconciliation.crossChecks.length > 0) {
    if (reconciliation.crossChecks.every((c) => c.withinTolerance)) passedRules.push("E-05_cross_domain_agreement");
    else failedRules.push({ id: "E-05_cross_domain_agreement", detail: "cross-domain gross delta beyond tolerance" });
  }

  // Internal fee coherence: declared feeRateBps vs the rate the amounts imply.
  const gross = metrics.grossAmountMinor;
  const fees = metrics.feesAmountMinor;
  const declaredBps = metrics.feeRateBps;
  if (typeof gross === "number" && gross > 0 && typeof fees === "number" && typeof declaredBps === "number") {
    const impliedBps = (fees / gross) * 10000;
    if (Math.abs(impliedBps - declaredBps) <= Math.max(1, declaredBps * 0.05)) passedRules.push("E-06_fee_rate_coherent");
    else failedRules.push({ id: "E-06_fee_rate_coherent", detail: `declared ${declaredBps}bps vs implied ${Math.round(impliedBps)}bps` });
  }

  // Plausibility vs an injected reference rate — runs ONLY when the caller
  // supplies one; the engine never invents a benchmark.
  if (typeof opts.referenceFeeRateBps === "number" && opts.referenceFeeRateBps > 0 && typeof declaredBps === "number") {
    const maxMultiple = opts.feeVsRateTableMaxMultiple;
    enRequire(typeof maxMultiple === "number" && maxMultiple > 0, "plausibility multiple must come from the policy (no fallback)");
    if (declaredBps <= opts.referenceFeeRateBps * maxMultiple) passedRules.push("E-07_fee_plausible");
    else failedRules.push({ id: "E-07_fee_plausible", detail: `${declaredBps}bps exceeds ${maxMultiple}× reference ${opts.referenceFeeRateBps}bps` });
  }

  const method = deriveVerificationMethod(evidence, opts.hasAttestation);
  const failedIds = failedRules.map((r) => r.id);
  const structurallySound = !failedIds.includes("E-01_fields_valid") && !failedIds.includes("E-02_core_metrics_present") && !failedIds.includes("E-03_envelope_complete");
  const noConflicts = !failedIds.includes("E-04_no_contradictions") && !failedIds.includes("E-05_cross_domain_agreement") && !failedIds.includes("E-07_fee_plausible");

  let confidenceLevel = "unknown";
  const nothingReadable = Object.keys(metrics).length === 0 && (!Array.isArray(evidence.entries) || evidence.entries.length === 0);
  if (!nothingReadable) {
    if (!structurallySound || !noConflicts) confidenceLevel = "low";
    else if (method === "independent_api" || method === "independent_document") confidenceLevel = "high";
    else if (method === "attested_only") confidenceLevel = "medium";
    else confidenceLevel = "low";
  }

  return deepFreeze({
    ruleSetVersion: ECL_RULESET_VERSION,
    confidenceLevel,
    verificationMethod: method,
    passedRules,
    failedRules,
    warnings,
    nothingReadable,
  });
}

function reviewIntent(identity, reasonCode, severity, blockingActions, correlationId, extra) {
  const idempotencyKey = `eclp3:${sha256Hex(
    stableSerialize({ kind: "review_case", brandId: identity.brandId, evidenceEntityType: identity.evidenceEntityType, evidenceId: identity.evidenceId, reasonCode, correlationId }),
  ).slice(0, 40)}`;
  const record = {
    brand_id: identity.brandId,
    owner_email: identity.ownerEmail,
    reason_code: reasonCode,
    severity,
    status: "open",
    idempotency_key: idempotencyKey,
    evidence_entity_type: identity.evidenceEntityType,
    evidence_id: identity.evidenceId,
    blocking_actions: { actions: blockingActions, descriptive_only: false, ...(extra && typeof extra === "object" ? extra : {}) },
  };
  return { idempotencyKey, record };
}

/**
 * THE ENGINE. input = {
 *   identity: { evidenceEntityType, evidenceId, brandId, ownerEmail },
 *   evidence: NormalizedEvidence (from the P2 normalizers),
 *   existing: [{ id, status, evidence }],
 *   state:   { status, provisionalStartedAt?, expiresAt? }  — current lifecycle state,
 *   strikes: [ EvidenceStrike rows ],
 *   context: { now, hasAttestation, baselineLocked, hasBlockingReviewCase, referenceFeeRateBps? },
 *   actor:   "system" | "user" | "reviewer",
 * }
 * Returns a deep-frozen, hashable DECISION. Throws EclEngineError on missing
 * inputs — a guess here would silently answer a question nobody asked.
 */
export function runEclEngine(input, policy) {
  const i = input && typeof input === "object" ? input : {};
  const identity = i.identity && typeof i.identity === "object" ? i.identity : {};
  enRequire(enNonEmpty(identity.evidenceEntityType) && enNonEmpty(identity.evidenceId) && enNonEmpty(identity.brandId) && enNonEmpty(identity.ownerEmail), "identity requires evidenceEntityType, evidenceId, brandId, ownerEmail");
  enRequire(i.evidence && typeof i.evidence === "object" && enNonEmpty(i.evidence.domain), "evidence must be a normalized envelope");
  enRequire(Array.isArray(i.existing), "existing must be an array (pass [] when none)");
  enRequire(i.state && typeof i.state === "object" && enNonEmpty(i.state.status), "state.status (current lifecycle status) is required");
  enRequire(Array.isArray(i.strikes), "strikes must be an array (pass [] when none)");
  enRequire(policy && typeof policy === "object" && policy.gates, "policy is required");
  const ctx = i.context && typeof i.context === "object" ? i.context : {};
  const nowMs = Date.parse(String(ctx.now));
  enRequire(!Number.isNaN(nowMs), "context.now must be an injected, parseable instant (no implicit clock)");
  enRequire(ctx.hasAttestation !== undefined && ctx.hasAttestation !== null, "context.hasAttestation is required");
  enRequire(ctx.baselineLocked !== undefined && ctx.baselineLocked !== null, "context.baselineLocked is required");
  enRequire(ctx.hasBlockingReviewCase !== undefined && ctx.hasBlockingReviewCase !== null, "context.hasBlockingReviewCase is required");
  const actor = ["system", "user", "reviewer"].includes(i.actor) ? i.actor : "system";
  const nowIso = new Date(nowMs).toISOString();

  // ── Trazabilidad: every decision is reproducible from this hash ─────────
  const inputsHash = sha256Hex(
    stableSerialize({
      engineVersion: ECL_ENGINE_VERSION,
      ruleSetVersion: ECL_RULESET_VERSION,
      policyVersion: policy.policyVersion || null,
      identity,
      evidence: i.evidence,
      existing: i.existing.map((e) => ({ id: e && e.id, status: e && e.status, checksum: e && e.evidence && e.evidence.checksum })),
      state: i.state,
      strikes: i.strikes.map((s) => ({ scope: s && s.scope, expires_at: s && s.expires_at, withdrawn_at: (s && s.withdrawn_at) || null })),
      context: { now: nowIso, hasAttestation: ctx.hasAttestation === true, baselineLocked: ctx.baselineLocked === true, hasBlockingReviewCase: ctx.hasBlockingReviewCase === true, referenceFeeRateBps: ctx.referenceFeeRateBps === undefined ? null : ctx.referenceFeeRateBps },
    }),
  );
  const correlationId = `eclp3:${inputsHash.slice(0, 40)}`;

  // ── 1. Reconciliation (dedup, supersession, contradictions) ─────────────
  const reconciliation = reconcileEvidence(i.evidence, i.existing, policy);

  // Exact replay: the SAME bytes were already processed. Idempotent no-op.
  if (reconciliation.duplicates.length > 0) {
    return deepFreeze({
      engineVersion: ECL_ENGINE_VERSION,
      ruleSetVersion: ECL_RULESET_VERSION,
      policyVersion: policy.policyVersion || null,
      correlationId,
      inputsHash,
      outcome: "duplicate_replay",
      duplicateOf: reconciliation.duplicates.map((d) => d.existingId),
      reconciliation,
      confidenceResult: null,
      confidenceResultHash: null,
      transition: null,
      supersessions: [],
      reviewCaseIntents: [],
      strikeIntents: [],
      provisional: null,
      decisionHash: sha256Hex(stableSerialize({ inputsHash, outcome: "duplicate_replay" })),
    });
  }

  // ── 2. Classification ────────────────────────────────────────────────────
  const classification = classifyConfidence(i.evidence, reconciliation, {
    hasAttestation: ctx.hasAttestation === true,
    referenceFeeRateBps: ctx.referenceFeeRateBps,
    feeVsRateTableMaxMultiple: policy.plausibility ? policy.plausibility.feeVsRateTableMaxMultiple : undefined,
  });

  // ── 3. Strikes: economic contradictions strike the scope, per policy ─────
  const scope = strikeScopeForDomain(i.evidence.domain);
  const strikeIntents = [];
  for (const c of reconciliation.contradictions) {
    strikeIntents.push(
      buildStrikeIntent(
        { brandId: identity.brandId, ownerEmail: identity.ownerEmail, scope, reasonCode: `evidence_contradiction:${c.code}`, evidenceEntityType: identity.evidenceEntityType, evidenceId: identity.evidenceId, correlationId },
        policy,
        { now: nowIso },
      ),
    );
  }
  const activeStrikeCountByScope = countActiveStrikesByScope(i.strikes, nowMs);
  // Prospective counts (existing + would-be strikes) drive the escalation.
  const prospectiveCounts = { ...activeStrikeCountByScope };
  if (strikeIntents.length > 0) prospectiveCounts[scope] = Number(prospectiveCounts[scope] || 0) + strikeIntents.length;
  const escalatedScopes = scopesRequiringEscalation(prospectiveCounts, policy);

  // ── 4. Fail-closed review routing ────────────────────────────────────────
  const reviewCaseIntents = [];
  const reviewReasons = [];
  if (reconciliation.contradictions.length > 0) {
    reviewReasons.push("evidence_contradiction");
    reviewCaseIntents.push(reviewIntent(identity, "evidence_contradiction", "economic", ["freeze_baseline", "create_invoice"], correlationId, { contradictions: reconciliation.contradictions.map((c) => c.code) }));
  }
  if (reconciliation.ambiguities.length > 0) {
    reviewReasons.push("reconciliation_ambiguous");
    reviewCaseIntents.push(reviewIntent(identity, "reconciliation_ambiguous", "quality", ["freeze_baseline"], correlationId, { ambiguities: reconciliation.ambiguities.map((a) => a.code) }));
  }
  if (classification.nothingReadable) {
    reviewReasons.push("evidence_unreadable");
    reviewCaseIntents.push(reviewIntent(identity, "evidence_unreadable", "quality", ["show_dashboard"], correlationId, null));
  }
  for (const s of escalatedScopes) {
    reviewReasons.push(`strike_threshold_reached:${s}`);
    reviewCaseIntents.push(reviewIntent(identity, `strike_threshold_reached:${s}`, "economic", ["create_invoice"], correlationId, { scope: s }));
  }

  // ── 5. Expiry of the CURRENT state, from the injected instant only ───────
  const expiry = resolveExpiry(i.state, policy, { now: nowIso });
  if (expiry.ambiguous) {
    reviewReasons.push("provisional_window_unrecoverable");
    reviewCaseIntents.push(reviewIntent(identity, "provisional_window_unrecoverable", "quality", ["recover_proposal"], correlationId, null));
  }

  // ── 6. Target status (never inferred favorably) ──────────────────────────
  let toStatus;
  if (reviewReasons.length > 0) {
    toStatus = "under_review";
  } else if (expiry.lapsed) {
    toStatus = "expired";
  } else if (classification.confidenceLevel === "high" && (classification.verificationMethod === "independent_api" || classification.verificationMethod === "independent_document")) {
    toStatus = "verified";
  } else if (classification.confidenceLevel === "medium" && ctx.hasAttestation === true) {
    toStatus = "accepted_provisionally";
  } else if (classification.confidenceLevel === "low" || classification.confidenceLevel === "medium") {
    toStatus = "estimated";
  } else {
    toStatus = "under_review";
  }

  // A target the graph does not allow from the current state is itself an
  // ambiguity → review, unless review is the target already. Terminal states
  // never move.
  if (isTerminalStatus(i.state.status)) {
    toStatus = i.state.status;
  } else if (toStatus !== i.state.status && !canTransition(i.state.status, toStatus)) {
    if (toStatus !== "under_review" && canTransition(i.state.status, "under_review")) {
      reviewReasons.push("illegal_transition_requested");
      reviewCaseIntents.push(reviewIntent(identity, "illegal_transition_requested", "quality", [], correlationId, { requested: toStatus, from: i.state.status }));
      toStatus = "under_review";
    } else {
      toStatus = i.state.status;
    }
  }

  const provisional =
    toStatus === "accepted_provisionally"
      ? deepFreeze({ startedAt: nowIso, expiresAt: deriveProvisionalExpiry(nowIso, policy) })
      : null;

  // ── 7. Lifecycle event intents ───────────────────────────────────────────
  const eventName =
    reviewReasons.length > 0 ? `evidence_review_opened:${reviewReasons[0]}` : expiry.lapsed ? "provisional_expired" : `evidence_${toStatus}`;
  const transition = buildLifecycleTransition({
    evidenceEntityType: identity.evidenceEntityType,
    evidenceId: identity.evidenceId,
    brandId: identity.brandId,
    ownerEmail: identity.ownerEmail,
    fromStatus: i.state.status,
    toStatus,
    event: eventName,
    actor,
    correlationId,
    payload: { inputsHash, ruleSetVersion: ECL_RULESET_VERSION, reviewReasons },
  });

  const supersessions = reconciliation.supersedes
    .map((s) => {
      const prior = i.existing.find((e) => e && e.id === s.existingId);
      if (!prior || isTerminalStatus(prior.status) || !canTransition(prior.status, "superseded")) return null;
      return buildLifecycleTransition({
        evidenceEntityType: identity.evidenceEntityType,
        evidenceId: s.existingId,
        brandId: identity.brandId,
        ownerEmail: identity.ownerEmail,
        fromStatus: prior.status,
        toStatus: "superseded",
        event: `evidence_superseded:${s.reason}`,
        actor,
        correlationId,
        payload: { supersededById: identity.evidenceId, inputsHash },
      });
    })
    .filter((t) => t !== null);

  // ── 8. Finalized ConfidenceResult through the P2 gate layer ──────────────
  const gateContext = {
    now: nowIso,
    hasAttestation: ctx.hasAttestation === true,
    hasOpenConflicts: reconciliation.contradictions.length > 0,
    baselineLocked: ctx.baselineLocked === true,
    activeStrikeCountByScope: prospectiveCounts,
    hasBlockingReviewCase: ctx.hasBlockingReviewCase === true || reviewCaseIntents.length > 0,
  };
  const confidenceResult = finalizeConfidenceResult(
    {
      evidenceType: i.evidence.evidenceType,
      sourceType: i.evidence.sourceType,
      confidenceLevel: classification.confidenceLevel,
      verificationMethod: classification.verificationMethod,
      evidenceStatus: toStatus,
      passedRules: classification.passedRules,
      failedRules: classification.failedRules,
      warnings: classification.warnings,
      missingFields: i.evidence.missingFields,
      invalidFields: i.evidence.invalidFields,
      conflicts: reconciliation.contradictions,
      metrics: i.evidence.metrics,
      period: { periodStart: i.evidence.periodStart, periodEnd: i.evidence.periodEnd, coverageDays: i.evidence.coverageDays },
      provenance: { importId: i.evidence.importId, checksum: i.evidence.checksum, parserVersion: i.evidence.parserVersion, inputsHash, correlationId },
      expiresAt: provisional ? provisional.expiresAt : (i.state.expiresAt || null),
      reviewRequired: reviewReasons.length > 0,
      ruleSetVersion: ECL_RULESET_VERSION,
      explanation: {
        reason: reviewReasons.length > 0 ? `routed to human review: ${reviewReasons.join(", ")}` : `classified ${classification.confidenceLevel} via ${classification.verificationMethod}`,
        actionsToImprove: classification.failedRules.map((r) => `resolve ${r.id}`),
      },
    },
    policy,
    gateContext,
  );

  const decision = {
    engineVersion: ECL_ENGINE_VERSION,
    ruleSetVersion: ECL_RULESET_VERSION,
    policyVersion: policy.policyVersion || null,
    correlationId,
    inputsHash,
    outcome: reviewReasons.length > 0 ? "under_review" : toStatus === i.state.status ? "no_change" : toStatus,
    duplicateOf: [],
    reconciliation,
    confidenceResult,
    confidenceResultHash: hashConfidenceResult(confidenceResult),
    transition,
    supersessions,
    reviewCaseIntents,
    strikeIntents,
    provisional,
  };
  return deepFreeze({ ...decision, decisionHash: sha256Hex(stableSerialize(decision)) });
}
// NOTE: no "summarize gates with assumed context" helper exists ON PURPOSE —
// a gate verdict computed with invented context (assumed attestation, assumed
// locked baseline) would be a favorable inference, which P3 forbids. Gate
// evaluation always goes through eclGates.evaluateGate with REAL context.