import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { callCambraClaude } from '../../shared/commercialModelRouter.ts';
import { createCanonicalAgentTask, settleCanonicalAgentTask } from '../../shared/agentTaskEnvelope.ts';
import { boundedWindowAtCap, commercialInferenceHasPostEffect, commercialInferenceReviewError, completedNoEffectTerminal, failedNoEffectTerminal, protectedCommercialFailureTerminal, reviewRequiredNoEffectTerminal, settleProtectedCommercialInferenceSuccess } from '../../shared/commercialAgentTask.ts';
import {
  COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED,
  COMMERCIAL_EGRESS_INPUT_REVIEW_REQUIRED,
  observedPolicyContext,
  observedPolicyMetadata,
  parseCommercialFindingsJson,
  protectedCommercialBestEffort,
  protectedCommercialErrorResponse,
  resolveObservedAnthropicEgressPolicy,
  sanitizeCommercialEgress,
  shapeQaMonitorProviderSignals,
  stableCommercialPublicErrorCode,
} from '../../shared/commercialProtectedEgress.ts';

const AGENT_NAME = "qa_monitor";
const TASK_TYPE = "qa_monitor";
const RISK_LEVEL = 1;
const ENG_DISCLAIMER = "⚠️ Fix propuesto por IA. Revísalo antes de dárselo a Base44.";
const PROCESSING_PURPOSE = "admin_runtime_failure_monitoring" as const;

async function callClaude(svc, prompt, eventKey, policy) { return callCambraClaude(prompt, { tier:'standard', maxTokens:3000, svc, eventKey, source:'qaMonitorAgent', relatedEntityType:'AgentTask', relatedEntityId:eventKey, protectedEgress:{purpose:PROCESSING_PURPOSE,policy} }); }

