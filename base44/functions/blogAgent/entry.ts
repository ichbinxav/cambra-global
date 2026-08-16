import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { callCambraClaude } from '../../shared/commercialModelRouter.ts';
import { paidProviderFetch } from '../../shared/costGovernance.ts';
import { internalErrorResponse } from '../../shared/publicErrors.ts';
import { captureEmergencyEpoch, guardedEmergencyEffect } from '../../shared/operationalControl.ts';
import {
  beginExternalApprovalEffects,
  claimExternalApprovalExecution,
  completeExternalApprovalExecution,
  externalExecutionHttpStatus,
  markExternalApprovalReviewRequired,
  releaseExternalApprovalClaim,
} from '../../shared/externalApprovalExecution.ts';

const AGENT_NAME = "blog";
const TASK_TYPE = "publish_blog";
const RISK_LEVEL = 2;
const ACTION_TYPE = "publish_blog";

async function callClaude(svc, prompt, eventKey) { return (await callCambraClaude(prompt, { tier:'standard', maxTokens:4096, svc, eventKey, source:'blogAgent' })).text; }

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

    // ═══ EXECUTE — publishes as Insight entity ═════════════════════════
    if (mode === "execute") {
      let communicationEpoch:any;
      try{communicationEpoch=await captureEmergencyEpoch(base44.asServiceRole,'communications');}
      catch(error:any){return Response.json({ok:false,error:error?.message||'emergency_control_paused:communications'},{status:409});}
      const approvalId = body?.approval_id;
      if (!approvalId) return Response.json({ ok: false, error: "approval_id required" }, { status: 400 });
      const ap = await base44.asServiceRole.entities.Approval.get(approvalId).catch((error:any)=>safeBestEffort(error,{operation:'blogAgent',fallback:null,severity:'secondary'}));
      if (!ap) return Response.json({ ok: false, error: "Approval not found" }, { status: 404 });
      if (ap.action_type !== ACTION_TYPE) return Response.json({ ok: false, error: `action_type mismatch: ${ap.action_type}` }, { status: 400 });
      if (ap.status !== "approved") return Response.json({ ok: false, error: `Cannot execute: status="${ap.status}"`, gate: "blocked" }, { status: 403 });

      task = await base44.asServiceRole.entities.AgentTask.get(ap.agent_task_id).catch((error:any)=>safeBestEffort(error,{operation:'blogAgent',fallback:null,severity:'secondary'}));
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
        const payload = ap.draft_payload_json || {};
        if (!String(payload.title || '').trim() || !String(payload.content || '').trim()) throw new Error('blog_approved_payload_incomplete');
        await beginExternalApprovalEffects(base44.asServiceRole, execution);
        // Publish as Insight (Insights entity is the platform's content store, used by /Insights page).
        const insight = await guardedEmergencyEffect(base44.asServiceRole,{claim:communicationEpoch,effect_key:`publish_insight:${ap.id}`,effect:()=>base44.asServiceRole.entities.Insight.create({
          title: payload.title,
          excerpt: payload.excerpt || "",
          content: payload.content,
          category: payload.category || "infrastructure",
          read_time: payload.read_time || 5,
          published: true,
        }),contain:(created:any)=>base44.asServiceRole.entities.Insight.update(created.id,{published:false})});
        const observed = await base44.asServiceRole.entities.Insight.get(insight.id).catch((error:any)=>safeBestEffort(error,{operation:'blogAgent.publish_postcondition_read',fallback:null,severity:'critical'}));
        if (!observed || observed.published !== true || String(observed.title || '') !== String(payload.title || '')) throw new Error('blog_publish_postcondition_failed');
        const result = await completeExternalApprovalExecution(base44.asServiceRole, execution, { task_id:task.id, insight_id:insight.id, published:true, execution_receipt_ref:`insight:${insight.id}` }, `Blog published as Insight: ${payload.title}`);
        return Response.json(result);
      } catch (error) {
        const code = String((error as any)?.code || (error as Error)?.message || 'blog_external_execution_failed');
        if (execution?.acquired) {
          if (execution.effectsStarted) await markExternalApprovalReviewRequired(base44.asServiceRole, execution, code);
          else await releaseExternalApprovalClaim(base44.asServiceRole, execution, code);
        }
        return Response.json({ ok:false, error:code, review_required:execution?.effectsStarted === true }, { status:execution?.effectsStarted ? 409 : Number((error as any)?.status || 500) });
      }
    }

    // ═══ DRAFT — Surfer brief if available, fallback Claude ═════════════
    const topic = body?.topic;
    const category = body?.category || "infrastructure";
    if (!topic) return Response.json({ ok: false, error: "topic required for draft mode" }, { status: 400 });

    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: true,
      risk_level: RISK_LEVEL,
      input_summary: `Draft blog post: ${topic}`,
      started_at: new Date().toISOString(),
    });

    const surferKey = Deno.env.get("SURFER_API_KEY");
    let brief = null;
    let briefSource = "none";

    if (surferKey) {
      try {
        const res = await paidProviderFetch(base44.asServiceRole, { event_key:`api:surfer:content-editor:${task.id}`, category:'api', provider:'surfer', source:'blogAgent', related_entity_type:'AgentTask', related_entity_id:task.id }, "https://app.surferseo.com/api/v1/content_editors", {
          method: "POST",
          headers: { "Content-Type": "application/json", "API-KEY": surferKey },
          body: JSON.stringify({ keyword: topic, location: "United Kingdom" }),
        });
        const data = await res.json();
        if (res.ok) {
          brief = {
            target_keyword: topic,
            secondary_keywords: data?.terms || data?.secondary_keywords || [],
            target_word_count: data?.target_word_count || 1500,
            outline_hints: data?.headings || [],
          };
          briefSource = "surfer";
        }
      } catch (_) { /* fall through */ }
    }

    const prompt = [
      "Eres editor de CAMBRA (infraestructura económica para ecommerce independientes).",
      "Escribe outline detallado + intro de un blog post.",
      "Voz: founder editorial, sin hype, datos concretos, perspectiva propia.",
      "",
      "Devuelve EXACTAMENTE este formato:",
      "TITLE: <título, max 70 chars>",
      "EXCERPT: <2 líneas, max 160 chars>",
      "OUTLINE:",
      "- H2: <sección>",
      "  - Punto clave",
      "  - Punto clave",
      "- H2: <sección>",
      "  ...",
      "INTRO:",
      "<200-300 palabras de intro real, publicable>",
      "",
      `Tema: ${topic}`,
      `Categoría: ${category}`,
      brief ? `\nSEO brief (Surfer):\n${JSON.stringify(brief)}` : "",
    ].join("\n");

    const text = await callClaude(base44.asServiceRole, prompt, task?.id || crypto.randomUUID());
    const titleMatch = text.match(/TITLE:\s*(.+)/i);
    const excerptMatch = text.match(/EXCERPT:\s*(.+)/i);
    const outlineMatch = text.match(/OUTLINE:\s*([\s\S]+?)\nINTRO:/i);
    const introMatch = text.match(/INTRO:\s*([\s\S]+)/i);

    const title = (titleMatch?.[1] || topic).trim();
    const excerpt = (excerptMatch?.[1] || "").trim();
    const outline = (outlineMatch?.[1] || "").trim();
    const intro = (introMatch?.[1] || "").trim();

    if (!intro || !outline) throw new Error(`Claude returned unparseable blog draft: ${text.slice(0, 200)}`);

    const fullContent = `${intro}\n\n---\n\n## Outline (draft)\n\n${outline}`;
    const draftPayload = {
      title,
      excerpt,
      content: fullContent,
      category,
      read_time: Math.max(3, Math.ceil(fullContent.split(/\s+/).length / 200)),
      seo_brief: brief,
      brief_source: briefSource,
    };

    const approval = await base44.asServiceRole.entities.Approval.create({
      brand_id: "_platform",
      agent_task_id: task.id,
      action_type: ACTION_TYPE,
      risk_level: RISK_LEVEL,
      draft_content: `Blog draft (SEO brief: ${briefSource})\n\nTitle: ${title}\nExcerpt: ${excerpt}\n\n${fullContent}`,
      draft_payload_json: draftPayload,
      status: "pending",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "waiting_approval",
      approval_id: approval.id,
      output_summary: `Blog draft ready (brief: ${briefSource}) — awaiting approval`,
      output_payload_json: { draft: draftPayload, approval_id: approval.id },
    });

    return Response.json({ ok: true, task_id: task.id, approval_id: approval.id, status: "waiting_approval", brief_source: briefSource });
  } catch (error) {
    if (task?.id) {
      try {
        const base44 = createClientFromRequest(req);
        await base44.asServiceRole.entities.AgentTask.update(task.id, { status: "failed", error: error.message, completed_at: new Date().toISOString() });
      } catch (_) { /* swallow */ }
    }
    return internalErrorResponse(error, 'blogAgent');
  }
});
