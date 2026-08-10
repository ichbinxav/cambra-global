import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const AGENT_NAME = "blog";
const TASK_TYPE = "publish_blog";
const RISK_LEVEL = 2;
const ACTION_TYPE = "publish_blog";

async function callClaude(prompt) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("TOOL_NOT_CONFIGURED: añade ANTHROPIC_API_KEY a Base44 secrets para activar este agente");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 4096, messages: [{ role: "user", content: prompt }] }),
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

    // ═══ EXECUTE — publishes as Insight entity ═════════════════════════
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

      const payload = ap.draft_payload_json || {};
      // Publish as Insight (Insights entity is the platform's content store, used by /Insights page)
      const insight = await base44.asServiceRole.entities.Insight.create({
        title: payload.title,
        excerpt: payload.excerpt || "",
        content: payload.content,
        category: payload.category || "infrastructure",
        read_time: payload.read_time || 5,
        published: true,
      });

      await base44.asServiceRole.entities.AgentTask.update(task.id, {
        status: "completed",
        output_summary: `Blog published as Insight: ${payload.title}`,
        output_payload_json: { insight_id: insight.id, approval_id: ap.id },
        completed_at: new Date().toISOString(),
      });
      return Response.json({ ok: true, task_id: task.id, approval_id: ap.id, insight_id: insight.id, published: true });
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
        const res = await fetch("https://app.surferseo.com/api/v1/content_editors", {
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

    const text = await callClaude(prompt);
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
    return Response.json({ ok: false, error: error.message, task_id: task?.id || null }, { status: 500 });
  }
});