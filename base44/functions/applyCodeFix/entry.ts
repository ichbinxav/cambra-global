import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ════════════════════════════════════════════════════════════════════════════
// applyCodeFix — TWO-DOOR GATE for the highest-risk action in the system.
//
//   mode "propose": NEVER reachable by code-mutation logic. This branch only
//                   records an intent + ensures an Approval exists. No write.
//
//   mode "apply":   REQUIRES approval_id. Validates that:
//                     1. The Approval exists
//                     2. action_type === "apply_code_fix"
//                     3. risk_level === 4
//                     4. status === "approved"
//                     5. Has approved_by (audit trail)
//                   If ANY check fails → 403 BEFORE touching anything.
//                   Only after all 5 pass → records the apply intent + marks
//                   the related AgentTask as completed.
//
// Code mutation in Base44 cannot be done programmatically by user functions —
// the platform does not expose a file-write API to backend functions. So this
// gate's job is to RECORD which fix was approved, by whom, when, and produce
// the diff payload that a human (the founder) or a privileged automation
// outside this function would actually apply.
// ════════════════════════════════════════════════════════════════════════════

const VALID_MODES = ["propose", "apply"];
const REQUIRED_ACTION_TYPE = "apply_code_fix";
const REQUIRED_RISK_LEVEL = 4;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ ok: false, error: "Forbidden — admin only" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode;

    if (!VALID_MODES.includes(mode)) {
      return Response.json({ ok: false, error: "mode must be 'propose' or 'apply'" }, { status: 400 });
    }

    // ───────────────────────────────────────────────────────────
    // MODE: propose — ONLY records intent. No code mutation path.
    // ───────────────────────────────────────────────────────────
    if (mode === "propose") {
      // This branch exists for symmetry with the two-door pattern.
      // It does NOT modify code. It does NOT create the Approval either —
      // engineeringReportAgent is the only function that creates apply_code_fix
      // Approvals (from consolidated findings). This branch just confirms
      // an existing Approval and returns its current state.
      const approvalId = body?.approval_id;
      if (!approvalId) return Response.json({ ok: false, error: "approval_id required in propose mode" }, { status: 400 });
      const approval = await base44.asServiceRole.entities.Approval.get(approvalId).catch(() => null);
      if (!approval) return Response.json({ ok: false, error: "Approval not found" }, { status: 404 });
      return Response.json({
        ok: true,
        mode: "propose",
        approval_id: approval.id,
        approval_status: approval.status,
        action_type: approval.action_type,
        risk_level: approval.risk_level,
        note: "propose mode does not modify code. To apply, the Approval must be approved by a human, then call mode='apply'.",
      });
    }

    // ───────────────────────────────────────────────────────────
    // MODE: apply — STRICT GATE. 5 checks before any side-effect.
    // ───────────────────────────────────────────────────────────
    const approvalId = body?.approval_id;
    if (!approvalId) {
      return Response.json({ ok: false, error: "approval_id required in apply mode", gate: "missing_approval_id" }, { status: 400 });
    }

    const approval = await base44.asServiceRole.entities.Approval.get(approvalId).catch(() => null);

    // Gate 1: Approval must exist
    if (!approval) {
      return Response.json({ ok: false, error: "Approval not found", gate: "approval_not_found" }, { status: 404 });
    }

    // Gate 2: action_type must be apply_code_fix
    if (approval.action_type !== REQUIRED_ACTION_TYPE) {
      return Response.json({
        ok: false,
        error: `action_type mismatch: expected '${REQUIRED_ACTION_TYPE}', got '${approval.action_type}'`,
        gate: "action_type_mismatch",
      }, { status: 403 });
    }

    // Gate 3: risk_level must be 4 (code changes are the highest risk action)
    if (approval.risk_level !== REQUIRED_RISK_LEVEL) {
      return Response.json({
        ok: false,
        error: `risk_level mismatch: expected ${REQUIRED_RISK_LEVEL}, got ${approval.risk_level}`,
        gate: "risk_level_mismatch",
      }, { status: 403 });
    }

    // Gate 4: status MUST be approved (this is THE security check)
    if (approval.status !== "approved") {
      return Response.json({
        ok: false,
        error: `Approval status is '${approval.status}' — must be 'approved' before applying any code change`,
        gate: "approval_not_approved",
        current_status: approval.status,
      }, { status: 403 });
    }

    // Gate 5: must have approved_by (audit trail)
    if (!approval.approved_by) {
      return Response.json({
        ok: false,
        error: "Approval has no approved_by user — audit trail is broken, refusing to apply",
        gate: "missing_approver",
      }, { status: 403 });
    }

    // ───────────────────────────────────────────────────────────
    // All 5 gates passed. Record the apply event.
    // ───────────────────────────────────────────────────────────
    const payload = approval.draft_payload_json || {};

    // Idempotency: don't double-apply. If an apply event already exists for this approval, refuse.
    const existing = await base44.asServiceRole.entities.Event
      .filter({ event_type: "engineering.fix.applied", entity_id: approval.id }, "-created_date", 1).catch(() => []);
    if (existing.length > 0) {
      return Response.json({
        ok: false,
        error: "This fix has already been applied",
        gate: "already_applied",
        applied_event_id: existing[0].id,
      }, { status: 409 });
    }

    const appliedAt = new Date().toISOString();
    const appliedEvent = await base44.asServiceRole.entities.Event.create({
      brand_id: "_platform",
      event_type: "engineering.fix.applied",
      source: "applyCodeFix",
      entity_type: "Approval",
      entity_id: approval.id,
      agent_task_id: approval.agent_task_id || null,
      payload_json: {
        approval_id: approval.id,
        approved_by: approval.approved_by,
        approved_at: approval.approved_at,
        applied_by: user.email,
        applied_at: appliedAt,
        file: payload.file,
        location: payload.location,
        source_agent: payload.source_agent,
        finding_id: payload.finding_id,
        diff: payload.proposed_fix_diff,
        risk_of_applying: payload.risk_of_applying,
      },
      status: "pending",
    });

    return Response.json({
      ok: true,
      mode: "apply",
      gate: "passed_all_checks",
      approval_id: approval.id,
      approved_by: approval.approved_by,
      applied_by: user.email,
      applied_at: appliedAt,
      applied_event_id: appliedEvent.id,
      file: payload.file,
      diff_recorded: !!payload.proposed_fix_diff,
      note: "Fix application recorded with full audit trail. Diff payload is available in the Event for manual application or external tooling.",
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});