// AUDIT 2026-08-18 — moved out of base44/functions/autonomousCompanyOrchestrator/entry.ts. Host functions
// import this module directly: a relative import into another function's tree
// cannot be bundled, so every host of this logical route silently failed to
// deploy and kept serving stale code.
import { safeBestEffort } from '../bestEffort.ts';
import { claimSchedulerRun, finishSchedulerRunOrThrow, markSchedulerEffectStarted, schedulerClaimDeniedResponse } from '../schedulerRun.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../internalGate.ts';
import { emergencyState } from '../operationalControl.ts';
import { createCanonicalAgentTask } from '../agentTaskEnvelope.ts';
import { sha256Canonical } from '../legalExecution.ts';
import { runtimeDeploymentIdentity, validateRuntimeDeploymentIdentity } from '../runtimeEvidence.ts';

const VERSION = 'autonomous-company-orchestrator-p8-1.1.0';

const COORDINATED_WORKERS = Object.freeze([
  { name: 'alwaysOnLeadDiscoveryWorker', cadenceSeconds: 3600 },
  { name: 'salesPipelineWorker', cadenceSeconds: 3600 },
  { name: 'outreachExperimentLearningWorker', cadenceSeconds: 86400 },
  { name: 'executiveDigestWorker', cadenceSeconds: 86400 },
]);

