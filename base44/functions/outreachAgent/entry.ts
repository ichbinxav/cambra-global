import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { emergencyState } from '../../shared/operationalControl.ts';

const AGENT_NAME = "outreach";
const TASK_TYPE = "send_outreach_email";
const RISK_LEVEL = 3;
const ACTION_TYPE = "send_outreach_email";

async function callClaude(prompt) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("TOOL_NOT_CONFIGURED: añade ANTHROPIC_API_KEY a Base44 secrets para activar este agente");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Claude API error: ${data?.error?.message || res.statusText}`);
  return data?.content?.[0]?.text || "";
}

function parseDraftEmail(text) {
  const subjectMatch = text.match(/Subject:\s*(.+)/i);
  const bodyMatch = text.match(/Body:\s*([\s\S]+)/i);
  return {
    subject: (subjectMatch?.[1] || "").trim(),
    body: (bodyMatch?.[1] || text).trim(),
  };
}

/**
 * DRAFT mode: redacta email + crea Approval pending. NUNCA llama Instantly.
 * EXECUTE mode: SOLO corre si el Approval referenciado está "approved". Sino rechaza.
 */
Deno.serve(async (req) => {
  let task = null;
  let approval = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode === "execute" ? "execute" : "draft";

    // ═══ EXECUTE MODE — strict Approval gate ════════════════════════════
    if (mode === "execute") {
      const emergency = await emergencyState(base44.asServiceRole);
      if (emergency.safe_mode || emergency.communications_paused) return Response.json({ ok:false, error:'emergency_control_paused:communications', safe_mode:emergency.safe_mode, reason:emergency.reason || null }, { status:409 });
      const approvalId = body?.approval_id;
      if (!approvalId) return Response.json({ ok: false, error: "approval_id required for execute mode" }, { status: 400 });

      const ap = await base44.asServiceRole.entities.Approval.get(approvalId).catch(() => null);
      if (!ap) return Response.json({ ok: false, error: "Approval not found" }, { status: 404 });
      if (ap.action_type !== ACTION_TYPE) {
        return Response.json({ ok: false, error: `Approval action_type mismatch: ${ap.action_type}` }, { status: 400 });
      }
      if (ap.status !== "approved") {
        return Response.json({
          ok: false,
          error: `Cannot execute: Approval status is "${ap.status}", must be "approved"`,
          gate: "blocked",
        }, { status: 403 });
      }

      // Resume the AgentTask
      const taskId = ap.agent_task_id;
      task = await base44.asServiceRole.entities.AgentTask.get(taskId).catch(() => null);
      if (!task) return Response.json({ ok: false, error: "AgentTask not found" }, { status: 404 });

      await base44.asServiceRole.entities.AgentTask.update(task.id, { status: "running" });

      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (!resendKey) {
        throw new Error("TOOL_NOT_CONFIGURED: añade RESEND_API_KEY a Base44 secrets para enviar emails");
      }

      const payload = ap.draft_payload_json || {};
      const fromAddress = Deno.env.get("RESEND_FROM") || "CAMBRA <hello@contact.cambra.global>";
      const replyTo = Deno.env.get("ADMIN_NOTIFICATION_EMAIL") || "hello@cambra.global";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: fromAddress,
          to: payload.to,
          reply_to: replyTo,
          subject: payload.subject,
          text: payload.body,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`Resend API error: ${data?.message || data?.error?.message || res.statusText}`);

      // Mark lead as contacted
      if (payload.lead_id) {
        await base44.asServiceRole.entities.OutboundLead.update(payload.lead_id, {
          stage: "contacted",
        }).catch(() => null);
      }

      await base44.asServiceRole.entities.AgentTask.update(task.id, {
        status: "completed",
        output_summary: `Sent outreach email to ${payload.to}`,
        output_payload_json: { resend_response: data, approval_id: ap.id },
        completed_at: new Date().toISOString(),
      });

      return Response.json({ ok: true, task_id: task.id, approval_id: ap.id, sent: true });
    }

    // ═══ DRAFT MODE — never calls Instantly ═════════════════════════════
    const leadId = body?.lead_id;
    if (!leadId) return Response.json({ ok: false, error: "lead_id required for draft mode" }, { status: 400 });

    const lead = await base44.asServiceRole.entities.OutboundLead.get(leadId).catch(() => null);
    if (!lead) return Response.json({ ok: false, error: "Lead not found" }, { status: 404 });
    if (!lead.contact_email) return Response.json({ ok: false, error: "Lead has no contact_email" }, { status: 400 });

    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: true,
      risk_level: RISK_LEVEL,
      related_entity_type: "OutboundLead",
      related_entity_id: lead.id,
      input_summary: `Draft outreach to ${lead.contact_full_name || lead.contact_email} at ${lead.company_name || lead.company_domain}`,
      started_at: new Date().toISOString(),
    });

    const prompt = [
      "Eres SDR de CAMBRA (infraestructura económica para ecommerce independientes — pagos, shipping, SaaS).",
      "Redacta un cold email B2B en el idioma del país del lead, corto (max 90 palabras), específico, sin clichés.",
      "Hook: un dato concreto que les hará pensar 'esto me concierne'. Sin promesas vagas.",
      "Formato EXACTO:",
      "Subject: <una línea, max 8 palabras>",
      "Body: <cuerpo del email>",
      "",
      "Lead:",
      JSON.stringify({
        name: lead.contact_full_name,
        title: lead.contact_title,
        company: lead.company_name,
        country: lead.country,
        industry: lead.industry,
        score: lead.score,
        next_action: lead.next_action,
      }),
    ].join("\n");

    const text = await callClaude(prompt);
    const { subject, body: emailBody } = parseDraftEmail(text);

    if (!subject || !emailBody) {
      throw new Error(`Claude returned unparseable email: ${text.slice(0, 200)}`);
    }

    const draftContent = `To: ${lead.contact_email}\nSubject: ${subject}\n\n${emailBody}`;
    const draftPayload = {
      to: lead.contact_email,
      subject,
      body: emailBody,
      lead_id: lead.id,
      campaign_id: body?.campaign_id || null,
    };

    approval = await base44.asServiceRole.entities.Approval.create({
      brand_id: "_platform",
      agent_task_id: task.id,
      action_type: ACTION_TYPE,
      related_entity_type: "OutboundLead",
      related_entity_id: lead.id,
      risk_level: RISK_LEVEL,
      draft_content: draftContent,
      draft_payload_json: draftPayload,
      status: "pending",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "waiting_approval",
      approval_id: approval.id,
      output_summary: `Draft ready — awaiting approval to send to ${lead.contact_email}`,
      output_payload_json: { draft: draftPayload, approval_id: approval.id },
    });

    return Response.json({
      ok: true,
      task_id: task.id,
      approval_id: approval.id,
      status: "waiting_approval",
      message: "Draft created. Email will NOT be sent until Approval is approved.",
    });
  } catch (error) {
    if (task?.id) {
      try {
        const base44 = createClientFromRequest(req);
        await base44.asServiceRole.entities.AgentTask.update(task.id, {
          status: "failed",
          error: error.message,
          completed_at: new Date().toISOString(),
        });
      } catch (_) { /* swallow */ }
    }
    return Response.json({ ok: false, error: error.message, task_id: task?.id || null }, { status: 500 });
  }
});