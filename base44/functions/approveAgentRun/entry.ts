import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * M8 — approveAgentRun
 *
 * Human approval gate. Admin only.
 *
 * - Validates status === 'awaiting_approval'.
 * - Records approved/rejected actions.
 * - For agent_type='recommendation': writes approved items into the Recommendation entity.
 * - NEVER calls external provider APIs and NEVER activates deals.
 */

const ENGINE_VERSION = 'm8-approve-agent-run-1.0';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Admin only (no service-role bypass — this is a human gate)
  let user = null;
  try { user = await base44.auth.me(); } catch (_) { /* fall through */ }
  if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') {
    return Response.json({ ok: false, error: 'Forbidden — admin only' }, { status: 403 });
  }

  let body = {};
  try { body = await req.json(); } catch (_) { /* empty body ok */ }
  const { run_id, approved_actions = [], rejected_actions = [] } = body || {};
  if (!run_id) {
    return Response.json({ ok: false, error: 'run_id required' }, { status: 400 });
  }

  const svc = base44.asServiceRole;

  const run = await svc.entities.AgentRun.get(run_id).catch(() => null);
  if (!run) {
    return Response.json({ ok: false, error: 'AgentRun not found' }, { status: 404 });
  }
  if (run.status !== 'awaiting_approval') {
    return Response.json({
      ok: false,
      error: `AgentRun status is '${run.status}', expected 'awaiting_approval'`,
    }, { status: 409 });
  }

  const approvedArr = Array.isArray(approved_actions) ? approved_actions : [];
  const rejectedArr = Array.isArray(rejected_actions) ? rejected_actions : [];
  const nowIso = new Date().toISOString();

  // ── For recommendation agent: persist approved recs to Recommendation entity ──
  let recommendations_written = 0;
  if (run.agent_type === 'recommendation' && approvedArr.length) {
    const recsToCreate = approvedArr.map((a) => ({
      brand_id: run.brand_id,
      vertical: a.vertical || 'general',
      type: 'ai_synthesis',
      title: a.title || 'AI-generated recommendation',
      description: a.reasoning || '',
      expected_benefit: a.expected_saving_eur != null
        ? `€${Math.round(a.expected_saving_eur).toLocaleString()}/yr`
        : undefined,
      action_required: 'Review and activate',
      action_link: '/Dashboard',
      score_json: {
        total: Math.round((Number(a.confidence || 0) * 100) || 50),
        confidence: Number(a.confidence || 0),
        expected_saving_eur: Number(a.expected_saving_eur || 0),
        priority: Number(a.priority || 3),
      },
      reasons: Array.isArray(a.evidence) ? a.evidence : (a.reasoning ? [a.reasoning] : []),
      effort_level: a.effort || 'medium',
      generated_at: nowIso,
    }));

    try {
      await svc.entities.Recommendation.bulkCreate(recsToCreate);
      recommendations_written = recsToCreate.length;
    } catch (e) {
      console.warn('Recommendation bulkCreate failed:', e?.message || e);
    }
  }

  // ── Update the AgentRun ──────────────────────────────────────
  await svc.entities.AgentRun.update(run_id, {
    status: 'approved',
    actions_approved: approvedArr,
    actions_rejected: rejectedArr,
    approved_by: user.email,
    approved_at: nowIso,
  });

  // ── Log to OperationalLog (best-effort) ──────────────────────
  try {
    await svc.entities.OperationalLog.create({
      brand_id: run.brand_id,
      kind: 'agent_run_approved',
      message: `AgentRun ${run_id} (${run.agent_type}) approved by ${user.email}`,
      payload: {
        run_id,
        agent_type: run.agent_type,
        approved_count: approvedArr.length,
        rejected_count: rejectedArr.length,
        recommendations_written,
        engine_version: ENGINE_VERSION,
      },
    });
  } catch (_) { /* OperationalLog may be optional — non-fatal */ }

  return Response.json({
    ok: true,
    run_id,
    actions_approved_count: approvedArr.length,
    actions_rejected_count: rejectedArr.length,
    recommendations_written,
  });
});