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

const AGENT_NAME = "x_twitter";
const TASK_TYPE = "publish_x_post";
const RISK_LEVEL = 2;
const ACTION_TYPE = "publish_x_post";

async function callClaude(svc, prompt, eventKey) { return (await callCambraClaude(prompt, { tier:'standard', maxTokens:1024, svc, eventKey, source:'xTwitterAgent' })).text; }

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

    // ═══ EXECUTE ════════════════════════════════════════════════════════
    if (mode === "execute") {
      let communicationEpoch:any;
      try { communicationEpoch=await captureEmergencyEpoch(base44.asServiceRole, 'communications'); }
      catch (error) { return Response.json({ ok:false, error:error?.message || 'emergency_control_paused:communications' }, { status:409 }); }
      const approvalId = body?.approval_id;
      if (!approvalId) return Response.json({ ok: false, error: "approval_id required" }, { status: 400 });
      const ap = await base44.asServiceRole.entities.Approval.get(approvalId).catch((error:any)=>safeBestEffort(error,{operation:'xTwitterAgent',fallback:null,severity:'secondary'}));
      if (!ap) return Response.json({ ok: false, error: "Approval not found" }, { status: 404 });
      if (ap.action_type !== ACTION_TYPE) return Response.json({ ok: false, error: `action_type mismatch: ${ap.action_type}` }, { status: 400 });
      if (ap.status !== "approved") return Response.json({ ok: false, error: `Cannot execute: status="${ap.status}"`, gate: "blocked" }, { status: 403 });

      task = await base44.asServiceRole.entities.AgentTask.get(ap.agent_task_id).catch((error:any)=>safeBestEffort(error,{operation:'xTwitterAgent',fallback:null,severity:'secondary'}));
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
        const typefullyKey = Deno.env.get("TYPEFULLY_API_KEY");
        if (!typefullyKey) throw new Error("TOOL_NOT_CONFIGURED:TYPEFULLY_API_KEY");
        const payload = ap.draft_payload_json || {};
        if (!String(payload.content || '').trim()) throw new Error('x_approved_payload_incomplete');
        await beginExternalApprovalEffects(base44.asServiceRole, execution);
        const res = await paidProviderFetch(base44.asServiceRole, { event_key:`api:typefully:publish:${ap.id}`, stable_event_key:true, category:'api', provider:'typefully', source:'xTwitterAgent', related_entity_type:'Approval', related_entity_id:ap.id, emergency_epoch_claim:communicationEpoch }, "https://api.typefully.com/v1/drafts/", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-KEY": typefullyKey },
          body: JSON.stringify({ content: payload.content, share: true, "auto-retweet-enabled": false }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(`typefully_publish_failed:${res.status}`);
        if (!data || typeof data !== 'object') throw new Error('typefully_publish_postcondition_failed');
        const providerReference=String(data.id||data.post_id||data.draft?.id||'').trim();
        if(!providerReference)throw new Error('typefully_provider_receipt_missing');
        const result = await completeExternalApprovalExecution(base44.asServiceRole, execution, { task_id:task.id, published:true, provider:'typefully', provider_response:data, execution_receipt_ref:`typefully-post:${providerReference}` }, 'X post published via Typefully');
        return Response.json(result);
      } catch (error) {
        const code = String((error as any)?.code || (error as Error)?.message || 'x_external_execution_failed');
        if (execution?.acquired) {
          if (execution.effectsStarted) await markExternalApprovalReviewRequired(base44.asServiceRole, execution, code);
          else await releaseExternalApprovalClaim(base44.asServiceRole, execution, code);
        }
        return Response.json({ ok:false, error:code, review_required:execution?.effectsStarted === true }, { status:execution?.effectsStarted ? 409 : Number((error as any)?.status || 500) });
      }
    }

    // ═══ DRAFT ═════════════════════════════════════════════════════════
    const topic = body?.topic || "infraestructura económica de los ecommerce independientes";
    const format = body?.format === "thread" ? "thread" : "single";

    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: true,
      risk_level: RISK_LEVEL,
      input_summary: `Draft X ${format}: ${topic}`,
      started_at: new Date().toISOString(),
    });

    const typefullyKey = Deno.env.get("TYPEFULLY_API_KEY");
    let content = "";
    let source = "claude_fallback";

    if (typefullyKey) {
      try {
        const res = await paidProviderFetch(base44.asServiceRole, { event_key:`api:typefully:generate:${task.id}`, category:'api', provider:'typefully', source:'xTwitterAgent', related_entity_type:'AgentTask', related_entity_id:task.id }, "https://api.typefully.com/v1/ai/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-KEY": typefullyKey },
          body: JSON.stringify({ topic, format }),
        });
        const data = await res.json();
        if (res.ok) { content = data?.content || data?.draft || ""; source = "typefully"; }
      } catch (_) { /* fall through */ }
    }

    if (!content) {
      const prompt = format === "thread"
        ? [
            "Eres el founder de CAMBRA. Escribe un thread de X (Twitter) de 4-6 tweets.",
            "Cada tweet: <280 chars. Separa cada tweet con '---' en su propia línea.",
            "Sin hype, sin emojis decorativos. Hook fuerte, datos concretos, cierre con observación.",
            "",
            `Tema: ${topic}`,
          ].join("\n")
        : [
            "Eres el founder de CAMBRA. Escribe un solo tweet.",
            "Menos de 280 caracteres. Sin hashtags. Sin emojis. Una idea filo, no genérica.",
            "Devuelve SOLO el texto del tweet.",
            "",
            `Tema: ${topic}`,
          ].join("\n");
      content = (await callClaude(base44.asServiceRole, prompt, task?.id || crypto.randomUUID())).trim();
    }

    if (!content) throw new Error("Failed to generate X content");

    const draftPayload = { content, format, source };
    const approval = await base44.asServiceRole.entities.Approval.create({
      brand_id: "_platform",
      agent_task_id: task.id,
      action_type: ACTION_TYPE,
      risk_level: RISK_LEVEL,
      draft_content: `X ${format} (source: ${source})\n\n${content}`,
      draft_payload_json: draftPayload,
      status: "pending",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "waiting_approval",
      approval_id: approval.id,
      output_summary: `X ${format} draft ready (source: ${source}) — awaiting approval`,
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
    return internalErrorResponse(error, 'xTwitterAgent');
  }
});
