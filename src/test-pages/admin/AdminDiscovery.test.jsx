// @vitest-environment jsdom
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

globalThis.React = React;

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/api/base44Client', () => ({ base44: { functions: { invoke } } }));

import AdminDiscovery from '../../pages/admin/AdminDiscovery.jsx';

const plan = {
  plan_fingerprint: 'plan-fp-1',
  source_capability_version: 'cap-v1',
  classification: [
    { field: 'country', label: 'Country', value: ['FR'], effective_classification: 'NATIVE_SEARCH_FILTER' },
    { field: 'sales_channel', label: 'Sales Channel', value: ['omnichannel'], effective_classification: 'DERIVED_SIGNAL' },
    { field: 'actual_tpv', label: 'Actual TPV', value: ['high'], effective_classification: 'MERCHANT_DATA_REQUIRED' },
  ],
  filter_execution_matrix: [
    { field: 'country', status: 'APPLIED' },
    { field: 'sales_channel', status: 'PARTIAL' },
    { field: 'actual_tpv', status: 'NOT_APPLIED' },
  ],
  stages: [{ key: 'NATIVE_DISCOVERY', label: 'Native discovery', enabled: true, paid: false }],
  selected_source: 'CAMBRA',
  source_selection_reason: 'canonical_first',
  expected_funnel: { target: 100, unique: { min: 10, max: 50 }, high_fit: { min: 1, max: 10 } },
  cost: { search_minor: 0, selective_enrichment_minor: 0, hard_cap_minor: 0, monthly_remaining_minor: 10000, estimated_min_minor: 0, estimated_max_minor: 0 },
  limitations: [],
};

const overview = { ok: true, kpis: [], budget: {}, source_health: {}, running: [], recent_wins: [], needs_attention: [] };
const capabilities = { ok: true, filters: { MERCHANT: {}, PARTNER: {}, PROVIDER: {} }, sources: {}, source_health: {} };

function setTab(tab) {
  window.history.replaceState({}, '', `/admin/discovery?tab=${tab}`);
}

afterEach(() => {
  cleanup();
  invoke.mockReset();
});

/* global process */
describe('AdminDiscovery operational truth', () => {
  it('contains no browser-driven stage advance and requires a Run id for every results request', () => {
    const ui = fs.readFileSync(path.join(process.cwd(), 'src/pages/admin/AdminDiscovery.jsx'), 'utf8');
    expect(ui).not.toContain("call('advance'");
    expect(ui).not.toContain('discovery_v2_advance');
    expect(ui).toContain("call('run',{run_id:runId})");
    expect(ui).toContain("call('results',{run_id:runId");
    expect(ui).toContain('CAMBRA backend owns execution; this page only observes the Run. You can safely close the browser.');
  });

  it('uses truthful Partner and Provider search labels and never loads the global warehouse as Run results', async () => {
    invoke.mockImplementation(async (_name, request) => {
      if (request.action === 'discovery_v2_overview') return { data: overview };
      if (request.action === 'discovery_v2_capabilities') return { data: capabilities };
      if (request.action === 'discovery_v2_plan') return { data: { ok: true, plan, provider_usage: {} } };
      throw new Error(`Unexpected action ${request.action}`);
    });

    setTab('partners');
    const view = render(<AdminDiscovery />);
    expect(await screen.findByText('Partner Intelligence Search')).toBeTruthy();
    expect(invoke.mock.calls.some(([, request]) => request.action === 'discovery_v2_results')).toBe(false);

    view.unmount();
    setTab('providers');
    render(<AdminDiscovery />);
    expect(await screen.findByText('Provider Intelligence Search')).toBeTruthy();
    expect(screen.queryByText('Every field is searchable and multi-select.')).toBeNull();
    expect(screen.getByText(/Options express your intent/)).toBeTruthy();
  });

  it('shows applied/partial/unavailable plan truth, scopes terminal results to run_id and renders unknown score as an em dash', async () => {
    invoke.mockImplementation(async (_name, request) => {
      if (request.action === 'discovery_v2_overview') return { data: overview };
      if (request.action === 'discovery_v2_capabilities') return { data: capabilities };
      if (request.action === 'discovery_v2_plan') return { data: { ok: true, plan, provider_usage: {} } };
      if (request.action === 'discovery_v2_start') return { data: { ok: true, run: { id: 'run-1', status: 'COMPLETED', stage: 'COMPLETE', found: 1, unique: 1, high_fit: 0, spend_minor: 0, hard_cap_minor: 0 } } };
      if (request.action === 'discovery_v2_results') return { data: { ok: true, items: [{ id: 'lead-1', name: 'Evidence Ltd', subtitle: 'Retail · France', reason: 'Evidence exists but scoring coverage is unknown.', score: null, fit_band: 'UNKNOWN', opportunity: {}, contact: {}, details: {} }] } };
      throw new Error(`Unexpected action ${request.action}`);
    });

    setTab('merchants');
    render(<AdminDiscovery />);
    fireEvent.click(await screen.findByRole('button', { name: /Build pre-run plan/i }));
    expect(await screen.findByText('Applied')).toBeTruthy();
    expect(screen.getByText('Partial')).toBeTruthy();
    expect(screen.getByText('Unavailable')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Run Discovery/i }));
    expect(await screen.findByText('Evidence Ltd')).toBeTruthy();
    expect(screen.getByTestId('discovery-score').textContent).toBe('—');
    expect(screen.getByText(/canonical results from Run run-1/)).toBeTruthy();

    await waitFor(() => {
      const resultRequests = invoke.mock.calls.map(([, request]) => request).filter(request => request.action === 'discovery_v2_results');
      expect(resultRequests.length).toBeGreaterThan(0);
      expect(resultRequests.every(request => request.run_id === 'run-1')).toBe(true);
      expect(invoke.mock.calls.some(([, request]) => request.action === 'discovery_v2_advance')).toBe(false);
    });
  });
});
