import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { internalErrorResponse } from '../../shared/publicErrors.ts';

// Single endpoint that powers the Command Center top bar + recent activity.
// Aggregates counts across AgentTask, Approval, Event, AgentQuestion in
// the last 24h. Read-only. Never writes.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ ok: false, error: "Forbidden — admin only" }, { status: 403 });

    const now = Date.now();
    const last24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    // Read in parallel
    const [tasks, pendingApprovals, pendingQuestions, recentEvents] = await Promise.all([
      base44.asServiceRole.entities.AgentTask.list("-created_date", 300).catch((error:any)=>safeBestEffort(error,{operation:'getCommandCenterPulse',fallback:[],severity:'secondary'})),
      base44.asServiceRole.entities.Approval.filter({ status: "pending" }, "-created_date", 200).catch((error:any)=>safeBestEffort(error,{operation:'getCommandCenterPulse',fallback:[],severity:'secondary'})),
      base44.asServiceRole.entities.AgentQuestion.filter({ status: "pending" }, "-created_date", 200).catch((error:any)=>safeBestEffort(error,{operation:'getCommandCenterPulse',fallback:[],severity:'secondary'})),
      base44.asServiceRole.entities.Event.list("-created_date", 100).catch((error:any)=>safeBestEffort(error,{operation:'getCommandCenterPulse',fallback:[],severity:'secondary'})),
    ]);

    const tasks24h = tasks.filter(t => (t.created_date || "") >= last24h);
    const taskCounts = {
      total: tasks24h.length,
      running: tasks24h.filter(t => t.status === "running").length,
      completed: tasks24h.filter(t => t.status === "completed").length,
      failed: tasks24h.filter(t => t.status === "failed").length,
      waiting_approval: tasks24h.filter(t => t.status === "waiting_approval").length,
      waiting_input: tasks24h.filter(t => t.status === "waiting_input").length,
      queued: tasks24h.filter(t => t.status === "queued").length,
    };

    const legalFlags = recentEvents.filter(e =>
      e.event_type === "legal.flag.raised" && (e.status === "pending" || !e.status)
    );

    const significantEventTypes = [
      "chain.halted.lead_orchestrator",
      "chain.halted.outreach_orchestrator",
      "chain.halted.marketing_orchestrator",
      "chain.halted.research_orchestrator",
      "legal.flag.raised",
      "engineering.report.ready",
      "engineering.fix.validated",
      "research.bundle.completed",
      "agent.question.raised",
    ];
    const recentSignificantEvents = recentEvents
      .filter(e => significantEventTypes.includes(e.event_type))
      .slice(0, 15);

    // Recent activity (last 10 tasks)
    const recentActivity = tasks.slice(0, 10).map(t => ({
      id: t.id,
      agent_name: t.agent_name,
      task_type: t.task_type,
      status: t.status,
      input_summary: t.input_summary,
      output_summary: t.output_summary,
      created_date: t.created_date,
      completed_at: t.completed_at,
    }));

    return Response.json({
      ok: true,
      generated_at: new Date().toISOString(),
      window_hours: 24,
      tasks_24h: taskCounts,
      pending_approvals: pendingApprovals.length,
      pending_questions: pendingQuestions.length,
      legal_flags_open: legalFlags.length,
      recent_significant_events: recentSignificantEvents,
      recent_activity: recentActivity,
    });
  } catch (error) {
    return internalErrorResponse(error, 'getCommandCenterPulse');
  }
});