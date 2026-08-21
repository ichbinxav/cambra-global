import { cambraClaudeAgentTaskEvidence } from "./commercialModelRouter.ts";
import { settleCanonicalAgentTask } from "./agentTaskEnvelope.ts";
import {
  COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED,
  COMMERCIAL_EGRESS_INPUT_REVIEW_REQUIRED,
  protectedCommercialPersistenceBindings,
  requireSanitizedCommercialOutput,
  stableCommercialPublicErrorCode,
} from "./commercialProtectedEgress.ts";
import type { ProtectedAnthropicSource } from "./commercialProtectedEgress.ts";

function commercialCostTerminal(evidence: ReturnType<typeof cambraClaudeAgentTaskEvidence>) {
  const observedAt = new Date().toISOString();
  const costEvidence = {
    version: "agent-task-cost-evidence-v1" as const,
    code: evidence.settlement_persisted
      ? "COST_SETTLEMENT_PERSISTED"
      : evidence.reservation_persisted
      ? "COST_RESERVATION_PERSISTED_SETTLEMENT_PENDING"
      : evidence.reservation_ambiguous
      ? "COST_RESERVATION_PERSISTENCE_AMBIGUOUS"
      : evidence.pre_reservation_code || "COST_EVIDENCE_UNKNOWN",
    observed_at: observedAt,
    reservation_started: evidence.reservation_started,
    reservation_persisted: evidence.reservation_persisted,
    settlement_persisted: evidence.settlement_persisted,
  };
  if (
    evidence.settlement_persisted && evidence.reservation_persisted &&
    evidence.cost_record_refs.length > 0
  ) return { costState: "SETTLED" as const, costEvidence };
  if (
    evidence.reservation_persisted && evidence.cost_record_refs.length > 0
  ) return { costState: "RESERVED" as const, costEvidence };
  if (evidence.reservation_ambiguous) {
    return { costState: "RESERVATION_AMBIGUOUS" as const, costEvidence };
  }
  if (evidence.pre_reservation_code && !evidence.reservation_persisted) {
    return { costState: "NOT_RESERVED" as const, costEvidence };
  }
  return { costState: "UNKNOWN" as const, costEvidence };
}

function notApplicableCostTerminal() {
  return {
    costState: "NOT_APPLICABLE" as const,
    costEvidence: {
      version: "agent-task-cost-evidence-v1" as const,
      code: "COST_NOT_APPLICABLE",
      observed_at: new Date().toISOString(),
      reservation_started: false,
      reservation_persisted: false,
      settlement_persisted: false,
    },
  };
}

export function commercialAgentErrorResponse(
  error: any,
  operation: string,
  fallback: string,
  lastInference: any = null,
) {
  const errorEvidence = cambraClaudeAgentTaskEvidence(error);
  const priorEvidence = cambraClaudeAgentTaskEvidence(lastInference);
  const postEffect = [errorEvidence, priorEvidence].some((evidence) =>
    evidence.transport_started || evidence.effect_refs.length > 0 ||
    evidence.receipt_refs.length > 0
  );
  const explicitlyReviewRequired =
    Number(error?.status) === 409 &&
    (error?.review_required === true || error?.automatic_retry_blocked === true);
  const reviewRequired = explicitlyReviewRequired || postEffect;
  const code = postEffect && !explicitlyReviewRequired
    ? "commercial_inference_post_effect_review_required"
    : stableCommercialPublicErrorCode(error, fallback);
  const candidateStatus = Number(error?.status);
  const status = reviewRequired
    ? 409
    : Number.isInteger(candidateStatus) && candidateStatus >= 400 &&
        candidateStatus < 500
    ? candidateStatus
    : 500;
  const requestId = crypto.randomUUID();
  const log = {
    level: status >= 500 ? "error" : "warning",
    event: reviewRequired
      ? "commercial_inference_review_required"
      : "commercial_agent_operation_error",
    operation: String(operation).slice(0, 160),
    request_id: requestId,
    status,
    code,
  };
  if (status >= 500) console.error(JSON.stringify(log));
  else console.warn(JSON.stringify(log));
  return Response.json({
    ok: false,
    error: code,
    request_id: requestId,
    ...(reviewRequired
      ? { review_required: true, automatic_retry_blocked: true }
      : {}),
  }, { status });
}

