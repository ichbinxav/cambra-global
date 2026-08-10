import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { emergencyState } from '../../shared/operationalControl.ts';

const AGENT_NAME = "newsletter";
const TASK_TYPE = "send_newsletter";
const RISK_LEVEL = 2;
const ACTION_TYPE = "send_newsletter";

async function callClaude(prompt) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("TOOL_NOT_CONFIGURED: añade ANTHROPIC_API_KEY a Base44 secrets para activar este agente");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: Deno.env.get('ANTHROPIC_STANDARD_MODEL')||'claude-sonnet-5', max_tokens: 4096, messages: [{ role: "user", content: prompt }] }),
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

    // ═══ EXECUTE — sends to subscribers via SendEmail integration ══════
    if (mode === "execute") {
      const emergency = await emergencyState(base44.asServiceRole);
      if (emergency.safe_mode || emergency.communications_paused) return Response.json({ ok:false, error:'emergency_control_paused:communications', safe_mode:emergency.safe_mode, reason:emergency.reason || null }, { status:409 });
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
      // Subscribers come from the Lead entity (landing opt-ins) with benchmark_opt_in=true and consent=true
      const subscribers = await base44.asServiceRole.entities.Lead
        .filter({ consent: true, benchmark_opt_in: true }, "-created_date", 1000).catch(() => []);

      let sent = 0;
      const errors = [];
      for (const sub of subscribers) {
        if (!sub.email) continue;
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            from_name: "CAMBRA",
            to: sub.email,
            subject: payload.subject,
            body: payload.body,
          });
          sent++;
        } catch (e) { errors.push({ email: sub.email, error: e.message }); }
      }

      await base44.asServiceRole.entities.AgentTask.update(task.id, {
        status: "completed",
        output_summary: `Newsletter sent to ${sent} of ${subscribers.length} subscribers`,
        output_payload_json: { sent, total: subscribers.length, errors: errors.slice(0, 10), approval_id: ap.id },
        completed_at: new Date().toISOString(),
      });
      return Response.json({ ok: true, task_id: task.id, approval_id: ap.id, sent, total: subscribers.length });
    }

    // ═══ DRAFT — Claude only ════════════════════════════════════════════
    const theme = body?.theme || "monthly infrastructure update";

    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: true,
      risk_level: RISK_LEVEL,
      input_summary: `Draft newsletter: ${theme}`,
      started_at: new Date().toISOString(),
    });

    const prompt = [
      "Eres editor del newsletter de CAMBRA (infraestructura económica para ecommerce independientes).",
      "Audiencia: founders de ecommerce. Tono editorial, no marketing.",
      "",
      "Devuelve EXACTAMENTE este formato:",
      "SUBJECT: <una línea, max 60 chars, sin clickbait>",
      "INTRO:",
      "<2-3 párrafos, voz de founder, ningún 'hola subscriptor'>",
      "SECTION_1_TITLE: <título>",
      "SECTION_1_BODY:",
      "<2-3 párrafos con un dato concreto>",
      "SECTION_2_TITLE: <título>",
      "SECTION_2_BODY:",
      "<2-3 párrafos>",
      "SECTION_3_TITLE: <título>",
      "SECTION_3_BODY:",
      "<2-3 párrafos>",
      "CTA: <una línea con acción clara>",
      "",
      `Tema del mes: ${theme}`,
    ].join("\n");

    const text = await callClaude(prompt);
    const subjectMatch = text.match(/SUBJECT:\s*(.+)/i);
    const introMatch = text.match(/INTRO:\s*([\s\S]+?)\nSECTION_1_TITLE:/i);
    const s1tMatch = text.match(/SECTION_1_TITLE:\s*(.+)/i);
    const s1bMatch = text.match(/SECTION_1_BODY:\s*([\s\S]+?)\nSECTION_2_TITLE:/i);
    const s2tMatch = text.match(/SECTION_2_TITLE:\s*(.+)/i);
    const s2bMatch = text.match(/SECTION_2_BODY:\s*([\s\S]+?)\nSECTION_3_TITLE:/i);
    const s3tMatch = text.match(/SECTION_3_TITLE:\s*(.+)/i);
    const s3bMatch = text.match(/SECTION_3_BODY:\s*([\s\S]+?)\nCTA:/i);
    const ctaMatch = text.match(/CTA:\s*(.+)/i);

    const subject = (subjectMatch?.[1] || theme).trim();
    const intro = (introMatch?.[1] || "").trim();
    const s1 = { title: (s1tMatch?.[1] || "").trim(), body: (s1bMatch?.[1] || "").trim() };
    const s2 = { title: (s2tMatch?.[1] || "").trim(), body: (s2bMatch?.[1] || "").trim() };
    const s3 = { title: (s3tMatch?.[1] || "").trim(), body: (s3bMatch?.[1] || "").trim() };
    const cta = (ctaMatch?.[1] || "").trim();

    if (!intro || !s1.body) throw new Error(`Claude returned unparseable newsletter: ${text.slice(0, 200)}`);

    const bodyHtml = [
      intro,
      `\n## ${s1.title}\n\n${s1.body}`,
      `\n## ${s2.title}\n\n${s2.body}`,
      `\n## ${s3.title}\n\n${s3.body}`,
      `\n\n---\n\n${cta}`,
    ].join("\n");

    const draftPayload = { subject, body: bodyHtml, intro, sections: [s1, s2, s3], cta };
    const approval = await base44.asServiceRole.entities.Approval.create({
      brand_id: "_platform",
      agent_task_id: task.id,
      action_type: ACTION_TYPE,
      risk_level: RISK_LEVEL,
      draft_content: `Newsletter\n\nSubject: ${subject}\n\n${bodyHtml}`,
      draft_payload_json: draftPayload,
      status: "pending",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "waiting_approval",
      approval_id: approval.id,
      output_summary: `Newsletter draft ready — awaiting approval`,
      output_payload_json: { draft: draftPayload, approval_id: approval.id },
    });

    return Response.json({ ok: true, task_id: task.id, approval_id: approval.id, status: "waiting_approval" });
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