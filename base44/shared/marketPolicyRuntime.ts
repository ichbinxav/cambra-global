import { canonicalMarket } from './marketContext.ts';
import { assertNoAiOverride, MARKET_CAPABILITIES } from './jurisdictionPolicy.ts';
import { auditRegulatoryDecision, evaluateRegulatoryActivityRuntime } from './regulatoryRuntime.ts';
import { requireCriticalOperation } from './criticalExecution.ts';

export async function evaluateMarketCapabilityRuntime(svc:any, input:any) {
  const capability = String(input?.capability || '').toUpperCase();
  if (!MARKET_CAPABILITIES.includes(capability)) return { allowed:false,state:'BLOCKED',reason_code:'unknown_capability',enforced:true };
  let brand = input?.brand || null;
  if (!brand && input?.brand_id) brand = await requireCriticalOperation('market_policy_brand_read', () => svc.entities.Brand.get(String(input.brand_id)));
  let context = input?.context || null;
  if (!context && brand?.market_context_id) context = await requireCriticalOperation('market_policy_context_read', () => svc.entities.MerchantMarketContext.get(String(brand.market_context_id)));
  if (!context && brand) {
    const rows = await requireCriticalOperation('market_policy_context_lookup', () => svc.entities.MerchantMarketContext.filter({ brand_id:brand.id }, '-last_resolved_at', 1));
    context = rows[0] || null;
  }
  const explicit = canonicalMarket(input?.jurisdiction)?.iso2 || null;
  const jurisdiction = explicit || canonicalMarket(context?.legal_entity_country)?.iso2 || canonicalMarket(context?.home_market)?.iso2 || canonicalMarket(brand?.billing_country)?.iso2 || canonicalMarket(brand?.country)?.iso2 || null;
  const rollout = String(input?.rollout || brand?.market_context_rollout || 'legacy');
  const enforced = input?.enforce === true || rollout === 'production';
  if (!jurisdiction) return { allowed:!enforced,state:enforced?'BLOCKED':'REVIEW_REQUIRED',reason_code:enforced?'market_jurisdiction_unresolved':'shadow_jurisdiction_unresolved',jurisdiction:null,enforced,rollout };
  const policies = await requireCriticalOperation('market_capability_policy_authority_read', () => svc.entities.JurisdictionCapabilityPolicy.filter({ jurisdiction,capability,active:true }, '-effective_from', 20));
  let policy = policies[0] || null;
  const controls = await requireCriticalOperation('market_capability_control_authority_read', () => svc.entities.MarketCapabilityControl.filter({ jurisdiction,capability,blocked:true }, '-updated_at', 20));
  const now = Date.now();
  const control = controls.find((x:any) => (!x.effective_from || Date.parse(x.effective_from) <= now) && (!x.effective_to || Date.parse(x.effective_to) > now)) || null;
  const overrides = await requireCriticalOperation('market_policy_override_authority_read', () => svc.entities.MarketPolicyOverride.filter({ jurisdiction,capability }, '-created_at', 20));
  const override = overrides.find((x:any) => !x.revoked_at && (!x.effective_from || Date.parse(x.effective_from) <= now) && (!x.expires_at || Date.parse(x.expires_at) > now)) || null;
  const nonOverridable = ['ACCESS_BANK_ACCOUNT_DATA','INITIATE_PAYMENT','HOLD_FUNDS','ACT_AS_PSP','ACT_AS_PSP_AGENT'].includes(capability);
  if (override && !nonOverridable) policy = { ...(policy || {}),state:override.new_state,reason_code:'explicit_human_override',policy_version:`override:${override.id}` };
  const p1 = assertNoAiOverride({ capability,policy,kill_switch:!!control,within_limit:input?.within_limit === true,ai_requested_bypass:input?.ai_requested_bypass === true,now:new Date().toISOString() });
  let decision:any = enforced ? p1 : { ...p1,allowed:true,shadow_would_allow:p1.allowed,shadow_state:p1.state,shadow_reason_code:p1.reason_code,reason_code:'shadow_mode_not_enforced' };
  let regulatoryDecision:any = null;
  if (enforced && decision.allowed) {
    regulatoryDecision = await evaluateRegulatoryActivityRuntime(svc, { ...input,jurisdiction,capability });
    if (!regulatoryDecision.allowed) decision = { ...decision,allowed:false,state:regulatoryDecision.outcome === 'BLOCK' ? 'BLOCKED' : 'REVIEW_REQUIRED',reason_code:`p10_${regulatoryDecision.reason_code}` };
  }
  return { ...decision,jurisdiction,enforced,rollout,policy_id:policy?.id || null,control_id:control?.id || null,override_id:override?.id || null,non_overridable:nonOverridable,context_id:context?.id || null,regulatory_decision:regulatoryDecision };
}

export async function auditMarketCapabilityDecision(svc:any, input:any, decision:any) {
  const eventType = decision.bypass_attempt ? 'country_policy_ai_bypass_denied' : decision.enforced ? (decision.allowed ? 'country_policy_allowed' : 'country_policy_denied') : 'country_policy_checked';
  await requireCriticalOperation('market_capability_decision_audit_write', () => svc.entities.Event.create({ brand_id:String(input?.brand_id || input?.brand?.id || '_platform'),event_type:eventType,source:String(input?.actor_type || 'market_policy_runtime'),entity_type:'JurisdictionCapabilityPolicy',entity_id:decision.policy_id || '',payload_json:{ jurisdiction:decision.jurisdiction,capability:String(input?.capability || '').toUpperCase(),decision,policy_id:decision.policy_id,control_id:decision.control_id,override_id:decision.override_id,context_id:decision.context_id },status:'processed',processed_at:new Date().toISOString() }));
  if (decision.regulatory_decision) await auditRegulatoryDecision(svc, input, decision.regulatory_decision);
  return decision;
}

export async function assertMarketCapabilityAllowed(svc:any, input:any) {
  const decision = await evaluateMarketCapabilityRuntime(svc, input);
  await auditMarketCapabilityDecision(svc, input, decision);
  if (!decision.allowed) {
    const error:any = new Error(`market_capability_denied:${input.capability}:${decision.reason_code}`);
    error.code = 'MARKET_CAPABILITY_DENIED';
    error.decision = decision;
    throw error;
  }
  return decision;
}
