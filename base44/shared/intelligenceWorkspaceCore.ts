// DASHBOARD-C10 (2026-08-17) — Intelligence workspace projection.
//
// NOT to be confused with intelligenceCore.ts, which holds the P12 primitives
// (moatScore, benchmarkVisibility, pricingAt) and is imported by ten other modules.
// This is the workspace projection only.
//
// C0's verdict for this workspace was AUTHORITY_EXISTS_BUT_FRAGMENTED with
// recommended_root PROJECTION_ONLY, and that holds: five aggregators already exist and
// no sixth authority is justified. This module projects the knowledge planes under the
// workspace contract. It creates no entity and owns no truth.
//
// The KPI that matters here is coverage, and it is the one most easily made to lie.
// "Markets with current verified pricing: 0" and "pricing coverage unknown" look almost
// identical on a dashboard and mean opposite things — the first is a finding, the second
// is a broken read. Every count below is null when its source failed.

import { readRuntimeSource } from './runtimeSourceRead.ts';
import {
  buildContext, kpi, portfolioResponse, sortKeepingUnknownLast,
} from './workspaceContract.ts';
import { P3_MARKETS, VERIFIED_STATUSES } from './p3RateIntelligence.ts';
import { CLOSED_CANDIDATE_STATES } from './intelligencePromotionCore.ts';

export const INTELLIGENCE_WORKSPACE_VERSION = 'intelligence-workspace-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();
const READ_LIMIT = 5000;

/**
 * The five aggregators C0 found. Declared here so the consolidation is legible and so a
 * sixth cannot be added without this list changing.
 */
export const INTELLIGENCE_AGGREGATORS = Object.freeze([
  'getIntelligenceCommandCenter', 'getEuropeMarketsCommandCenter',
  'getRoutingIntelligenceCommandCenter', 'rateIntelligenceQuery', 'intelligenceAccess',
] as const);

/**
 * The tabs the Intelligence workspace absorbs.
 *
 * This list must match the `tab` each intelligence redirect in
 * config/dashboard/navigation.v1.json points at — the registry is the single source of
 * truth, and `intelligence:check` fails if a redirect names a tab that is not here. Two
 * drifts were caught that way while writing C10: `/admin/providers` had no tab at all,
 * and `/admin/growth` is declared as a VIEW of markets (`tab=markets&view=growth`), not
 * as a tab of its own.
 */
export const INTELLIGENCE_TABS = Object.freeze([
  { key: 'overview', label: 'Overview', hosts: '/admin/intelligence' },
  { key: 'pricing-queue', label: 'Pricing changes', hosts: null },
  { key: 'markets', label: 'Markets', hosts: '/admin/markets', views: ['growth'] },
  { key: 'routing', label: 'Routing', hosts: '/admin/routing-intelligence' },
  { key: 'benchmarks', label: 'Benchmarks', hosts: '/admin/benchmarks' },
  { key: 'recommendations', label: 'Recommendations', hosts: '/admin/recommendations' },
  { key: 'providers', label: 'Providers', hosts: '/admin/providers' },
] as const);

