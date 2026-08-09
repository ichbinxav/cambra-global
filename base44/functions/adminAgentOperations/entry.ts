import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
const PLATFORM = '_platform';
const ALLOWED = new Set(['founderCopilotAgent','investorUpdateAgent','qaAgent','leadDiscoveryAgent','leadEnrichmentAgent','leadScoringAgent','crmAgent','outreachAgent','followUpAgent','meetingAgent','blogAgent','newsletterAgent','linkedinAgent','xTwitterAgent','seoAgent','competitorMonitorAgent','providerResearchAgent','providerMonitorAgent','gdprAgent','complianceAgent','legalReviewAgent','contractIPAgent','codeReviewAgent','securityAgent','qaMonitorAgent','engineeringReportAgent','fixValidatorAgent','discoveryTechStackAgent','spendIntelligenceAgent','recommendationEngineAgent','brainOrchestrator','systemHealthAgent']);
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req); const user = await base44.auth.me().catch(() => null);
  if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({})); const action = String(body?.action || 'status'); const svc = base44.asServiceRole;
  if (action === 'status') { const tasks = await svc.entities.AgentTask.list('-created_date', 500).catch(() => []); const latest: Record<string, any> = {}; for (const t of tasks) if (t.agent_name && !latest[t.agent_name]) latest[t.agent_name] = t; return Response.json({ ok: true, latest, recent: tasks.slice(0, 80) }); }
  if (action === 'run') { const functionName = String(body?.function_name || ''); if (!ALLOWED.has(functionName)) return Response.json({ ok: false, error: 'agent_not_allowlisted' }, { status: 400 }); const args = body?.args && typeof body.args === 'object' ? body.args : {}; const result = await svc.functions.invoke(functionName, args); await svc.entities.OperationalLog.create({ brand_id: PLATFORM, event_type: 'status_changed', message: 'admin_agent_manual_run', metadata_json: { function_name: functionName, requested_by: user.email || user.id || 'admin' } }).catch(() => null); return Response.json({ ok: true, function_name: functionName, result: result?.data ?? result ?? null }); }
  return Response.json({ ok: false, error: 'unsupported_action' }, { status: 400 });
});
