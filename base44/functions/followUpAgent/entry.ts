import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { callCambraClaude } from '../../shared/commercialModelRouter.ts';
import { assertOperationAllowed } from '../../shared/operationalControl.ts';
import { canonicalMarket } from '../../shared/marketContext.ts';
import { internalErrorResponse } from '../../shared/publicErrors.ts';

const AGENT_NAME = "follow_up";
const TASK_TYPE = "send_follow_up_email";
const RISK_LEVEL = 3;
const ACTION_TYPE = "send_follow_up_email";

async function callClaude(svc, prompt, eventKey) { return (await callCambraClaude(prompt, { tier:'standard', maxTokens:2048, svc, eventKey, source:'followUpAgent' })).text; }

function parseDraftEmail(text) {
  const subjectMatch = text.match(/Subject:\s*(.+)/i);
  const bodyMatch = text.match(/Body:\s*([\s\S]+)/i);
  return {
    subject: (subjectMatch?.[1] || "").trim(),
    body: (bodyMatch?.[1] || text).trim(),
  };
}

function languageFor(country) {
  const iso2 = canonicalMarket(country)?.iso2;
  return iso2 === 'FR' ? 'fr' : iso2 === 'ES' ? 'es' : 'en';
}

async function ensureCanonicalThread(svc, lead, preferredId = '') {
  if (preferredId) {
    const preferred = await svc.entities.CommunicationThread.get(preferredId).catch((error:any)=>safeBestEffort(error,{operation:'followUpAgent',fallback:null,severity:'secondary'}));
    if (preferred && !['closed', 'suppressed'].includes(String(preferred.status || ''))) return preferred;
  }
  const rows = await svc.entities.CommunicationThread.filter(
    { engine: 'merchant_acquisition', lead_id: lead.id }, '-created_date', 5,
  ).catch((error:any)=>safeBestEffort(error,{operation:'followUpAgent',fallback:[],severity:'secondary'}));
  const available = rows.find((row) => !['closed', 'suppressed'].includes(String(row.status || '')));
  if (available) return available;

  return svc.entities.CommunicationThread.create({
    thread_key: `legacy-follow-up:${lead.id}`,
    engine: 'merchant_acquisition',
    related_entity_type: 'OutboundLead',
    related_entity_id: lead.id,
    lead_id: lead.id,
    counterparty_email: lead.contact_email,
    counterparty_name: lead.contact_full_name || '',
    company_name: lead.company_name || '',
    relationship_type: 'merchant',
    language: languageFor(lead.country),
    status: 'awaiting_approval',
    conversation_state: 'WAITING_APPROVAL',
    policy_key: '',
    policy_version: '',
    sending_profile_resolution_status: 'REVIEW_REQUIRED',
    sending_profile_resolution_reason: 'legacy_thread_has_no_deterministic_profile_evidence',
    automation_paused: true,
    pause_reason: 'legacy_sending_profile_review_required',
    summary: `Legacy approved follow-up to ${lead.company_name || lead.contact_email}`,
    market_jurisdiction: canonicalMarket(lead.country)?.iso2 || '',
  });
}

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
      try { await assertOperationAllowed(base44.asServiceRole, 'communications'); }
      catch (error) { return Response.json({ ok:false, error:error?.message || 'emergency_control_paused:communications' }, { status:409 }); }
      const approvalId = body?.approval_id;
      if (!approvalId) return Response.json({ ok: false, error: "approval_id required for execute mode" }, { status: 400 });

      const ap = await base44.asServiceRole.entities.Approval.get(approvalId).catch((error:any)=>safeBestEffort(error,{operation:'followUpAgent',fallback:null,severity:'secondary'}));
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

      task = await base44.asServiceRole.entities.AgentTask.get(ap.agent_task_id).catch((error:any)=>safeBestEffort(error,{operation:'followUpAgent',fallback:null,severity:'secondary'}));
      if (!task) return Response.json({ ok: false, error: "AgentTask not found" }, { status: 404 });

      await base44.asServiceRole.entities.AgentTask.update(task.id, { status: "running" });

      const payload = ap.draft_payload_json || {};
      const lead = payload.lead_id
        ? await base44.asServiceRole.entities.OutboundLead.get(payload.lead_id).catch((error:any)=>safeBestEffort(error,{operation:'followUpAgent',fallback:null,severity:'secondary'}))
        : null;
      if (!lead) throw new Error('approved_follow_up_lead_missing');
      const thread = await ensureCanonicalThread(base44.asServiceRole, lead, payload.communication_thread_id || '');
      const internal = Deno.env.get('INTERNAL_CALL_SECRET') || '';
      const send = await base44.asServiceRole.functions.invoke('commercialSendMessage', {
        thread_id: thread.id,
        action: 'follow_up',
        classification: 'follow_up',
        subject: payload.subject,
        text: payload.body,
        to: payload.to,
        approval_id: ap.id,
        agent_name: 'follow_up',
        idempotency_key: `legacy-follow-up-approved:${ap.id}`,
        sending_profile_key: thread.sending_profile_key || undefined,
        manual_override: true,
        internal_secret: internal,
      }).catch((error) => ({ data: { ok: false, error: String(error?.message || error) } }));
      const sent = send?.data || send || {};
      if (sent.ok === false) throw new Error(`central_send_failed:${sent.error || 'unknown'}`);

      await base44.asServiceRole.entities.AgentTask.update(task.id, {
        status: "completed",
        output_summary: `Sent follow-up #${payload.step || "?"} to ${payload.to}`,
        output_payload_json: { central_send: sent, communication_thread_id: thread.id, approval_id: ap.id },
        completed_at: new Date().toISOString(),
      });

      return Response.json({ ok: true, task_id: task.id, approval_id: ap.id, thread_id: thread.id, sent: true });
    }

    // ═══ DRAFT MODE — never calls Instantly ═════════════════════════════
    const leadId = body?.lead_id;
    const step = Math.min(Math.max(Number(body?.step) || 1, 1), 5);
    const previousMessages = Array.isArray(body?.previous_messages) ? body.previous_messages : [];
    if (!leadId) return Response.json({ ok: false, error: "lead_id required for draft mode" }, { status: 400 });

    const lead = await base44.asServiceRole.entities.OutboundLead.get(leadId).catch((error:any)=>safeBestEffort(error,{operation:'followUpAgent',fallback:null,severity:'secondary'}));
    if (!lead) return Response.json({ ok: false, error: "Lead not found" }, { status: 404 });
    if (!lead.contact_email) return Response.json({ ok: false, error: "Lead has no contact_email" }, { status: 400 });

    const thread = await ensureCanonicalThread(base44.asServiceRole, lead, body?.communication_thread_id || '');

    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: true,
      risk_level: RISK_LEVEL,
      related_entity_type: "OutboundLead",
      related_entity_id: lead.id,
      input_summary: `Draft follow-up #${step} to ${lead.contact_full_name || lead.contact_email}`,
      started_at: new Date().toISOString(),
    });

    const intent = step === 1
      ? "bump suave, una pregunta concreta"
      : step === 2
      ? "ángulo nuevo, un dato específico de su industria"
      : step === 3
      ? "valor puro, sin pedir nada"
      : "break-up email cortés, deja la puerta abierta";

    const prompt = [
      `Eres SDR de CAMBRA. Redacta el follow-up #${step} de una secuencia.`,
      `Intent: ${intent}.`,
      "Idioma del país del lead. Max 60 palabras. Sin clichés. Sin 'just following up'.",
      "Formato EXACTO:",
      "Subject: <una línea, puede ser 'Re: <subject anterior>'>",
      "Body: <cuerpo>",
      "",
      "Lead:",
      JSON.stringify({
        name: lead.contact_full_name,
        company: lead.company_name,
        country: lead.country,
      }),
      "",
      "Mensajes previos en la secuencia:",
      JSON.stringify(previousMessages),
    ].join("\n");

    const text = await callClaude(base44.asServiceRole, prompt, task?.id || crypto.randomUUID());
    const { subject, body: emailBody } = parseDraftEmail(text);
    if (!subject || !emailBody) {
      throw new Error(`Claude returned unparseable email: ${text.slice(0, 200)}`);
    }

    const draftContent = `Follow-up #${step}\nTo: ${lead.contact_email}\nSubject: ${subject}\n\n${emailBody}`;
    const draftPayload = {
      to: lead.contact_email,
      subject,
      body: emailBody,
      lead_id: lead.id,
      step,
      communication_thread_id: thread.id,
      legacy_external_thread_id: body?.thread_id || null,
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
      output_summary: `Follow-up #${step} ready — awaiting approval`,
      output_payload_json: { draft: draftPayload, approval_id: approval.id },
    });

    return Response.json({
      ok: true,
      task_id: task.id,
      approval_id: approval.id,
      status: "waiting_approval",
      message: "Follow-up draft created. Email will NOT be sent until Approval is approved.",
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
    return internalErrorResponse(error, 'followUpAgent');
  }
});
