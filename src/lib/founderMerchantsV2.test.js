import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  MERCHANT_BLOCKS,
  MERCHANT_KPI_KEYS,
  applyMerchantQuery,
  buildMerchantKpiDrilldown,
  collectMerchantBlock,
  buildMerchantPortfolioKpis,
  assertMerchantCommunicationThreads,
  assertMerchantScopedRows,
  buildMerchantSummaries,
  paginateMerchantRows,
  sanitizeMerchantAdminValue,
} from '../../base44/shared/founderMerchantsV2.ts';

const brand = (id, patch = {}) => ({ id, name: `Merchant ${id}`, billing_legal_name: `Legal ${id}`, service_status: 'active', created_date: '2026-07-01T00:00:00.000Z', ...patch });
const demand = (brandId, volumeMinor, provider = 'stripe') => ({ id: `d-${brandId}`, brand_id: brandId, vertical: 'payments', data_classification: 'production', is_demo: false, observed_annual_volume_minor: volumeMinor, current_provider_slug: provider, currency: 'EUR', channel: 'online' });
const verified = (brandId, gmvEur, currentBps) => ({ id: `v-${brandId}`, brand_id: brandId, integration_id: `i-${brandId}`, measured_current_bps: currentBps, sample_metrics: { gmv_eur: gmvEur }, measurement_window: { days_covered: 90 }, created_date: '2026-08-01T00:00:00.000Z' });