// L1 — vigila runtime. NO APLICA fixes. Solo detecta patrones de fallo.
// Lee AgentTask (failed) + Event log. NUNCA escribe código.
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
    const requestedWindowHours = Number(body?.window_hours);
    const windowHours = Number.isInteger(requestedWindowHours) && requestedWindowHours >= 1 && requestedWindowHours <= 168
      ? requestedWindowHours
      : 12;
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

    // Read failed AgentTasks in window
    const recentTasks = await base44.asServiceRole.entities.AgentTask
      .filter({ created_date: { $gte: since } }, "-created_date", 500).catch((error:any)=>{sourceReadFailures.push('AgentTask');return protectedCommercialBestEffort(error,{operation:'qaMonitorAgent.read_agent_task',code:'qa_monitor_source_coverage_incomplete',fallback:[],severity:'secondary'});});
    const tasksInWindow = recentTasks.filter(t => t.created_date >= since);
    const failedTasks = tasksInWindow.filter(t => t.status === "failed");
    const recentEvents = await base44.asServiceRole.entities.Event
      .filter({ created_date: { $gte: since } }, "-created_date", 300).catch((error:any)=>{sourceReadFailures.push('Event');return protectedCommercialBestEffort(error,{operation:'qaMonitorAgent.read_event',code:'qa_monitor_source_coverage_incomplete',fallback:[],severity:'secondary'});});
    if (boundedWindowAtCap(recentTasks, since, 500)) sourceAtCap.push("AgentTask");
    if (boundedWindowAtCap(recentEvents, since, 300)) sourceAtCap.push("Event");
    const failedEvents = recentEvents.filter(e =>
      e.created_date >= since && (e.status === "failed" || (e.event_type || "").includes("error") || (e.event_type || "").includes("failed"))
    );

    // Only fixed category enums and counts may cross the provider boundary.
    const providerSignals = shapeQaMonitorProviderSignals(failedTasks, failedEvents);
    const totalRuns = tasksInWindow.length;
    const overallFailureRate = totalRuns > 0 ? (failedTasks.length / totalRuns) : 0;
    const sourceCoverageComplete = sourceReadFailures.length === 0 && sourceAtCap.length === 0;
    const inferenceRequired = sourceCoverageComplete && (failedTasks.length > 0 || failedEvents.length > 0);

    const rawPrompt = inferenceRequired ? [
      "Eres analista de QA/observabilidad. Te paso patrones de fallo agregados de un sistema de agentes.",
      "IMPORTANTE: NO aplicas fixes. NO tienes acceso de escritura al repo. Solo PROPONES con diff + ready_to_paste_prompt cuando tengas alta confianza (si no, sugiere investigación con investigation_steps en vez de fix).",
      "Para cada patrón de fallo identifica: causa probable, severidad, y si propones fix, el diff exacto y un ready_to_paste_prompt.",
      "- ready_to_paste_prompt: instrucción lista para pegar al builder de Base44. Empieza con 'En functions/<nombre>, …' o equivalente. NO pegues el diff dentro.",
      "Sé conservador: runtime fixes son los más arriesgados — prefiere 'risk_of_applying: high' por defecto.",
      "",
      "Devuelve SOLO JSON con shape:",
      `{"findings":[{"id":"<slug>","affected_function":"<nombre>","failure_count":<num>,"failure_rate":<0..1>,"pattern":"<error pattern>","severity":"<info|warning|critical>","probable_cause":"<2 líneas>","proposed_fix_diff":"<diff o null si no propones fix>","ready_to_paste_prompt":"<instrucción para Base44 o null si solo es investigación>","investigation_steps":"<pasos sugeridos si no hay fix claro, o null>","risk_of_applying":"<low|medium|high>","risk_explanation":"<por qué>"}],"summary":"<2 líneas>"}`,
      "",
      `Total runs en ventana: ${totalRuns}, failure rate: ${(overallFailureRate * 100).toFixed(1)}%`,
      "Failure categories agregadas (enums estables; sin mensajes libres):",
      JSON.stringify(providerSignals, null, 2),
    ].join("\n") : null;
    const sanitizedPrompt = rawPrompt ? sanitizeCommercialEgress(rawPrompt) : null;
    const prompt = sanitizedPrompt?.ok && typeof sanitizedPrompt.value === "string"
      ? sanitizedPrompt.value
      : null;
    const policy = inferenceRequired && prompt
      ? resolveObservedAnthropicEgressPolicy(PROCESSING_PURPOSE)
      : null;
    const inferenceAllowed = inferenceRequired && Boolean(prompt) && policy?.ok === true;

    // Build the root after the deterministic read phase so a clean window is
    // represented honestly as a non-material no-op rather than as an unproved
    // paid provider effect.
    task = await createCanonicalAgentTask(base44.asServiceRole, req, {
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: RISK_LEVEL,
      input_summary: `QA monitor: runtime since ${since}`,
      started_at: new Date().toISOString(),
    }, {
      workflowKey: "qa_monitor_agent",
      workflowVersion: "v2.0.0",
      tenantKey: "_platform",
      processingPurpose: PROCESSING_PURPOSE,
      functionName: "qaMonitorAgent",
      input: inferenceAllowed
        ? { prompt, window_hours: windowHours, since, total_runs: totalRuns, provider_signals: providerSignals, anthropic_policy: observedPolicyMetadata(policy.evidence), failed_source_reads: [], source_at_cap: [] }
        : { window_hours: windowHours, since, total_runs: totalRuns, failed_tasks: failedTasks.length, failed_events: failedEvents.length, provider_egress_status: inferenceRequired ? "REVIEW_REQUIRED" : "NOT_APPLICABLE", failed_source_reads: sourceReadFailures, source_at_cap: sourceAtCap },
      subjectType: "Platform",
      subjectId: "_platform",
      policyContext: inferenceAllowed
        ? observedPolicyContext(policy.evidence)
        : inferenceRequired ? { status: "UNKNOWN" } : { status: "NOT_APPLICABLE" },
      authorityContext: { status: "OBSERVED", key: "base44_auth:role:admin", version: "v1" },
      intelligenceContext: sourceCoverageComplete ? { status: "NOT_APPLICABLE" } : { status: "UNKNOWN" },
      materialEffect: inferenceAllowed,
      ...(inferenceAllowed ? { effectClass: "SPEND" } : {}),
      costApplicable: inferenceAllowed,
    });

    if (!sourceCoverageComplete) {
      const outputPayload = { ok: false, error: "qa_monitor_source_coverage_incomplete", source_coverage: { complete: false, failed_reads: sourceReadFailures, at_cap: sourceAtCap } };
      task = await settleCanonicalAgentTask(base44.asServiceRole, task, {
        status: "failed",
        error: outputPayload.error,
        output_summary: "QA monitor blocked: source coverage incomplete",
        output_payload_json: outputPayload,
        completed_at: new Date().toISOString(),
      }, {
        ...failedNoEffectTerminal(),
        intelligenceContext: { status: "UNKNOWN" },
        result: outputPayload,
        terminalEvent: { eventType: "agent.task.terminal", source: "qaMonitorAgent", payload: outputPayload },
      });
      return Response.json({ ok: false, error: outputPayload.error, task_id: task.id, automatic_retry_blocked: true }, { status: 503 });
    }

    if (!inferenceRequired) {
      const outputPayload = { disclaimer: ENG_DISCLAIMER, findings: [], total_runs: totalRuns, failure_rate: 0, window_hours: windowHours, no_inference_required: true, source_coverage: { complete: true, failed_reads: [], at_cap: [] } };
      task = await settleCanonicalAgentTask(base44.asServiceRole, task, {
        status: "completed",
        output_summary: `QA monitor: no failures in last ${windowHours}h (${totalRuns} runs)`,
        output_payload_json: outputPayload,
        completed_at: new Date().toISOString(),
      }, {
        ...completedNoEffectTerminal(),
        result: outputPayload,
        terminalEvent: { eventType: "agent.task.terminal", source: "qaMonitorAgent", payload: outputPayload },
      });
      return Response.json({ ok: true, task_id: task.id, findings_count: 0 });
    }

    if (!prompt || !policy?.ok) {
      const errorCode = stableCommercialPublicErrorCode({
        code: prompt
          ? COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED
          : COMMERCIAL_EGRESS_INPUT_REVIEW_REQUIRED,
      }, "qa_monitor_failed");
      const outputPayload = { ok: false, error: errorCode, provider_egress: { status: "REVIEW_REQUIRED", purpose: PROCESSING_PURPOSE } };
      task = await settleCanonicalAgentTask(base44.asServiceRole, task, {
        status: "waiting_input",
        error: errorCode,
        output_summary: "QA monitor blocked pending provider-egress review",
        output_payload_json: outputPayload,
        completed_at: new Date().toISOString(),
      }, {
        ...reviewRequiredNoEffectTerminal(),
        policyContext: { status: "UNKNOWN" },
        result: outputPayload,
        terminalEvent: { eventType: "agent.task.terminal", source: "qaMonitorAgent", payload: outputPayload },
      });
      return Response.json({ ok: false, error: errorCode, task_id: task.id, review_required: true, automatic_retry_blocked: true }, { status: 409 });
    }

    inference = await callClaude(base44.asServiceRole, prompt, task.id, policy.evidence);
    const parsed = parseCommercialFindingsJson(inference.text);
    if (!parsed) {
      throw commercialInferenceReviewError("QA_MONITOR_RESPONSE_INVALID");
    }
    const findings = (Array.isArray(parsed.findings) ? parsed.findings : []).map(f => ({
      ...f,
      source_agent: AGENT_NAME,
      detected_at: new Date().toISOString(),
    }));

    const completed = await settleProtectedCommercialInferenceSuccess(base44.asServiceRole, task, {
      source: "qaMonitorAgent",
      inference,
      output: {
        disclaimer: ENG_DISCLAIMER,
        findings,
        summary: parsed.summary,
        total_runs: totalRuns,
        failed_tasks: failedTasks.length,
        failure_rate: overallFailureRate,
        window_hours: windowHours,
        source_coverage: { complete: true, failed_reads: [], at_cap: [] },
      },
      outputSummary: `QA monitor: ${findings.length} findings · ${failedTasks.length} failed tasks · ${(overallFailureRate * 100).toFixed(1)}% failure rate`,
    });
    task = completed.task;
    const outputPayload: any = completed.outputPayload;

    return Response.json({ ok: true, task_id: task.id, findings_count: findings.length, failure_rate: overallFailureRate });
  } catch (error: any) {
    if (task?.id) {
      try {
        const base44 = createClientFromRequest(req);
        const publicError = stableCommercialPublicErrorCode(error, "qa_monitor_failed");
        const terminal = protectedCommercialFailureTerminal(error, inference, task.material_effect === true);
        const outputPayload = { ok: false, error: publicError, source_coverage: { complete: sourceReadFailures.length === 0 && sourceAtCap.length === 0, failed_reads: sourceReadFailures, at_cap: sourceAtCap } };
        await settleCanonicalAgentTask(base44.asServiceRole, task, { status: terminal.terminalState === "REVIEW_REQUIRED" ? "waiting_input" : "failed", error: publicError, output_summary: "QA monitor failed safely", output_payload_json: outputPayload, completed_at: new Date().toISOString() }, {
          ...terminal,
          intelligenceContext: sourceReadFailures.length || sourceAtCap.length ? { status: "UNKNOWN" } : { status: "NOT_APPLICABLE" },
          result: outputPayload,
          terminalEvent: { eventType: "agent.task.terminal", source: "qaMonitorAgent", payload: outputPayload },
        });
      } catch (markError) {
        protectedCommercialBestEffort(markError, { operation: 'qaMonitorAgent.trace_terminal', code: 'qa_monitor_failed', fallback: null, severity: 'critical' });
      }
    }
    return protectedCommercialErrorResponse(error, 'qaMonitorAgent', 'qa_monitor_failed', commercialInferenceHasPostEffect(error, inference));
  }
});
