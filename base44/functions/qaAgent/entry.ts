import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { callCambraClaude } from '../../shared/commercialModelRouter.ts';
import { createCanonicalAgentTask, settleCanonicalAgentTask } from '../../shared/agentTaskEnvelope.ts';
import { commercialInferenceHasPostEffect, failedNoEffectTerminal, protectedCommercialFailureTerminal, reviewRequiredNoEffectTerminal, settleProtectedCommercialInferenceSuccess } from '../../shared/commercialAgentTask.ts';
import {
  COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED,
  COMMERCIAL_EGRESS_INPUT_REVIEW_REQUIRED,
  normalizeAllowedQaFlows,
  observedPolicyContext,
  observedPolicyMetadata,
  protectedCommercialBestEffort,
  protectedCommercialErrorResponse,
  resolveObservedAnthropicEgressPolicy,
  sanitizeCommercialEgress,
  shapeFailureProviderSignals,
  stableCommercialPublicErrorCode,
} from '../../shared/commercialProtectedEgress.ts';

const AGENT_NAME = "qa";
const TASK_TYPE = "qa_flow_review";
const RISK_LEVEL = 1;
const PROCESSING_PURPOSE = "admin_requested_qa_flow_review" as const;

async function callClaude(svc, prompt, eventKey, policy) { return callCambraClaude(prompt, { tier:'standard', maxTokens:2048, svc, eventKey, source:'qaAgent', relatedEntityType:'AgentTask', relatedEntityId:eventKey, protectedEgress:{purpose:PROCESSING_PURPOSE,policy} }); }