describe('Founder/Admin Merchants V2 canonical backend', () => {
  it('defines exactly the 12 required KPI and lazy block contracts', () => {
    expect(MERCHANT_KPI_KEYS).toHaveLength(12);
    expect(MERCHANT_BLOCKS).toEqual([
      'overview', 'payments_infrastructure', 'analyzer_opportunities', 'recover_savings',
      'data_documents', 'cambra_activity', 'attention_approvals', 'company_contacts',
      'billing_revenue', 'contracts_legal', 'communications', 'technical_audit',
    ]);
  });

  it('includes only registered real merchants, excluding demo and unclaimed Analyzer Brands', () => {
    const rows = buildMerchantSummaries({
      brands: [brand('real'), brand('demo', { is_demo: true }), brand('anon', { anon_session_id: 'anon-session' })],
      demandUnits: [demand('real', 10_000_000), demand('anon', 50_000_000)],
      now: '2026-08-13T00:00:00.000Z',
    });
    expect(rows.map((row) => row.id)).toEqual(['real']);
    expect(fs.readFileSync('base44/shared/founderMerchantsV2.ts', 'utf8')).toContain("brand.is_demo === true || text(brand.anon_session_id)");
  });

  it('preserves observed/modeled/verified truth classes and does not turn missing analysis into zero savings', () => {
    const [row] = buildMerchantSummaries({
      brands: [brand('one')],
      demandUnits: [demand('one', 12_000_000)],
      verifiedAnalyses: [verified('one', 250_000, 187)],
      savingsReports: [{ id: 'r1', brand_id: 'one', measurement_mode: 'fully_verified', verification_status: 'realized', savings: 1_000, month: '2026-08-01' }],
      now: '2026-08-13T00:00:00.000Z',
    });
    expect(row.payment_volume.truth_class).toBe('observed');
    expect(row.payment_cost.truth_class).toBe('observed');
    expect(row.payment_cost.observed_volume_minor).toBeGreaterThan(0);
    expect(row.potential_savings).toBeNull();
    expect(row.verified_savings).toMatchObject({ value_minor: 100_000, truth_class: 'verified' });
    expect(row.realized_savings).toMatchObject({ value_minor: 100_000, truth_class: 'verified' });
  });

  it('never converts unavailable or truncated canonical evidence into a confirmed zero', () => {
    const unavailable = buildMerchantSummaries({
      brands: [brand('one')],
      savingsReports: [], invoices: [], approvals: [], incidents: [],
      sourceStatus: {
        savingsReports: { ok: false }, invoices: { ok: false },
        approvals: { ok: false }, incidents: { ok: false },
      },
      now: '2026-08-13T00:00:00.000Z',
    })[0];
    expect(unavailable.verified_savings).toBeNull();
    expect(unavailable.realized_savings).toBeNull();
    expect(unavailable.cambra_revenue).toBeNull();
    expect(unavailable.needs_attention).toBeNull();
    expect(unavailable.attention_status).toBe('UNAVAILABLE');

    const lowerBound = buildMerchantSummaries({
      brands: [brand('one')],
      savingsReports: [{ brand_id: 'one', measurement_mode: 'fully_verified', verification_status: 'verified', savings: 25, month: '2026-08-01' }],
      approvals: [{ brand_id: 'one', id: 'approval-1' }], incidents: [],
      sourceStatus: {
        savingsReports: { ok: true, truncated: true }, approvals: { ok: true, truncated: true },
        incidents: { ok: false },
      },
      now: '2026-08-13T00:00:00.000Z',
    })[0];
    expect(lowerBound.verified_savings).toMatchObject({ value_minor: 2500, evidence_status: 'PARTIAL' });
    expect(lowerBound.needs_attention).toBe(1);
    expect(lowerBound.attention_status).toBe('PARTIAL');
  });

  it('never emits clear attention, billing or Recover claims when block dependencies fail', async () => {
    const unavailableSvc = {
      entities: new Proxy({}, {
        get: () => ({ filter: async () => { throw new Error('source unavailable'); } }),
      }),
    };
    const merchant = brand('one');
    const attention = await collectMerchantBlock(unavailableSvc, merchant, 'attention_approvals');
    expect(attention).toMatchObject({ status: 'UNAVAILABLE', summary: 'Attention state unavailable' });
    expect(attention.summary).not.toContain('Nothing required');
    const billing = await collectMerchantBlock(unavailableSvc, merchant, 'billing_revenue');
    expect(billing).toMatchObject({ status: 'UNAVAILABLE', summary: 'Billing evidence unavailable' });
    expect(billing.data.revenue).toMatchObject({ earned_minor: null, invoiced_minor: null, collected_minor: null, outstanding_minor: null });
    const recover = await collectMerchantBlock(unavailableSvc, merchant, 'recover_savings');
    expect(recover).toMatchObject({ status: 'UNAVAILABLE', summary: 'Recover evidence unavailable' });
    expect(recover.data.funnel).toEqual({ identified_minor: null, accepted_minor: null, verified_minor: null, realized_minor: null });
  });

  it('applies combined filters and deterministic null-last sorting', () => {
    const rows = buildMerchantSummaries({
      brands: [brand('fr-high', { country: 'FR' }), brand('fr-unknown', { country: 'FR' }), brand('es', { country: 'ES' })],
      demandUnits: [demand('fr-high', 12_000_000, 'stripe'), demand('fr-unknown', 8_000_000, 'stripe'), demand('es', 30_000_000, 'adyen')],
      analyzerResults: [{ id: 'a1', brand_id: 'fr-high', payment_savings: 25_000, data_completeness_score: 94, created_date: '2026-08-01T00:00:00.000Z' }],
      now: '2026-08-13T00:00:00.000Z',
    });
    const selected = applyMerchantQuery(rows, { filters: { country: ['FR'], psp: ['stripe'], data_confidence_min: 90 }, sort_by: 'potential_savings', sort_direction: 'desc' });
    expect(selected.map((row) => row.id)).toEqual(['fr-high']);
    const sorted = applyMerchantQuery(rows, { sort_by: 'potential_savings', sort_direction: 'desc' });
    expect(sorted[0].id).toBe('fr-high');
    expect(sorted.at(-1).potential_savings).toBeNull();
  });

  it('recomputes KPI values and source-derived contexts inside the current filtered segment', () => {
    const brands = [brand('fr', { country: 'FR' }), brand('es', { country: 'ES' })];
    const activations = [
      { id: 'act-fr', brand_id: 'fr', status: 'live', potential_savings_yearly: 100 },
      { id: 'act-es', brand_id: 'es', status: 'live', potential_savings_yearly: 900 },
    ];
    const invoices = [
      { id: 'inv-fr', brand_id: 'fr', amount_paid: 10, paid_at: '2026-08-05T00:00:00.000Z' },
      { id: 'inv-es', brand_id: 'es', amount_paid: 90, paid_at: '2026-08-05T00:00:00.000Z' },
    ];
    const empty = { ok: true, rows: [], truncated: false, limit: 5000 };
    const sources = {
      brands: { ...empty, rows: brands }, demandUnits: empty, verifiedAnalyses: empty,
      analyzerResults: empty, activations: { ...empty, rows: activations },
      savingsReports: empty, invoices: { ...empty, rows: invoices }, integrations: empty,
      lifecycles: empty, approvals: empty, incidents: empty, documents: empty, marketContexts: empty,
    };
    const summaries = buildMerchantSummaries({ brands, activations, invoices, now: '2026-08-13T00:00:00.000Z' });
    const france = applyMerchantQuery(summaries, { filters: { country: ['FR'] } });
    const kpis = buildMerchantPortfolioKpis(france, sources, '2026-08-13T00:00:00.000Z');
    expect(kpis.find((row) => row.key === 'total_merchants').value).toBe(1);
    expect(kpis.find((row) => row.key === 'cambra_revenue')).toMatchObject({ value: 1000, context: { collected_this_month_minor: 1000 } });
    expect(kpis.find((row) => row.key === 'recover_active')).toMatchObject({ value: 1, context: { modeled_savings_in_progress_minor: 10_000 } });
  });

  it('builds decision-grade KPI drilldowns without collapsing truth classes', () => {
    const summaries = buildMerchantSummaries({
      brands: [brand('fr', { country: 'FR' }), brand('es', { country: 'ES' })],
      demandUnits: [demand('fr', 20_000_000, 'stripe'), demand('es', 10_000_000, 'adyen')],
      analyzerResults: [
        { id: 'a-fr', brand_id: 'fr', payment_savings: 30_000, data_completeness_score: 92, created_date: '2026-08-01T00:00:00.000Z' },
        { id: 'a-es', brand_id: 'es', payment_savings: 10_000, data_completeness_score: 45, created_date: '2026-08-02T00:00:00.000Z' },
      ],
      invoices: [{ brand_id: 'fr', status: 'paid', total_amount: 100, amount_paid: 100, balance_due: 0, paid_at: '2026-08-03T00:00:00.000Z' }],
      approvals: [{ id: 'approval-1', brand_id: 'fr', status: 'pending', action_type: 'recover_authorization', risk_level: 3 }],
      now: '2026-08-13T00:00:00.000Z',
    });
    const source = (rows) => ({ ok: true, truncated: false, rows, limit: 5000 });
    const sources = {
      analyzerResults: source([
        { id: 'a-fr', brand_id: 'fr', payment_savings: 30_000, created_date: '2026-08-01T00:00:00.000Z' },
        { id: 'a-es', brand_id: 'es', payment_savings: 10_000, created_date: '2026-08-02T00:00:00.000Z' },
      ]),
      invoices: source([{ brand_id: 'fr', status: 'paid', total_amount: 100, amount_paid: 100, balance_due: 0, paid_at: '2026-08-03T00:00:00.000Z' }]),
      savingsReports: source([]), approvals: source([{ id: 'approval-1', brand_id: 'fr', status: 'pending', action_type: 'recover_authorization', risk_level: 3 }]), incidents: source([]),
    };
    const kpis = [{ key: 'potential_savings', value: 4_000_000, status: 'AVAILABLE', truth_class: 'modeled' }, { key: 'cambra_revenue', value: 10_000, status: 'AVAILABLE', truth_class: 'verified' }, { key: 'needs_attention', value: 1, status: 'AVAILABLE', truth_class: 'observed' }];
    const opportunity = buildMerchantKpiDrilldown('potential_savings', summaries, kpis, sources);
    expect(opportunity.breakdown.potential_savings).toMatchObject({
      recover_coverage: { active_merchants: 0, modeled_merchants: 2 },
      concentration: { top_5_share_pct: 100 },
    });
    expect(opportunity.breakdown.potential_savings.by_country[0]).toMatchObject({ country: 'FR', modeled_savings_minor: 3_000_000 });
    expect(opportunity.breakdown.potential_savings.trend[0]).toMatchObject({ month: '2026-08', modeled_savings_minor: 4_000_000 });
    const revenue = buildMerchantKpiDrilldown('cambra_revenue', summaries, kpis, sources);
    expect(revenue.breakdown.revenue.totals).toMatchObject({ invoiced_minor: 10_000, collected_minor: 10_000, outstanding_minor: 0 });
    expect(revenue.breakdown.revenue.truth_boundary.collected).toBe('verified_payment');
    const attention = buildMerchantKpiDrilldown('needs_attention', summaries, kpis, sources);
    expect(attention.breakdown.direct_founder_decisions.approvals[0]).toMatchObject({ id: 'approval-1', brand_id: 'fr' });
    expect(attention.actions).toContainEqual({ key: 'review_founder_approvals', href: '/admin/approvals', safe: true });
  });

  it('paginates thousands of summaries with bounded page size and stable cursors', () => {
    const rows = Array.from({ length: 10_000 }, (_, index) => ({ id: `m-${String(index).padStart(5, '0')}`, trading_name: `Merchant ${index}`, identifiers_search: [], search_text: '' }));
    const page = paginateMerchantRows(rows, '5000', 500);
    expect(page.items).toHaveLength(100);
    expect(page.page_size).toBe(100);
    expect(page.next_cursor).toBe('5100');
    expect(page.total).toBe(10_000);
  });

  it('fails closed on cross-merchant rows, including Contract/DealActivation scope', () => {
    expect(() => assertMerchantScopedRows('m1', [{ id: 'ok', brand_id: 'm1' }])).not.toThrow();
    expect(() => assertMerchantScopedRows('m1', [{ id: 'leak', brand_id: 'm2' }])).toThrow('merchant_scope_violation');
    const source = fs.readFileSync('base44/shared/founderMerchantsV2.ts', 'utf8');
    expect(source).toContain("query: { deal_activation_id: { $in: activationIds } }");
    expect(source).toContain("merchant_scope_violation:Contract.deal_activation_id");
    expect(source).not.toContain("query: { user_email: brand.created_by");
  });

  it('attributes communication threads only through explicit merchant relationships', () => {
    const scope = {
      brandId: 'm1', activationIds: ['recover-1'], caseIds: ['case-1'],
      informationRequestIds: ['request-1'], attributedThreadIds: ['acquisition-thread-1'],
    };
    expect(() => assertMerchantCommunicationThreads(scope, [
      { id: 'brand-thread', related_entity_type: 'Brand', related_entity_id: 'm1' },
      { id: 'recover-thread', recover_id: 'recover-1' },
      { id: 'case-thread', related_entity_type: 'NegotiationCase', related_entity_id: 'case-1' },
      { id: 'request-thread', related_entity_type: 'MerchantInformationRequest', related_entity_id: 'request-1' },
      { id: 'acquisition-thread-1', related_entity_type: 'OutboundLead', related_entity_id: 'lead-1' },
    ])).not.toThrow();
    expect(() => assertMerchantCommunicationThreads(scope, [
      { id: 'cross-tenant', related_entity_type: 'Brand', related_entity_id: 'm2' },
    ])).toThrow('merchant_scope_violation:CommunicationThread');
  });

  it('strips credentials and raw provider payloads recursively from admin projections', () => {
    const clean = sanitizeMerchantAdminValue({ id: 'i1', access_token: 'secret', refresh_token: 'secret2', nested: { api_key: 'secret3', raw_event_json: { private: true }, useful: 'ok' } });
    expect(clean).toEqual({ id: 'i1', nested: { useful: 'ok' } });
  });

  it('reuses one physical Founder Control entry and requires server-canonical Ask context', () => {
    const entry = fs.readFileSync('base44/functions/getFounderControlCenter/entry.ts', 'utf8');
    const shared = fs.readFileSync('base44/shared/founderMerchantsV2.ts', 'utf8');
    expect(entry).toContain("body?.view||'').toLowerCase()==='merchants'");
    expect(entry).toContain('collectFounderMerchantsV2(base44.asServiceRole,user,body)');
    expect(shared).toContain('client_context_authoritative: false');
    expect(shared).toContain("max_merchant_ids: 50");
    expect(shared).toContain("one_or_more_selected_merchants_not_found");
  });
});
