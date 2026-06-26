import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const AGENT_NAME = "lead_enrichment";
const TASK_TYPE = "enrich_leads";
const RISK_LEVEL = 1;

Deno.serve(async (req) => {
  let task = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    // Accept either explicit lead IDs, or default to most recent un-enriched
    let leadIds = Array.isArray(body?.lead_ids) ? body.lead_ids : null;
    const limit = Math.min(Number(body?.limit) || 25, 100);

    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: RISK_LEVEL,
      input_summary: leadIds ? `Enrich ${leadIds.length} leads` : `Enrich latest ${limit} un-enriched leads`,
      started_at: new Date().toISOString(),
    });

    let leads = [];
    if (leadIds && leadIds.length) {
      leads = await base44.asServiceRole.entities.OutboundLead
        .filter({ id: { $in: leadIds } }, "-created_date", leadIds.length).catch(() => []);
    } else {
      leads = await base44.asServiceRole.entities.OutboundLead
        .filter({ enriched: false }, "-created_date", limit).catch(() => []);
    }

    if (!leads.length) {
      await base44.asServiceRole.entities.AgentTask.update(task.id, {
        status: "completed",
        output_summary: "No leads to enrich",
        output_payload_json: { count: 0 },
        completed_at: new Date().toISOString(),
      });
      return Response.json({ ok: true, task_id: task.id, count: 0 });
    }

    const clayKey = Deno.env.get("CLAY_API_KEY");
    const fallback = !clayKey;
    let enrichedCount = 0;
    let skippedCount = 0;
    const updates = [];

    for (const lead of leads) {
      if (fallback) {
        updates.push({
          id: lead.id,
          stage: "enriched",
          // Don't flip enriched=true on fallback — we'll re-run later when Clay key is added.
          enrichment_json: { note: "TOOL_NOT_CONFIGURED: CLAY_API_KEY missing — lead passed through without enrichment" },
        });
        skippedCount++;
        continue;
      }

      try {
        const res = await fetch("https://api.clay.com/v1/enrich", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${clayKey}`,
          },
          body: JSON.stringify({
            email: lead.contact_email || undefined,
            domain: lead.company_domain || undefined,
            linkedin_url: lead.linkedin_url || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || res.statusText);

        updates.push({
          id: lead.id,
          enriched: true,
          stage: "enriched",
          enrichment_json: data,
        });
        enrichedCount++;
      } catch (e) {
        updates.push({
          id: lead.id,
          stage: "enriched",
          enrichment_json: { error: e.message },
        });
        skippedCount++;
      }
    }

    if (updates.length) {
      try {
        await base44.asServiceRole.entities.OutboundLead.bulkUpdate(updates);
      } catch (e) {
        // Fallback: per-row update
        for (const u of updates) {
          const { id, ...patch } = u;
          await base44.asServiceRole.entities.OutboundLead.update(id, patch).catch(() => null);
        }
      }
    }

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "completed",
      output_summary: fallback
        ? `Pass-through: ${leads.length} leads (CLAY_API_KEY missing)`
        : `Enriched ${enrichedCount}, skipped ${skippedCount} of ${leads.length}`,
      output_payload_json: {
        count: leads.length,
        enriched: enrichedCount,
        skipped: skippedCount,
        fallback,
      },
      completed_at: new Date().toISOString(),
    });

    return Response.json({
      ok: true,
      task_id: task.id,
      count: leads.length,
      enriched: enrichedCount,
      skipped: skippedCount,
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