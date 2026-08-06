// v62.4 — ECL P2: the ConfidenceResult CONTRACT (canonical, pure).
//
// This file defines the SHAPE of a confidence result and the authoritative
// enums it may use. It deliberately does NOT compute confidence: the rules
// (P-01…P-08) belong to a later phase, and the policy-dependent evaluation
// (gates, freeze eligibility, finalization) lives in ./eclGates.js — which
// imports from here, never the other way round, so the layering stays acyclic.
//
// NO `score` FIELD. The parser produces aggregates; a numeric score over
// aggregates would project a precision the evidence does not contain. The
// contract carries a categorical level plus the rules that passed and failed.
//
// base44/shared/generated/eclDomain.ts is GENERATED from this file.

import { deepFreeze } from "./eclSerialize.js";

export const CONFIDENCE_LEVELS = ["high", "medium", "low", "unknown"];

export const EVIDENCE_STATUSES = [
  "pending",
  "processing",
  "estimated",
  "accepted_provisionally",
  "verified",
  "rejected",
  "expired",
  "superseded",
  "under_review",
];

export const VERIFICATION_METHODS = ["independent_api", "independent_document", "attested_only", "none"];

export const FREEZE_ELIGIBILITY = ["eligible", "conditionally_eligible", "not_eligible"];

export const SOURCE_TYPES = [
  "api",
  "provider_statement",
  "bank_statement",
  "commerce_export",
  "accounting_export",
  "fec",
  "manual_declaration",
];

// The exact field set of a finalized ConfidenceResult, in contract order.
export const CONFIDENCE_RESULT_FIELDS = [
  "evidenceType",
  "sourceType",
  "confidenceLevel",
  "verificationMethod",
  "evidenceStatus",
  "freezeEligibility",
  "passedRules",
  "failedRules",
  "warnings",
  "missingFields",
  "invalidFields",
  "conflicts",
  "metrics",
  "period",
  "provenance",
  "expiresAt",
  "reviewRequired",
  "policyVersion",
  "ruleSetVersion",
  "explanation",
];

// Fields a caller may never supply: freezeEligibility is ALWAYS derived from
// the policy + context, so accepting it from the caller would let the consumer
// of a gate decide the gate's own outcome.
export const CALLER_FORBIDDEN_FIELDS = ["freezeEligibility"];

export class ConfidenceContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfidenceContractError";
  }
}

const inEnum = (list, value) => list.includes(value);
const asArray = (v) => (Array.isArray(v) ? v : []);

/**
 * Build a validated, deep-frozen ASSESSMENT: everything known about the
 * evidence except the derived verdicts. Throws when the caller supplies a
 * derived field or an out-of-enum value — a silent coercion here would produce
 * a result that looks authoritative and is not.
 */
export function makeConfidenceAssessment(fields) {
  const f = fields && typeof fields === "object" ? fields : {};

  for (const forbidden of CALLER_FORBIDDEN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(f, forbidden)) {
      throw new ConfidenceContractError(`${forbidden} is always derived and must not be supplied by the caller`);
    }
  }
  if (!inEnum(CONFIDENCE_LEVELS, f.confidenceLevel)) {
    throw new ConfidenceContractError(`confidenceLevel must be one of ${CONFIDENCE_LEVELS.join(", ")}`);
  }
  if (!inEnum(EVIDENCE_STATUSES, f.evidenceStatus)) {
    throw new ConfidenceContractError(`evidenceStatus must be one of ${EVIDENCE_STATUSES.join(", ")}`);
  }
  if (!inEnum(VERIFICATION_METHODS, f.verificationMethod)) {
    throw new ConfidenceContractError(`verificationMethod must be one of ${VERIFICATION_METHODS.join(", ")}`);
  }
  if (f.sourceType !== undefined && f.sourceType !== null && !inEnum(SOURCE_TYPES, f.sourceType)) {
    throw new ConfidenceContractError(`sourceType must be one of ${SOURCE_TYPES.join(", ")}`);
  }

  return deepFreeze({
    evidenceType: f.evidenceType === undefined ? null : f.evidenceType,
    sourceType: f.sourceType === undefined ? null : f.sourceType,
    confidenceLevel: f.confidenceLevel,
    verificationMethod: f.verificationMethod,
    evidenceStatus: f.evidenceStatus,
    passedRules: [...asArray(f.passedRules)],
    // failedRules entries are { id, detail }: an id alone cannot be explained
    // to a merchant, and a free-text reason alone cannot be reasoned about.
    failedRules: asArray(f.failedRules).map((r) => ({
      id: String(r && r.id),
      detail: r && r.detail === undefined ? "" : String(r && r.detail),
    })),
    warnings: [...asArray(f.warnings)],
    missingFields: [...asArray(f.missingFields)],
    invalidFields: asArray(f.invalidFields).map((v) => (typeof v === "object" && v !== null ? { ...v } : v)),
    conflicts: asArray(f.conflicts).map((v) => (typeof v === "object" && v !== null ? { ...v } : v)),
    metrics: f.metrics && typeof f.metrics === "object" ? { ...f.metrics } : {},
    period: f.period && typeof f.period === "object" ? { ...f.period } : { periodStart: null, periodEnd: null, coverageDays: null },
    provenance: f.provenance && typeof f.provenance === "object" ? { ...f.provenance } : {},
    expiresAt: f.expiresAt === undefined ? null : f.expiresAt,
    reviewRequired: f.reviewRequired === true,
    ruleSetVersion: f.ruleSetVersion === undefined ? null : f.ruleSetVersion,
    explanation: {
      reason: f.explanation && f.explanation.reason ? String(f.explanation.reason) : "",
      actionsToImprove: asArray(f.explanation && f.explanation.actionsToImprove).map(String),
    },
  });
}