export function boundedWindowAtCap(
  rows: any[],
  since: string,
  cap: number,
) {
  if (!Array.isArray(rows) || rows.length < cap || cap < 1) return false;
  const boundary = Date.parse(String(rows[rows.length - 1]?.created_date || ""));
  const lowerBound = Date.parse(String(since || ""));
  return Number.isFinite(boundary) && Number.isFinite(lowerBound) &&
    boundary >= lowerBound;
}

export function commercialInferenceReviewError(
  code = "COMMERCIAL_INFERENCE_REVIEW_REQUIRED",
) {
  return Object.assign(
    new Error(String(code || "commercial_inference_review_required").toLowerCase()),
    {
      code,
      status: 409,
      review_required: true,
      automatic_retry_blocked: true,
    },
  );
}

/**
 * Convert the evidence returned (or thrown) by callCambraClaude into the
 * conservative terminal states accepted by the canonical AgentTask envelope.
 * A successful application result is not enough to claim EXECUTED: cost,
 * effect and provider receipt references must all be present.
 */
export function commercialInferenceTerminal(
  value: any,
  outcome: "COMPLETED" | "FAILED",
) {
  const evidence = cambraClaudeAgentTaskEvidence(value);
  const cost = commercialCostTerminal(evidence);
  const receiptBackedByEffect = evidence.receipt_refs.length > 0 &&
    evidence.receipt_refs.every((receipt) => evidence.effect_refs.some((effect) =>
      effect.type === "AnthropicMessage" && effect.id === receipt.id
    ));
  const evidenceComplete = evidence.cost_record_refs.length > 0 &&
    evidence.effect_refs.length > 0 && evidence.receipt_refs.length > 0 &&
    receiptBackedByEffect &&
    evidence.transport_evidence_persisted === true &&
    evidence.reservation_persisted === true &&
    evidence.settlement_persisted === true &&
    Number(evidence.provider_http_status) >= 200 &&
    Number(evidence.provider_http_status) < 300;
  if (outcome === "COMPLETED") {
    if (!evidenceComplete) {
      throw Object.assign(
        commercialInferenceReviewError(
          "COMMERCIAL_INFERENCE_EVIDENCE_REVIEW_REQUIRED",
        ),
        { agent_task_evidence: value?.agent_task_evidence },
      );
    }
    return {
      terminalState: "COMPLETED" as const,
      effectState: "EXECUTED" as const,
      ambiguityState: "NONE" as const,
      ...cost,
      costRecordRefs: evidence.cost_record_refs,
      effectRefs: evidence.effect_refs,
      receiptRefs: evidence.receipt_refs,
    };
  }
  const postEffect = evidence.transport_started ||
    evidence.effect_refs.length > 0;
  const costNeedsReview = cost.costState === "RESERVATION_AMBIGUOUS" ||
    cost.costState === "RESERVED";
  return {
    terminalState: postEffect || costNeedsReview
      ? "REVIEW_REQUIRED" as const
      : "FAILED" as const,
    effectState: postEffect
      ? "FAILED_POST_EFFECT" as const
      : "FAILED_PRE_EFFECT" as const,
    ambiguityState: postEffect || costNeedsReview
      ? "REVIEW_REQUIRED" as const
      : "NONE" as const,
    ...cost,
    costRecordRefs: evidence.cost_record_refs,
    effectRefs: evidence.effect_refs,
    receiptRefs: evidence.receipt_refs,
  };
}

/**
 * Executable success pipeline shared by the five protected handlers. It is the
 * only place their model output becomes an AgentTask patch/result/outbox intent.
 */