function observedAt(run: any) {
  const raw = run?.completed_at || run?.heartbeat_at || run?.started_at;
  const parsed = Date.parse(String(raw || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export function projectScheduledWorkerEvidence(spec: any, rows: any[], nowMs = Date.now()) {
  const attempts = (Array.isArray(rows) ? rows : [])
    .filter((row: any) => row?.record_kind !== 'CONTROL' && row?.invocation_kind === 'SCHEDULED')
    .sort((a: any, b: any) => Number(observedAt(b) || 0) - Number(observedAt(a) || 0));
  const latest = attempts[0] || null;
  const latestCompleted = attempts.find((row: any) => row?.status === 'COMPLETED') || null;
  const completedAt = observedAt(latestCompleted);
  const ageSeconds = completedAt === null ? null : Math.max(0, (nowMs - completedAt) / 1000);
  const fresh = ageSeconds !== null && ageSeconds <= Number(spec.cadenceSeconds) * 2.5;
  let status = 'UNKNOWN';
  if (latest?.status === 'COMPLETED') status = fresh ? 'HEALTHY' : 'STALE';
  else if (latest?.status === 'FAILED') status = fresh ? 'DEGRADED' : 'FAILED';
  else if (latest?.status === 'REVIEW_REQUIRED') status = 'REVIEW_REQUIRED';
  else if (['CLAIMED', 'RUNNING', 'DUPLICATE_BLOCKED'].includes(String(latest?.status || ''))) status = 'DEGRADED';
  else if (latestCompleted) status = fresh ? 'HEALTHY' : 'STALE';
  return {
    name: spec.name,
    ok: status === 'HEALTHY',
    observation_only: true,
    status,
    cadence_seconds: Number(spec.cadenceSeconds),
    latest_run_id: latest?.id || null,
    latest_run_status: latest?.status || null,
    latest_completed_run_id: latestCompleted?.id || null,
    latest_completed_at: latestCompleted?.completed_at || latestCompleted?.heartbeat_at || null,
    age_seconds: ageSeconds,
  };
}

async function observeStep(service: any, spec: any) {
  const rows = await service.entities.SchedulerRun.filter({
    worker_key: spec.name,
    record_kind: 'ATTEMPT',
    invocation_kind: 'SCHEDULED',
  }, '-started_at', 20);
  if (!Array.isArray(rows)) throw new Error(`scheduler_evidence_unavailable:${spec.name}`);
  return projectScheduledWorkerEvidence(spec, rows);
}

async function upsertMarketDecision(service: any, snapshot: any) {
  const market = snapshot?.prioritization_json?.hot_markets?.[0];
  if (!market || Number(market.observed_companies || 0) < 10 || Number(market.outreach_ready || 0) < 3) return null;
  const day = new Date().toISOString().slice(0, 10);
  const decisionKey = `market-priority:${market.key}:${day}`;
  const existing = await service.entities.FounderDecision.filter({ decision_key: decisionKey }, '-created_at', 1).catch((error:any)=>safeBestEffort(error,{operation:'autonomousCompanyOrchestrator',fallback:[],severity:'secondary'}));
  if (existing[0]) return existing[0];
  return service.entities.FounderDecision.create({
    decision_key: decisionKey,
    decision_type: 'market_priority',
    related_entity_type: 'CommercialIntelligenceSnapshot',
    related_entity_id: snapshot.id,
    status: 'open',
    title: `Review ${market.key} as the next commercial priority`,
    summary: `${market.observed_companies} observed companies, ${market.outreach_ready} outreach-ready and heat score ${market.heat_score}. This is an observed sample, not proof of total market size.`,
    options_json: [
      { key: 'prioritize', label: `Prioritize ${market.key}`, effect: 'Update founder-approved acquisition policy after review' },
      { key: 'hold', label: 'Keep current allocation', effect: 'No policy change' },
      { key: 'research', label: 'Collect more evidence', effect: 'No policy change; expand source coverage' },
    ],
    recommended_option: 'research',
    financial_impact_json: { expected_eur: null, reason: 'insufficient observed revenue values for a defensible financial forecast' },
    risk_json: { level: 'notice', sampling_bias_possible: true, source_coverage: snapshot.source_coverage_json || {} },
    reversibility: 'reversible',
    confidence: Math.min(0.9, Math.max(0.1, Number(market.observed_companies || 0) / 100)),
    evidence_json: [{ entity: 'CommercialIntelligenceSnapshot', id: snapshot.id, generated_at: snapshot.generated_at, market: market.key }],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

export async function handleAutonomousCompanyOrchestrator(req: Request) {let __schedulerSvc:any=null;let __schedulerClaim:any=null;let __schedulerOk=true;let __schedulerRuntime:any=null;
  let task: any = null;
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.clone().json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response as Response;
    const service = base44.asServiceRole;__schedulerSvc=service;__schedulerClaim=await claimSchedulerRun(service,req,{worker_key:'autonomousCompanyOrchestrator',cadence_seconds:21600});{const denied=schedulerClaimDeniedResponse(__schedulerClaim);if(denied)return denied;}__schedulerClaim=await markSchedulerEffectStarted(service,__schedulerClaim);{const denied=schedulerClaimDeniedResponse(__schedulerClaim);if(denied)return denied;}
    const __runtimeIdentity=runtimeDeploymentIdentity(),__runtimeValidation=validateRuntimeDeploymentIdentity(__runtimeIdentity,{environment:'production'});
    __schedulerRuntime={runtime_identity_hash:await sha256Canonical(__runtimeIdentity),runtime_git_sha:__runtimeIdentity.git_sha,runtime_identity_status:__runtimeValidation.status,runtime_identity_blockers:__runtimeValidation.blockers};
    const emergency = await emergencyState(service);
    task = await createCanonicalAgentTask(service, req, {
      brand_id: '_platform', agent_name: 'autonomous_company_orchestrator', task_type: 'p8_company_coordination',
      status: 'running', requires_approval: false, risk_level: 1,
      input_summary: 'Coordinate intelligence, commercial projection, learning and executive digest; no direct outreach or material execution',
      started_at: new Date().toISOString(),
    }, {
      workflowKey:'autonomous_company_coordination', workflowVersion:VERSION, tenantKey:'_platform',
      processingPurpose:'company_intelligence_coordination', functionName:'autonomousCompanyOrchestrator',
      input:{host_action:body?.host_action||null}, triggerType:gate.isInternal?'INTERNAL':undefined,
      parentRun:String(__schedulerClaim.run.run_key || __schedulerClaim.run.id),
      sourceRefs:[
        {type:'platform_scope',id:'_platform'},
        {
          type:'SchedulerRun',
          id:String(__schedulerClaim.run.id),
          version:String(__schedulerClaim.run?.details_json?.guard_version||'scheduler-guard-unknown'),
        },
      ],
    });

    // Each dependency already owns a durable schedule. Coordination observes
    // those scheduler receipts instead of re-invoking four long-running jobs.
    // This keeps the six-hour task bounded and cannot send, charge or spend.
    const steps = await Promise.all(COORDINATED_WORKERS.map((spec) => observeStep(service, spec)));

    const [commercialRows, maintenanceRows, criticalIncidents] = await Promise.all([
      service.entities.CommercialIntelligenceSnapshot.list('-generated_at', 1).catch((error:any)=>safeBestEffort(error,{operation:'autonomousCompanyOrchestrator',fallback:[],severity:'secondary'})),
      service.entities.MaintenanceRun.list('-started_at', 1).catch((error:any)=>safeBestEffort(error,{operation:'autonomousCompanyOrchestrator',fallback:[],severity:'secondary'})),
      service.entities.AutonomyIncident.filter({ status: 'open', severity: 'critical' }, '-last_seen_at', 50).catch((error:any)=>safeBestEffort(error,{operation:'autonomousCompanyOrchestrator',fallback:[],severity:'secondary'})),
    ]);
    const decision = await upsertMarketDecision(service, commercialRows[0] || null).catch((error:any)=>safeBestEffort(error,{operation:'autonomousCompanyOrchestrator',fallback:null,severity:'secondary'}));
    const degradedSteps = steps.filter((step) => !step.ok);
    const state = degradedSteps.length || criticalIncidents.length ? 'degraded' : emergency.safe_mode ? 'contained' : 'healthy';
    const output = {
      orchestrator_version: VERSION,
      state,
      safe_mode: emergency.safe_mode,
      material_execution_invoked: false,
      steps,
      commercial_intelligence_snapshot_id: commercialRows[0]?.id || null,
      maintenance_run_id: maintenanceRows[0]?.id || null,
      critical_incident_ids: criticalIncidents.map((incident: any) => incident.id),
      founder_decision_id: decision?.id || null,
      truth_boundary: 'Coordination status is operational evidence. It is not financial truth and cannot grant approve/sign/spend/charge authority.',
    };
    await service.entities.AgentTask.update(task.id, {
      status: 'completed',
      output_summary: `P8 coordination ${state}: ${steps.length - degradedSteps.length}/${steps.length} scheduled dependencies healthy`,
      output_payload_json: output,
      completed_at: new Date().toISOString(),
    });
    await service.entities.Event.create({
      brand_id: '_platform', event_type: 'company.coordination.completed', source: 'autonomous_company_orchestrator',
      entity_type: 'AgentTask', entity_id: task.id, agent_task_id: task.id,
      payload_json: { orchestrator_version: VERSION, state, degraded_dependencies: degradedSteps.map((step) => step.name), commercial_intelligence_snapshot_id: output.commercial_intelligence_snapshot_id, founder_decision_id: output.founder_decision_id }, status: 'pending',
    }).catch((error:any)=>safeBestEffort(error,{operation:'autonomousCompanyOrchestrator',fallback:null,severity:'secondary'}));
    return Response.json({ ok: true, task_id: task.id, ...output });
  } catch (error) {
    __schedulerOk=false;
    console.error('autonomousCompanyOrchestrator failed', error);
    if (task?.id) {
      try {
        const base44 = createClientFromRequest(req);
        await base44.asServiceRole.entities.AgentTask.update(task.id, { status: 'failed', error: 'autonomous_company_orchestration_failed', completed_at: new Date().toISOString() });
      } catch {__schedulerOk=false; /* best effort */ }
    }
    return Response.json({ ok: false, error: 'autonomous_company_orchestration_failed', task_id: task?.id || null }, { status: 500 });
  }finally{if(__schedulerSvc&&__schedulerClaim?.allowed===true)await finishSchedulerRunOrThrow(__schedulerSvc,__schedulerClaim,{worker_key:'autonomousCompanyOrchestrator',...(__schedulerRuntime||{runtime_identity_status:'INCOMPLETE',runtime_identity_blockers:['runtime_binding_not_recorded']})},__schedulerOk)}
}
