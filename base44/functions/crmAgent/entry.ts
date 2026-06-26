import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const AGENT_NAME = "crm";
const TASK_TYPE = "sync_leads_to_crm";
const RISK_LEVEL = 0;

Deno.serve(async (req) => {
  let task = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const leadIds = Array.isArray(body?.lead_ids) ? body.lead_ids : null;
    const limit = Math.min(Number(body?.limit) || 25, 100);

    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: RISK_LEVEL,
      input_summary: leadIds ? `Sync ${leadIds.length} leads to CRM` : `Sync latest ${limit} scored leads to CRM`,
      started_at: new Date().toISOString(),
    });

    let leads = [];
    if (leadIds && leadIds.length) {
      leads = await base44.asServiceRole.entities.OutboundLead
        .filter({ id: { $in: leadIds } }, "-created_date", leadIds.length).catch(() => []);
    } else {
      leads = await base44.asServiceRole.entities.OutboundLead
        .filter({ stage: "scored", attio_record_id: null }, "-score", limit).catch(() => []);
      if (!leads.length) {
        leads = await base44.asServiceRole.entities.OutboundLead
          .filter({ attio_record_id: null }, "-created_date", limit).catch(() => []);
      }
    }

    if (!leads.length) {
      await base44.asServiceRole.entities.AgentTask.update(task.id, {
        status: "completed",
        output_summary: "No leads to sync",
        output_payload_json: { count: 0 },
        completed_at: new Date().toISOString(),
      });
      return Response.json({ ok: true, task_id: task.id, count: 0 });
    }

    const attioKey = Deno.env.get("ATTIO_API_KEY");
    const fallback = !attioKey;
    let syncedAttio = 0;
    let storedLocal = 0;
    const updates = [];
    const errors = [];

    for (const lead of leads) {
      if (!fallback) {
        try {
          const res = await fetch("https://api.attio.com/v2/objects/companies/records", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${attioKey}`,
            },
            body: JSON.stringify({
              data: {
                values: {
                  name: [{ value: lead.company_name || lead.company_domain || "Unknown" }],
                  domains: lead.company_domain ? [{ domain: lead.company_domain }] : undefined,
                },
              },
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error?.message || data?.message || res.statusText);
          const recordId = data?.data?.id?.record_id || data?.data?.id || null;
          updates.push({
            id: lead.id,
            attio_record_id: recordId,
            stage: "contacted",
          });
          syncedAttio++;
          continue;
        } catch (e) {
          errors.push({ lead_id: lead.id, error: e.message });
          // Fall through to local storage so the lead isn't lost
        }
      }

      // Fallback: store/update locally as a Brand-stage record in OutboundLead itself.
      // We don't write to the M0-M2 Brand entity — keeping that schema untouched.
      updates.push({
        id: lead.id,
        stage: lead.stage === "scored" ? "scored" : "lead",
        next_action: lead.next_action || "Review for outreach (CRM fallback — Attio not configured)",
      });
      storedLocal++;
    }

    if (updates.length) {
      try {
        await base44.asServiceRole.entities.OutboundLead.bulkUpdate(updates);
      } catch (_) {
        for (const u of updates) {
          const { id, ...patch } = u;
          await base44.asServiceRole.entities.OutboundLead.update(id, patch).catch(() => null);
        }
      }
    }

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "completed",
      output_summary: fallback
        ? `CRM fallback: ${storedLocal} leads kept in OutboundLead (ATTIO_API_KEY missing)`
        : `Synced ${syncedAttio} to Attio, ${storedLocal} kept locally`,
      output_payload_json: {
        count: leads.length,
        synced_attio: syncedAttio,
        stored_local: storedLocal,
        fallback,
        errors: errors.slice(0, 10),
      },
      completed_at: new Date().toISOString(),
    });

    return Response.json({
      ok: true,
      task_id: task.id,
      count: leads.length,
      synced_attio: syncedAttio,
      stored_local: storedLocal,
      fallback,
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