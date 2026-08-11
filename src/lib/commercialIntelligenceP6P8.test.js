import { describe, expect, it } from 'vitest';
import { buildCommercialIntelligence, normalizeCompanyDomain } from '../../base44/shared/commercialIntelligence.ts';

const now = new Date('2026-08-11T02:00:00.000Z');
const lead = (id, overrides = {}) => ({
  id,
  company_name: `Company ${id}`,
  company_domain: `${id}.example.com`,
  contact_full_name: `Contact ${id}`,
  contact_title: 'CFO',
  contact_email: `${id}@example.com`,
  country: 'FR',
  industry: 'ecommerce',
  source: 'apollo',
  stage: 'scored',
  reservoir_state: 'ready',
  score: 80,
  score_breakdown_json: { evidence_confidence: 0.8, signals: { payment_provider: 'stripe', commerce_platform: 'shopify' } },
  last_verified_at: now.toISOString(),
  ...overrides,
});
describe('P6 market intelligence', () => {
  it('normalizes company identity and deduplicates company-first', () => {
    expect(normalizeCompanyDomain('https://www.Shop.Example.com/path')).toBe('shop.example.com');
    const data = buildCommercialIntelligence([
      lead('a', { company_domain: 'https://www.acme.eu', score: 75 }),
      lead('b', { company_domain: 'acme.eu', score: 90 }),
    ], { countries: ['FR'], min_lead_score: 70 }, now);
    expect(data.market_sizing.tam.observed_lower_bound).toBe(1);
    expect(data.prioritization.top_100[0].lead_id).toBe('b');
  });

  it('reports TAM/SAM/SOM as observed lower bounds and refuses a fabricated Europe estimate', () => {
    const data = buildCommercialIntelligence([
      lead('fr-ready'),
      lead('es-low', { country: 'ES', score: 20, reservoir_state: 'qualified' }),
      lead('de-ready', { country: 'DE' }),
    ], { countries: ['FR', 'ES'], min_lead_score: 70 }, now);
    expect(data.market_sizing.methodology).toBe('observed_lower_bound');
    expect(data.market_sizing.tam).toMatchObject({ estimate: null, observed_lower_bound: 3 });
    expect(data.market_sizing.sam).toMatchObject({ estimate: null, observed_lower_bound: 1 });
    expect(data.market_sizing.som).toMatchObject({ estimate: null, observed_lower_bound: 1 });
    expect(data.unknowns).toContain('total_european_tam_not_established_from_current_sources');
  });

  it('builds deterministic Top 100 / Top 1000 priority lists and hot segments', () => {
    const leads = Array.from({ length: 120 }, (_, i) => lead(String(i), { score: 70 + (i % 25), country: i % 2 ? 'FR' : 'ES' }));
    const data = buildCommercialIntelligence(leads, { countries: ['FR', 'ES'], min_lead_score: 70 }, now);
    expect(data.prioritization.top_100).toHaveLength(100);
    expect(data.prioritization.top_1000).toHaveLength(120);
    expect(data.prioritization.hot_markets.map((item) => item.key)).toEqual(expect.arrayContaining(['FR', 'ES']));
  });

  it('materializes a connected lead graph without copying contact email into graph nodes', () => {
    const data = buildCommercialIntelligence([lead('graph')], { countries: ['FR'] }, now);
    expect(data.lead_graph.nodes.map((node) => node.type)).toEqual(expect.arrayContaining(['company', 'contact', 'provider', 'technology']));
    expect(data.lead_graph.edges.map((edge) => edge.type)).toEqual(expect.arrayContaining(['works_at', 'uses_provider', 'uses_technology']));
    expect(JSON.stringify(data.lead_graph)).not.toContain('graph@example.com');
  });

  it('keeps unknown pipeline value out of forecast instead of imputing revenue', () => {
    const data = buildCommercialIntelligence([
      lead('known', { expected_revenue_value: 1000, close_probability: 0.25 }),
      lead('unknown', { expected_revenue_value: null, close_probability: 0.5 }),
    ], { countries: ['FR'] }, now);
    expect(data.forecast.by_country[0]).toMatchObject({ pipeline_count: 2, known_value_count: 1, unknown_value_count: 1, known_expected_revenue_eur: 1000, weighted_expected_revenue_eur: 250, forecast_available: true });
  });

  it('learns only from observed won/lost outcomes and never mutates ICP policy automatically', () => {
    const outcomes = Array.from({ length: 10 }, (_, i) => lead(`outcome-${i}`, { revenue_stage: i < 3 ? 'won' : 'lost' }));
    const data = buildCommercialIntelligence(outcomes, { countries: ['FR'] }, now);
    expect(data.learning.outcome_sample_size).toBe(10);
    expect(data.learning.recommendations[0]).toMatchObject({ dimension: 'country', value: 'FR', sample_size: 10, observed_wins: 3, observed_win_rate: 0.3 });
    expect(data.learning.automatic_policy_mutation).toBe(false);
  });
});