/** Builds the Intelligence portfolio projection. */
export async function buildIntelligencePortfolio(input: {
  svc: any;
  now: string;
  contextId: string;
  filters?: Record<string, unknown>;
}) {
  const read = async (source: string, fn: () => Promise<any[]>) =>
    readRuntimeSource<any[]>({ source, read: fn, fallback: [], limit: READ_LIMIT });

  const reads: Record<string, any> = {
    ProviderPricingVersion: await read('ProviderPricingVersion', () => input.svc.entities.ProviderPricingVersion.list('-recorded_at', READ_LIMIT)),
    RateChangeCandidate: await read('RateChangeCandidate', () => input.svc.entities.RateChangeCandidate.list('-detected_at', READ_LIMIT)),
    KnowledgeConflict: await read('KnowledgeConflict', () => input.svc.entities.KnowledgeConflict.list('-created_at', READ_LIMIT)),
    KnowledgeGap: await read('KnowledgeGap', () => input.svc.entities.KnowledgeGap.list('-created_date', READ_LIMIT)),
  };

  const rows = (key: string): any[] => (reads[key].status === 'UNAVAILABLE' ? [] : (reads[key].value || []));
  const available = (key: string) => reads[key].status !== 'UNAVAILABLE';

  const versions = rows('ProviderPricingVersion').filter((row) => row.is_demo !== true);
  const current = versions.filter((row) => text(row.status).toUpperCase() === 'CURRENT');
  const verified = current.filter((row) => (VERIFIED_STATUSES as readonly string[])
    .includes(text(row.verification_status).toUpperCase()));

  const marketsWithVerified = new Set(verified
    .map((row) => text(row.market || row.country).toUpperCase())
    .filter((market) => (P3_MARKETS as readonly string[]).includes(market)));

  const candidates = rows('RateChangeCandidate');
  const openCandidates = candidates.filter((row) => !(CLOSED_CANDIDATE_STATES as readonly string[])
    .includes(text(row.state).toUpperCase()));

  // The oldest unresolved candidate. A queue nobody clears is invisible in a count but
  // obvious in an age, and until C10 nothing could clear one at all.
  const oldestOpen = openCandidates
    .map((row) => text(row.detected_at))
    .filter(Boolean)
    .sort()[0] || null;
  const oldestOpenDays = oldestOpen
    ? Math.floor((Date.parse(input.now) - Date.parse(oldestOpen)) / 86400000)
    : null;

  const conflicts = rows('KnowledgeConflict').filter((row) => text(row.status).toUpperCase() === 'OPEN');
  const gaps = rows('KnowledgeGap');

  const { context, source_health } = buildContext({
    workspace: 'intelligence', filters: input.filters || {},
    now: input.now, contextId: input.contextId, reads,
  });

  const kpis = [
    kpi({
      metric_key: 'markets_with_verified_pricing',
      label: `Markets with verified current pricing (of ${P3_MARKETS.length})`,
      value: available('ProviderPricingVersion') ? marketsWithVerified.size : null,
      unit: 'count', truth_class: 'OBSERVED',
      sources: ['ProviderPricingVersion'], health: source_health,
      extra: {
        denominator: P3_MARKETS.length,
        claim_boundary: 'Counts only CURRENT versions whose verification_status is one of the five verified states, '
          + 'excluding demo rows. A market with an observed-but-unverified price is NOT counted here.',
      },
    }),
    kpi({
      metric_key: 'current_pricing_versions', label: 'Current pricing versions',
      value: available('ProviderPricingVersion') ? current.length : null,
      unit: 'count', truth_class: 'OBSERVED',
      sources: ['ProviderPricingVersion'], health: source_health,
    }),
    kpi({
      metric_key: 'open_pricing_candidates', label: 'Unresolved pricing changes',
      value: available('RateChangeCandidate') ? openCandidates.length : null,
      unit: 'count', truth_class: 'OBSERVED',
      sources: ['RateChangeCandidate'], health: source_health,
      extra: {
        oldest_detected_at: oldestOpen,
        oldest_open_days: oldestOpenDays,
        claim_boundary: 'Detected source changes awaiting adjudication. Before C10 nothing read this table, '
          + 'so a non-zero count here is a backlog that had no exit.',
      },
    }),
    kpi({
      metric_key: 'open_knowledge_conflicts', label: 'Open knowledge conflicts',
      value: available('KnowledgeConflict') ? conflicts.length : null,
      unit: 'count', truth_class: 'OBSERVED',
      sources: ['KnowledgeConflict'], health: source_health,
    }),
    kpi({
      metric_key: 'declared_knowledge_gaps', label: 'Declared knowledge gaps',
      value: available('KnowledgeGap') ? gaps.length : null,
      unit: 'count', truth_class: 'OBSERVED',
      sources: ['KnowledgeGap'], health: source_health,
    }),
  ];

  // Per-market coverage. A market absent from the pricing table is UNKNOWN coverage, not
  // zero coverage: nobody has looked, which is different from having looked and found
  // nothing.
  const marketRows = available('ProviderPricingVersion')
    ? (P3_MARKETS as readonly string[]).map((market) => {
      const forMarket = current.filter((row) => text(row.market || row.country).toUpperCase() === market);
      const verifiedForMarket = forMarket.filter((row) => (VERIFIED_STATUSES as readonly string[])
        .includes(text(row.verification_status).toUpperCase()));
      return {
        market,
        current_versions: forMarket.length,
        verified_versions: verifiedForMarket.length,
        providers: new Set(forMarket.map((row) => text(row.provider_slug)).filter(Boolean)).size,
        coverage_state: forMarket.length === 0
          ? 'NO_PRICING_RECORDED'
          : (verifiedForMarket.length ? 'VERIFIED_PRESENT' : 'OBSERVED_ONLY'),
      };
    })
    : [];

  return {
    ...portfolioResponse({
      context, source_health, kpis,
      quick_views: [],
      filter_options: { market: [...P3_MARKETS], coverage_state: ['VERIFIED_PRESENT', 'OBSERVED_ONLY', 'NO_PRICING_RECORDED'] },
      rows: sortKeepingUnknownLast(marketRows, (row) => row.verified_versions, 'desc'),
      total: available('ProviderPricingVersion') ? marketRows.length : null,
      permissions: { read: true, prepare: true, operate: false },
      available_actions: ['promotion_queue', 'preview_promotion', 'apply_promotion', 'reject_candidate'],
    }),
    aggregators: [...INTELLIGENCE_AGGREGATORS],
    tabs: INTELLIGENCE_TABS.map((tab) => ({
      key: tab.key, label: tab.label, hosts: tab.hosts,
      views: 'views' in tab ? [...tab.views] : [],
    })),
    provider_firewall: {
      disclosed: true,
      note: 'Provider compensation never influences a merchant recommendation, a benchmark or a Recover target. '
        + 'Provider-side economics live in the Finance workspace behind that firewall.',
    },
  };
}
