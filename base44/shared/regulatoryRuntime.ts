import { CAPABILITY_TO_REGULATORY_ACTIVITY, decideRegulatoryActivity } from './regulatoryControl.ts';
import { requireCriticalOperation } from './criticalExecution.ts';

export async function evaluateRegulatoryActivityRuntime(svc:any, input:any) {
  const jurisdiction = String(input.jurisdiction || '').toUpperCase();
  const activity = String(input.activity || CAPABILITY_TO_REGULATORY_ACTIVITY[String(input.capability || '').toUpperCase()] || '').toUpperCase();
  const policies = await requireCriticalOperation('regulatory_policy_authority_read', () => svc.entities.RegulatoryPolicyVersion.filter({ jurisdiction, activity, active:true }, '-effective_from', 20));
  const policy = policies[0] || null;
  const evidence = policy?.evidence_refs?.length ? await requireCriticalOperation('regulatory_evidence_authority_read', () => svc.entities.RegulatoryEvidence.filter({ evidence_key:{ $in:policy.evidence_refs } }, '-observed_at', 100)) : [];
  const registrations = await requireCriticalOperation('regulatory_registration_authority_read', () => svc.entities.RegulatoryRegistration.filter({ status:{ $in:['ACTIVE','PASSPORTED'] } }, '-updated_at', 100));
  const partners = await requireCriticalOperation('regulatory_partner_mandate_authority_read', () => svc.entities.RegulatoryPartnerMandate.filter({ status:'ACTIVE' }, '-updated_at', 100));
  return decideRegulatoryActivity({ ...input, jurisdiction, activity, policy, evidence, registrations, partners });
}

export async function auditRegulatoryDecision(svc:any, input:any, decision:any) {
  const key = String(input.idempotency_key || `${input.brand_id || '_platform'}:${decision.jurisdiction}:${decision.activity}:${decision.policy_version || 'none'}:${new Date().toISOString().slice(0,10)}`);
  const existing = await requireCriticalOperation('regulatory_decision_idempotency_read', () => svc.entities.ComplianceDecision.filter({ decision_key:key }, '-decided_at', 1));
  if (!existing[0]) await requireCriticalOperation('regulatory_decision_audit_write', () => svc.entities.ComplianceDecision.create({ decision_key:key,brand_id:String(input.brand_id || '_platform'),jurisdiction:decision.jurisdiction,activity:decision.activity,outcome:decision.outcome,status:decision.status,allowed:decision.allowed===true,reason_code:decision.reason_code,policy_id:decision.policy_id,policy_version:decision.policy_version,evidence_refs:decision.evidence_ids || [],conditions_json:{conditions:decision.conditions || [],missing_conditions:decision.missing_conditions || []},actor_type:String(input.actor_type || 'regulatory_runtime'),decided_at:new Date().toISOString(),decision_json:decision }));
  return decision;
}
