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
  stableCommercialPublicErrorCode,
} from '../../shared/commercialProtectedEgress.ts';

const AGENT_NAME = "security";
const TASK_TYPE = "security_review";
const RISK_LEVEL = 1;
const ENG_DISCLAIMER = "⚠️ Fix propuesto por IA. Revísalo antes de dárselo a Base44.";
const PROCESSING_PURPOSE = "admin_requested_security_review" as const;

async function callClaude(svc, prompt, eventKey, policy) { return callCambraClaude(prompt, { tier:'high_reasoning', maxTokens:4000, svc, eventKey, source:'securityAgent', relatedEntityType:'AgentTask', relatedEntityId:eventKey, protectedEgress:{purpose:PROCESSING_PURPOSE,policy} }); }

// L1 — DETECTA seguridad, no APLICA. Misma garantía estructural que codeReviewAgent.
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
    const inferenceRequired = codeSnippets.length > 0;
    const providerSnippets = normalizeCommercialCodeSnippets(
      inferenceRequired ? codeSnippets : [],
    );
    const policy = inferenceRequired && providerSnippets !== null
      ? resolveObservedAnthropicEgressPolicy(PROCESSING_PURPOSE)
      : null;
    const inferenceAllowed = inferenceRequired && providerSnippets !== null && policy?.ok === true;
    task = await createCanonicalAgentTask(base44.asServiceRole, req, {
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: RISK_LEVEL,
      input_summary: `Security review: ${codeSnippets.length} snippets`,
      started_at: new Date().toISOString(),
    }, {
      workflowKey: "security_agent",
      workflowVersion: "v2.0.0",
      tenantKey: "_platform",
      processingPurpose: PROCESSING_PURPOSE,
      functionName: "securityAgent",
      input: inferenceAllowed
        ? { code_snippets: providerSnippets, anthropic_policy: observedPolicyMetadata(policy.evidence) }
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
        output_summary: "Security review: no snippets provided",
        output_payload_json: outputPayload,
        completed_at: new Date().toISOString(),
      }, {
        ...completedNoEffectTerminal(),
        result: outputPayload,
        terminalEvent: { eventType: "agent.task.terminal", source: "securityAgent", payload: outputPayload },
      });
      return Response.json({ ok: true, task_id: task.id, findings_count: 0 });
    }

    if (!providerSnippets || !policy?.ok) {
      const errorCode = stableCommercialPublicErrorCode({
        code: providerSnippets
          ? COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED
          : COMMERCIAL_EGRESS_INPUT_REVIEW_REQUIRED,
      }, "security_review_failed");
      const outputPayload = { ok: false, error: errorCode, provider_egress: { status: "REVIEW_REQUIRED", purpose: PROCESSING_PURPOSE } };
      task = await settleCanonicalAgentTask(base44.asServiceRole, task, {
        status: "waiting_input",
        error: errorCode,
        output_summary: "Security review blocked pending provider-egress review",
        output_payload_json: outputPayload,
        completed_at: new Date().toISOString(),
      }, {
        ...reviewRequiredNoEffectTerminal(),
        policyContext: { status: "UNKNOWN" },
        result: outputPayload,
        terminalEvent: { eventType: "agent.task.terminal", source: "securityAgent", payload: outputPayload },
      });
      return Response.json({ ok: false, error: errorCode, task_id: task.id, review_required: true, automatic_retry_blocked: true }, { status: 409 });
    }

    const prompt = [
      "Eres auditor de seguridad senior para CAMBRA (datos financieros + GDPR en France — categoría sensible).",
      "",
      "Áreas a vigilar:",
      "- tenant_isolation: queries .list() / .filter() sin brand_id o created_by → cualquier usuario lee data de otro tenant",
      "- exposed_data: datos personales o financieros expuestos en responses, logs, o entregados a usuarios no-admin",
      "- auth: endpoints sin auth.me() o sin check de role en operaciones admin/sensibles",
      "- secrets: API keys, tokens o secrets hardcodeados en código en vez de Deno.env.get",
      "- injection: inputs sin validar usados en queries o llamadas externas",
      "",
      "Para CAMBRA (financiero + GDPR): cualquier fuga de tenant o de PII = severity 'critical'.",
      "",
      "IMPORTANTE: NO aplicas cambios. NO tienes acceso de escritura al repo. Solo PROPONES fixes con diff exacto + ready_to_paste_prompt para que el founder lo lleve a Base44 manualmente.",
      "- ready_to_paste_prompt: instrucción en español lista para copiar y pegar al builder chat de Base44. Empieza con 'En <file>, …' e indica el cambio concreto. NO pegues el diff entero dentro — Base44 trabaja con instrucciones, no con diffs literales.",
      "",
      "Devuelve SOLO JSON con shape:",
      `{"findings":[{"id":"<slug>","file":"<path>","location":"<línea o función>","security_category":"<tenant_isolation|exposed_data|auth|secrets|injection>","severity":"<info|warning|critical>","problem_description":"<2-3 líneas>","proposed_fix_diff":"<diff before/after>","ready_to_paste_prompt":"<instrucción lista para pegar a Base44>","risk_of_applying":"<low|medium|high>","risk_explanation":"<por qué>"}],"summary":"<2 líneas>"}`,
      "",
      "Si no hay hallazgos: findings: [].",
      "",
      "CÓDIGO A AUDITAR:",
      ...providerSnippets.map((s, i) => `--- Snippet ${i + 1} (${s.file || "unknown"}) ---\n${s.content || ""}`),
    ].join("\n");

    inference = await callClaude(base44.asServiceRole, prompt, task.id, policy.evidence);
    const parsed = parseCommercialFindingsJson(inference.text);
    if (!parsed) {
      throw commercialInferenceReviewError("SECURITY_REVIEW_RESPONSE_INVALID");
    }
    const findings = (Array.isArray(parsed.findings) ? parsed.findings : []).map(f => ({
      ...f,
      source_agent: AGENT_NAME,
      detected_at: new Date().toISOString(),
    }));

    const completed = await settleProtectedCommercialInferenceSuccess(base44.asServiceRole, task, {
      source: "securityAgent",
      inference,
      output: { disclaimer: ENG_DISCLAIMER, findings, summary: parsed.summary, snippets_reviewed: codeSnippets.length },
      outputSummary: `Security: ${findings.length} findings (${findings.filter(f => f.severity === "critical").length} critical)`,
    });
    task = completed.task;
    const outputPayload: any = completed.outputPayload;

    return Response.json({ ok: true, task_id: task.id, findings_count: outputPayload.findings.length, disclaimer: ENG_DISCLAIMER });
  } catch (error: any) {
    if (task?.id) {
      try {
        const base44 = createClientFromRequest(req);
        const publicError = stableCommercialPublicErrorCode(error, "security_review_failed");
        const terminal = protectedCommercialFailureTerminal(error, inference, task.material_effect === true);
        const outputPayload = { ok: false, error: publicError };
        await settleCanonicalAgentTask(base44.asServiceRole, task, { status: terminal.terminalState === "REVIEW_REQUIRED" ? "waiting_input" : "failed", error: publicError, output_summary: "Security review failed safely", output_payload_json: outputPayload, completed_at: new Date().toISOString() }, {
          ...terminal,
          result: outputPayload,
          terminalEvent: { eventType: "agent.task.terminal", source: "securityAgent", payload: outputPayload },
        });
      } catch (markError) {
        protectedCommercialBestEffort(markError, { operation: 'securityAgent.trace_terminal', code: 'security_review_failed', fallback: null, severity: 'critical' });
      }
    }
    return protectedCommercialErrorResponse(error, 'securityAgent', 'security_review_failed', commercialInferenceHasPostEffect(error, inference));
  }
});
