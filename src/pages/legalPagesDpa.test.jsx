// @vitest-environment jsdom
// legalPagesDpa.test.jsx — DPA-1 (2026-08-16). R4: what actually renders and
// what actually happens, not what the source file contains.
//
// Covers the prompt's required behaviours:
//   - /Dpa and /Subprocessors render in en/es/fr with the right language;
//   - the footer links both;
//   - the acceptance gate blocks until the box is ticked and the evidence is
//     persisted, and FAILS CLOSED when persistence fails.

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// The SDK is replaced per-test so the acceptance flow can be driven through
// its real component logic without a network.
const authMe = vi.fn();
const acceptanceFilter = vi.fn();
const functionsInvoke = vi.fn();
vi.mock('@/api/base44Client', () => ({
  base44: {
    auth: { me: (...a) => authMe(...a) },
    entities: { LegalAcceptance: { filter: (...a) => acceptanceFilter(...a) } },
    functions: { invoke: (...a) => functionsInvoke(...a) },
  },
}));

import { LanguageProvider } from '@/lib/i18n.jsx';
import { AuthProvider } from '@/lib/AuthContext.jsx';
import { MarketProvider } from '@/lib/publicExperience.jsx';
import Dpa from './Dpa.jsx';
import Subprocessors from './Subprocessors.jsx';
import PublicFooter from '@/components/shared/PublicFooter.jsx';
import LegalAcceptanceGate from '@/components/shared/LegalAcceptanceGate.jsx';
import { CURRENT_DPA_VERSION, CURRENT_TERMS_VERSION } from '@/lib/legalVersions.js';

// PublicPageShell reaches for useAuth and useMarket, so the public legal pages
// need the same providers App.jsx wraps them in. The SDK underneath is the
// mock above, so nothing touches the network.
function renderIn(node, lang) {
  if (lang) localStorage.setItem('cambra_lang', lang);
  return render(
    <MemoryRouter>
      <AuthProvider>
        <MarketProvider>
          <LanguageProvider>{node}</LanguageProvider>
        </MarketProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  authMe.mockReset();
  acceptanceFilter.mockReset();
  functionsInvoke.mockReset();
});
afterEach(() => cleanup());

describe('/Dpa renders the right language', () => {
  it('English shows the English title and the fixed placeholder values', () => {
    renderIn(<Dpa />, 'en');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Data Processing Agreement/i);
    const body = document.body.textContent;
    // The bracketed placeholders of the source draft must be gone, replaced by
    // the values the Decision Log records.
    expect(body).not.toMatch(/\[\d+\]/);
    expect(body).toMatch(/48 hours/);
    expect(body).toMatch(/30 days/);
    expect(body).toMatch(/90 days/);
    expect(body).toMatch(/15 business days/);
  });

  it('Spanish and French render their own text, not the English master', () => {
    renderIn(<Dpa />, 'es');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Acuerdo de Encargo/i);
    expect(document.body.textContent).toMatch(/48 horas/);
    cleanup();
    renderIn(<Dpa />, 'fr');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/sous-traitance/i);
    expect(document.body.textContent).toMatch(/48 heures/);
  });

  it('links to the sub-processor list, because Annex III delegates to it', () => {
    renderIn(<Dpa />, 'en');
    const link = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '/Subprocessors');
    expect(link).toBeTruthy();
  });
});

describe('/Subprocessors publishes gaps instead of inventing facts', () => {
  it('renders the confirmed providers already declared in the privacy policy', () => {
    renderIn(<Subprocessors />, 'en');
    const body = document.body.textContent;
    for (const provider of ['Base44', 'Anthropic PBC', 'OpenAI', 'Resend, Inc.', 'Stripe Payments Europe Ltd.']) {
      expect(body, provider).toContain(provider);
    }
  });

  it('marks unverified points as pending rather than asserting them', () => {
    renderIn(<Subprocessors />, 'en');
    expect(document.body.textContent).toMatch(/Pending legal review/i);
    expect(document.body.textContent).toMatch(/Pending confirmation/i);
  });

  it('carries its own last-updated date — the 30-day notice depends on it', () => {
    renderIn(<Subprocessors />, 'en');
    expect(document.body.textContent).toMatch(/Last updated/i);
  });

  it('renders in Spanish when the language is Spanish', () => {
    renderIn(<Subprocessors />, 'es');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Subencargados/i);
  });
});

describe('the public footer exposes both new pages', () => {
  it('links /Dpa and /Subprocessors', () => {
    renderIn(<PublicFooter />, 'en');
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/Dpa');
    expect(hrefs).toContain('/Subprocessors');
  });
});

