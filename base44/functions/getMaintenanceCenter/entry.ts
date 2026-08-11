import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

Deno.serve(async (req) => {
  try {
    const b = createClientFromRequest(req);
    const u = await b.auth.me().catch(() => null);
    if (!u) return Response.json({ ok:false, error:'Unauthorized' }, { status:401 });
    if (u.role !== 'admin') return Response.json({ ok:false, error:'Forbidden' }, { status:403 });
    const s = b.asServiceRole;
    const [runs, incidents, integrations, tasks, pricing, knowledge, security, documentation, production] = await Promise.all([
      s.entities.MaintenanceRun.list('-started_at', 50),
      s.entities.AutonomyIncident.filter({ status:'open' }, '-last_seen_at', 500),
      s.entities.Integration.list('-last_sync_at', 2000),
      s.entities.AgentTask.list('-created_date', 2000),
      s.entities.ProviderPricingVersion.list('-observed_at', 2000),
      s.entities.RemediationKnowledge.list('-last_verified_at', 500),
      s.entities.SecurityAudit.list('-created_date', 500),
      s.entities.DocumentationHealthAssessment.list('-calculated_at', 20).catch(() => []),
      s.entities.ProductionReadinessSnapshot.list('-calculated_at', 20).catch(() => []),
    ]);
    const last = runs[0] || null;
    const doc = documentation[0] || null;
    const t = Date.now();
    const stalePricing = pricing.filter((x:any) => x.truth_level === 'verified_official' && x.knowledge_state === 'active' && t - Date.parse(x.observed_at || '') > 90 * 86400000);
    const integrationIssues = integrations.filter((x:any) => x.status === 'error' || (x.status === 'connected' && x.last_sync_at && t - Date.parse(x.last_sync_at) > 7 * 86400000));
    const recentTasks = tasks.filter((x:any) => t - Date.parse(x.created_date || x.started_at || '') < 7 * 86400000);
    const agentFailures = recentTasks.filter((x:any) => x.status === 'failed');
    const critical = incidents.filter((x:any) => x.severity === 'critical');
    const autoEligible = incidents.filter((x:any) => x.automation_eligibility !== 'human_required');
    const human = incidents.filter((x:any) => x.automation_eligibility === 'human_required' || x.workflow_state === 'human_review');
    const recentSecurity = security.filter((x:any) => x.success === false && t - Date.parse(x.created_date || '') < 24 * 3600000);
    const documentationDrift = Number(doc?.outdated_count || 0) + Number(doc?.incomplete_count || 0) + Number(doc?.contradictory_count || 0) + Number(doc?.unverified_count || 0);
    return Response.json({
      ok:true,
      generated_at:new Date().toISOString(),
      health:{
        score:last?.health_score ?? null,
        status:critical.length ? 'critical' : incidents.length ? 'attention' : last?.status === 'failed' ? 'degraded' : 'healthy',
        last_sweep_at:last?.completed_at || last?.started_at || null,
        engine_version:last?.engine_version || null,
      },
      documentation_health: doc ? {
        score:doc.score,
        status:Number(doc.critical_drift_count || 0) > 0 ? 'critical' : documentationDrift > 0 ? 'attention' : 'current',
        current_count:doc.current_count || 0,
        incomplete_count:doc.incomplete_count || 0,
        outdated_count:doc.outdated_count || 0,
        contradictory_count:doc.contradictory_count || 0,
        unverified_count:doc.unverified_count || 0,
        critical_drift_count:doc.critical_drift_count || 0,
        registry_version:doc.registry_version || null,
        system_version:doc.system_version || null,
        calculated_at:doc.calculated_at || null,
      } : null,
      production_readiness: production[0] || null,
      metrics:{
        active_issues:incidents.length,
        critical_incidents:critical.length,
        automatic_resolution_eligible:autoEligible.length,
        human_review_required:human.length,
        integrations_unhealthy:integrationIssues.length,
        stale_provider_pricing:stalePricing.length,
        agent_failures_7d:agentFailures.length,
        security_failures_24h:recentSecurity.length,
        validated_remediations:knowledge.filter((x:any) => x.active && Number(x.success_count || 0) > 0).length,
        repairs_verified_last_run:Number(last?.repairs_verified || 0),
        repairs_failed_last_run:Number(last?.repairs_failed || 0),
        documentation_health_score:doc?.score ?? null,
        documentation_drift:documentationDrift,
        documentation_critical_drift:Number(doc?.critical_drift_count || 0),
        production_sealed:production[0]?.sealed === true,
        production_external_blockers:(production[0]?.external_blockers || []).length,
      },
      last_run:last,
      runs:runs.slice(0,20),
      incidents:incidents.slice(0,100),
      integration_issues:integrationIssues.slice(0,50).map((x:any) => ({ id:x.id, provider:x.provider, brand_id:x.brand_id, status:x.status, last_sync_at:x.last_sync_at, last_error:x.last_error })),
      stale_pricing:stalePricing.slice(0,50).map((x:any) => ({ id:x.id, provider_slug:x.provider_slug, country:x.country, channel:x.channel, observed_at:x.observed_at })),
      remediation_knowledge:knowledge.slice(0,50).map((x:any) => ({ id:x.id, domain:x.domain, incident_type:x.incident_type, successful_action:x.successful_action, validation_count:x.validation_count, success_count:x.success_count, failure_count:x.failure_count, confidence:x.confidence, last_verified_at:x.last_verified_at })),
      truth_boundary:{
        health_score:'advisory composite from the latest MaintenanceRun',
        documentation_health:'runtime projection from the P18 registry; source-path drift is enforced by documentation:check during release closure',
        financial_integrity:'authoritative Invoice/ProviderRevenue ledgers and reconciliation workers remain source of truth',
        security:'signals are escalated; P17 never autonomously weakens auth, permissions or security controls',
        developer:'technical incidents may create investigation tasks; code application/cutover remains DeveloperMigrationEngine approval-gated',
      },
    });
  } catch (e) {
    console.error(e);
    return Response.json({ ok:false, error:'maintenance_center_failed' }, { status:500 });
  }
});
