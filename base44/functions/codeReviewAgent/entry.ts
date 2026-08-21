import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { callCambraClaude } from '../../shared/commercialModelRouter.ts';
import { createCanonicalAgentTask, settleCanonicalAgentTask } from '../../shared/agentTaskEnvelope.ts';
import { commercialInferenceHasPostEffect, commercialInferenceReviewError, completedNoEffectTerminal, protectedCommercialFailureTerminal, reviewRequiredNoEffectTerminal, settleProtectedCommercialInferenceSuccess } from '../../shared/commercialAgentTask.ts';
import {
  COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED,
  COMMERCIAL_EGRESS_INPUT_REVIEW_REQUIRED,
  normalizeCommercialCodeSnippets,
  observedPolicyContext,
  observedPolicyMetadata,
  parseCommercialFindingsJson,
  protectedCommercialBestEffort,
  protectedCommercialErrorResponse,
  resolveObservedAnthropicEgressPolicy,
  sanitizeCommercialEgress,
  stableCommercialPublicErrorCode,
} from '../../shared/commercialProtectedEgress.ts';

const AGENT_NAME = "code_review";
const TASK_TYPE = "code_review";
const RISK_LEVEL = 1;
const ENG_DISCLAIMER = "⚠️ Fix propuesto por IA. Revísalo antes de dárselo a Base44.";
const PROCESSING_PURPOSE = "admin_requested_code_review" as const;

async function callClaude(svc, prompt, eventKey, policy) { return callCambraClaude(prompt, { tier:'standard', maxTokens:4000, svc, eventKey, source:'codeReviewAgent', relatedEntityType:'AgentTask', relatedEntityId:eventKey, protectedEgress:{purpose:PROCESSING_PURPOSE,policy} }); }

