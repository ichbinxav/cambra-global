import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import {
  EUROPE_MARKET_REGISTRY,
  EUROPE_MARKETS,
  MARKET_SCOPE_COUNTS,
  MARKET_SCOPE_DECISION_STATUS,
  MARKET_SCOPE_VERSION,
} from '../../shared/generated/europeMarkets.ts';
import {
  MARKET_CAPABILITIES,
  isSensitiveCapability,
} from '../../shared/jurisdictionPolicy.ts';
import {
  REGULATED_CAPABILITIES,
  evaluateMarketLaunchScope,
  marketSeedLaunchProjection,
} from '../../shared/marketLaunchScope.ts';

const POLICY_VERSION = `${MARKET_SCOPE_VERSION}:capability-v1`;
const RESEARCH_CAPABILITIES = new Set(['RESEARCH_MARKET', 'DISCOVER_PROVIDER']);
const ACTIVE_INTELLIGENCE_CAPABILITIES = new Set([
  ...RESEARCH_CAPABILITIES,
  'DISCOVER_LEAD',
  'ENRICH_LEAD',
  'ANALYZE',
  'RECOMMEND',
]);
const OUTBOUND_CAPABILITIES = new Set(['OUTREACH', 'PROVIDER_CONTACT']);

function regulatorySystem(iso2: string) {
  if (iso2 === 'GB') return 'UK_PSR';
  if (iso2 === 'CH') return 'SWISS';
  if (iso2 === 'AD') return 'ANDORRAN';
  return EUROPE_MARKETS.some((market: any) => market.iso2 === iso2)
    ? 'EU_EEA_PSD2'
    : 'OTHER';
}

