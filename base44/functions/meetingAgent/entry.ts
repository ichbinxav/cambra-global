import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { paidProviderFetch } from '../../shared/costGovernance.ts';
import { assertOperationAllowed } from '../../shared/operationalControl.ts';

const AGENT_NAME = "meeting";
const TASK_TYPE = "schedule_meeting";
const RISK_LEVEL = 3;
const ACTION_TYPE = "schedule_meeting";

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

      task = await base44.asServiceRole.entities.AgentTask.get(ap.agent_task_id).catch(() => null);
      if (!task) return Response.json({ ok: false, error: "AgentTask not found" }, { status: 404 });

      await base44.asServiceRole.entities.AgentTask.update(task.id, { status: "running" });

      const calKey = Deno.env.get("CAL_API_KEY");
      if (!calKey) {
        throw new Error("TOOL_NOT_CONFIGURED: añade CAL_API_KEY a Base44 secrets para confirmar reuniones");
      }

      const payload = ap.draft_payload_json || {};
      const selectedSlot = body?.selected_slot || payload?.slots?.[0];
      if (!selectedSlot) throw new Error("No slot selected for booking");

      const res = await paidProviderFetch(base44.asServiceRole, { event_key:`api:cal:booking:${ap.id}`, category:'api', provider:'cal.com', source:'meetingAgent', related_entity_type:'Approval', related_entity_id:ap.id }, "https://api.cal.com/v2/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${calKey}`,
          "cal-api-version": "2024-08-13",
        },
        body: JSON.stringify({
          start: selectedSlot,
          eventTypeId: payload.event_type_id,
          attendee: {
            name: payload.attendee_name,
            email: payload.attendee_email,
            timeZone: payload.timezone || "Europe/Paris",
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`Cal.com API error: ${data?.error?.message || data?.message || res.statusText}`);

      if (payload.lead_id) {
        await base44.asServiceRole.entities.OutboundLead.update(payload.lead_id, {
          stage: "meeting",
        }).catch(() => null);
      }

      await base44.asServiceRole.entities.AgentTask.update(task.id, {
        status: "completed",
        output_summary: `Meeting booked for ${selectedSlot} with ${payload.attendee_email}`,
        output_payload_json: { cal_response: data, slot: selectedSlot, approval_id: ap.id },
        completed_at: new Date().toISOString(),
      });

      return Response.json({ ok: true, task_id: task.id, approval_id: ap.id, booked: true, slot: selectedSlot });
    }

    // ═══ DRAFT MODE — proposes slots, never calls Cal.com to book ═══════
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
      input_summary: `Propose meeting slots for ${lead.contact_full_name || lead.contact_email}`,
      started_at: new Date().toISOString(),
    });

    const calKey = Deno.env.get("CAL_API_KEY");
    let slots = [];
    let slotSource = "fallback_generated";

    if (calKey && body?.event_type_id) {
      // Real Cal.com slot fetch (read-only, NOT a booking)
      try {
        const from = new Date();
        const to = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const res = await paidProviderFetch(base44.asServiceRole, { event_key:`api:cal:slots:${task.id}`, category:'api', provider:'cal.com', source:'meetingAgent', related_entity_type:'AgentTask', related_entity_id:task.id },
          `https://api.cal.com/v2/slots?eventTypeId=${body.event_type_id}&startTime=${from.toISOString()}&endTime=${to.toISOString()}`,
          { headers: { "Authorization": `Bearer ${calKey}`, "cal-api-version": "2024-09-04" } }
        );
        const data = await res.json();
        if (res.ok) {
          // Flatten Cal.com slot response
          const all = Object.values(data?.data?.slots || data?.slots || {}).flat();
          slots = all.slice(0, 3).map(s => s?.time || s?.start || s).filter(Boolean);
          slotSource = "cal.com";
        }
      } catch (_) { /* fall through to generated slots */ }
    }

    if (!slots.length) {
      // FINAL AUTONOMOUS SEAL: never invent availability. A missing/unreadable
      // calendar is an external configuration blocker, not a reason to fabricate
      // plausible-looking slots that may conflict with the founder's real calendar.
      await base44.asServiceRole.entities.AgentTask.update(task.id, {
        status: "waiting_input",
        output_summary: "Calendar availability unavailable — real Cal.com connection/event type required",
        output_payload_json: { blocker: "calendar_availability_unverified", cal_key_present: !!calKey, event_type_id_present: !!body?.event_type_id },
        completed_at: new Date().toISOString(),
      });
      return Response.json({ ok: false, task_id: task.id, status: "waiting_input", error: "calendar_availability_unverified", setup_required: true }, { status: 409 });
    }

    const draftContent = [
      `Propose meeting with ${lead.contact_full_name || lead.contact_email} (${lead.company_name || lead.company_domain})`,
      `Source: ${slotSource}`,
      "",
      "Proposed slots:",
      ...slots.map((s, i) => `  ${i + 1}. ${s}`),
    ].join("\n");

    const draftPayload = {
      lead_id: lead.id,
      attendee_email: lead.contact_email,
      attendee_name: lead.contact_full_name || lead.contact_email,
      timezone: body?.timezone || "Europe/Paris",
      event_type_id: body?.event_type_id || null,
      slots,
      slot_source: slotSource,
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
      output_summary: `${slots.length} slots proposed — awaiting approval`,
      output_payload_json: { draft: draftPayload, approval_id: approval.id },
    });

    return Response.json({
      ok: true,
      task_id: task.id,
      approval_id: approval.id,
      status: "waiting_approval",
      message: "Slots proposed. Meeting will NOT be booked until Approval is approved.",
      slots,
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
