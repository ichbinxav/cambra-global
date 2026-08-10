import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const AGENT_NAME = "linkedin";
const TASK_TYPE = "publish_linkedin_post";
const RISK_LEVEL = 2;
const ACTION_TYPE = "publish_linkedin_post";

async function callClaude(prompt) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("TOOL_NOT_CONFIGURED: añade ANTHROPIC_API_KEY a Base44 secrets para activar este agente");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: Deno.env.get('ANTHROPIC_STANDARD_MODEL')||'claude-sonnet-5',
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Claude API error: ${data?.error?.message || res.statusText}`);
  return data?.content?.[0]?.text || "";
}

Deno.serve(async (req) => {
  let task = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode === "execute" ? "execute" : "draft";

    // ═══ EXECUTE — strict Approval gate ═════════════════════════════════
    if (mode === "execute") {
      const approvalId = body?.approval_id;
      if (!approvalId) return Response.json({ ok: false, error: "approval_id required for execute mode" }, { status: 400 });

      const ap = await base44.asServiceRole.entities.Approval.get(approvalId).catch(() => null);
      if (!ap) return Response.json({ ok: false, error: "Approval not found" }, { status: 404 });
      if (ap.action_type !== ACTION_TYPE) return Response.json({ ok: false, error: `Approval action_type mismatch: ${ap.action_type}` }, { status: 400 });
      if (ap.status !== "approved") return Response.json({ ok: false, error: `Cannot execute: status="${ap.status}", must be "approved"`, gate: "blocked" }, { status: 403 });

      task = await base44.asServiceRole.entities.AgentTask.get(ap.agent_task_id).catch(() => null);
      if (!task) return Response.json({ ok: false, error: "AgentTask not found" }, { status: 404 });
      await base44.asServiceRole.entities.AgentTask.update(task.id, { status: "running" });

      const taplioKey = Deno.env.get("TAPLIO_API_KEY");
      if (!taplioKey) throw new Error("TOOL_NOT_CONFIGURED: añade TAPLIO_API_KEY a Base44 secrets para publicar en LinkedIn");

      const payload = ap.draft_payload_json || {};
      const res = await fetch("https://api.taplio.com/v1/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${taplioKey}` },
        body: JSON.stringify({ content: payload.content, schedule_at: payload.schedule_at || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`Taplio API error: ${data?.error?.message || res.statusText}`);

      await base44.asServiceRole.entities.AgentTask.update(task.id, {
        status: "completed",
        output_summary: "LinkedIn post published via Taplio",
        output_payload_json: { taplio_response: data, approval_id: ap.id },
        completed_at: new Date().toISOString(),
      });
      return Response.json({ ok: true, task_id: task.id, approval_id: ap.id, published: true });
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
        const res = await fetch("https://api.taplio.com/v1/generate", {
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
      content = (await callClaude(prompt)).trim();
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
    return Response.json({ ok: false, error: error.message, task_id: task?.id || null }, { status: 500 });
  }
});