import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { EUROPE_CURRENCIES, EUROPE_MARKETS, EUROPE_MARKET_REGISTRY } from '../../shared/generated/europeMarkets.ts';
import { localizationReadiness } from '../../shared/localeRuntime.ts';
import { REGULATORY_ACTIVITIES } from '../../shared/regulatoryControl.ts';
import { MARKET_CAPABILITIES } from '../../shared/jurisdictionPolicy.ts';
import { ACTION_POLICIES } from '../../shared/legalExecution.ts';
import { handleEuropeanGrowthCommandCenter } from '../../shared/logical/getEuropeanGrowthCommandCenter.ts';
import { guardedScheduledServe } from '../../shared/schedulerRun.ts';

function regulatoryReadiness(policies:any[]) {
  if (policies.length !== REGULATORY_ACTIVITIES.length) return { status:'MISSING_POLICY_COVERAGE',gate:'REVIEW',covered:policies.length,expected:REGULATORY_ACTIVITIES.length };
  if (policies.some((x:any) => x.status === 'PROHIBITED')) return { status:'RESTRICTED',gate:'BLOCK',covered:policies.length,expected:REGULATORY_ACTIVITIES.length };
  if (policies.some((x:any) => ['UNCERTAIN','LEGAL_REVIEW_REQUIRED'].includes(x.status))) return { status:'LEGAL_REVIEW_REQUIRED',gate:'REVIEW',covered:policies.length,expected:REGULATORY_ACTIVITIES.length };
  if (policies.some((x:any) => ['REGISTRATION_REQUIRED','AUTHORIZATION_REQUIRED','PARTNER_REQUIRED'].includes(x.status))) return { status:'AUTHORITY_OR_PARTNER_REQUIRED',gate:'BLOCK',covered:policies.length,expected:REGULATORY_ACTIVITIES.length };
  return { status:'EVIDENCE_BACKED_POLICY_AVAILABLE',gate:'CONDITIONS',covered:policies.length,expected:REGULATORY_ACTIVITIES.length };
}

function compactGrowthPayload(value:any) {
  if (!value || typeof value !== 'object' || value.ok !== true) return value;
  const path=value.growth_path || {};
  return {
    ok:true,
    engine_version:value.engine_version,
    action:value.action,
    snapshot_id:value.snapshot_id || null,
    decision_id:value.decision_id || null,
    growth_path:{
      engine_version:path.engine_version,
      current_period_key:path.current_period_key,
      actuals:path.actuals ? { bookings:path.actuals.bookings,verified_economic_value:path.actuals.verified_economic_value,revenue:path.actuals.revenue,cash:path.actuals.cash,as_of:path.actuals.as_of } : null,
      target_gaps:(path.target_gaps || []).map((row:any) => ({ period_key:row.period_key,target_key:row.target_key,metric_key:row.metric_key,target:row.target,actual:row.actual,projected:row.projected,projected_gap:row.projected_gap,attainment_pct:row.attainment_pct,target_probability:row.target_probability,confidence:row.confidence })),
      forecasts:(path.forecasts || []).map((row:any) => ({ period_key:row.period_key,target_key:row.target_key,target_metric:row.target_metric,target_value:row.target_value,currency:row.currency,business_line:row.business_line,confidence:row.confidence,distribution:row.distribution })),
      binding_constraint:path.binding_constraint ? { type:path.binding_constraint.type,severity:path.binding_constraint.severity,binding:path.binding_constraint.binding,effect:path.binding_constraint.effect } : null,
      constraints:(path.constraints || []).map((row:any) => ({ type:row.type,severity:row.severity,binding:row.binding,effect:row.effect })),
      limitations:path.limitations,
      recommendations:(path.recommendations || []).map((row:any) => ({ recommendation_key:row.recommendation_key,action:row.action,why:row.why,cost_eur:row.cost_eur,expected_impact:row.expected_impact,confidence:row.confidence,authority:row.authority,execute:row.execute })),
      marginal_allocation:(path.marginal_allocation || []).map((row:any) => ({ option_key:row.option_key,action:row.action,channel:row.channel,cost_eur:row.cost_eur,expected_incremental_contribution_eur:row.expected_incremental_contribution_eur,marginal_return:row.marginal_return,confidence:row.confidence,authority:row.authority,execute:row.execute,status:row.status })),
      lineage:(path.lineage || []).map((row:any) => ({ metric:row.metric,sources:(row.sources || []).slice(0,20),source_count:(row.sources || []).length })),
      truth_boundary:path.truth_boundary,
    },
    target_registry:(value.target_registry || []).slice(0,50).map((row:any) => ({ id:row.id,target_key:row.target_key,version:row.version,status:row.status,period_key:row.period_key,period_start:row.period_start,period_end:row.period_end,metric_key:row.metric_key,target_value:row.target_value,currency:row.currency,business_line:row.business_line,geography:row.geography,effective_at:row.effective_at })),
    markets:(value.markets || []).map((row:any) => ({
      market_code:row.market_code,
      launch_state:row.launch_state,
      activation_state:row.activation_state,
      attractiveness_score:row.attractiveness_score,
      data_maturity:row.data_maturity,
      localization_readiness:row.localization_readiness ? { translation_readiness:row.localization_readiness.translation_readiness } : null,
      regulatory_readiness:row.regulatory_readiness ? { gate:row.regulatory_readiness.gate } : null,
      production_readiness:row.production_readiness ? { sealed:row.production_readiness.sealed === true } : null,
      strategy:row.strategy,
      next_action:row.next_action,
    })),
    brief:value.brief ? { generated_at:value.brief.generated_at,attention_json:value.brief.attention_json } : null,
    metrics:value.metrics,
    truth_boundary:value.truth_boundary,
  };
}

