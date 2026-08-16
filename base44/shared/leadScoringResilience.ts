import { deterministicMerchantOpportunity } from "./merchantOpportunity.ts";
import { observedFiniteNumber } from "./intelligenceCore.ts";
import { buildAdaptiveLeadDecisionV0 } from "./adaptiveLeadCore.ts";

export type LeadModelStatus =
  | "PARSED"
  | "PARTIAL"
  | "UNAVAILABLE_OR_UNPARSEABLE"
  | "SKIPPED_DETERMINISTIC_ONLY";

function hasUsableEmail(value: any) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function observedEvidence(signals: Record<string, any>) {
  return Object.entries(signals || {})
    .filter(([, value]) =>
      value !== null && value !== undefined && value !== ""
    )
    .slice(0, 4)
    .map(([key, value]) => `${key}=${String(value).slice(0, 80)}`);
}

export function validLeadModelRow(row: any) {
  return Boolean(
    row?.id && typeof row?.score === "number" && Number.isFinite(row.score),
  );
}

export function buildResilientLeadScore(
  lead: any,
  row: any,
  status: LeadModelStatus,
  outcomeCalibration: any = null,
  governance: {
    policy?: any;
    policy_binding?: any;
    aggregate_coverage?: any;
  } = {},
) {
  const det = deterministicMerchantOpportunity(lead);
  const useModel = (status === "PARSED" || status === "PARTIAL") &&
    validLeadModelRow(row);
  const llm = useModel
    ? Math.max(0, Math.min(100, Math.round(row.score)))
    : null;
  const weighted = useModel
    ? Math.round(det.opportunity_score * 0.7 + (llm as number) * 0.3)
    : det.opportunity_score;
  const observedAdjustment = observedFiniteNumber(
    outcomeCalibration?.adjustment,
  );
  const advisoryApplied = outcomeCalibration?.applied === true &&
    observedAdjustment !== null;
  const calibrationAdjustment = advisoryApplied
    ? Math.max(-3, Math.min(3, Math.round(observedAdjustment)))
    : 0;
  // Company opportunity is independent of person/contact availability. Contact
  // readiness remains a downstream gate and may change next_action, never this
  // company-only score.
  const score = Math.max(0, Math.min(100, weighted + calibrationAdjustment));
  const evidence = observedEvidence(det.signals);
  const reasoning = useModel && String(row?.reasoning || "").trim()
    ? String(row.reasoning).trim().slice(0, 500)
    : `Deterministic evidence only${
      evidence.length
        ? `: ${evidence.join(", ")}`
        : ": insufficient structured signals"
    }; review before activation.`;
  const nextAction = useModel && String(row?.next_action || "").trim()
    ? String(row.next_action).trim().slice(0, 300)
    : hasUsableEmail(lead?.contact_email)
    ? "Review deterministic evidence before commercial activation"
    : "Find and verify a corporate email before outreach";
  const scoreBreakdown = {
    breakdown: det.breakdown,
    llm_breakdown: useModel ? (row?.breakdown || null) : null,
    reasoning,
    opportunity_score: det.opportunity_score,
    evidence_confidence: det.evidence_confidence,
    evidence_count: det.evidence_count,
    signals: det.signals,
    scoring_version:
      "merchant-company-opportunity-v3+privacy-safe-outcome-advisory-v1",
    scoring_contract: det.scoring_contract,
    methodology_class:
      "DETERMINISTIC_COMPANY_ONLY_HEURISTIC_WITH_OPTIONAL_LLM_ADVISORY",
    probabilistic_calibration: false,
    company_only: true,
    contact_features_used: false,
    contact_role_advisory: det.contact_role_advisory,
    model_status: useModel ? "PARSED" : status,
    weights: useModel
      ? { deterministic: 0.7, llm: 0.3 }
      : { deterministic: 1, llm: 0 },
    outcome_calibration: advisoryApplied
      ? {
        version: outcomeCalibration.version,
        methodology_class: "DESCRIPTIVE_AGGREGATE_HEURISTIC",
        probabilistic_calibration: false,
        legacy_field_name: true,
        adjustment: calibrationAdjustment,
        sample_size: outcomeCalibration.sample_size,
        success_rate_pct: outcomeCalibration.success_rate_pct,
        aggregate_refs: outcomeCalibration.aggregate_refs,
        as_of: outcomeCalibration.as_of,
        temporal_filter: outcomeCalibration.temporal_filter,
        privacy_boundary: "irreversible_k10_aggregate_only",
      }
      : {
        version: outcomeCalibration?.version || null,
        methodology_class: "DESCRIPTIVE_AGGREGATE_HEURISTIC",
        probabilistic_calibration: false,
        legacy_field_name: true,
        adjustment: 0,
        reason: outcomeCalibration?.reason || "not_available",
        aggregate_refs: [],
        as_of: outcomeCalibration?.as_of || null,
        temporal_filter: outcomeCalibration?.temporal_filter || null,
      },
    // Compatibility fields remain explicit so old readers do not infer a
    // hidden contact penalty. The former email cap is intentionally retired.
    email_cap_applied: false,
    legacy_contact_cap_removed: true,
  };
  const adaptiveDecision: any = buildAdaptiveLeadDecisionV0({
    lead: {
      ...lead,
      score,
      stage: "scored",
      score_breakdown_json: scoreBreakdown,
    },
    score_snapshot: {
      breakdown: det.breakdown,
      // Adaptive V0 is deliberately independent from the optional LLM row.
      // The legacy aggregate remains available to compatibility readers, but
      // cannot grant DROP/contact/research authority inside this core.
      opportunity_score: det.opportunity_score,
      evidence_confidence: det.evidence_confidence,
      evidence_count: det.evidence_count,
    },
    policy: governance.policy || {},
    policy_binding: governance.policy_binding || {
      authority_status: "BLOCKED",
    },
    aggregate_coverage: governance.aggregate_coverage || {
      status: "INCOMPLETE",
      coverage_complete: false,
      blocker: "aggregate_coverage_not_supplied",
    },
    current_intelligence_state: "CHEAP_SCREENED",
  });
  const adaptiveNextAction = adaptiveDecision.disposition === "DROP"
    ? "Stopped before further spend or contact; review the point-in-time DROP snapshot before any reopening."
    : adaptiveDecision.disposition === "RESEARCH_MORE"
    ? "Review the declared company-only evidence gap; no person/contact lookup is allowed yet."
    : adaptiveDecision.disposition === "DECLARE_OUTREACH_WORTHY"
    ? "Company is outreach-worthy under the V0 heuristic; run the separate contact, compliance and authority gates."
    : "Review the company-only evidence snapshot before any contact or paid action.";
  const dropped = adaptiveDecision.disposition === "DROP";
  return {
    id: lead.id,
    score,
    score_breakdown_json: {
      ...scoreBreakdown,
      adaptive_lead_v0: adaptiveDecision,
    },
    next_action: dropped || adaptiveDecision.disposition !==
        "DECLARE_OUTREACH_WORTHY"
      ? adaptiveNextAction
      : nextAction || adaptiveNextAction,
    stage: dropped ? "disqualified" : "scored",
    ...(dropped
      ? {
        reservoir_state: adaptiveDecision.suppressed
          ? "suppressed"
          : "disqualified",
        reservoir_updated_at: adaptiveDecision.decision_time,
      }
      : {}),
  };
}
