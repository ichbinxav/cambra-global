import { safeBestEffort } from '../../shared/bestEffort.ts';
import { claimSchedulerRun, finishSchedulerRunOrThrow, markSchedulerEffectStarted, schedulerClaimDeniedResponse } from '../../shared/schedulerRun.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { emergencyState } from '../../shared/operationalControl.ts';
import { attachCanonicalChildTask, createCanonicalAgentTask } from '../../shared/agentTaskEnvelope.ts';
import { sha256Canonical } from '../../shared/legalExecution.ts';
import { runtimeDeploymentIdentity, validateRuntimeDeploymentIdentity } from '../../shared/runtimeEvidence.ts';

const VERSION = 'autonomous-company-orchestrator-p8-1.0.0';

async function invokeStep(service: any, name: string, internalSecret: string, parent: any, stepIndex: number, payload: any = {}) {
  const startedAt = new Date().toISOString();
  try {
    const result = await service.functions.invoke(name, { ...payload,internal_secret: internalSecret });
    const data = result?.data || result || {};
    if (data?.task_id) await attachCanonicalChildTask(service, data.task_id, parent, { stepKey:name, stepIndex, input:payload, sourceRefs:[{type:'function',id:name}] });
    return { name, ok: data?.ok !== false, started_at: startedAt, completed_at: new Date().toISOString(), result: data };
  } catch (error: any) {
    return { name, ok: false, started_at: startedAt, completed_at: new Date().toISOString(), error: String(error?.message || error).slice(0, 500) };
  }
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
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response as Response;
    const service = base44.asServiceRole;__schedulerSvc=service;__schedulerClaim=await claimSchedulerRun(service,req,{worker_key:'autonomousCompanyOrchestrator',cadence_seconds:21600});{const denied=schedulerClaimDeniedResponse(__schedulerClaim);if(denied)return denied;}__schedulerClaim=await markSchedulerEffectStarted(service,__schedulerClaim);{const denied=schedulerClaimDeniedResponse(__schedulerClaim);if(denied)return denied;}
    const __runtimeIdentity=runtimeDeploymentIdentity(),__runtimeValidation=validateRuntimeDeploymentIdentity(__runtimeIdentity,{environment:'production'});
    __schedulerRuntime={runtime_identity_hash:await sha256Canonical(__runtimeIdentity),runtime_git_sha:__runtimeIdentity.git_sha,runtime_identity_status:__runtimeValidation.status,runtime_identity_blockers:__runtimeValidation.blockers};
    const internalSecret = Deno.env.get('INTERNAL_CALL_SECRET') || '';
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
      sourceRefs:[
        {type:'platform_scope',id:'_platform'},
        {
          type:'SchedulerRun',
          id:String(__schedulerClaim.run.id),
          version:String(__schedulerClaim.run?.details_json?.guard_version||'scheduler-guard-unknown'),
        },
      ],
    });

    // These steps are deliberately intelligence/projection-only. External
    // sending, contract acceptance, migration cutover, spend and charging stay
    // behind their existing policy/authority gates and are not invoked here.
    const steps = [];
    steps.push(await invokeStep(service, 'alwaysOnLeadDiscoveryWorker', internalSecret, task, 1));
    steps.push(await invokeStep(service, 'salesPipelineWorker', internalSecret, task, 2));
    steps.push(await invokeStep(service, 'outreachExperimentLearningWorker', internalSecret, task, 3));
    steps.push(await invokeStep(service, 'executiveDigestWorker', internalSecret, task, 4));

    const [commercialRows, maintenanceRows, criticalIncidents] = await Promise.all([
      service.entities.CommercialIntelligenceSnapshot.list('-generated_at', 1).catch((error:any)=>safeBestEffort(error,{operation:'autonomousCompanyOrchestrator',fallback:[],severity:'secondary'})),
      service.entities.MaintenanceRun.list('-started_at', 1).catch((error:any)=>safeBestEffort(error,{operation:'autonomousCompanyOrchestrator',fallback:[],severity:'secondary'})),
      service.entities.AutonomyIncident.filter({ status: 'open', severity: 'critical' }, '-last_seen_at', 50).catch((error:any)=>safeBestEffort(error,{operation:'autonomousCompanyOrchestrator',fallback:[],severity:'secondary'})),
    ]);
    const decision = await upsertMarketDecision(service, commercialRows[0] || null).catch((error:any)=>safeBestEffort(error,{operation:'autonomousCompanyOrchestrator',fallback:null,severity:'secondary'}));
    const failedSteps = steps.filter((step) => !step.ok);
    const state = failedSteps.length || criticalIncidents.length ? 'degraded' : emergency.safe_mode ? 'contained' : 'healthy';
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
      status: failedSteps.length ? 'failed' : 'completed',
      output_summary: `P8 coordination ${state}: ${steps.length - failedSteps.length}/${steps.length} intelligence steps completed`,
      output_payload_json: output,
      ...(failedSteps.length ? { error: `${failedSteps.length} coordinated step(s) failed` } : {}),
      completed_at: new Date().toISOString(),
    });
    await service.entities.Event.create({
      brand_id: '_platform', event_type: 'company.coordination.completed', source: 'autonomous_company_orchestrator',
      entity_type: 'AgentTask', entity_id: task.id, agent_task_id: task.id,
      payload_json: { orchestrator_version: VERSION, state, failed_steps: failedSteps.map((step) => step.name), commercial_intelligence_snapshot_id: output.commercial_intelligence_snapshot_id, founder_decision_id: output.founder_decision_id }, status: 'pending',
    }).catch((error:any)=>safeBestEffort(error,{operation:'autonomousCompanyOrchestrator',fallback:null,severity:'secondary'}));
    return Response.json({ ok: failedSteps.length === 0, task_id: task.id, ...output }, { status: failedSteps.length ? 207 : 200 });
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
  }finally{if(__schedulerSvc&&__schedulerClaim)await finishSchedulerRunOrThrow(__schedulerSvc,__schedulerClaim,{worker_key:'autonomousCompanyOrchestrator',...(__schedulerRuntime||{runtime_identity_status:'INCOMPLETE',runtime_identity_blockers:['runtime_binding_not_recorded']})},__schedulerOk)}
}
