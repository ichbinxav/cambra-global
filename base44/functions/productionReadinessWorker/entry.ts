import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { evaluateProductionSeal } from '../../shared/productionReadiness.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req); const body = await req.json().catch(() => ({})); const gate = await requireAdminOrInternal(req, base44, body); if (!gate.ok) return gate.response;
    const svc = base44.asServiceRole; const sha = String(body.final_sha || 'UNVERIFIED');
    const [findings,verifications,restores,slos] = await Promise.all([
      svc.entities.ProductionFinding.filter({ status:{ $in:['OPEN','REMEDIATING'] } }, '-updated_at', 1000).catch(() => []),
      svc.entities.ReleaseVerification.filter({ git_sha:sha }, '-verified_at', 100).catch(() => []),
      svc.entities.DisasterRecoveryExercise.filter({ exercise_type:'REAL_RESTORE' }, '-completed_at', 20).catch(() => []),
      svc.entities.ServiceLevelSnapshot.list('-calculated_at', 100).catch(() => []),
    ]);
    const verification = (source:string) => verifications.find((x:any) => x.source === source) || { status:'NOT_RUN' };
    const decision = evaluateProductionSeal({ findings,final_sha:sha,local_checks:body.local_checks || {},remote_ci:verification('GITHUB_ACTIONS'),base44_runtime:verification('BASE44_RUNTIME'),restore_exercise:restores[0] || { status:'NOT_RUN' },document_extraction_eval:verification('DOCUMENT_GOLDEN_CORPUS'),dependency_monitor:verification('DEPENDENCY_MONITOR') });
    const now = new Date().toISOString(); const snapshot = { snapshot_key:`p11:${sha}:${now.slice(0,10)}`,git_sha:sha,status:decision.status,technically_complete:decision.technically_complete,sealed:decision.sealed,internal_blockers:decision.internal_blockers,external_blockers:decision.external_blockers,failed_local_checks:decision.failed_local_checks,slo_status_json:{ snapshots:slos.slice(0,20),note:'SLO rows remain evidence; absence is not healthy.' },decision_json:decision,version:decision.version,calculated_at:now };
    const old = await svc.entities.ProductionReadinessSnapshot.filter({ snapshot_key:snapshot.snapshot_key }, '-calculated_at', 1).catch(() => []); if (old[0]) await svc.entities.ProductionReadinessSnapshot.update(old[0].id, snapshot); else await svc.entities.ProductionReadinessSnapshot.create(snapshot);
    return Response.json({ ok:true,snapshot });
  } catch (error) { console.error(error); return Response.json({ ok:false,error:'production_readiness_failed' }, { status:500 }); }
});