describe('the acceptance gate', () => {
  const child = <div data-testid="app">the app</div>;

  it('lets an already-accepted user straight through', async () => {
    authMe.mockResolvedValue({ email: 'a@b.com' });
    acceptanceFilter.mockResolvedValue([
      { terms_version: CURRENT_TERMS_VERSION, dpa_version: CURRENT_DPA_VERSION },
    ]);
    renderIn(<LegalAcceptanceGate>{child}</LegalAcceptanceGate>, 'en');
    await waitFor(() => expect(screen.getByTestId('app')).toBeTruthy());
    expect(functionsInvoke).not.toHaveBeenCalled();
  });

  it('blocks a user who never accepted, and does not pre-tick the box', async () => {
    authMe.mockResolvedValue({ email: 'new@b.com' });
    acceptanceFilter.mockResolvedValue([]);
    renderIn(<LegalAcceptanceGate>{child}</LegalAcceptanceGate>, 'en');
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeTruthy());
    expect(screen.queryByTestId('app')).toBeNull();
    expect(screen.getByRole('checkbox').checked).toBe(false);
    // The CTA is unusable until the box is ticked — no accidental acceptance.
    expect(screen.getByRole('button').disabled).toBe(true);
  });

  it('treats a stale accepted version as not accepted', async () => {
    authMe.mockResolvedValue({ email: 'old@b.com' });
    acceptanceFilter.mockResolvedValue([{ terms_version: '2026-08-04', dpa_version: '0.9' }]);
    renderIn(<LegalAcceptanceGate>{child}</LegalAcceptanceGate>, 'en');
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeTruthy());
    expect(screen.queryByTestId('app')).toBeNull();
  });

  it('persists the evidence with the current versions, then admits the user', async () => {
    const user = userEvent.setup();
    authMe.mockResolvedValue({ email: 'new@b.com' });
    acceptanceFilter.mockResolvedValue([]);
    functionsInvoke.mockResolvedValue({ data: { ok: true, acceptance_id: 'acc_1' } });
    renderIn(<LegalAcceptanceGate>{child}</LegalAcceptanceGate>, 'en');
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeTruthy());
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByTestId('app')).toBeTruthy());
    expect(functionsInvoke).toHaveBeenCalledWith('claimAnonPaymentsResult', {
      action: 'record_legal_acceptance',
      terms_version: CURRENT_TERMS_VERSION,
      dpa_version: CURRENT_DPA_VERSION,
      locale: 'en',
    });
  });

  it('FAILS CLOSED: if the evidence is not persisted, the user does not get in', async () => {
    const user = userEvent.setup();
    authMe.mockResolvedValue({ email: 'new@b.com' });
    acceptanceFilter.mockResolvedValue([]);
    functionsInvoke.mockResolvedValue({ data: { ok: false, error: 'legal_acceptance_not_persisted' } });
    renderIn(<LegalAcceptanceGate>{child}</LegalAcceptanceGate>, 'en');
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeTruthy());
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    // The app is still blocked and the failure is visible — no phantom
    // acceptance, no silent pass-through.
    expect(screen.queryByTestId('app')).toBeNull();
  });

  it('FAILS CLOSED on a transport error too', async () => {
    const user = userEvent.setup();
    authMe.mockResolvedValue({ email: 'new@b.com' });
    acceptanceFilter.mockResolvedValue([]);
    functionsInvoke.mockRejectedValue(new Error('network'));
    renderIn(<LegalAcceptanceGate>{child}</LegalAcceptanceGate>, 'en');
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeTruthy());
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.queryByTestId('app')).toBeNull();
  });
});

describe('the Terms incorporate the DPA by reference', () => {
  // The content IS the product here, so asserting on the published content is
  // legitimate — but it is asserted through the module the app actually
  // renders, in all three languages, not by grepping a file.
  it('every language has the incorporation section pointing at /Dpa', async () => {
    const mods = {
      en: (await import('../content/legal/en/terms.js')).default,
      es: (await import('../content/legal/es/terms.js')).default,
      fr: (await import('../content/legal/fr/terms.js')).default,
    };
    for (const [lang, doc] of Object.entries(mods)) {
      const section = doc.sections.find((s) => /5 bis/.test(s.title));
      expect(section, `${lang} incorporation section`).toBeTruthy();
      expect(section.content, lang).toContain('/Dpa');
      expect(section.content, lang).toContain('/Subprocessors');
    }
  });

  it('does not break the existing cross-references to sections 7 and 14', async () => {
    // Inserting "5 bis" instead of renumbering keeps every internal citation
    // valid (the Terms cite "Section 7", "Section 7(c)" and "Section 14" in
    // their own body). If someone renumbers later, this fails loudly.
    const doc = (await import('../content/legal/en/terms.js')).default;
    const titles = doc.sections.map((s) => s.title);
    expect(titles.some((t) => t.startsWith('7.'))).toBe(true);
    expect(titles.some((t) => t.startsWith('14.'))).toBe(true);
    expect(titles.some((t) => t.startsWith('16.'))).toBe(true);
    const cites = doc.sections.map((s) => s.content).join(' ');
    expect(cites).toMatch(/Section 7/);
    expect(cites).toMatch(/Section 14/);
  });
});
