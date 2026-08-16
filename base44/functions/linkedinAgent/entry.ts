import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { callCambraClaude } from '../../shared/commercialModelRouter.ts';
import { paidProviderFetch } from '../../shared/costGovernance.ts';
import { captureEmergencyEpoch } from '../../shared/operationalControl.ts';
import { internalErrorResponse } from '../../shared/publicErrors.ts';
import {
  beginExternalApprovalEffects,
  claimExternalApprovalExecution,
  completeExternalApprovalExecution,
  externalExecutionHttpStatus,
  markExternalApprovalReviewRequired,
  releaseExternalApprovalClaim,
} from '../../shared/externalApprovalExecution.ts';

const AGENT_NAME = "linkedin";
const TASK_TYPE = "publish_linkedin_post";
const RISK_LEVEL = 2;
const ACTION_TYPE = "publish_linkedin_post";

async function callClaude(svc, prompt, eventKey) { return (await callCambraClaude(prompt, { tier:'standard', maxTokens:2048, svc, eventKey, source:'linkedinAgent' })).text; }

Deno.serve(async (req) => {
  let task = null;
  let execution:any = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode === "execute" ? "execute" : "draft";

    // ═══ EXECUTE — strict Approval gate ═════════════════════════════════
    if (mode === "execute") {
      let communicationEpoch:any;
      try { communicationEpoch=await captureEmergencyEpoch(base44.asServiceRole, 'communications'); }
      catch (error) { return Response.json({ ok:false, error:error?.message || 'emergency_control_paused:communications' }, { status:409 }); }
      const approvalId = body?.approval_id;
      if (!approvalId) return Response.json({ ok: false, error: "approval_id required for execute mode" }, { status: 400 });

      const ap = await base44.asServiceRole.entities.Approval.get(approvalId).catch((error:any)=>safeBestEffort(error,{operation:'linkedinAgent',fallback:null,severity:'secondary'}));
      if (!ap) return Response.json({ ok: false, error: "Approval not found" }, { status: 404 });
      if (ap.action_type !== ACTION_TYPE) return Response.json({ ok: false, error: `Approval action_type mismatch: ${ap.action_type}` }, { status: 400 });
      if (ap.status !== "approved") return Response.json({ ok: false, error: `Cannot execute: status="${ap.status}", must be "approved"`, gate: "blocked" }, { status: 403 });

      task = await base44.asServiceRole.entities.AgentTask.get(ap.agent_task_id).catch((error:any)=>safeBestEffort(error,{operation:'linkedinAgent',fallback:null,severity:'secondary'}));
      if (!task) return Response.json({ ok: false, error: "AgentTask not found" }, { status: 404 });
      try {
        execution = await claimExternalApprovalExecution(base44.asServiceRole, {
          approval:ap, task, commandKey:body.execution_command_key, actorEmail:user.email,
          actionType:ACTION_TYPE, agentName:AGENT_NAME, taskType:TASK_TYPE, riskLevel:RISK_LEVEL,
        });
        if (!execution.acquired) {
          if (execution.state === 'replay') return Response.json({ ...execution.result, ok:true, idempotent_replay:true });
          return Response.json({ ok:false, error:execution.error || 'external_execution_not_claimed', execution_state:execution.state, review_required:execution.state === 'review_required' }, { status:externalExecutionHttpStatus(execution) });
        }
        const taplioKey = Deno.env.get("TAPLIO_API_KEY");
        if (!taplioKey) throw new Error("TOOL_NOT_CONFIGURED:TAPLIO_API_KEY");
        const payload = ap.draft_payload_json || {};
        if (!String(payload.content || '').trim()) throw new Error('linkedin_approved_payload_incomplete');
        await beginExternalApprovalEffects(base44.asServiceRole, execution);
        const res = await paidProviderFetch(base44.asServiceRole, { event_key:`api:taplio:publish:${ap.id}`, stable_event_key:true, category:'api', provider:'taplio', source:'linkedinAgent', related_entity_type:'Approval', related_entity_id:ap.id, emergency_epoch_claim:communicationEpoch }, "https://api.taplio.com/v1/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${taplioKey}` },
          body: JSON.stringify({ content: payload.content, schedule_at: payload.schedule_at || null }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(`taplio_publish_failed:${res.status}`);
        if (!data || typeof data !== 'object') throw new Error('taplio_publish_postcondition_failed');
        const providerReference=String(data.id||data.post_id||'').trim();
        if(!providerReference)throw new Error('taplio_provider_receipt_missing');
        const result = await completeExternalApprovalExecution(base44.asServiceRole, execution, { task_id:task.id, published:true, provider:'taplio', provider_response:data, execution_receipt_ref:`taplio-post:${providerReference}` }, 'LinkedIn post published via Taplio');
        return Response.json(result);
      } catch (error) {
        const code = String((error as any)?.code || (error as Error)?.message || 'linkedin_external_execution_failed');
        if (execution?.acquired) {
          if (execution.effectsStarted) await markExternalApprovalReviewRequired(base44.asServiceRole, execution, code);
          else await releaseExternalApprovalClaim(base44.asServiceRole, execution, code);
        }
        return Response.json({ ok:false, error:code, review_required:execution?.effectsStarted === true }, { status:execution?.effectsStarted ? 409 : Number((error as any)?.status || 500) });
      }
    }

    // ═══ DRAFT — Taplio if available, fallback Claude ═══════════════════
    const topic = body?.topic || "infraestructura económica de los ecommerce independientes";
    const angle = body?.angle || "observación contraria a la corriente";

    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: true,
      risk_level: RISK_LEVEL,
      input_summary: `Draft LinkedIn post: ${topic}`,
      started_at: new Date().toISOString(),
    });

    const taplioKey = Deno.env.get("TAPLIO_API_KEY");
    let content = "";
    let source = "claude_fallback";

    if (taplioKey) {
      try {
        const res = await paidProviderFetch(base44.asServiceRole, { event_key:`api:taplio:generate:${task.id}`, category:'api', provider:'taplio', source:'linkedinAgent', related_entity_type:'AgentTask', related_entity_id:task.id }, "https://api.taplio.com/v1/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${taplioKey}` },
          body: JSON.stringify({ topic, angle, tone: "founder", length: "medium" }),
        });
        const data = await res.json();
        if (res.ok) { content = data?.content || data?.post || ""; source = "taplio"; }
      } catch (_) { /* fall through to Claude */ }
    }

    if (!content) {
      const prompt = [
        "Eres el founder de CAMBRA (infraestructura económica para ecommerce independientes — pagos, shipping, SaaS).",
        "Escribe un post de LinkedIn en voz de founder. 150-250 palabras.",
        "Reglas: sin hype, sin 'I'm thrilled', sin emojis decorativos. Una observación específica + dato concreto + reflexión.",
        "Máximo 2 hashtags al final, relevantes.",
        "Devuelve SOLO el texto del post, sin meta-comentarios.",
        "",
        `Tema: ${topic}`,
        `Ángulo: ${angle}`,
      ].join("\n");
      content = (await callClaude(base44.asServiceRole, prompt, task?.id || crypto.randomUUID())).trim();
    }

    if (!content) throw new Error("Failed to generate post content");

    const draftPayload = { content, source, schedule_at: body?.schedule_at || null };
    const approval = await base44.asServiceRole.entities.Approval.create({
      brand_id: "_platform",
      agent_task_id: task.id,
      action_type: ACTION_TYPE,
      risk_level: RISK_LEVEL,
      draft_content: `LinkedIn post (source: ${source})\n\n${content}`,
      draft_payload_json: draftPayload,
      status: "pending",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "waiting_approval",
      approval_id: approval.id,
      output_summary: `LinkedIn draft ready (source: ${source}) — awaiting approval`,
      output_payload_json: { draft: draftPayload, approval_id: approval.id },
    });

    return Response.json({ ok: true, task_id: task.id, approval_id: approval.id, status: "waiting_approval", source });
  } catch (error) {
    if (task?.id) {
      try {
        const base44 = createClientFromRequest(req);
        await base44.asServiceRole.entities.AgentTask.update(task.id, { status: "failed", error: error.message, completed_at: new Date().toISOString() });
      } catch (_) { /* swallow */ }
    }
    return internalErrorResponse(error, 'linkedinAgent');
  }
});
