import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { EUROPE_CURRENCIES, EUROPE_MARKETS, EUROPE_MARKET_REGISTRY } from '../../shared/generated/europeMarkets.ts';
import { localizationReadiness } from '../../shared/localeRuntime.ts';
import { REGULATORY_ACTIVITIES } from '../../shared/regulatoryControl.ts';
import { handleEuropeanGrowthCommandCenter } from '../getEuropeanGrowthCommandCenter/entry.ts';
import { guardedScheduledServe } from '../../shared/schedulerRun.ts';

function regulatoryReadiness(policies:any[]) {
  if (policies.length !== REGULATORY_ACTIVITIES.length) return { status:'MISSING_POLICY_COVERAGE',gate:'REVIEW',covered:policies.length,expected:REGULATORY_ACTIVITIES.length };
  if (policies.some((x:any) => x.status === 'PROHIBITED')) return { status:'RESTRICTED',gate:'BLOCK',covered:policies.length,expected:REGULATORY_ACTIVITIES.length };
  if (policies.some((x:any) => ['UNCERTAIN','LEGAL_REVIEW_REQUIRED'].includes(x.status))) return { status:'LEGAL_REVIEW_REQUIRED',gate:'REVIEW',covered:policies.length,expected:REGULATORY_ACTIVITIES.length };
  if (policies.some((x:any) => ['REGISTRATION_REQUIRED','AUTHORIZATION_REQUIRED','PARTNER_REQUIRED'].includes(x.status))) return { status:'AUTHORITY_OR_PARTNER_REQUIRED',gate:'BLOCK',covered:policies.length,expected:REGULATORY_ACTIVITIES.length };
  return { status:'EVIDENCE_BACKED_POLICY_AVAILABLE',gate:'CONDITIONS',covered:policies.length,expected:REGULATORY_ACTIVITIES.length };
}

async function normalizeRoutedJson(response:Response) {
  const text = await response.text();
  try {
    return Response.json(JSON.parse(text), { status:response.status });
  } catch {
    return new Response(text, { status:response.status, headers:{ 'content-type':response.headers.get('content-type') || 'text/plain; charset=utf-8' } });
  }
}

