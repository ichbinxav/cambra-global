// legalAcceptance.test.js — DPA-1 (2026-08-16). R4: real state, not string
// matching over source code.
//
// What this locks:
//   1. The three places a document version lives (backend module, frontend
//      mirror, published content) cannot drift apart.
//   2. The validator fails closed on a stale or missing version — a merchant
//      cannot be recorded as having accepted the current text by sending a
//      version string we do not publish.
//   3. The evidence record actually carries who / when / which versions, and
//      never lets the client dictate the identity fields.
//   4. The legal-status control file admits the review is pending. If someone
//      flips it to APPROVED, that is a deliberate act, not a silent drift.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

import {
  CURRENT_DPA_VERSION as BE_DPA,
  CURRENT_TERMS_VERSION as BE_TERMS,
  LEGAL_ACCEPTANCE_POLICY_VERSION,
  buildLegalAcceptanceRecord,
  coversCurrentVersions,
  validateLegalAcceptance,
} from '../../base44/shared/legalAcceptance.ts';
import {
  CURRENT_DPA_VERSION as FE_DPA,
  CURRENT_TERMS_VERSION as FE_TERMS,
  coversCurrentVersions as feCovers,
} from './legalVersions.js';

import enTerms from '../content/legal/en/terms.js';
import esTerms from '../content/legal/es/terms.js';
import frTerms from '../content/legal/fr/terms.js';
import enDpa from '../content/legal/en/dpa.js';
import esDpa from '../content/legal/es/dpa.js';
import frDpa from '../content/legal/fr/dpa.js';

describe('document versions have exactly one truth', () => {
  it('backend and frontend constants agree', () => {
    expect(FE_TERMS).toBe(BE_TERMS);
    expect(FE_DPA).toBe(BE_DPA);
  });

  it('the constants match the versions actually published, in every language', () => {
    for (const [lang, doc] of Object.entries({ en: enTerms, es: esTerms, fr: frTerms })) {
      expect(doc.version, `${lang} terms version`).toBe(BE_TERMS);
    }
    for (const [lang, doc] of Object.entries({ en: enDpa, es: esDpa, fr: frDpa })) {
      expect(doc.version, `${lang} dpa version`).toBe(BE_DPA);
    }
  });

  it('the two coversCurrentVersions implementations behave identically', () => {
    const cases = [
      { terms_version: BE_TERMS, dpa_version: BE_DPA },
      { terms_version: BE_TERMS, dpa_version: '0.9' },
      { terms_version: '2020-01-01', dpa_version: BE_DPA },
      {},
      null,
    ];
    for (const row of cases) {
      expect(feCovers(row), JSON.stringify(row)).toBe(coversCurrentVersions(row));
    }
  });
});

describe('validateLegalAcceptance fails closed', () => {
  it('accepts the current versions and normalises the locale', () => {
    const r = validateLegalAcceptance({ terms_version: BE_TERMS, dpa_version: BE_DPA, locale: 'ES' });
    expect(r).toMatchObject({ ok: true, terms_version: BE_TERMS, dpa_version: BE_DPA, locale: 'es' });
  });

  it('rejects a missing version instead of assuming the current one', () => {
    expect(validateLegalAcceptance({ dpa_version: BE_DPA })).toMatchObject({ ok: false, error: 'terms_version_required' });
    expect(validateLegalAcceptance({ terms_version: BE_TERMS })).toMatchObject({ ok: false, error: 'dpa_version_required' });
    expect(validateLegalAcceptance({})).toMatchObject({ ok: false });
  });

  it('rejects a stale version and says which one it expected', () => {
    const r = validateLegalAcceptance({ terms_version: '2026-08-04', dpa_version: BE_DPA });
    expect(r).toMatchObject({ ok: false, error: 'terms_version_stale', expected: BE_TERMS, received: '2026-08-04' });
    const d = validateLegalAcceptance({ terms_version: BE_TERMS, dpa_version: '0.9' });
    expect(d).toMatchObject({ ok: false, error: 'dpa_version_stale', expected: BE_DPA });
  });

  it('drops a malformed locale rather than storing garbage', () => {
    const r = validateLegalAcceptance({ terms_version: BE_TERMS, dpa_version: BE_DPA, locale: 'not a locale' });
    expect(r).toMatchObject({ ok: true, locale: null });
  });
});

describe('the evidence record answers who / when / which versions', () => {
  it('carries every field a supervisory authority would ask for', () => {
    const record = buildLegalAcceptanceRecord({
      user_email: 'Merchant@Example.COM',
      accepted_at: '2026-08-16T10:00:00.000Z',
      terms_version: BE_TERMS,
      dpa_version: BE_DPA,
      locale: 'es',
      ip_address: '203.0.113.7',
      user_agent: 'Mozilla/5.0 test',
      brand_id: 'brand_1',
    });
    expect(record).toMatchObject({
      user_email: 'merchant@example.com', // normalised, not echoed
      accepted_at: '2026-08-16T10:00:00.000Z',
      terms_version: BE_TERMS,
      dpa_version: BE_DPA,
      acceptance_method: 'in_app_checkbox',
      locale: 'es',
      ip_address: '203.0.113.7',
      brand_id: 'brand_1',
    });
    expect(record.document_versions_json).toEqual({
      terms: BE_TERMS,
      dpa: BE_DPA,
      policy_version: LEGAL_ACCEPTANCE_POLICY_VERSION,
    });
    // The record it produces is, by construction, one that counts as current.
    expect(coversCurrentVersions(record)).toBe(true);
  });

  it('omits optional evidence rather than inventing it', () => {
    const record = buildLegalAcceptanceRecord({
      user_email: 'a@b.com',
      accepted_at: '2026-08-16T10:00:00.000Z',
      terms_version: BE_TERMS,
      dpa_version: BE_DPA,
    });
    expect(record.ip_address).toBeUndefined();
    expect(record.user_agent).toBeUndefined();
    expect(record.brand_id).toBeUndefined();
    expect(record.locale).toBeUndefined();
  });

  it('truncates an abusive user agent instead of storing it whole', () => {
    const record = buildLegalAcceptanceRecord({
      user_email: 'a@b.com',
      accepted_at: '2026-08-16T10:00:00.000Z',
      terms_version: BE_TERMS,
      dpa_version: BE_DPA,
      user_agent: 'x'.repeat(5000),
    });
    expect(record.user_agent.length).toBe(500);
  });
});

describe('the legal-status control file tells the truth about the review', () => {
  const status = JSON.parse(fs.readFileSync('config/legal/dpa-status.json', 'utf8'));

  it('records the DPA and the sub-processor list as PENDING legal review', () => {
    const byId = Object.fromEntries(status.documents.map((d) => [d.id, d]));
    expect(byId.dpa.legal_review).toBe('PENDING');
    expect(byId.subprocessors.legal_review).toBe('PENDING');
    // Pending review must block the production seal — otherwise the flag is
    // decoration.
    expect(byId.dpa.blocking_for_production_seal).toBe(true);
    expect(byId.subprocessors.blocking_for_production_seal).toBe(true);
  });

  it('keeps the controller-side master unpublished', () => {
    const internal = status.documents.find((d) => d.id === 'dpa_controller_master');
    expect(internal.published_at).toBeNull();
  });

  it('declares the same accepted versions the code enforces', () => {
    expect(status.accepted_versions.terms).toBe(BE_TERMS);
    expect(status.accepted_versions.dpa).toBe(BE_DPA);
  });
});
