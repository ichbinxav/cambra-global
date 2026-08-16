// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

globalThis.React = React;

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/api/base44Client', () => ({ base44: { functions: { invoke } } }));
vi.mock('@/lib/i18n.jsx', () => ({ useTranslation: () => ({ lang: 'en' }) }));

import AdminMerchants from './AdminMerchants.jsx';

const kpiKeys = [
  'total_merchants','active_merchants','total_payment_volume','average_payment_cost',
  'potential_savings','verified_savings','realized_savings','cambra_revenue',
  'recover_active','needs_attention','average_data_confidence','new_merchants',
];

const merchant = {
  id: 'merchant-1', trading_name: 'SÉZANE', legal_name: 'Benda Bili SAS', country: 'FR',
  merchant_status: 'active', payment_volume: { value_minor: 420000000, truth_class: 'observed' },
  payment_cost: { bps: 196, annual_cost_minor: 8240000, truth_class: 'observed' },
  potential_savings: { pct: 26, value_minor: 2140000, truth_class: 'modeled' },
  verified_savings: null, realized_savings: null, cambra_revenue: null,
  psps: ['stripe'], recover: { active: false, status: 'not_activated' }, current_phase: null,
  data_sources: ['connected'], data_confidence: 94, data_confidence_label: 'High confidence',
  needs_attention: null, attention_status: 'UNAVAILABLE', attention_breakdown: { approvals: null, incidents: null },
  joined_at: '2026-08-01T00:00:00.000Z', last_activity_at: '2026-08-13T00:00:00.000Z',
  evidence: { source_coverage: { verified_savings: 'UNAVAILABLE', cambra_revenue: 'UNAVAILABLE' } },
};

const portfolio = {
  ok: true,
  kpis: kpiKeys.map((key, index) => ({
    key, label: key, value: index + 1, unit: key.includes('savings') || key === 'cambra_revenue' || key === 'total_payment_volume' ? 'EUR_minor_annual' : 'count',
    truth_class: key === 'potential_savings' ? 'modeled' : 'observed', status: 'AVAILABLE', context: {},
  })),
  merchants: { items: [merchant], total: 1, next_cursor: null },
  filters: { status: ['active'], country: ['FR'], psp: ['stripe'], recover_status: ['not_activated'], current_phase: [], data_source: ['connected','documents','manual'] },
  quick_views: [{ key: 'all', label: 'All', filters: {} }], saved_views: [],
  source_health: [{ source: 'Brand', status: 'AVAILABLE' }],
};

afterEach(() => { cleanup(); invoke.mockReset(); });

describe('AdminMerchants progressive disclosure', () => {
  it('renders 12 canonical KPI cards and does not turn unavailable merchant values into zero', async () => {
    invoke.mockResolvedValueOnce({ data: portfolio });
    render(<MemoryRouter><AdminMerchants /></MemoryRouter>);

    expect(await screen.findByText('Total Merchants')).toBeTruthy();
    expect(screen.getAllByRole('button').filter(button => button.hasAttribute('aria-expanded'))).toHaveLength(12);
    expect(screen.getByText('SÉZANE')).toBeTruthy();
    fireEvent.click(screen.getByText('SÉZANE'));
    expect((await screen.findAllByText('Unavailable')).length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText('Needs Attention').length).toBeGreaterThanOrEqual(2);
  });

  it('loads an internal block only when opened and keeps independent block accordions available', async () => {
    invoke.mockImplementation(async (_name, request) => {
      if (request.action === 'portfolio') return { data: portfolio };
      if (request.action === 'merchant_block') return { data: { ok: true, status: 'AVAILABLE', block: request.block, summary: 'Stripe · Online · EUR', data: { integrations: [{ id: 'int-1', provider: 'stripe', status: 'connected' }], profile: null, demand_units: [], verified_analyses: [] }, dependencies: [{ source: 'Integration', status: 'AVAILABLE' }] } };
      throw new Error(`Unexpected action ${request.action}`);
    });
    render(<MemoryRouter><AdminMerchants /></MemoryRouter>);
    fireEvent.click(await screen.findByText('SÉZANE'));
    expect(invoke.mock.calls.filter(([, request]) => request.action === 'merchant_block')).toHaveLength(0);

    fireEvent.click(screen.getByText('Payments & Infrastructure'));
    await waitFor(() => expect(invoke.mock.calls.some(([, request]) => request.action === 'merchant_block' && request.block === 'payments_infrastructure' && request.merchant_id === 'merchant-1')).toBe(true));
    expect(await screen.findByText(/Integrations & Connection Health/i)).toBeTruthy();
    expect(screen.getByText('Analyzer & Opportunities')).toBeTruthy();
  });
});
