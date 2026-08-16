// @vitest-environment jsdom
// reportsCurrencyRendering.test.jsx — FX paso 2, Fase C (R4: rendered state).
//
// The Reports surface used to hardcode `€${...}` in the chart axis/tooltip
// and in the KPI/fee/benchmark components — a merchant whose results are in
// another currency would read a euro sign over a non-euro number. These
// tests render the REAL components that produce the money strings and assert
// the correct currency symbol/format appears for two non-EUR currencies.

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The fee panel probes an activation counter through the SDK on mount; jsdom
// has no network, so the client is mocked at the module boundary. The mock
// only unblocks rendering — every assertion below is about the REAL
// formatting logic of the real components.
vi.mock('@/api/base44Client', () => ({
  base44: { functions: { invoke: () => Promise.resolve({ data: { activated_count: 3 } }) } },
}));
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '@/lib/i18n.jsx';
import ReportsKPIStrip from './ReportsKPIStrip.jsx';
import EffectiveFeePanel from './EffectiveFeePanel.jsx';

function withProvider(node) {
  // MemoryRouter because the fee panel renders a react-router <Link>.
  return render(<MemoryRouter><LanguageProvider>{node}</LanguageProvider></MemoryRouter>);
}

afterEach(() => cleanup());

describe('ReportsKPIStrip renders the result currency, not a hardcoded €', () => {
  it('PLN results show złoty formatting', () => {
    withProvider(<ReportsKPIStrip results={[{ total_savings: 12_500, currency: 'PLN', verification_status: 'verified' }]} />);
    // en-GB compact currency for PLN renders "PLN 12.5K" (no euro sign).
    const text = document.body.textContent;
    expect(text).toMatch(/PLN|zł/);
    expect(text).not.toMatch(/€1?2[.,]5/);
  });

  it('SEK results show krona formatting', () => {
    withProvider(<ReportsKPIStrip results={[{ total_savings: 40_000, currency: 'SEK', verification_status: 'verified' }]} />);
    const text = document.body.textContent;
    expect(text).toMatch(/SEK|kr/);
  });

  it('legacy results without the field still render EUR', () => {
    withProvider(<ReportsKPIStrip results={[{ total_savings: 12_000, verification_status: 'verified' }]} />);
    expect(document.body.textContent).toMatch(/€/);
  });
});

describe('EffectiveFeePanel denominates in the report currency', () => {
  it('a PLN MonthlySavingsReport renders złoty amounts', async () => {
    withProvider(<EffectiveFeePanel report={{ savings: 1000, effective_fee_pct: 25, currency: 'PLN' }} />);
    // The panel resolves an activation count asynchronously (renders null
    // until the probe settles — jsdom's failed fetch resolves it to 0), so
    // wait for the money strings to appear.
    const matches = await screen.findAllByText(/PLN|zł/, {}, { timeout: 3000 });
    expect(matches.length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/€/);
  });
});