export async function settleProtectedCommercialInferenceSuccess(
  svc: any,
  task: any,
  input: {
    source: ProtectedAnthropicSource;
    inference: any;
    output: unknown;
    outputSummary: string;
    completedAt?: string;
  },
) {
  const persistence = protectedCommercialPersistenceBindings(
    input.source,
    input.output,
  );
  const summary = requireSanitizedCommercialOutput({
    value: String(input.outputSummary || ""),
  }) as { value: string };
  const settled = await settleCanonicalAgentTask(svc, task, {
    status: "completed",
    output_summary: summary.value,
    ...persistence.taskPatch,
    completed_at: input.completedAt || new Date().toISOString(),
  }, {
    ...commercialInferenceTerminal(input.inference, "COMPLETED"),
    ...persistence.terminal,
  });
  return { task: settled, outputPayload: persistence.payload } as const;
}

export function commercialInferenceFailureTerminal(
  error: any,
  lastInference: any = null,
) {
  const errorEvidence = cambraClaudeAgentTaskEvidence(error);
  const errorCarriesEvidence = errorEvidence.transport_started ||
    errorEvidence.reservation_started ||
    errorEvidence.reservation_persisted ||
    errorEvidence.reservation_ambiguous ||
    Boolean(errorEvidence.pre_reservation_code) ||
    errorEvidence.cost_record_refs.length > 0 ||
    errorEvidence.effect_refs.length > 0 ||
    errorEvidence.receipt_refs.length > 0;
  // A parse or AgentTask settlement failure can happen after Anthropic already
  // returned successfully. Preserve that earlier durable evidence instead of
  // falsely downgrading the run to FAILED_PRE_EFFECT.
  return commercialInferenceTerminal(
    errorCarriesEvidence ? error : lastInference || error,
    "FAILED",
  );
}

export function commercialInferenceHasPostEffect(
  error: any,
  lastInference: any = null,
) {
  return [
    cambraClaudeAgentTaskEvidence(error),
    cambraClaudeAgentTaskEvidence(lastInference),
  ].some((evidence) =>
    evidence.transport_started || evidence.effect_refs.length > 0 ||
    evidence.receipt_refs.length > 0
  );
}

/**
 * A root bound as non-material can close REVIEW_REQUIRED/no-effect. If a
 * policy races after a material root was bound, canonical coherence requires
 * FAILED_PRE_EFFECT; the HTTP contract still blocks automatic retry.
 */
export function protectedCommercialFailureTerminal(
  error: any,
  lastInference: any = null,
  materialEffect = false,
) {
  const code = String(error?.code || "").toUpperCase();
  if (
    !commercialInferenceHasPostEffect(error, lastInference) &&
    materialEffect !== true &&
    [
      COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED,
      COMMERCIAL_EGRESS_INPUT_REVIEW_REQUIRED,
    ].includes(code)
  ) {
    return reviewRequiredNoEffectTerminal();
  }
  return materialEffect
    ? commercialInferenceFailureTerminal(error, lastInference)
    : failedNoEffectTerminal();
}

export function completedNoEffectTerminal() {
  return {
    terminalState: "COMPLETED" as const,
    effectState: "NOT_APPLICABLE" as const,
    ambiguityState: "NONE" as const,
    ...notApplicableCostTerminal(),
    costRecordRefs: [],
    effectRefs: [],
    receiptRefs: [],
  };
}

/** Human/source review is required even though no material effect was tried. */
export function reviewRequiredNoEffectTerminal() {
  return {
    terminalState: "REVIEW_REQUIRED" as const,
    effectState: "NOT_APPLICABLE" as const,
    ambiguityState: "NONE" as const,
    ...notApplicableCostTerminal(),
    costRecordRefs: [],
    effectRefs: [],
    receiptRefs: [],
  };
}

export function failedNoEffectTerminal() {
  return {
    terminalState: "FAILED" as const,
    effectState: "NOT_APPLICABLE" as const,
    ambiguityState: "NONE" as const,
    ...notApplicableCostTerminal(),
    costRecordRefs: [],
    effectRefs: [],
    receiptRefs: [],
  };
}
