import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { claimSchedulerRun, finishSchedulerRunOrThrow, markSchedulerEffectStarted, schedulerClaimDeniedResponse } from '../../shared/schedulerRun.ts';

export async function handleRegulatoryMonitoringWorker(req: Request) {
  let svc:any = null;
  let claim:any = null;
  let success = true;
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;
    svc = base44.asServiceRole;
    claim = await claimSchedulerRun(svc, req, { worker_key:'regulatoryMonitoringWorker',cadence_seconds:86400 });
    { const denied = schedulerClaimDeniedResponse(claim); if (denied) return denied; }
    claim = await markSchedulerEffectStarted(svc, claim);
    { const denied = schedulerClaimDeniedResponse(claim); if (denied) return denied; }
    const now = new Date();
    const horizon = new Date(now.getTime() + 30 * 86400000);
    const [policies,evidence,registrations] = await Promise.all([
      svc.entities.RegulatoryPolicyVersion.filter({ active:true }, '-next_review_at', 5000).catch((error:any)=>safeBestEffort(error,{operation:'regulatoryMonitoringWorker',fallback:[],severity:'secondary'})),
      svc.entities.RegulatoryEvidence.filter({ active:true }, '-next_review_at', 5000).catch((error:any)=>safeBestEffort(error,{operation:'regulatoryMonitoringWorker',fallback:[],severity:'secondary'})),
      svc.entities.RegulatoryRegistration.filter({ active:true }, '-effective_to', 500).catch((error:any)=>safeBestEffort(error,{operation:'regulatoryMonitoringWorker',fallback:[],severity:'secondary'})),
    ]);
    const findings:any[] = [];
    for (const row of policies) if (!row.next_review_at || Date.parse(row.next_review_at) <= now.getTime()) findings.push({ key:`policy:${row.id}`,type:'POLICY_REVIEW_DUE',severity:'HIGH',jurisdiction:row.jurisdiction,activity:row.activity,entity_id:row.id });
    for (const row of evidence) if (!row.next_review_at || Date.parse(row.next_review_at) <= now.getTime()) findings.push({ key:`evidence:${row.id}`,type:'EVIDENCE_REVIEW_DUE',severity:'HIGH',jurisdiction:row.jurisdiction,activity:row.activity,entity_id:row.id });
    for (const row of registrations) if (!row.effective_to || Date.parse(row.effective_to) <= horizon.getTime()) findings.push({ key:`registration:${row.id}`,type:'REGISTRATION_EXPIRY_OR_DATE_MISSING',severity:'CRITICAL',jurisdiction:row.jurisdiction,entity_id:row.id });
    let created = 0;
    for (const finding of findings) {
      const issueKey = `p10:${finding.key}:${now.toISOString().slice(0,10)}`;
      const old = await svc.entities.ComplianceIssue.filter({ issue_key:issueKey }, '-created_at', 1).catch((error:any)=>safeBestEffort(error,{operation:'regulatoryMonitoringWorker',fallback:[],severity:'secondary'}));
      if (old[0]) continue;
      await svc.entities.ComplianceIssue.create({ issue_key:issueKey,review_id:'p10-continuous-monitoring',rule_id:finding.type,title:`P10 ${finding.type}`,type:finding.type,severity:String(finding.severity).toLowerCase(),status:'open',description:'P10 regulatory freshness control requires human/legal review.',blocking:true,resolved:false,source_entity_type:finding.type.startsWith('POLICY')?'RegulatoryPolicyVersion':finding.type.startsWith('EVIDENCE')?'RegulatoryEvidence':'RegulatoryRegistration',source_entity_id:finding.entity_id,details_json:finding,created_at:now.toISOString() }).catch((error:any)=>safeBestEffort(error,{operation:'regulatoryMonitoringWorker',fallback:null,severity:'secondary'}));
      created++;
    }
    return Response.json({ ok:true,reviewed:{ policies:policies.length,evidence:evidence.length,registrations:registrations.length },findings:findings.length,created,auto_promoted:false,legal_conclusions_changed:false });
  } catch (error) {
    success = false;
    console.error(error);
    return Response.json({ ok:false,error:'regulatory_monitoring_failed' }, { status:500 });
  } finally {
    if (svc && claim) await finishSchedulerRunOrThrow(svc,claim,{ worker_key:'regulatoryMonitoringWorker' },success);
  }
}