async function normalizeRoutedJson(response:Response, project=(value:any)=>value) {
  const text = await response.text();
  let value:any = text;
  for (let layer=0; layer<4 && typeof value==='string'; layer++) {
    try { value=JSON.parse(value); }
    catch { break; }
  }
  if (typeof value!=='string') value=project(value);
  return typeof value==='string'
    ? new Response(value, { status:response.status, headers:{ 'content-type':response.headers.get('content-type') || 'text/plain; charset=utf-8' } })
    : new Response(JSON.stringify(value), { status:response.status, headers:{ 'content-type':'application/json' } });
}

guardedScheduledServe({"worker_key":"getEuropeMarketsCommandCenter","cadence_seconds":21600},createClientFromRequest,async (req) => {
  const routedBody = await req.clone().json().catch(() => ({}));
  if (routedBody?.view === 'growth') return normalizeRoutedJson(await handleEuropeanGrowthCommandCenter(req), compactGrowthPayload);
  try {
    const base44 = createClientFromRequest(req); const user = await base44.auth.me().catch((error:any)=>safeBestEffort(error,{operation:'getEuropeMarketsCommandCenter',fallback:null,severity:'secondary'}));
    if (!user || user.role !== 'admin') return Response.json({ ok:false,error:'Forbidden' }, { status:403 });
    const svc = base44.asServiceRole;
    const [profiles,p1Policies,controls,contexts,intelligence,p10Policies,p11Policies,registrations] = await Promise.all([
      svc.entities.CountryProfile.list('iso2', 100).catch((error:any)=>safeBestEffort(error,{operation:'getEuropeMarketsCommandCenter',fallback:[],severity:'secondary'})),
      svc.entities.JurisdictionCapabilityPolicy.filter({ active:true }, '-effective_from', 2000).catch((error:any)=>safeBestEffort(error,{operation:'getEuropeMarketsCommandCenter',fallback:[],severity:'secondary'})),
      svc.entities.MarketCapabilityControl.filter({ blocked:true }, '-updated_at', 500).catch((error:any)=>safeBestEffort(error,{operation:'getEuropeMarketsCommandCenter',fallback:[],severity:'secondary'})),
      svc.entities.MerchantMarketContext.list('-last_resolved_at', 500).catch((error:any)=>safeBestEffort(error,{operation:'getEuropeMarketsCommandCenter',fallback:[],severity:'secondary'})),
      svc.entities.MarketIntelligenceProfile.list('jurisdiction', 100).catch((error:any)=>safeBestEffort(error,{operation:'getEuropeMarketsCommandCenter',fallback:[],severity:'secondary'})),
      svc.entities.RegulatoryPolicyVersion.filter({ active:true }, '-effective_from', 5000).catch((error:any)=>safeBestEffort(error,{operation:'getEuropeMarketsCommandCenter',fallback:[],severity:'secondary'})),
      svc.entities.LegalExecutionPolicy.filter({ active:true }, '-effective_from', 5000).catch((error:any)=>safeBestEffort(error,{operation:'getEuropeMarketsCommandCenter',fallback:[],severity:'secondary'})),
      svc.entities.RegulatoryRegistration.filter({ active:true }, '-updated_at', 500).catch((error:any)=>safeBestEffort(error,{operation:'getEuropeMarketsCommandCenter',fallback:[],severity:'secondary'})),
    ]);
    const marketCodes = new Set((EUROPE_MARKETS as any[]).map((market:any) => market.iso2));
    const canonicalCapabilities = new Set(MARKET_CAPABILITIES as readonly string[]);
    const p1MatrixPolicies = p1Policies.filter((row:any) => marketCodes.has(row.jurisdiction) && canonicalCapabilities.has(row.capability));
    const p1LegacyPolicies = p1Policies.filter((row:any) => !marketCodes.has(row.jurisdiction) || !canonicalCapabilities.has(row.capability));
    const p11Actions = Object.keys(ACTION_POLICIES);
    const profileByMarket = new Map(profiles.map((x:any) => [x.iso2,x])); const intelligenceByMarket = new Map(intelligence.map((x:any) => [x.jurisdiction,x]));
    const rows = (EUROPE_MARKETS as any[]).map((market) => {
      const profile:any = profileByMarket.get(market.iso2) || {}; const intel:any = intelligenceByMarket.get(market.iso2) || {};
      const caps = p1MatrixPolicies.filter((x:any) => x.jurisdiction === market.iso2); const blocked = controls.filter((x:any) => x.jurisdiction === market.iso2); const regulatoryPolicies = p10Policies.filter((x:any) => x.jurisdiction === market.iso2); const legalPolicies = p11Policies.filter((x:any) => x.jurisdiction === market.iso2);
      return { ...market,intelligence_status:profile.intelligence_status || 'NOT_RESEARCHED',launch_status:profile.launch_status || 'RESEARCHABLE',p1_regulatory_status:profile.regulatory_status || 'PENDING_REVIEW',p1_policy_status:{covered:caps.length,expected:MARKET_CAPABILITIES.length,complete:caps.length===MARKET_CAPABILITIES.length},regulatory_status:regulatoryReadiness(regulatoryPolicies),legal_execution_status:{covered:legalPolicies.length,expected:p11Actions.length,complete:legalPolicies.length===p11Actions.length,allow:legalPolicies.filter((x:any)=>['ALLOW','ALLOW_WITH_CONDITIONS'].includes(x.status)).length,blocked:legalPolicies.filter((x:any)=>['BLOCK','LEGAL_REVIEW_REQUIRED'].includes(x.status)).length},localization_readiness:localizationReadiness(market.iso2),data_confidence:profile.overall_data_confidence || 'UNKNOWN',freshness:profile.freshness_status || 'UNKNOWN',provider_readiness:intel.provider_discovery_status || profile.provider_intelligence_status || 'PENDING_PROVIDER_DISCOVERY',rate_readiness:intel.rate_intelligence_status || profile.rate_intelligence_status || 'PENDING_RATE_INTELLIGENCE',benchmark_maturity:profile.benchmark_maturity || 'NOT_RESEARCHED',capabilities:{ enabled:caps.filter((x:any) => x.state === 'ENABLED').length,limited:caps.filter((x:any) => x.state === 'LIMITED').length,review_required:caps.filter((x:any) => x.state === 'REVIEW_REQUIRED').length,blocked:caps.filter((x:any) => x.state === 'BLOCKED').length,kill_switches:blocked.length } };
    });
    return Response.json({ ok:true,registry_version:EUROPE_MARKET_REGISTRY.registryVersion,localization_registry_version:rows[0]?.localization_readiness?.registry_version,markets:rows,currencies:EUROPE_CURRENCIES,metrics:{ markets:rows.length,currencies:EUROPE_CURRENCIES.length,contexts:contexts.length,conflicting_contexts:contexts.filter((x:any) => x.resolution_status === 'CONFLICTING_EVIDENCE').length,multi_market_contexts:contexts.filter((x:any) => x.resolution_status === 'MULTI_MARKET').length,active_kill_switches:controls.length,native_product_localized_markets:rows.filter((x:any) => x.localization_readiness.translation_readiness === 'NATIVE_PRODUCT').length,p1_active_policy_rows:p1Policies.length,p1_matrix_policy_rows:p1MatrixPolicies.length,p1_expected_policy_rows:EUROPE_MARKETS.length * MARKET_CAPABILITIES.length,p1_legacy_policy_rows:p1LegacyPolicies.length,p10_policy_rows:p10Policies.length,p10_expected_policy_rows:EUROPE_MARKETS.length * REGULATORY_ACTIVITIES.length,p11_policy_rows:p11Policies.length,p11_expected_policy_rows:EUROPE_MARKETS.length * p11Actions.length,active_registrations:registrations.filter((x:any) => ['ACTIVE','PASSPORTED'].includes(x.status)).length },truth_boundary:{ market_registry:'stable identity/institution/currency metadata only',localization:'implemented product locales are en-GB/fr-FR/es-ES; fallback-only markets are not represented as native-localized',legal_translation:'translation availability is separate from legal applicability and never legal approval',seo:'single client-side URL means hreflang is intentionally absent until localized URLs exist',tax:'separate Recover tax engine; country profile never decides invoice tax',jurisdiction_capability:'P1 is the operational capability matrix; its coverage does not replace P10 or P11 legal evidence',regulatory:'P10 requires current primary-authority evidence; missing coverage remains review-required and is not a product outage',legal_execution:'P11 is a separate action-level execution authority; missing coverage grants zero permission',provider_rates:'P2/P3 pending; no provider/rate data fabricated' } });
  } catch (error) { console.error(error); return Response.json({ ok:false,error:'europe_markets_command_center_failed' }, { status:500 }); }
});
