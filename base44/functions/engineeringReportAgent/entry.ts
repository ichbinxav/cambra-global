import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const AGENT_NAME = "engineering_report";
const TASK_TYPE = "engineering_report";
const RISK_LEVEL = 1;
const ENG_DISCLAIMER = "⚠️ Fix propuesto por IA. Revisa el diff antes de aprobar. Aplicar cambios de código tiene riesgo — verifica que entiendes el cambio.";

// L1 — consolida findings de los 3 agentes de detección. Por CADA fix propuesto crea
// un Approval (action_type: "apply_code_fix", risk_level: 4). NUNCA aplica código.
// El único agente que crea Approvals para apply_code_fix.
Deno.serve(async (req) => {
  let task = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const reportLabel = body?.label || (new Date().getHours() < 12 ? "morning" : "afternoon");

    // Window: since the last engineering_report task (or 12h fallback)
    const recentReports = await base44.asServiceRole.entities.AgentTask
      .filter({ agent_name: AGENT_NAME, task_type: TASK_TYPE, status: "completed" }, "-completed_at", 1).catch(() => []);
    const since = recentReports[0]?.completed_at
      || new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: RISK_LEVEL,
      input_summary: `Engineering report (${reportLabel}): consolidating since ${since}`,
      started_at: new Date().toISOString(),
    });

    // Collect findings from the 3 detection agents
    const sourceAgents = ["code_review", "security", "qa_monitor"];
    const allDetectionTasks = await base44.asServiceRole.entities.AgentTask
      .filter({ status: "completed" }, "-completed_at", 200).catch(() => []);
    const relevant = allDetectionTasks.filter(t =>
      sourceAgents.includes(t.agent_name) &&
      (t.completed_at || t.created_date) >= since
    );

    const allFindings = [];
    for (const t of relevant) {
      const f = t.output_payload_json?.findings;
      if (Array.isArray(f)) {
        for (const finding of f) {
          allFindings.push({ ...finding, source_task_id: t.id });
        }
      }
    }

    // Group by severity
    const bySeverity = { critical: [], warning: [], info: [] };
    for (const f of allFindings) {
      const sev = ["critical", "warning", "info"].includes(f.severity) ? f.severity : "info";
      bySeverity[sev].push(f);
    }
    const overallSeverity = bySeverity.critical.length > 0 ? "critical"
      : bySeverity.warning.length > 0 ? "warning" : "info";

    // For each finding that has a proposed_fix_diff → create ONE Approval (L4)
    const approvalsCreated = [];
    for (const f of allFindings) {
      const diff = f.proposed_fix_diff;
      if (!diff || typeof diff !== "string" || diff.trim().length === 0) continue;

      const draftContent = [
        `PROBLEMA (${(f.severity || "info").toUpperCase()})`,
        `Fuente: ${f.source_agent || "unknown"}${f.security_category ? ` / ${f.security_category}` : ""}`,
        `File: ${f.file || f.affected_function || "n/a"}${f.location ? ` @ ${f.location}` : ""}`,
        "",
        f.problem_description || f.pattern || "(sin descripción)",
        "",
        `RIESGO DE APLICAR: ${(f.risk_of_applying || "unknown").toUpperCase()}`,
        f.risk_explanation || "(sin explicación de riesgo)",
        "",
        "DIFF PROPUESTO:",
        diff,
        "",
        ENG_DISCLAIMER,
      ].join("\n");

      const approval = await base44.asServiceRole.entities.Approval.create({
        brand_id: "_platform",
        agent_task_id: task.id,
        action_type: "apply_code_fix",
        related_entity_type: "AgentTask",
        related_entity_id: f.source_task_id,
        risk_level: 4,
        draft_content: draftContent,
        draft_payload_json: {
          finding_id: f.id,
          source_agent: f.source_agent,
          source_task_id: f.source_task_id,
          file: f.file || null,
          location: f.location || null,
          affected_function: f.affected_function || null,
          severity: f.severity,
          security_category: f.security_category || null,
          proposed_fix_diff: diff,
          risk_of_applying: f.risk_of_applying || "unknown",
          risk_explanation: f.risk_explanation || null,
          problem_description: f.problem_description || f.pattern || null,
          disclaimer: ENG_DISCLAIMER,
        },
        status: "pending",
      }).catch(() => null);
      if (approval) approvalsCreated.push({ approval_id: approval.id, finding_id: f.id, severity: f.severity });
    }

    // Emit Event for Founder Copilot
    const ev = await base44.asServiceRole.entities.Event.create({
      brand_id: "_platform",
      event_type: "engineering.report.ready",
      source: AGENT_NAME,
      entity_type: "AgentTask",
      entity_id: task.id,
      agent_task_id: task.id,
      payload_json: {
        label: reportLabel,
        since,
        until: new Date().toISOString(),
        counts: {
          critical: bySeverity.critical.length,
          warning: bySeverity.warning.length,
          info: bySeverity.info.length,
          total: allFindings.length,
        },
        approvals_created: approvalsCreated.length,
        overall_severity: overallSeverity,
        disclaimer: ENG_DISCLAIMER,
      },
      status: "pending",
    }).catch(() => null);

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "completed",
      output_summary: `Engineering report (${reportLabel}): ${bySeverity.critical.length} critical · ${bySeverity.warning.length} warning · ${bySeverity.info.length} info · ${approvalsCreated.length} approvals created`,
      output_payload_json: {
        disclaimer: ENG_DISCLAIMER,
        label: reportLabel,
        window: { since, until: new Date().toISOString() },
        counts: {
          critical: bySeverity.critical.length,
          warning: bySeverity.warning.length,
          info: bySeverity.info.length,
          total: allFindings.length,
        },
        findings_by_severity: bySeverity,
        approvals_created: approvalsCreated,
        overall_severity: overallSeverity,
        report_event_id: ev?.id || null,
        source_tasks_count: relevant.length,
      },
      completed_at: new Date().toISOString(),
    });

    return Response.json({
      ok: true,
      task_id: task.id,
      label: reportLabel,
      counts: { critical: bySeverity.critical.length, warning: bySeverity.warning.length, info: bySeverity.info.length },
      approvals_created: approvalsCreated.length,
      event_id: ev?.id || null,
    });
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