import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Brain Orchestrator — chains B1 → B2 → B3.
 *
 * Input: { website_url, brand_id }
 *
 * Mirrors the existing orchestrator pattern (leadOrchestrator, etc.):
 * opens a parent AgentTask, invokes each child agent sequentially, and
 * stops on the first failure (parent fails, downstream skipped).
 *
 * No spend re-computation, no scanning duplication — each child reuses
 * the previous child's AgentTask via brand_id lookup.
 */

const AGENT_NAME = "brain_orchestrator";
const TASK_TYPE = "analyzer_brain_chain";

Deno.serve(async (req) => {
  let parent = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { website_url, brand_id } = body;
    if (!brand_id) return Response.json({ ok: false, error: "Missing brand_id" }, { status: 400 });
    if (!website_url) return Response.json({ ok: false, error: "Missing website_url" }, { status: 400 });

    parent = await base44.asServiceRole.entities.AgentTask.create({
      brand_id,
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: 1,
      input_summary: `Brain chain for ${website_url}`,
      started_at: new Date().toISOString(),
    });

    const steps = [];

    // ── B1: Discovery ────────────────────────────────────────────────
    const b1 = await base44.asServiceRole.functions.invoke("discoveryTechStackAgent", {
      website_url, brand_id,
    });
    const p1 = b1?.data || b1;
    steps.push({ step: "discovery", ok: !!p1?.ok, task_id: p1?.task_id, summary: p1?.summary, error: p1?.error });
    if (!p1?.ok) {
      await base44.asServiceRole.entities.AgentTask.update(parent.id, {
        status: "failed",
        error: `Discovery failed: ${p1?.error || "unknown"}`,
        output_payload_json: { steps },
        completed_at: new Date().toISOString(),
      });
      return Response.json({ ok: false, task_id: parent.id, steps, error: "Discovery step failed" });
    }

    // ── B2: Spend ────────────────────────────────────────────────────
    const b2 = await base44.asServiceRole.functions.invoke("spendIntelligenceAgent", {
      brand_id, discovery_task_id: p1.task_id,
    });
    const p2 = b2?.data || b2;
    steps.push({ step: "spend", ok: !!p2?.ok, task_id: p2?.task_id, totals: p2?.totals, error: p2?.error });
    if (!p2?.ok) {
      await base44.asServiceRole.entities.AgentTask.update(parent.id, {
        status: "failed",
        error: `Spend failed: ${p2?.error || "unknown"}`,
        output_payload_json: { steps },
        completed_at: new Date().toISOString(),
      });
      return Response.json({ ok: false, task_id: parent.id, steps, error: "Spend step failed" });
    }

    // ── B3: Recommendation ───────────────────────────────────────────
    const b3 = await base44.asServiceRole.functions.invoke("recommendationEngineAgent", {
      brand_id, spend_task_id: p2.task_id,
    });
    const p3 = b3?.data || b3;
    steps.push({ step: "recommendation", ok: !!p3?.ok, task_id: p3?.task_id, totals: p3?.totals, summary: p3?.summary, error: p3?.error });
    if (!p3?.ok) {
      await base44.asServiceRole.entities.AgentTask.update(parent.id, {
        status: "failed",
        error: `Recommendation failed: ${p3?.error || "unknown"}`,
        output_payload_json: { steps },
        completed_at: new Date().toISOString(),
      });
      return Response.json({ ok: false, task_id: parent.id, steps, error: "Recommendation step failed" });
    }

    const summary = `Brain chain completed: ${p1.findings?.length || 0} tools → €${p2?.totals?.monthly || 0}/mo spend → ${p3?.totals?.opportunity_count || 0} opportunities (~€${p3?.totals?.annual_savings || 0}/yr).`;
    await base44.asServiceRole.entities.AgentTask.update(parent.id, {
      status: "completed",
      output_summary: summary,
      output_payload_json: { steps, website_url },
      completed_at: new Date().toISOString(),
    });

    return Response.json({ ok: true, task_id: parent.id, steps, summary });
  } catch (error) {
    if (parent?.id) {
      try {
        const base44 = createClientFromRequest(req);
        await base44.asServiceRole.entities.AgentTask.update(parent.id, {
          status: "failed", error: error.message, completed_at: new Date().toISOString(),
        });
      } catch {}
    }
    return Response.json({ ok: false, error: error.message, task_id: parent?.id || null }, { status: 500 });
  }
});