function seedState(iso2: string, capability: string) {
  const marketScope = evaluateMarketLaunchScope(iso2);
  if (!marketScope.iso2) {
    return {
      state: 'BLOCKED',
      reason_code: 'unknown_market_blocked',
      human_readable_reason: 'The market is not present in the canonical registry.',
    };
  }
  if (REGULATED_CAPABILITIES.includes(capability)) {
    return {
      state: 'BLOCKED',
      reason_code: 'regulated_activity_not_authorized',
      human_readable_reason: 'Market membership never establishes authorization for regulated activity.',
    };
  }
  if (OUTBOUND_CAPABILITIES.has(capability)) {
    return {
      state: 'BLOCKED',
      reason_code: 'outbound_globally_paused_zero',
      human_readable_reason: 'Outbound remains paused with zero capacity in every market.',
    };
  }
  if (marketScope.research_only) {
    if (RESEARCH_CAPABILITIES.has(capability)) {
      return {
        state: 'ENABLED',
        reason_code: 'protected_market_research_only',
        human_readable_reason: 'Public research and provider discovery are allowed without launch activation.',
      };
    }
    if (capability === 'ANALYZE') {
      return {
        state: 'LIMITED',
        reason_code: 'protected_market_internal_analysis_only',
        human_readable_reason: 'Only clearly labelled internal, non-executable analysis is permitted.',
      };
    }
    return {
      state: 'BLOCKED',
      reason_code: 'protected_market_research_only',
      human_readable_reason: 'FR, BE and NL are protected from commercial or operational activation.',
    };
  }
  if (ACTIVE_INTELLIGENCE_CAPABILITIES.has(capability)) {
    return {
      state: 'ENABLED',
      reason_code: 'active_launch_scope_eligible',
      human_readable_reason: 'The market is in active scope; economic, evidence and policy gates still apply.',
    };
  }
  return {
    state: 'REVIEW_REQUIRED',
    reason_code: 'specific_policy_required',
    human_readable_reason: 'Active market membership alone does not authorize sensitive execution.',
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;

    const service = base44.asServiceRole;
    const now = new Date().toISOString();
    let countries_created = 0;
    let countries_updated = 0;
    let policies_created = 0;
    let profiles_created = 0;

    for (const market of EUROPE_MARKETS as any[]) {
      const launch = marketSeedLaunchProjection(market.iso2);
      if (!launch) throw new Error(`canonical_market_projection_missing:${market.iso2}`);

      const existing = (await service.entities.CountryProfile
        .filter({ iso2: market.iso2 }, '-updated_at', 5)
        .catch((error: any) => safeBestEffort(error, {
          operation: 'seedEuropeMarketFoundation',
          fallback: [],
          severity: 'secondary',
        })))[0];
      const row = {
        ...market,
        default_locale: 'en',
        supported_locales: ['en', 'fr', 'es'],
        default_language: '',
        supported_languages: [],
        commonly_supported_currencies: [market.primary_currency],
        regulatory_system: regulatorySystem(market.iso2),
        intelligence_status: 'NOT_RESEARCHED',
        launch_status: launch.launch_status,
        ...(launch.commercial_eligibility ? { commercial_eligibility: launch.commercial_eligibility } : {}),
        ...(launch.blocked_reason ? { blocked_reason: launch.blocked_reason } : {}),
        provider_intelligence_status: 'PENDING_PROVIDER_DISCOVERY',
        rate_intelligence_status: 'PENDING_RATE_INTELLIGENCE',
        benchmark_maturity: 'NOT_RESEARCHED',
        regulatory_status: 'PENDING_REVIEW',
        regulatory_confidence: 'UNKNOWN',
        overall_data_confidence: 'HIGH',
        freshness_status: 'CURRENT',
        registry_version: EUROPE_MARKET_REGISTRY.registryVersion,
        effective_from: EUROPE_MARKET_REGISTRY.effectiveDate,
        updated_at: now,
      };
      if (existing) {
        await service.entities.CountryProfile.update(existing.id, {
          ...row,
          intelligence_status: existing.intelligence_status || row.intelligence_status,
          // launch_status is intentionally reconciled from the canonical
          // scope, never preserved from the superseded FR/ES policy.
          launch_status: launch.launch_status,
          ...(launch.commercial_eligibility ? { commercial_eligibility: launch.commercial_eligibility } : {}),
          ...(launch.blocked_reason ? { blocked_reason: launch.blocked_reason } : { blocked_reason: null }),
          provider_intelligence_status: existing.provider_intelligence_status || row.provider_intelligence_status,
          rate_intelligence_status: existing.rate_intelligence_status || row.rate_intelligence_status,
          benchmark_maturity: existing.benchmark_maturity || row.benchmark_maturity,
          regulatory_status: existing.regulatory_status || row.regulatory_status,
          regulatory_confidence: existing.regulatory_confidence || row.regulatory_confidence,
          last_verified_at: existing.last_verified_at || undefined,
        });
        countries_updated += 1;
      } else {
        await service.entities.CountryProfile.create(row);
        countries_created += 1;
      }

      const intelligenceProfile = (await service.entities.MarketIntelligenceProfile
        .filter({ market_key: `market:${market.iso2}` }, '-updated_at', 1)
        .catch((error: any) => safeBestEffort(error, {
          operation: 'seedEuropeMarketFoundation',
          fallback: [],
          severity: 'secondary',
        })))[0];
      if (!intelligenceProfile) {
        await service.entities.MarketIntelligenceProfile.create({
          market_key: `market:${market.iso2}`,
          jurisdiction: market.iso2,
          payment_context_status: 'NOT_RESEARCHED',
          payment_context_json: {
            local_payment_methods: 'NOT_RESEARCHED',
            wallets: 'NOT_RESEARCHED',
            bnpl: 'NOT_RESEARCHED',
            bank_payment_methods: 'NOT_RESEARCHED',
            card_mix: 'NOT_RESEARCHED',
            ecommerce_landscape: 'NOT_RESEARCHED',
            pos_landscape: 'NOT_RESEARCHED',
            acquiring_structure: 'NOT_RESEARCHED',
            psp_landscape: 'PENDING_PROVIDER_DISCOVERY',
            settlement_characteristics: 'NOT_RESEARCHED',
            cross_border_characteristics: 'NOT_RESEARCHED',
          },
          commercial_context_status: 'NOT_RESEARCHED',
          commercial_context_json: {
            business_languages: 'NOT_RESEARCHED',
            merchant_ecosystem_metrics: 'NOT_RESEARCHED',
            ecommerce_size: 'NOT_RESEARCHED',
            icp_estimates: 'NOT_RESEARCHED',
            vertical_attractiveness: 'NOT_RESEARCHED',
            commercial_priority: 'PENDING_P5',
            opportunity_score: 'PENDING_P5',
          },
          provider_discovery_status: 'PENDING_PROVIDER_DISCOVERY',
          rate_intelligence_status: 'PENDING_RATE_INTELLIGENCE',
          benchmark_status: 'PENDING_P4',
          commercial_priority_status: 'PENDING_P5',
          updated_at: now,
        });
        profiles_created += 1;
      }

      for (const capability of MARKET_CAPABILITIES) {
        const policyKey = `${POLICY_VERSION}:${market.iso2}:${capability}`;
        const existingPolicy = (await service.entities.JurisdictionCapabilityPolicy
          .filter({ policy_key: policyKey }, '-effective_from', 1)
          .catch((error: any) => safeBestEffort(error, {
            operation: 'seedEuropeMarketFoundation',
            fallback: [],
            severity: 'secondary',
          })))[0];
        if (!existingPolicy) {
          const state = seedState(market.iso2, capability);
          await service.entities.JurisdictionCapabilityPolicy.create({
            policy_key: policyKey,
            jurisdiction: market.iso2,
            capability,
            ...state,
            evidence_refs: [],
            confidence: isSensitiveCapability(capability) ? 'UNKNOWN' : 'HIGH',
            effective_from: now,
            reviewed_at: now,
            next_review_at: isSensitiveCapability(capability)
              ? new Date(Date.now() + 90 * 86_400_000).toISOString()
              : new Date(Date.now() + 365 * 86_400_000).toISOString(),
            policy_version: POLICY_VERSION,
            active: true,
            created_by_actor: gate.user?.email || 'internal',
          });
          policies_created += 1;
        }
      }
    }

    await service.entities.Event.create({
      brand_id: '_platform',
      event_type: 'country_intelligence_updated',
      source: 'market_scope_seed',
      entity_type: 'CountryProfile',
      entity_id: 'europe-33',
      payload_json: {
        registry_version: EUROPE_MARKET_REGISTRY.registryVersion,
        market_scope_version: MARKET_SCOPE_VERSION,
        market_scope_decision_status: MARKET_SCOPE_DECISION_STATUS,
        ...MARKET_SCOPE_COUNTS,
        countries_created,
        countries_updated,
        profiles_created,
        policies_created,
        outbound_capacity: 0,
        idempotent: true,
      },
      status: 'processed',
      processed_at: now,
    }).catch((error: any) => safeBestEffort(error, {
      operation: 'seedEuropeMarketFoundation',
      fallback: null,
      severity: 'secondary',
    }));

    return Response.json({
      ok: true,
      registry_version: EUROPE_MARKET_REGISTRY.registryVersion,
      market_scope_version: MARKET_SCOPE_VERSION,
      market_scope_decision_status: MARKET_SCOPE_DECISION_STATUS,
      ...MARKET_SCOPE_COUNTS,
      countries_created,
      countries_updated,
      profiles_created,
      policies_created,
      outbound_capacity: 0,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ ok: false, error: 'europe_market_seed_failed' }, { status: 500 });
  }
});
