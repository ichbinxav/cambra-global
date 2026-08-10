import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const AGENT_NAME = "engineering_report";
const TASK_TYPE = "engineering_report";
const RISK_LEVEL = 1;
const ENG_DISCLAIMER = "⚠️ Fix propuesto por IA. Revísalo antes de dárselo a Base44.";

// L1 — consolida findings de los 3 agentes de detección. NUNCA aplica código.
// NUNCA crea Approvals — los agentes no tienen escritura al repo, así que no hay
// nada que "aprobar para ejecutar". El reporte es INFORMATIVO: lista hallazgos
// + ready_to_paste_prompts que el founder llevará a Base44 manualmente.
Deno.serve(async (req) => {
  let task = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const reportLabel = body?.label || (new Date().getHours() < 12 ? "morning" : "afternoon");

    // Window: since the last engineering_report (or 12h fallback)
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

    // Collect findings from the 3 detection agents since `since`
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

    // Build the ready-to-paste queue: ordered by severity, only findings that have a prompt
    const readyToPasteQueue = [];
    for (const sev of ["critical", "warning", "info"]) {
      for (const f of bySeverity[sev]) {
        if (f.ready_to_paste_prompt && typeof f.ready_to_paste_prompt === "string" && f.ready_to_paste_prompt.trim()) {
          readyToPasteQueue.push({
            finding_id: f.id,
            severity: sev,
            source_agent: f.source_agent,
            file: f.file || f.affected_function || null,
            problem_short: (f.problem_description || f.pattern || "").slice(0, 120),
            ready_to_paste_prompt: f.ready_to_paste_prompt,
            risk_of_applying: f.risk_of_applying || "unknown",
            source_task_id: f.source_task_id,
          });
        }
      }
    }

    // Emit Event for Founder Copilot — informative, no Approval link
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
          ready_to_paste: readyToPasteQueue.length,
        },
        overall_severity: overallSeverity,
        disclaimer: ENG_DISCLAIMER,
      },
      status: "pending",
    }).catch(() => null);

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "completed",
      output_summary: `Engineering report (${reportLabel}): ${bySeverity.critical.length} critical · ${bySeverity.warning.length} warning · ${bySeverity.info.length} info · ${readyToPasteQueue.length} prompts ready for Base44`,
      output_payload_json: {
        disclaimer: ENG_DISCLAIMER,
        label: reportLabel,
        window: { since, until: new Date().toISOString() },
        counts: {
          critical: bySeverity.critical.length,
          warning: bySeverity.warning.length,
          info: bySeverity.info.length,
          total: allFindings.length,
          ready_to_paste: readyToPasteQueue.length,
        },
        findings_by_severity: bySeverity,
        ready_to_paste_queue: readyToPasteQueue,
        overall_severity: overallSeverity,
        report_event_id: ev?.id || null,
        source_tasks_count: relevant.length,
        next_step: "Copia cada ready_to_paste_prompt a Base44 builder chat. Cuando Base44 responda, invoca fixValidatorAgent (rescan + review_response) para confirmar el fix.",
      },
      completed_at: new Date().toISOString(),
    });

    return Response.json({
      ok: true,
      task_id: task.id,
      label: reportLabel,
      counts: {
        critical: bySeverity.critical.length,
        warning: bySeverity.warning.length,
        info: bySeverity.info.length,
        ready_to_paste: readyToPasteQueue.length,
      },
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