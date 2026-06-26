import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const AGENT_NAME = "x_twitter";
const TASK_TYPE = "publish_x_post";
const RISK_LEVEL = 2;
const ACTION_TYPE = "publish_x_post";

async function callClaude(prompt) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("TOOL_NOT_CONFIGURED: añade ANTHROPIC_API_KEY a Base44 secrets para activar este agente");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 1024, messages: [{ role: "user", content: prompt }] }),
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

    // ═══ EXECUTE ════════════════════════════════════════════════════════
    if (mode === "execute") {
      const approvalId = body?.approval_id;
      if (!approvalId) return Response.json({ ok: false, error: "approval_id required" }, { status: 400 });
      const ap = await base44.asServiceRole.entities.Approval.get(approvalId).catch(() => null);
      if (!ap) return Response.json({ ok: false, error: "Approval not found" }, { status: 404 });
      if (ap.action_type !== ACTION_TYPE) return Response.json({ ok: false, error: `action_type mismatch: ${ap.action_type}` }, { status: 400 });
      if (ap.status !== "approved") return Response.json({ ok: false, error: `Cannot execute: status="${ap.status}"`, gate: "blocked" }, { status: 403 });

      task = await base44.asServiceRole.entities.AgentTask.get(ap.agent_task_id).catch(() => null);
      if (!task) return Response.json({ ok: false, error: "AgentTask not found" }, { status: 404 });
      await base44.asServiceRole.entities.AgentTask.update(task.id, { status: "running" });

      const typefullyKey = Deno.env.get("TYPEFULLY_API_KEY");
      if (!typefullyKey) throw new Error("TOOL_NOT_CONFIGURED: añade TYPEFULLY_API_KEY a Base44 secrets para publicar en X");

      const payload = ap.draft_payload_json || {};
      const res = await fetch("https://api.typefully.com/v1/drafts/", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": typefullyKey },
        body: JSON.stringify({ content: payload.content, share: true, "auto-retweet-enabled": false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`Typefully API error: ${data?.error?.message || res.statusText}`);

      await base44.asServiceRole.entities.AgentTask.update(task.id, {
        status: "completed",
        output_summary: "X post published via Typefully",
        output_payload_json: { typefully_response: data, approval_id: ap.id },
        completed_at: new Date().toISOString(),
      });
      return Response.json({ ok: true, task_id: task.id, approval_id: ap.id, published: true });
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
        const res = await fetch("https://api.typefully.com/v1/ai/generate", {
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
      content = (await callClaude(prompt)).trim();
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
    return Response.json({ ok: false, error: error.message, task_id: task?.id || null }, { status: 500 });
  }
});