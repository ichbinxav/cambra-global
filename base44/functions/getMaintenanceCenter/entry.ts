import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { disasterRecoveryCompletionEvidence, readCriticalSchedulerEvidence } from '../../shared/schedulerRun.ts';
import { projectDocumentationHealth } from '../../shared/documentationHealth.ts';
import { integrationHealthScope, productionIntegrationHealthIssue } from '../../shared/integrationHealth.ts';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { handleDisasterRecoveryBackupChunk } from '../../shared/disasterRecoveryRuntime.ts';

Deno.serve(async (req) => {
  try {
    const routed = await req.clone().json().catch(() => ({}));
    if (routed.action === 'dr_backup_chunk') {
      const chunkClient = createClientFromRequest(req);
      const chunkGate = await requireAdminOrInternal(req, chunkClient, routed);
      if (!chunkGate.ok) return chunkGate.response;
      if (!chunkGate.isInternal) return Response.json({ ok:false, error:'dr_backup_chunk_internal_authority_required' }, { status:403 });
      return handleDisasterRecoveryBackupChunk(req);
    }
    const b = createClientFromRequest(req);
    const u = await b.auth.me().catch((error:any)=>safeBestEffort(error,{operation:'getMaintenanceCenter',fallback:null,severity:'secondary'}));
    if (!u) return Response.json({ ok:false, error:'Unauthorized' }, { status:401 });
    if (u.role !== 'admin') return Response.json({ ok:false, error:'Forbidden' }, { status:403 });
    const s = b.asServiceRole;
    const t = Date.now();
    const [runs, incidents, integrations, failedTasks, pricing, knowledge, security, documentation, production, alertDeliveries, disasterRecoveryExercises, disasterRecoveryEvents] = await Promise.all([
      s.entities.MaintenanceRun.list('-started_at', 50),
      s.entities.AutonomyIncident.filter({ status:'open' }, '-last_seen_at', 500),
      s.entities.Integration.list('-last_sync_at', 2000),
      s.entities.AgentTask.filter({ status:'failed' }, '-created_date', 5000),
      s.entities.ProviderPricingVersion.list('-observed_at', 2000),
      s.entities.RemediationKnowledge.list('-last_verified_at', 500),
      s.entities.SecurityAudit.list('-created_date', 500),
      s.entities.DocumentationHealthAssessment.list('-calculated_at', 20).catch((error:any)=>safeBestEffort(error,{operation:'getMaintenanceCenter',fallback:[],severity:'secondary'})),
      s.entities.ProductionReadinessSnapshot.list('-calculated_at', 20).catch((error:any)=>safeBestEffort(error,{operation:'getMaintenanceCenter',fallback:[],severity:'secondary'})),
      s.entities.IncidentAlertDelivery.list('-updated_at', 200).catch((error:any)=>safeBestEffort(error,{operation:'getMaintenanceCenter',fallback:[],severity:'secondary'})),
      s.entities.DisasterRecoveryExercise.list('-completed_at', 20).catch((error:any)=>safeBestEffort(error,{operation:'getMaintenanceCenter',fallback:[],severity:'secondary'})),
      s.entities.OperationalLog.filter({ event_type:{ $in:['disaster_recovery_backup_completed','disaster_recovery_backup_failed','disaster_recovery_restore_attested'] } }, '-created_at', 50).catch((error:any)=>safeBestEffort(error,{operation:'getMaintenanceCenter',fallback:[],severity:'secondary'})),
    ]);
    const last = runs[0] || null;
    const doc = documentation[0] || null;
    const docProjection = projectDocumentationHealth(doc);
    const stalePricing = pricing.filter((x:any) => x.truth_level === 'verified_official' && x.knowledge_state === 'active' && t - Date.parse(x.observed_at || '') > 90 * 86400000);
    const integrationIssues = integrations.filter((x:any) => productionIntegrationHealthIssue(x, t));
    const integrationHealthExclusions = integrations.filter((x:any) => !integrationHealthScope(x).included);
    const agentFailures = failedTasks.filter((x:any) => t - Date.parse(x.created_date || x.started_at || '') < 7 * 86400000);
    const critical = incidents.filter((x:any) => x.severity === 'critical');
    const autoEligible = incidents.filter((x:any) => x.automation_eligibility !== 'human_required');
    const human = incidents.filter((x:any) => x.automation_eligibility === 'human_required' || x.workflow_state === 'human_review');
    const recentSecurity = security.filter((x:any) => x.success === false && t - Date.parse(x.created_date || '') < 24 * 3600000);
    const schedulerHealth=await readCriticalSchedulerEvidence(s,t,disasterRecoveryCompletionEvidence(disasterRecoveryEvents));
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
        score:docProjection.source_health_score,
        status:docProjection.status,
        proposal_status:docProjection.proposal_status,
        proposal_workflow_score:docProjection.proposal_workflow_score,
        current_count:doc.current_count || 0,
        outdated_count:doc.outdated_count || 0,
        contradictory_count:doc.contradictory_count || 0,
        unverified_count:doc.unverified_count || 0,
        actual_drift_count:docProjection.actual_drift,
        pending_change_proposals:docProjection.pending_change_proposals,
        incident_review_proposals:docProjection.incident_review_proposals,
        legacy_incomplete_count:doc.incomplete_count || 0,
        legacy_critical_drift_count:doc.critical_drift_count || 0,
        registry_version:doc.registry_version || null,
        system_version:doc.system_version || null,
        calculated_at:doc.calculated_at || null,
      } : null,
      production_readiness: production[0] || null,
      disaster_recovery:{
        latest_backup_event:disasterRecoveryEvents.find((row:any)=>row.event_type==='disaster_recovery_backup_completed') || null,
        latest_failure_event:disasterRecoveryEvents.find((row:any)=>row.event_type==='disaster_recovery_backup_failed') || null,
        latest_real_restore:disasterRecoveryExercises.find((row:any)=>row.exercise_type==='REAL_RESTORE') || null,
        exercises:disasterRecoveryExercises,
        events:disasterRecoveryEvents,
        rpo_target_minutes:1440,
        rto_target_minutes:480,
        independent_storage:'globalcambra.sharepoint.com / CAMBRA INFRASTRUCTURE / Production Backups',
      },
      scheduler_health:schedulerHealth,
      metrics:{
        active_issues:incidents.length,
        critical_incidents:critical.length,
        automatic_resolution_eligible:autoEligible.length,
        human_review_required:human.length,
        integrations_unhealthy:integrationIssues.length,
        integrations_excluded_from_production_health:integrationHealthExclusions.length,
        stale_provider_pricing:stalePricing.length,
        agent_failures_7d:agentFailures.length,
        security_failures_24h:recentSecurity.length,
        validated_remediations:knowledge.filter((x:any) => x.active && Number(x.success_count || 0) > 0).length,
        repairs_verified_last_run:Number(last?.repairs_verified || 0),
        repairs_failed_last_run:Number(last?.repairs_failed || 0),
        documentation_health_score:doc ? docProjection.source_health_score : null,
        documentation_drift:docProjection.actual_drift,
        documentation_critical_drift:Number(doc?.contradictory_count || 0),
        documentation_pending_change_proposals:docProjection.pending_change_proposals,
        documentation_incident_review_proposals:docProjection.incident_review_proposals,
        documentation_proposal_workflow_score:docProjection.proposal_workflow_score,
        production_sealed:production[0]?.sealed === true,
        production_external_blockers:(production[0]?.external_blockers || []).length,
        disaster_recovery_pass:disasterRecoveryExercises.some((row:any)=>row.exercise_type==='REAL_RESTORE'&&row.status==='PASS'),
        critical_alerts_delivered:alertDeliveries.filter((x:any)=>x.status==='DELIVERED').length,
        critical_alerts_accepted:alertDeliveries.filter((x:any)=>x.status==='ACCEPTED').length,
        critical_alerts_observed:alertDeliveries.filter((x:any)=>['OBSERVED','DELIVERED'].includes(x.status)).length,
        critical_alerts_review_required:alertDeliveries.filter((x:any)=>['REVIEW_REQUIRED','FAILED'].includes(x.status)).length,
        critical_alerts_blocked:alertDeliveries.filter((x:any)=>['BLOCKED','CONFIGURATION_REQUIRED'].includes(x.status)).length,
        critical_alerts_pending:alertDeliveries.filter((x:any)=>['CLAIMED','EFFECTING','PENDING','RETRY_PENDING'].includes(x.status)).length,
        critical_alert_batches:alertDeliveries.filter((x:any)=>Array.isArray(x.incident_ids)&&x.incident_ids.length>0).length,
      },
      last_run:last,
      runs:runs.slice(0,20),
      incidents:incidents.slice(0,100),
      incident_alert_deliveries:alertDeliveries.slice(0,100),
      integration_issues:integrationIssues.slice(0,50).map((x:any) => ({ id:x.id, provider:x.provider, brand_id:x.brand_id, status:x.status, last_sync_at:x.last_sync_at, last_error:x.last_error })),
      integration_health_exclusions:integrationHealthExclusions.slice(0,50).map((x:any) => ({ id:x.id, provider:x.provider, brand_id:x.brand_id, reason:integrationHealthScope(x).reason })),
      stale_pricing:stalePricing.slice(0,50).map((x:any) => ({ id:x.id, provider_slug:x.provider_slug, country:x.country, channel:x.channel, observed_at:x.observed_at })),
      remediation_knowledge:knowledge.slice(0,50).map((x:any) => ({ id:x.id, domain:x.domain, incident_type:x.incident_type, successful_action:x.successful_action, validation_count:x.validation_count, success_count:x.success_count, failure_count:x.failure_count, confidence:x.confidence, last_verified_at:x.last_verified_at })),
      truth_boundary:{
        health_score:'advisory composite from the latest MaintenanceRun',
        documentation_health:'actual source drift is separate from pending DocumentationChangeProposal workflow; source-path drift is enforced by documentation:check during release closure',
        integration_health:'production health excludes explicitly classified internal demo and dogfood providers without deleting or mutating their evidence rows',
        financial_integrity:'authoritative Invoice/ProviderRevenue ledgers and reconciliation workers remain source of truth',
        security:'signals are escalated; P17 never autonomously weakens auth, permissions or security controls',
        developer:'technical incidents may create investigation tasks; code application/cutover remains DeveloperMigrationEngine approval-gated',
        incident_alerting:'AutonomyIncident is the sole incident source of truth; IncidentAlertDelivery is only the aggregated transport/linkage ledger. ACCEPTED is not DELIVERED; OBSERVED requires a provider receipt or reconciliation.',
      },
    });
  } catch (e) {
    console.error(e);
    return Response.json({ ok:false, error:'maintenance_center_failed' }, { status:500 });
  }
});
