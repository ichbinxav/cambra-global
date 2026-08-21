import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  boundedWindowAtCap,
  completedNoEffectTerminal,
  commercialAgentErrorResponse,
  commercialInferenceFailureTerminal,
  commercialInferenceReviewError,
  commercialInferenceTerminal,
  failedNoEffectTerminal,
  protectedCommercialFailureTerminal,
  reviewRequiredNoEffectTerminal,
  settleProtectedCommercialInferenceSuccess,
} from "../../base44/shared/commercialAgentTask.ts";
import {
  buildRootAgentTaskEnvelope,
} from "../../base44/shared/agentTaskEnvelope.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

describe("canonical commercial AgentTask lifecycle", () => {
  it("claims EXECUTED only with real cost, effect and provider receipt refs", () => {
    const complete = commercialInferenceTerminal({
      agent_task_evidence: {
        cost_record_refs: [{ type: "CostUsageEvent", id: "cost-real-1" }],
        effect_refs: [{ type: "AnthropicMessage", id: "msg_real_0001" }],
        receipt_refs: [{ type: "AnthropicMessage", id: "msg_real_0001" }],
        reservation_started: true,
        reservation_persisted: true,
        settlement_persisted: true,
        transport_started: true,
        transport_evidence_persisted: true,
        provider_http_status: 200,
      },
    }, "COMPLETED");
    expect(complete).toMatchObject({
      terminalState: "COMPLETED",
      effectState: "EXECUTED",
      ambiguityState: "NONE",
      costState: "SETTLED",
    });

    expect(() => commercialInferenceTerminal({
      agent_task_evidence: {
        cost_record_refs: [{ type: "CostUsageEvent", id: "cost-real-2" }],
        effect_refs: [{ type: "CostUsageEventTransport", id: "cost-real-2" }],
        receipt_refs: [],
        reservation_started: true,
        reservation_persisted: true,
        settlement_persisted: true,
        transport_started: true,
        transport_evidence_persisted: true,
      },
    }, "COMPLETED")).toThrowError(expect.objectContaining({
      code: "COMMERCIAL_INFERENCE_EVIDENCE_REVIEW_REQUIRED",
      status: 409,
      automatic_retry_blocked: true,
    }));
    expect(() => commercialInferenceTerminal({
      agent_task_evidence: {
        cost_record_refs: [{ type: "CostUsageEvent", id: "cost-real-2" }],
        effect_refs: [{ type: "AnthropicMessage", id: "msg_real_0002" }],
        receipt_refs: [{ type: "AnthropicMessage", id: "msg_real_0002" }],
        reservation_started: true,
        reservation_persisted: true,
        settlement_persisted: true,
        transport_started: true,
        transport_evidence_persisted: false,
      },
    }, "COMPLETED")).toThrowError(/commercial_inference_evidence_review_required/);
  });

  it("keeps post-transport failures in review and never fabricates a receipt", () => {
    const failed = commercialInferenceTerminal({
      agent_task_evidence: {
        cost_record_refs: [{ type: "CostUsageEvent", id: "cost-real-3" }],
        effect_refs: [{ type: "CostUsageEventTransport", id: "cost-real-3" }],
        receipt_refs: [],
        reservation_started: true,
        reservation_persisted: true,
        settlement_persisted: true,
        transport_started: true,
        transport_evidence_persisted: true,
      },
    }, "FAILED");
    expect(failed).toMatchObject({
      terminalState: "REVIEW_REQUIRED",
      effectState: "FAILED_POST_EFFECT",
      ambiguityState: "REVIEW_REQUIRED",
      receiptRefs: [],
    });
    expect(completedNoEffectTerminal()).toMatchObject({
      terminalState: "COMPLETED",
      effectState: "NOT_APPLICABLE",
    });
    expect(failedNoEffectTerminal()).toMatchObject({
      terminalState: "FAILED",
      effectState: "NOT_APPLICABLE",
    });
    expect(reviewRequiredNoEffectTerminal()).toMatchObject({
      terminalState: "REVIEW_REQUIRED",
      effectState: "NOT_APPLICABLE",
      ambiguityState: "NONE",
    });
    expect(protectedCommercialFailureTerminal({
      code: "COMMERCIAL_ANTHROPIC_EGRESS_POLICY_REVIEW_REQUIRED",
      status: 409,
      review_required: true,
    }, null, false)).toMatchObject({
      terminalState: "REVIEW_REQUIRED",
      effectState: "NOT_APPLICABLE",
      ambiguityState: "NONE",
      effectRefs: [],
      receiptRefs: [],
    });
    expect(protectedCommercialFailureTerminal({
      code: "COMMERCIAL_ANTHROPIC_EGRESS_POLICY_REVIEW_REQUIRED",
      status: 409,
      review_required: true,
    }, null, true)).toMatchObject({
      terminalState: "FAILED",
      effectState: "FAILED_PRE_EFFECT",
      ambiguityState: "NONE",
      effectRefs: [],
      receiptRefs: [],
    });
  });

  it("distinguishes durable no-reservation evidence from ambiguous or unsettled reservation state", () => {
    const notReserved = commercialInferenceTerminal({ agent_task_evidence: {
      cost_record_refs: [], effect_refs: [], receipt_refs: [],
      reservation_started: false, reservation_persisted: false,
      settlement_persisted: false, reservation_ambiguous: false,
      pre_reservation_code: "ANTHROPIC_NOT_CONFIGURED",
      transport_started: false, transport_evidence_persisted: false,
    } }, "FAILED");
    expect(notReserved).toMatchObject({ terminalState: "FAILED", effectState: "FAILED_PRE_EFFECT", costState: "NOT_RESERVED", costRecordRefs: [] });

    const ambiguous = commercialInferenceTerminal({ agent_task_evidence: {
      cost_record_refs: [], effect_refs: [], receipt_refs: [],
      reservation_started: true, reservation_persisted: false,
      settlement_persisted: false, reservation_ambiguous: true,
      pre_reservation_code: null, transport_started: false,
      transport_evidence_persisted: false,
    } }, "FAILED");
    expect(ambiguous).toMatchObject({ terminalState: "REVIEW_REQUIRED", effectState: "FAILED_PRE_EFFECT", ambiguityState: "REVIEW_REQUIRED", costState: "RESERVATION_AMBIGUOUS", costRecordRefs: [] });

    const reserved = commercialInferenceTerminal({ agent_task_evidence: {
      cost_record_refs: [{ type: "CostUsageEvent", id: "cost-reserved-real" }],
      effect_refs: [], receipt_refs: [], reservation_started: true,
      reservation_persisted: true, settlement_persisted: false,
      reservation_ambiguous: false, pre_reservation_code: null,
      transport_started: false, transport_evidence_persisted: false,
    } }, "FAILED");
    expect(reserved).toMatchObject({ terminalState: "REVIEW_REQUIRED", costState: "RESERVED", costRecordRefs: [{ id: "cost-reserved-real" }] });
  });

  it("preserves a successful inference when a later parse or task write fails", () => {
    const inference = {
      agent_task_evidence: {
        cost_record_refs: [{ type: "CostUsageEvent", id: "cost-real-4" }],
        effect_refs: [{ type: "AnthropicMessage", id: "msg_real_0004" }],
        receipt_refs: [{ type: "AnthropicMessage", id: "msg_real_0004" }],
        reservation_started: true,
        reservation_persisted: true,
        settlement_persisted: true,
        transport_started: true,
        transport_evidence_persisted: true,
        provider_http_status: 200,
      },
    };
    const terminal = commercialInferenceFailureTerminal(
      new Error("agent_task_terminal_settle_authority_unavailable"),
      inference,
    );
    expect(terminal).toMatchObject({
      terminalState: "REVIEW_REQUIRED",
      effectState: "FAILED_POST_EFFECT",
      ambiguityState: "REVIEW_REQUIRED",
      costRecordRefs: [{ type: "CostUsageEvent", id: "cost-real-4" }],
      effectRefs: [{ type: "AnthropicMessage", id: "msg_real_0004" }],
      receiptRefs: [{ type: "AnthropicMessage", id: "msg_real_0004" }],
    });
  });

  it("executes the shared five-handler success pipeline without persisting raw model data", async () => {
    const providerSecret = ["sk", "-ant-", "Z".repeat(24)].join("");
    for (const source of [
      "codeReviewAgent",
      "founderCopilotAgent",
      "qaAgent",
      "qaMonitorAgent",
      "securityAgent",
    ]) {
      const root = await buildRootAgentTaskEnvelope(
        new Request("https://cambra.invalid/internal"),
        {
          workflowKey: `protected_pipeline_${source}`,
          workflowVersion: "v1.0.0",
          tenantKey: "_platform",
          processingPurpose: "test_only",
          functionName: source,
          input: { fixture: source },
          subjectType: "Platform",
          subjectId: "_platform",
          policyContext: { status: "OBSERVED", key: "anthropic_egress:test" },
          authorityContext: { status: "OBSERVED", key: "base44_auth:test" },
          intelligenceContext: { status: "NOT_APPLICABLE" },
          materialEffect: true,
          effectClass: "SPEND",
          costApplicable: true,
        },
      );
      let stored = {
        ...root,
        id: `task-${source}`,
        root_task_id: `task-${source}`,
        brand_id: "_platform",
        status: "running",
        trace_revision: 1,
      };
      const svc = { entities: { AgentTask: {
        updateMany: async (filter, operation) => {
          if (filter.id !== stored.id || filter.trace_revision !== stored.trace_revision) {
            return { success: true, updated: 0 };
          }
          stored = { ...stored, ...structuredClone(operation.$set) };
          return { success: true, updated: 1 };
        },
        get: async () => structuredClone(stored),
      } } };
      const receiptId = `msg_${source}_0001`;
      const inference = { agent_task_evidence: {
        cost_record_refs: [{ type: "CostUsageEvent", id: `cost-${source}` }],
        effect_refs: [{ type: "AnthropicMessage", id: receiptId }],
        receipt_refs: [{ type: "AnthropicMessage", id: receiptId }],
        reservation_started: true,
        reservation_persisted: true,
        settlement_persisted: true,
        reservation_ambiguous: false,
        pre_reservation_code: null,
        transport_started: true,
        transport_evidence_persisted: true,
        provider_http_status: 200,
      } };
      const completed = await settleProtectedCommercialInferenceSuccess(
        svc,
        stored,
        {
          source,
          inference,
          output: {
            report: `Contact founder@example.com with ${providerSecret}`,
            api_key: "raw-sensitive-key-value",
            auth: "raw-auth-key-value",
            nested: {
              session_token: "raw-nested-token-value",
              deploy_auth_context: "raw-nested-auth-value",
              safe_value: "preserved",
            },
          },
          outputSummary: `Completed ${source}`,
          completedAt: "2026-08-21T12:00:00.000Z",
        },
      );
      const serialized = JSON.stringify(completed.task);
      expect(serialized).not.toContain(providerSecret);
      expect(serialized).not.toContain("founder@example.com");
      expect(serialized).not.toContain("raw-sensitive-key-value");
      expect(serialized).not.toContain("raw-auth-key-value");
      expect(serialized).not.toContain("raw-nested-token-value");
      expect(serialized).not.toContain("raw-nested-auth-value");
      expect(completed.task.output_payload_json).not.toHaveProperty("api_key");
      expect(completed.task.output_payload_json).not.toHaveProperty("auth");
      expect(completed.task.output_payload_json.nested)
        .toEqual({ safe_value: "preserved" });
      expect(completed.task.output_payload_json)
        .toEqual(completed.task.terminal_result_json.value);
      expect(completed.task.output_payload_json)
        .toEqual(completed.task.terminal_event_intent_json.payload_json);
      expect(completed.task.lineage_state).toBe("COMPLETE");
      expect(completed.task.effect_coverage_state).toBe("COMPLETE");
    }
  });

  it("migrates the safe agents with complete local root/terminal/outbox surfaces", () => {
    for (const name of [
      "codeReviewAgent",
      "founderCopilotAgent",
      "qaAgent",
      "qaMonitorAgent",
      "securityAgent",
      "spendIntelligenceAgent",
    ]) {
      const source = read(`base44/functions/${name}/entry.ts`);
      expect(source).toContain("createCanonicalAgentTask");
      expect(source).toContain("settleCanonicalAgentTask");
      expect(source).toContain('eventType: "agent.task.terminal"');
      expect(source).not.toContain(".entities.AgentTask.create(");
      expect(source).not.toContain(".entities.AgentTask.update(");
      expect(source).toContain(
        name === "spendIntelligenceAgent"
          ? "commercialAgentErrorResponse"
          : "protectedCommercialErrorResponse",
      );
      expect(source).not.toContain("internalErrorResponse");
      expect(source).not.toContain("PAID_AI_INFERENCE");
      if (name !== "spendIntelligenceAgent") {
        expect(source).not.toContain("safeBestEffort");
        expect(source).toContain("protectedCommercialBestEffort");
      }
      const settlements = source.match(/settleCanonicalAgentTask\s*\(/g) || [];
      const outboxIntents = source.match(/terminalEvent\s*:/g) || [];
      const outputBindings = source.match(/output_payload_json:\s*outputPayload/g) || [];
      const resultBindings = source.match(/result:\s*outputPayload/g) || [];
      const protectedTerminalBindings = source.match(/\.\.\.persistence\.terminal/g) || [];
      const protectedTaskBindings = source.match(/\.\.\.persistence\.taskPatch/g) || [];
      expect(outboxIntents.length + protectedTerminalBindings.length)
        .toBe(settlements.length);
      expect(outputBindings.length + protectedTaskBindings.length)
        .toBe(settlements.length);
      expect(resultBindings.length + protectedTerminalBindings.length)
        .toBe(settlements.length);
    }
  });

  it("fails closed on incomplete source coverage, caps, and invalid JSON", () => {
    for (const name of ["founderCopilotAgent", "qaAgent", "qaMonitorAgent"]) {
      const source = read(`base44/functions/${name}/entry.ts`);
      expect(source).toContain("sourceAtCap");
      expect(source).toContain("sourceCoverageComplete");
      expect(source.indexOf("task = await createCanonicalAgentTask")).toBeGreaterThan(source.indexOf("const prompt"));
      expect(source.indexOf("inference = await callClaude")).toBeGreaterThan(source.indexOf("if (!sourceCoverageComplete)"));
    }
    for (const name of ["codeReviewAgent", "qaMonitorAgent", "securityAgent"]) {
      const source = read(`base44/functions/${name}/entry.ts`);
      expect(source).toContain("commercialInferenceReviewError");
      expect(source).toContain("parseCommercialFindingsJson");
      expect(source).toMatch(/if\s*\(!parsed\)/);
    }
    expect(read("base44/functions/codeReviewAgent/entry.ts")).toContain("sanitizeCommercialEgress");
    expect(read("base44/functions/securityAgent/entry.ts")).toContain("normalizeCommercialCodeSnippets");
    expect(commercialInferenceReviewError("TEST_REVIEW")).toMatchObject({
      code: "TEST_REVIEW",
      status: 409,
      review_required: true,
      automatic_retry_blocked: true,
    });
  });

  it("flags only a window-bound cap, not a full page of old history", () => {
    const since = "2026-08-21T00:00:00.000Z";
    const oldRows = Array.from({ length: 500 }, (_, index) => ({
      id: `old-${index}`,
      created_date: "2026-08-20T23:59:59.000Z",
    }));
    const windowRows = Array.from({ length: 500 }, (_, index) => ({
      id: `new-${index}`,
      created_date: "2026-08-21T00:00:00.000Z",
    }));
    expect(boundedWindowAtCap(oldRows, since, 500)).toBe(false);
    expect(boundedWindowAtCap(windowRows, since, 500)).toBe(true);
  });

  it("preserves 409 review-required as explicitly non-retryable", async () => {
    const error = commercialInferenceReviewError(
      "COST_SETTLEMENT_REVIEW_REQUIRED",
    );
    const response = commercialAgentErrorResponse(
      error,
      "testAgent",
      "commercial_operation_failed",
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "cost_settlement_review_required",
      review_required: true,
      automatic_retry_blocked: true,
    });

    const completedInference = {
      agent_task_evidence: {
        cost_record_refs: [{ type: "CostUsageEvent", id: "cost-post-effect" }],
        effect_refs: [{ type: "AnthropicMessage", id: "msg_post_effect_01" }],
        receipt_refs: [{ type: "AnthropicMessage", id: "msg_post_effect_01" }],
        reservation_started: true,
        reservation_persisted: true,
        settlement_persisted: true,
        transport_started: true,
        transport_evidence_persisted: true,
        provider_http_status: 200,
      },
    };
    const postEffectResponse = commercialAgentErrorResponse(
      new Error("agent_task_terminal_readback_mismatch"),
      "testAgent",
      "test_failed",
      completedInference,
    );
    expect(postEffectResponse.status).toBe(409);
    await expect(postEffectResponse.json()).resolves.toMatchObject({
      ok: false,
      error: "commercial_inference_post_effect_review_required",
      review_required: true,
      automatic_retry_blocked: true,
    });
  });

  it("never returns or logs a syntactically valid unallowlisted error code", async () => {
    const secretStyleCode = ["sk", "-ant-", "Z".repeat(24)].join("");
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const reviewError = Object.assign(
        new Error(`provider rejected ${secretStyleCode}`),
        {
          code: secretStyleCode,
          status: 409,
          review_required: true,
          automatic_retry_blocked: true,
        },
      );
      const reviewResponse = commercialAgentErrorResponse(
        reviewError,
        "testAgent",
        "qa_agent_failed",
      );
      expect(reviewResponse.status).toBe(409);
      const reviewPayload = await reviewResponse.json();
      expect(reviewPayload).toMatchObject({
        error: "qa_agent_failed",
        review_required: true,
        automatic_retry_blocked: true,
      });

      const handledResponse = commercialAgentErrorResponse(
        Object.assign(new Error(secretStyleCode), {
          code: secretStyleCode,
          status: 422,
        }),
        "testAgent",
        secretStyleCode,
      );
      expect(handledResponse.status).toBe(422);
      await expect(handledResponse.json()).resolves.toMatchObject({
        error: "commercial_operation_failed",
      });
      const publicSurface = JSON.stringify({
        warning: warning.mock.calls,
        error: errorLog.mock.calls,
        reviewPayload,
      });
      expect(publicSurface).not.toContain(secretStyleCode);
    } finally {
      warning.mockRestore();
      errorLog.mockRestore();
    }
  });

  it("uses SPEND only after an observed, purpose-bound Anthropic policy", () => {
    for (const name of [
      "codeReviewAgent",
      "founderCopilotAgent",
      "qaAgent",
      "qaMonitorAgent",
      "securityAgent",
    ]) {
      const source = read(`base44/functions/${name}/entry.ts`);
      expect(source).toContain('effectClass: "SPEND"');
      expect(source).toContain("resolveObservedAnthropicEgressPolicy");
      expect(source).toContain("observedPolicyContext");
      expect(source).toContain("protectedEgress:{purpose:PROCESSING_PURPOSE,policy}");
      expect(source).toContain("settleProtectedCommercialInferenceSuccess");
      expect(source).toContain('status: "waiting_input"');
      expect(source).toContain("reviewRequiredNoEffectTerminal");
      expect(source).not.toMatch(/String\(error\?\.message/);
    }
  });

  it("binds only the actual Anthropic response id as a provider receipt", () => {
    const router = read("base44/shared/commercialModelRouter.ts");
    expect(router).toContain("providerReceiptId=anthropicMessageReceiptId(d)");
    expect(router).toContain("value?.type==='message'");
    expect(router).toContain("ANTHROPIC_MESSAGE_RECEIPT");
    expect(router).toContain("provider_receipt_id:providerReceiptId");
    expect(router).toContain("transport_started:true");
    expect(router.indexOf("assertObservedAnthropicEgressPolicy"))
      .toBeLessThan(router.indexOf("reservePaidOperation(opts.svc"));
    expect(router).not.toMatch(/receiptId\s*=\s*crypto\.randomUUID/);
  });
});