Deno.serve(async (req) => {
  let task = null;
  let inference: any = null;
  const sourceReadFailures: string[] = [];
  const sourceAtCap: string[] = [];
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const flows = normalizeAllowedQaFlows(body?.flows);

    // Lightweight signal: recent failed tasks over last 7 days as regression signal
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const recentFailures = await base44.asServiceRole.entities.AgentTask
      .filter({ status: "failed", created_date: { $gte: since7d } }, "-created_date", 50)
      .catch((error:any)=>{sourceReadFailures.push('AgentTask');return protectedCommercialBestEffort(error,{operation:'qaAgent.read_agent_task',code:'qa_agent_source_coverage_incomplete',fallback:[],severity:'secondary'});});
    if (recentFailures.length >= 50) sourceAtCap.push("AgentTask");

    const recentFailureSignals = shapeFailureProviderSignals(recentFailures);
    const failureSummary = recentFailureSignals.length
      ? recentFailureSignals.slice(0, 20).map((signal:any) => `${signal.component_category}/${signal.error_category}: ${signal.count}`).join("\n")
      : "Sin fallos de agentes en últimos 7 días.";

    const rawPrompt = flows ? [
      "Eres un QA engineer crítico revisando flujos de producto de CAMBRA.",
      "Para cada flujo listado, genera:",
      "1) 3-5 casos de test concretos (input, acción, resultado esperado)",
      "2) Posibles regressions a vigilar",
      "3) Severidad (alta/media/baja)",
      "Sé específico, no genérico. Español.",
      "",
      `Flujos: ${flows.join(", ")}`,
      "",
      "Señales recientes de fallos en agentes (últimos 7 días):",
      failureSummary,
    ].join("\n") : null;

    const sourceCoverageComplete = sourceReadFailures.length === 0 && sourceAtCap.length === 0;
    const sanitizedPrompt = rawPrompt ? sanitizeCommercialEgress(rawPrompt) : null;
    const prompt = sanitizedPrompt?.ok && typeof sanitizedPrompt.value === "string"
      ? sanitizedPrompt.value
      : null;
    const policy = sourceCoverageComplete && prompt
      ? resolveObservedAnthropicEgressPolicy(PROCESSING_PURPOSE)
      : null;
    const inferenceAllowed = sourceCoverageComplete && Boolean(prompt) && policy?.ok === true;
    task = await createCanonicalAgentTask(base44.asServiceRole, req, {
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: RISK_LEVEL,
      input_summary: flows ? `QA review for flows: ${flows.join(", ")}` : "QA review: flow input requires review",
      started_at: new Date().toISOString(),
    }, {
      workflowKey: "qa_agent",
      workflowVersion: "v2.0.0",
      tenantKey: "_platform",
      processingPurpose: PROCESSING_PURPOSE,
      functionName: "qaAgent",
      input: inferenceAllowed
        ? { prompt, flows, since_7d: since7d, recent_failure_signals: recentFailureSignals, anthropic_policy: observedPolicyMetadata(policy.evidence), failed_source_reads: [], source_at_cap: [] }
        : { supplied_flow_count: Array.isArray(body?.flows) ? body.flows.length : 0, since_7d: since7d, provider_egress_status: sourceCoverageComplete ? "REVIEW_REQUIRED" : "NOT_APPLICABLE", failed_source_reads: sourceReadFailures, source_at_cap: sourceAtCap },
      subjectType: "Platform",
      subjectId: "_platform",
      policyContext: inferenceAllowed
        ? observedPolicyContext(policy.evidence)
        : sourceCoverageComplete ? { status: "UNKNOWN" } : { status: "NOT_APPLICABLE" },
      authorityContext: { status: "OBSERVED", key: "base44_auth:role:admin", version: "v1" },
      intelligenceContext: sourceCoverageComplete ? { status: "NOT_APPLICABLE" } : { status: "UNKNOWN" },
      materialEffect: inferenceAllowed,
      ...(inferenceAllowed ? { effectClass: "SPEND" } : {}),
      costApplicable: inferenceAllowed,
    });

    if (!sourceCoverageComplete) {
      const outputPayload = { ok: false, error: "qa_agent_source_coverage_incomplete", source_coverage: { complete: false, failed_reads: sourceReadFailures, at_cap: sourceAtCap } };
      task = await settleCanonicalAgentTask(base44.asServiceRole, task, {
        status: "failed",
        error: outputPayload.error,
        output_summary: "QA review blocked: source coverage incomplete",
        output_payload_json: outputPayload,
        completed_at: new Date().toISOString(),
      }, {
        ...failedNoEffectTerminal(),
        intelligenceContext: { status: "UNKNOWN" },
        result: outputPayload,
        terminalEvent: { eventType: "agent.task.terminal", source: "qaAgent", payload: outputPayload },
      });
      return Response.json({ ok: false, error: outputPayload.error, task_id: task.id, automatic_retry_blocked: true }, { status: 503 });
    }

    if (!prompt || !policy?.ok || !flows) {
      const errorCode = stableCommercialPublicErrorCode({
        code: prompt && flows
          ? COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED
          : COMMERCIAL_EGRESS_INPUT_REVIEW_REQUIRED,
      }, "qa_agent_failed");
      const outputPayload = { ok: false, error: errorCode, provider_egress: { status: "REVIEW_REQUIRED", purpose: PROCESSING_PURPOSE } };
      task = await settleCanonicalAgentTask(base44.asServiceRole, task, {
        status: "waiting_input",
        error: errorCode,
        output_summary: "QA review blocked pending provider-egress review",
        output_payload_json: outputPayload,
        completed_at: new Date().toISOString(),
      }, {
        ...reviewRequiredNoEffectTerminal(),
        policyContext: { status: "UNKNOWN" },
        result: outputPayload,
        terminalEvent: { eventType: "agent.task.terminal", source: "qaAgent", payload: outputPayload },
      });
      return Response.json({ ok: false, error: errorCode, task_id: task.id, review_required: true, automatic_retry_blocked: true }, { status: 409 });
    }

    inference = await callClaude(base44.asServiceRole, prompt, task.id, policy.evidence);
    const report = inference.text;

    const completed = await settleProtectedCommercialInferenceSuccess(base44.asServiceRole, task, {
      source: "qaAgent",
      inference,
      output: {
        flows,
        report,
        signals: { recent_failures_7d: recentFailures.length, source_coverage: { complete: true, failed_reads: [], at_cap: [] } },
      },
      outputSummary: `QA report generated for ${flows.length} flow(s)`,
    });
    task = completed.task;
    const outputPayload: any = completed.outputPayload;

    return Response.json({ ok: true, task_id: task.id, flows: outputPayload.flows, report: outputPayload.report });
  } catch (error: any) {
    if (task?.id) {
      try {
        const base44 = createClientFromRequest(req);
        const publicError = stableCommercialPublicErrorCode(error, "qa_agent_failed");
        const terminal = protectedCommercialFailureTerminal(error, inference, task.material_effect === true);
        const outputPayload = { ok: false, error: publicError, source_coverage: { complete: sourceReadFailures.length === 0 && sourceAtCap.length === 0, failed_reads: sourceReadFailures, at_cap: sourceAtCap } };
        await settleCanonicalAgentTask(base44.asServiceRole, task, {
          status: terminal.terminalState === "REVIEW_REQUIRED" ? "waiting_input" : "failed",
          error: publicError,
          output_summary: "QA review failed safely",
          output_payload_json: outputPayload,
          completed_at: new Date().toISOString(),
        }, {
          ...terminal,
          intelligenceContext: sourceReadFailures.length || sourceAtCap.length ? { status: "UNKNOWN" } : { status: "NOT_APPLICABLE" },
          result: outputPayload,
          terminalEvent: { eventType: "agent.task.terminal", source: "qaAgent", payload: outputPayload },
        });
      } catch (markError) {
        protectedCommercialBestEffort(markError, { operation: 'qaAgent.trace_terminal', code: 'qa_agent_failed', fallback: null, severity: 'critical' });
      }
    }
    return protectedCommercialErrorResponse(error, 'qaAgent', 'qa_agent_failed', commercialInferenceHasPostEffect(error, inference));
  }
});
