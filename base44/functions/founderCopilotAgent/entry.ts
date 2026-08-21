import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { callCambraClaude } from '../../shared/commercialModelRouter.ts';
import { createCanonicalAgentTask, settleCanonicalAgentTask } from '../../shared/agentTaskEnvelope.ts';
import { commercialInferenceHasPostEffect, failedNoEffectTerminal, protectedCommercialFailureTerminal, reviewRequiredNoEffectTerminal, settleProtectedCommercialInferenceSuccess } from '../../shared/commercialAgentTask.ts';
import {
  COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED,
  COMMERCIAL_EGRESS_INPUT_REVIEW_REQUIRED,
  observedPolicyContext,
  observedPolicyMetadata,
  protectedCommercialBestEffort,
  protectedCommercialErrorResponse,
  resolveObservedAnthropicEgressPolicy,
  sanitizeCommercialEgress,
  stableCommercialPublicErrorCode,
} from '../../shared/commercialProtectedEgress.ts';

const AGENT_NAME = "founder_copilot";
const TASK_TYPE = "daily_brief";
const RISK_LEVEL = 0;
const PROCESSING_PURPOSE = "admin_founder_daily_brief" as const;

async function callClaude(svc, prompt, eventKey, policy) { return callCambraClaude(prompt, { tier:'standard', maxTokens:1024, svc, eventKey, source:'founderCopilotAgent', relatedEntityType:'AgentTask', relatedEntityId:eventKey, protectedEgress:{purpose:PROCESSING_PURPOSE,policy} }); }

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

    // 1) Collect the exact effective inputs before binding the root hash.
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [pendingApprovals, failedTasks, activeBrands] = await Promise.all([
      base44.asServiceRole.entities.Approval
        .filter({ status: "pending" }, "created_date", 100).catch((error:any)=>{sourceReadFailures.push('Approval');return protectedCommercialBestEffort(error,{operation:'founderCopilotAgent.read_approval',code:'founder_copilot_source_coverage_incomplete',fallback:[],severity:'secondary'});}),
      base44.asServiceRole.entities.AgentTask
        .filter({ status: "failed", created_date: { $gte: since24h } }, "-created_date", 100).catch((error:any)=>{sourceReadFailures.push('AgentTask');return protectedCommercialBestEffort(error,{operation:'founderCopilotAgent.read_agent_task',code:'founder_copilot_source_coverage_incomplete',fallback:[],severity:'secondary'});}),
      base44.asServiceRole.entities.Brand
        .list("-updated_date", 50).catch((error:any)=>{sourceReadFailures.push('Brand');return protectedCommercialBestEffort(error,{operation:'founderCopilotAgent.read_brand',code:'founder_copilot_source_coverage_incomplete',fallback:[],severity:'secondary'});}),
    ]);
    if (pendingApprovals.length >= 100) sourceAtCap.push("Approval");
    if (failedTasks.length >= 100) sourceAtCap.push("AgentTask");
    if (activeBrands.length >= 50) sourceAtCap.push("Brand");

    const approvalsCount = pendingApprovals.length;
    const approvalsByRisk = {
      L4: pendingApprovals.filter(a => a.risk_level === 4).length,
      L3: pendingApprovals.filter(a => a.risk_level === 3).length,
      L2: pendingApprovals.filter(a => a.risk_level === 2).length,
    };
    const failedCount = failedTasks.length;
    // 2) Compose provider input from fixed labels and counts only. Action
    // names, brand stages and task text are deliberately excluded.
    const rawPrompt = [
      "Eres el copilot de un founder solo construyendo CAMBRA (infraestructura económica para ecommerce independientes).",
      "Genera un brief diario en español, máximo 300 palabras, formato estricto:",
      "🔴 Urgente — qué exige decisión hoy",
      "🟡 Atención — qué vigilar esta semana",
      "🟢 Pipeline — qué progresa solo",
      "📋 Hoy — 3 a 5 acciones concretas, en orden de impacto",
      "",
      "Tono: directo, sin hype, sin emojis extra fuera del formato. Cero relleno.",
      "",
      "DATOS DE HOY:",
      `- Approvals pendientes: ${approvalsCount} (L4 financiero/legal: ${approvalsByRisk.L4}, L3 externo: ${approvalsByRisk.L3}, L2 client-visible: ${approvalsByRisk.L2})`,
      `- Tasks fallidos últimas 24h: ${failedCount}`,
      `- Brands activos observados: ${activeBrands.length}`,
    ].filter(Boolean).join("\n");

    const sourceCoverageComplete = sourceReadFailures.length === 0 && sourceAtCap.length === 0;
    const sanitizedPrompt = sanitizeCommercialEgress(rawPrompt);
    const prompt = sanitizedPrompt.ok && typeof sanitizedPrompt.value === "string"
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
      input_summary: "Daily founder brief — pending approvals + failed tasks 24h + active brands",
      started_at: new Date().toISOString(),
    }, {
      workflowKey: "founder_copilot_agent",
      workflowVersion: "v2.0.0",
      tenantKey: "_platform",
      processingPurpose: PROCESSING_PURPOSE,
      functionName: "founderCopilotAgent",
      input: inferenceAllowed
        ? { prompt, since_24h: since24h, approval_counts: { total: approvalsCount, by_risk: approvalsByRisk }, failed_tasks_24h: failedCount, active_brands: activeBrands.length, anthropic_policy: observedPolicyMetadata(policy.evidence), failed_source_reads: [], source_at_cap: [] }
        : { since_24h: since24h, approval_count: approvalsCount, failed_tasks_24h: failedCount, active_brands: activeBrands.length, provider_egress_status: sourceCoverageComplete ? "REVIEW_REQUIRED" : "NOT_APPLICABLE", failed_source_reads: sourceReadFailures, source_at_cap: sourceAtCap },
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
      const outputPayload = { ok: false, error: "founder_copilot_source_coverage_incomplete", source_coverage: { complete: false, failed_reads: sourceReadFailures, at_cap: sourceAtCap } };
      task = await settleCanonicalAgentTask(base44.asServiceRole, task, {
        status: "failed",
        error: outputPayload.error,
        output_summary: "Founder brief blocked: source coverage incomplete",
        output_payload_json: outputPayload,
        completed_at: new Date().toISOString(),
      }, {
        ...failedNoEffectTerminal(),
        intelligenceContext: { status: "UNKNOWN" },
        result: outputPayload,
        terminalEvent: { eventType: "agent.task.terminal", source: "founderCopilotAgent", payload: outputPayload },
      });
      return Response.json({ ok: false, error: outputPayload.error, task_id: task.id, automatic_retry_blocked: true }, { status: 503 });
    }

    if (!prompt || !policy?.ok) {
      const errorCode = stableCommercialPublicErrorCode({
        code: prompt
          ? COMMERCIAL_ANTHROPIC_POLICY_REVIEW_REQUIRED
          : COMMERCIAL_EGRESS_INPUT_REVIEW_REQUIRED,
      }, "founder_copilot_failed");
      const outputPayload = { ok: false, error: errorCode, provider_egress: { status: "REVIEW_REQUIRED", purpose: PROCESSING_PURPOSE } };
      task = await settleCanonicalAgentTask(base44.asServiceRole, task, {
        status: "waiting_input",
        error: errorCode,
        output_summary: "Founder brief blocked pending provider-egress review",
        output_payload_json: outputPayload,
        completed_at: new Date().toISOString(),
      }, {
        ...reviewRequiredNoEffectTerminal(),
        policyContext: { status: "UNKNOWN" },
        result: outputPayload,
        terminalEvent: { eventType: "agent.task.terminal", source: "founderCopilotAgent", payload: outputPayload },
      });
      return Response.json({ ok: false, error: errorCode, task_id: task.id, review_required: true, automatic_retry_blocked: true }, { status: 409 });
    }

    // 3) Call Claude only with complete source coverage.
    inference = await callClaude(base44.asServiceRole, prompt, task.id, policy.evidence);
    const brief = inference.text;

    // 4) Bind the complete user-visible output as the terminal result.
    const completed = await settleProtectedCommercialInferenceSuccess(base44.asServiceRole, task, {
      source: "founderCopilotAgent",
      inference,
      output: {
        brief,
        counts: {
          pending_approvals: approvalsCount,
          approvals_by_risk: approvalsByRisk,
          failed_tasks_24h: failedCount,
          active_brands_observed: activeBrands.length,
        },
        generated_at: new Date().toISOString(),
        source_coverage: { complete: true, failed_reads: [], at_cap: [] },
      },
      outputSummary: `Daily brief generated · ${approvalsCount} approvals · ${failedCount} failed 24h`,
    });
    task = completed.task;
    const outputPayload: any = completed.outputPayload;

    return Response.json({ ok: true, task_id: task.id, brief: outputPayload.brief, counts: outputPayload.counts });
  } catch (error: any) {
    if (task?.id) {
      try {
        const base44 = createClientFromRequest(req);
        const publicError = stableCommercialPublicErrorCode(error, "founder_copilot_failed");
        const terminal = protectedCommercialFailureTerminal(error, inference, task.material_effect === true);
        const outputPayload = { ok: false, error: publicError, source_coverage: { complete: sourceReadFailures.length === 0 && sourceAtCap.length === 0, failed_reads: sourceReadFailures, at_cap: sourceAtCap } };
        await settleCanonicalAgentTask(base44.asServiceRole, task, {
          status: terminal.terminalState === "REVIEW_REQUIRED" ? "waiting_input" : "failed",
          error: publicError,
          output_summary: "Founder brief failed safely",
          output_payload_json: outputPayload,
          completed_at: new Date().toISOString(),
        }, {
          ...terminal,
          intelligenceContext: sourceReadFailures.length || sourceAtCap.length ? { status: "UNKNOWN" } : { status: "NOT_APPLICABLE" },
          result: outputPayload,
          terminalEvent: { eventType: "agent.task.terminal", source: "founderCopilotAgent", payload: outputPayload },
        });
      } catch (markError) {
        protectedCommercialBestEffort(markError, { operation: 'founderCopilotAgent.trace_terminal', code: 'founder_copilot_failed', fallback: null, severity: 'critical' });
      }
    }
    return protectedCommercialErrorResponse(error, 'founderCopilotAgent', 'founder_copilot_failed', commercialInferenceHasPostEffect(error, inference));
  }
});