guardedScheduledServe({"worker_key":"getEuropeMarketsCommandCenter","cadence_seconds":21600},createClientFromRequest,async (req) => {
  const routedBody = await req.clone().json().catch(() => ({}));
  if (routedBody?.view === 'growth') return normalizeRoutedJson(await handleEuropeanGrowthCommandCenter(req));
  try {
    const base44 = createClientFromRequest(req); const user = await base44.auth.me().catch((error:any)=>safeBestEffort(error,{operation:'getEuropeMarketsCommandCenter',fallback:null,severity:'secondary'}));
    if (!user || user.role !== 'admin') return Response.json({ ok:false,error:'Forbidden' }, { status:403 });
    const svc = base44.asServiceRole;
    const [profiles,p1Policies,controls,contexts,intelligence,p10Policies,registrations] = await Promise.all([
      svc.entities.CountryProfile.list('iso2', 100).catch((error:any)=>safeBestEffort(error,{operation:'getEuropeMarketsCommandCenter',fallback:[],severity:'secondary'})),
      svc.entities.JurisdictionCapabilityPolicy.filter({ active:true }, '-effective_from', 2000).catch((error:any)=>safeBestEffort(error,{operation:'getEuropeMarketsCommandCenter',fallback:[],severity:'secondary'})),
      svc.entities.MarketCapabilityControl.filter({ blocked:true }, '-updated_at', 500).catch((error:any)=>safeBestEffort(error,{operation:'getEuropeMarketsCommandCenter',fallback:[],severity:'secondary'})),
      svc.entities.MerchantMarketContext.list('-last_resolved_at', 500).catch((error:any)=>safeBestEffort(error,{operation:'getEuropeMarketsCommandCenter',fallback:[],severity:'secondary'})),
      svc.entities.MarketIntelligenceProfile.list('jurisdiction', 100).catch((error:any)=>safeBestEffort(error,{operation:'getEuropeMarketsCommandCenter',fallback:[],severity:'secondary'})),
      svc.entities.RegulatoryPolicyVersion.filter({ active:true }, '-effective_from', 5000).catch((error:any)=>safeBestEffort(error,{operation:'getEuropeMarketsCommandCenter',fallback:[],severity:'secondary'})),
      svc.entities.RegulatoryRegistration.filter({ active:true }, '-updated_at', 500).catch((error:any)=>safeBestEffort(error,{operation:'getEuropeMarketsCommandCenter',fallback:[],severity:'secondary'})),
    ]);
    const profileByMarket = new Map(profiles.map((x:any) => [x.iso2,x])); const intelligenceByMarket = new Map(intelligence.map((x:any) => [x.jurisdiction,x]));
    const rows = (EUROPE_MARKETS as any[]).map((market) => {
      const profile:any = profileByMarket.get(market.iso2) || {}; const intel:any = intelligenceByMarket.get(market.iso2) || {};
      const caps = p1Policies.filter((x:any) => x.jurisdiction === market.iso2); const blocked = controls.filter((x:any) => x.jurisdiction === market.iso2); const regulatoryPolicies = p10Policies.filter((x:any) => x.jurisdiction === market.iso2);
      return { ...market,intelligence_status:profile.intelligence_status || 'NOT_RESEARCHED',launch_status:profile.launch_status || 'RESEARCHABLE',p1_regulatory_status:profile.regulatory_status || 'PENDING_REVIEW',regulatory_status:regulatoryReadiness(regulatoryPolicies),localization_readiness:localizationReadiness(market.iso2),data_confidence:profile.overall_data_confidence || 'UNKNOWN',freshness:profile.freshness_status || 'UNKNOWN',provider_readiness:intel.provider_discovery_status || profile.provider_intelligence_status || 'PENDING_PROVIDER_DISCOVERY',rate_readiness:intel.rate_intelligence_status || profile.rate_intelligence_status || 'PENDING_RATE_INTELLIGENCE',benchmark_maturity:profile.benchmark_maturity || 'NOT_RESEARCHED',capabilities:{ enabled:caps.filter((x:any) => x.state === 'ENABLED').length,limited:caps.filter((x:any) => x.state === 'LIMITED').length,review_required:caps.filter((x:any) => x.state === 'REVIEW_REQUIRED').length,blocked:caps.filter((x:any) => x.state === 'BLOCKED').length,kill_switches:blocked.length } };
    });
    return Response.json({ ok:true,registry_version:EUROPE_MARKET_REGISTRY.registryVersion,localization_registry_version:rows[0]?.localization_readiness?.registry_version,markets:rows,currencies:EUROPE_CURRENCIES,metrics:{ markets:rows.length,currencies:EUROPE_CURRENCIES.length,contexts:contexts.length,conflicting_contexts:contexts.filter((x:any) => x.resolution_status === 'CONFLICTING_EVIDENCE').length,multi_market_contexts:contexts.filter((x:any) => x.resolution_status === 'MULTI_MARKET').length,active_kill_switches:controls.length,native_product_localized_markets:rows.filter((x:any) => x.localization_readiness.translation_readiness === 'NATIVE_PRODUCT').length,p10_policy_rows:p10Policies.length,p10_expected_policy_rows:EUROPE_MARKETS.length * REGULATORY_ACTIVITIES.length,active_registrations:registrations.filter((x:any) => ['ACTIVE','PASSPORTED'].includes(x.status)).length },truth_boundary:{ market_registry:'stable identity/institution/currency metadata only',localization:'implemented product locales are en-GB/fr-FR/es-ES; fallback-only markets are not represented as native-localized',legal_translation:'translation availability is separate from legal applicability and never legal approval',seo:'single client-side URL means hreflang is intentionally absent until localized URLs exist',tax:'separate Recover tax engine; country profile never decides invoice tax',regulatory:'P10 requires current primary-authority evidence; conservative coverage is not legal clearance',provider_rates:'P2/P3 pending; no provider/rate data fabricated' } });
  } catch (error) { console.error(error); return Response.json({ ok:false,error:'europe_markets_command_center_failed' }, { status:500 }); }
});
