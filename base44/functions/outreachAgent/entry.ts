import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { captureEmergencyEpoch } from '../../shared/operationalControl.ts';
import { callCambraClaude } from '../../shared/commercialModelRouter.ts';
import { canonicalMarket } from '../../shared/marketContext.ts';
import { internalErrorResponse } from '../../shared/publicErrors.ts';
import { requireAcceptedCommercialSendResponse } from '../../shared/commercialSendSafety.ts';
import {
  beginExternalApprovalEffects,
  claimExternalApprovalExecution,
  completeExternalApprovalExecution,
  externalExecutionHttpStatus,
  markExternalApprovalReviewRequired,
  releaseExternalApprovalClaim,
} from '../../shared/externalApprovalExecution.ts';

const AGENT_NAME = "outreach";
const TASK_TYPE = "send_outreach_email";
const RISK_LEVEL = 3;
const ACTION_TYPE = "send_outreach_email";

async function callClaude(svc, prompt, eventKey) { return (await callCambraClaude(prompt, { tier:'standard', maxTokens:2048, svc, eventKey, source:'outreachAgent' })).text; }

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

async function ensureCanonicalThread(svc, lead) {
  const rows = await svc.entities.CommunicationThread.filter(
    { engine: 'merchant_acquisition', lead_id: lead.id }, '-created_date', 5,
  ).catch((error:any)=>safeBestEffort(error,{operation:'outreachAgent',fallback:[],severity:'secondary'}));
  const available = rows.find((row) => !['closed', 'suppressed'].includes(String(row.status || '')));
  if (available) return available;

  return svc.entities.CommunicationThread.create({
    thread_key: `legacy-outreach:${lead.id}`,
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
    summary: `Legacy approved outreach to ${lead.company_name || lead.contact_email}`,
    market_jurisdiction: canonicalMarket(lead.country)?.iso2 || '',
  });
}

/**
 * DRAFT mode: redacta email + crea Approval pending. NUNCA llama Instantly.
 * EXECUTE mode: SOLO corre si el Approval referenciado está "approved". Sino rechaza.
 */
Deno.serve(async (req) => {
  let task = null;
  let approval = null;
  let execution:any = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode === "execute" ? "execute" : "draft";

    // ═══ EXECUTE MODE — strict Approval gate ════════════════════════════
    if (mode === "execute") {
      let communicationEpoch:any;
      try { communicationEpoch=await captureEmergencyEpoch(base44.asServiceRole,'communications'); }
      catch (error) { return Response.json({ok:false,error:error?.message||'emergency_control_paused:communications'},{status:409}); }
      const approvalId = body?.approval_id;
      if (!approvalId) return Response.json({ ok: false, error: "approval_id required for execute mode" }, { status: 400 });

      const ap = await base44.asServiceRole.entities.Approval.get(approvalId).catch((error:any)=>safeBestEffort(error,{operation:'outreachAgent',fallback:null,severity:'secondary'}));
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
      task = await base44.asServiceRole.entities.AgentTask.get(taskId).catch((error:any)=>safeBestEffort(error,{operation:'outreachAgent',fallback:null,severity:'secondary'}));
      if (!task) return Response.json({ ok: false, error: "AgentTask not found" }, { status: 404 });

      try {
        execution=await claimExternalApprovalExecution(base44.asServiceRole,{approval:ap,task,commandKey:body.execution_command_key,actorEmail:user.email,actionType:ACTION_TYPE,agentName:AGENT_NAME,taskType:TASK_TYPE,riskLevel:RISK_LEVEL});
        if(!execution.acquired){
          if(execution.state==='replay')return Response.json({...execution.result,ok:true,idempotent_replay:true});
          return Response.json({ok:false,error:execution.error||'external_execution_not_claimed',execution_state:execution.state,review_required:execution.state==='review_required'},{status:externalExecutionHttpStatus(execution)});
        }
        const payload = ap.draft_payload_json || {};
        const lead = payload.lead_id ? await base44.asServiceRole.entities.OutboundLead.get(payload.lead_id) : null;
        if (!lead) throw new Error('approved_outreach_lead_missing');
        const preferredThread = payload.communication_thread_id ? await base44.asServiceRole.entities.CommunicationThread.get(payload.communication_thread_id) : null;
        const thread = preferredThread || await ensureCanonicalThread(base44.asServiceRole, lead);
        if (!thread) throw new Error('approved_outreach_thread_missing');
        const internal = Deno.env.get('INTERNAL_CALL_SECRET') || '';
        await beginExternalApprovalEffects(base44.asServiceRole,execution);
        const sent=requireAcceptedCommercialSendResponse(await base44.asServiceRole.functions.invoke('commercialSendMessage', {
          thread_id: thread.id, action:'initial_outreach', classification:'initial_outreach', subject:payload.subject, text:payload.body, to:payload.to,
          approval_id:ap.id, agent_name:AGENT_NAME, idempotency_key:`legacy-outreach-approved:${ap.id}`, sending_profile_key:thread.sending_profile_key||undefined,
          manual_override:true, internal_secret:internal, emergency_epoch_claim:communicationEpoch,
        }),'outreach_approved_send');
        if(payload.lead_id)await base44.asServiceRole.entities.OutboundLead.update(payload.lead_id,{stage:'contacted'});
        const result=await completeExternalApprovalExecution(base44.asServiceRole,execution,{task_id:task.id,approval_id:ap.id,thread_id:thread.id,sent:true,central_send:sent,execution_receipt_ref:`commercial-message:${sent.message_id}`},`Sent outreach email to ${payload.to}`);
        return Response.json(result);
      }catch(error){
        const code=String(error?.code||error?.message||'outreach_external_execution_failed');
        if(execution?.acquired){if(execution.effectsStarted)await markExternalApprovalReviewRequired(base44.asServiceRole,execution,code);else await releaseExternalApprovalClaim(base44.asServiceRole,execution,code);}
        return Response.json({ok:false,error:code,review_required:execution?.effectsStarted===true},{status:execution?.effectsStarted?409:Number(error?.status||500)});
      }
    }

    // ═══ DRAFT MODE — never calls Instantly ═════════════════════════════
    const leadId = body?.lead_id;
    if (!leadId) return Response.json({ ok: false, error: "lead_id required for draft mode" }, { status: 400 });

    const lead = await base44.asServiceRole.entities.OutboundLead.get(leadId).catch((error:any)=>safeBestEffort(error,{operation:'outreachAgent',fallback:null,severity:'secondary'}));
    if (!lead) return Response.json({ ok: false, error: "Lead not found" }, { status: 404 });
    if (!lead.contact_email) return Response.json({ ok: false, error: "Lead has no contact_email" }, { status: 400 });

    const thread = await ensureCanonicalThread(base44.asServiceRole, lead);

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

    const text = await callClaude(base44.asServiceRole, prompt, task?.id || crypto.randomUUID());
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
      communication_thread_id: thread.id,
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
    return internalErrorResponse(error, 'outreachAgent');
  }
});