// L1 — DETECTA, no APLICA. Esta function NO tiene ninguna llamada que escriba código.
// Sólo crea una AgentTask con findings[]. El engineeringReportAgent los consolida en Approvals.
Deno.serve(async (req) => {
  let task = null;
  let inference: any = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const codeSnippets = Array.isArray(body?.code_snippets) ? body.code_snippets : [];
    const defaultFocus = "general code quality, anti-patterns, business logic in frontend, duplicated calculations, single source of truth violations";
    const focusAreas = body?.focus_areas === undefined || body?.focus_areas === null || body?.focus_areas === ""
      ? defaultFocus
      : typeof body?.focus_areas === "string" ? body.focus_areas : null;
    const inferenceRequired = codeSnippets.length > 0;
    const providerSnippets = normalizeCommercialCodeSnippets(
      inferenceRequired ? codeSnippets : [],
    );
    const sanitizedFocus = focusAreas === null
      ? null
      : sanitizeCommercialEgress(inferenceRequired ? focusAreas : "general code quality");
    const providerFocus = sanitizedFocus?.ok && typeof sanitizedFocus.value === "string" && sanitizedFocus.bytes <= 1_000
      ? sanitizedFocus.value
      : null;
    const providerInputAllowed = providerSnippets !== null && providerFocus !== null;
    const policy = inferenceRequired && providerInputAllowed
      ? resolveObservedAnthropicEgressPolicy(PROCESSING_PURPOSE)
      : null;
    const inferenceAllowed = inferenceRequired && providerInputAllowed && policy?.ok === true;
    task = await createCanonicalAgentTask(base44.asServiceRole, req, {
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: RISK_LEVEL,
      input_summary: inferenceAllowed
        ? `Code review: ${codeSnippets.length} snippets, focus: ${providerFocus.slice(0, 80)}`
        : `Code review: ${codeSnippets.length} snippets`,
      started_at: new Date().toISOString(),
    }, {
      workflowKey: "code_review_agent",
      workflowVersion: "v2.0.0",
      tenantKey: "_platform",
      processingPurpose: PROCESSING_PURPOSE,
      functionName: "codeReviewAgent",
      input: inferenceAllowed
        ? { code_snippets: providerSnippets, focus_areas: providerFocus, anthropic_policy: observedPolicyMetadata(policy.evidence) }
        : { code_snippet_count: codeSnippets.length, provider_egress_status: inferenceRequired ? "REVIEW_REQUIRED" : "NOT_APPLICABLE" },
      subjectType: "Platform",
      subjectId: "_platform",
      policyContext: inferenceAllowed
        ? observedPolicyContext(policy.evidence)
        : inferenceRequired ? { status: "UNKNOWN" } : { status: "NOT_APPLICABLE" },
      authorityContext: { status: "OBSERVED", key: "base44_auth:role:admin", version: "v1" },
      intelligenceContext: { status: "NOT_APPLICABLE" },
      materialEffect: inferenceAllowed,
      ...(inferenceAllowed ? { effectClass: "SPEND" } : {}),
      costApplicable: inferenceAllowed,
    });

    if (codeSnippets.length === 0) {
      const outputPayload = { disclaimer: ENG_DISCLAIMER, findings: [], no_inference_required: true };
      task = await settleCanonicalAgentTask(base44.asServiceRole, task, {
        status: "completed",
        output_summary: "Code review: no snippets provided",
        output_payload_json: outputPayload,
        completed_at: new Date().toISOString(),
      }, {
        ...completedNoEffectTerminal(),
        result: outputPayload,
        terminalEvent: { eventType: "agent.task.terminal", source: "codeReviewAgent", payload: outputPayload },
      });
      return Response.json({ ok: true, task_id: task.id, findings_count: 0 });
    }

    if (!providerInputAllowed || !policy?.ok) {
      const errorCode = stableCommercialPublicErrorCode({
        code: providerInputAllowed
          ? COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED
          : COMMERCIAL_EGRESS_INPUT_REVIEW_REQUIRED,
      }, "code_review_failed");
      const outputPayload = {
        ok: false,
        error: errorCode,
        provider_egress: { status: "REVIEW_REQUIRED", purpose: PROCESSING_PURPOSE },
      };
      task = await settleCanonicalAgentTask(base44.asServiceRole, task, {
        status: "waiting_input",
        error: errorCode,
        output_summary: "Code review blocked pending provider-egress review",
        output_payload_json: outputPayload,
        completed_at: new Date().toISOString(),
      }, {
        ...reviewRequiredNoEffectTerminal(),
        policyContext: { status: "UNKNOWN" },
        result: outputPayload,
        terminalEvent: { eventType: "agent.task.terminal", source: "codeReviewAgent", payload: outputPayload },
      });
      return Response.json({ ok: false, error: errorCode, task_id: task.id, review_required: true, automatic_retry_blocked: true }, { status: 409 });
    }

    const prompt = [
      "Eres revisor senior de código para CAMBRA (plataforma React + Tailwind + Deno backend functions + Base44 SDK).",
      "Reglas del Architecture Bible que debes vigilar:",
      "- Single source of truth: misma lógica de negocio no debe estar duplicada en frontend y backend",
      "- Cálculos financieros/benchmarks viven en backend (scoreEngine.js), nunca en componentes",
      "- Tenant isolation: queries por brand_id o created_by",
      "- No hardcodeo de IDs, secrets ni configuración de entorno en componentes",
      `Focus extra del usuario: ${providerFocus}`,
      "",
      "IMPORTANTE: NO aplicas cambios. NO tienes acceso de escritura al repo. Solo PROPONES fixes que el founder llevará a Base44 manualmente.",
      "Para cada hallazgo da un diff EXACTO (formato unified diff o bloque before/after) Y un ready_to_paste_prompt:",
      "- ready_to_paste_prompt: texto en español que el founder copia tal cual y pega en Base44 builder chat. Debe empezar con la instrucción concreta ('En <file>, ...'), incluir el contexto del problema en 1-2 líneas, y pedir el cambio específico. NO incluyas el diff entero dentro del prompt — Base44 trabaja mejor con instrucciones que con diffs literales.",
      "Sé conservador: si no estás seguro, severity='info', no 'critical'.",
      "",
      "Devuelve SOLO JSON con shape:",
      `{"findings":[{"id":"<slug-único>","file":"<path o snippet name>","location":"<línea o función>","severity":"<info|warning|critical>","problem_description":"<2-3 líneas>","proposed_fix_diff":"<diff before/after>","ready_to_paste_prompt":"<instrucción lista para pegar a Base44>","risk_of_applying":"<low|medium|high>","risk_explanation":"<por qué ese nivel de riesgo>"}],"summary":"<2 líneas>"}`,
      "",
      "Si no hay hallazgos, findings: [].",
      "",
      "CÓDIGO A REVISAR:",
      ...providerSnippets.map((s, i) => `--- Snippet ${i + 1} (${s.file || "unknown"}) ---\n${s.content || ""}`),
    ].join("\n");

    inference = await callClaude(base44.asServiceRole, prompt, task.id, policy.evidence);
    const parsed = parseCommercialFindingsJson(inference.text);
    if (!parsed) {
      throw commercialInferenceReviewError("CODE_REVIEW_RESPONSE_INVALID");
    }
    const findings = (Array.isArray(parsed.findings) ? parsed.findings : []).map(f => ({
      ...f,
      source_agent: AGENT_NAME,
      detected_at: new Date().toISOString(),
    }));

    const completed = await settleProtectedCommercialInferenceSuccess(base44.asServiceRole, task, {
      source: "codeReviewAgent",
      inference,
      output: { disclaimer: ENG_DISCLAIMER, findings, summary: parsed.summary, snippets_reviewed: codeSnippets.length },
      outputSummary: `Code review: ${findings.length} findings (${findings.filter(f => f.severity === "critical").length} critical)`,
    });
    task = completed.task;
    const outputPayload: any = completed.outputPayload;

    return Response.json({ ok: true, task_id: task.id, findings_count: outputPayload.findings.length, disclaimer: ENG_DISCLAIMER });
  } catch (error: any) {
    if (task?.id) {
      try {
        const base44 = createClientFromRequest(req);
        const publicError = stableCommercialPublicErrorCode(error, "code_review_failed");
        const terminal = protectedCommercialFailureTerminal(error, inference, task.material_effect === true);
        const outputPayload = { ok: false, error: publicError };
        await settleCanonicalAgentTask(base44.asServiceRole, task, { status: terminal.terminalState === "REVIEW_REQUIRED" ? "waiting_input" : "failed", error: publicError, output_summary: "Code review failed safely", output_payload_json: outputPayload, completed_at: new Date().toISOString() }, {
          ...terminal,
          result: outputPayload,
          terminalEvent: { eventType: "agent.task.terminal", source: "codeReviewAgent", payload: outputPayload },
        });
      } catch (markError) {
        protectedCommercialBestEffort(markError, { operation: 'codeReviewAgent.trace_terminal', code: 'code_review_failed', fallback: null, severity: 'critical' });
      }
    }
    return protectedCommercialErrorResponse(error, 'codeReviewAgent', 'code_review_failed', commercialInferenceHasPostEffect(error, inference));
  }
});
