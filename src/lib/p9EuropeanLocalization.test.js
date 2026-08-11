import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import en from './locales/en.js';
import fr from './locales/fr.js';
import es from './locales/es.js';
import { LOCALE_MARKETS, PRODUCT_LOCALES } from './generated/localeRegistry.js';
import { auditTranslationCatalog, formatMoneyMinor, localizationReadiness, pluralCategory, resolveLocale } from '../../base44/shared/localeRuntime.ts';

const read = (path) => fs.readFileSync(path, 'utf8');

describe('P9 European localization and productization', () => {
  it('separates 33 markets from three implemented product locales and currencies', () => {
    expect(LOCALE_MARKETS).toHaveLength(33);
    expect(PRODUCT_LOCALES.map((x) => x.locale)).toEqual(['en-GB', 'fr-FR', 'es-ES']);
    for (const market of LOCALE_MARKETS) {
      expect(market.market_code).toMatch(/^[A-Z]{2}$/);
      expect(market.currency).toMatch(/^[A-Z]{3}$/);
      expect(market.timezone).toBeTruthy();
      expect(market.native_locales.length).toBeGreaterThan(0);
    }
  });

  it('honors explicit user locale and never lets geolocation lock it', () => {
    const resolved = resolveLocale({ market_code: 'FR', explicit_locale: 'es-ES', merchant_locale: 'fr-FR', browser_locales: ['fr-FR'], geolocation_market: 'FR' });
    expect(resolved).toMatchObject({ locale: 'es-ES', source: 'explicit_user', explicit_override_honored: true, geolocation_locked: false, currency: 'EUR' });
  });

  it('uses market policy before browser and labels non-native fallback honestly', () => {
    expect(resolveLocale({ market_code: 'ES', browser_locales: ['en-US'] })).toMatchObject({ locale: 'es-ES', source: 'market_default', fallback_used: false });
    expect(resolveLocale({ market_code: 'DE' })).toMatchObject({ locale: 'en-GB', source: 'market_default', fallback_used: true });
    expect(localizationReadiness('DE')).toMatchObject({ status: 'LIMITED', launch_gate: 'BLOCK_FULL_LAUNCH' });
  });

  it('formats non-EUR market money and locale plurals without string concatenation', () => {
    expect(formatMoneyMinor(123456, { locale: 'en-GB', currency: 'GBP', minor_units: 2 })).toContain('£');
    expect(formatMoneyMinor(123456, { locale: 'fr-FR', currency: 'CHF', minor_units: 2 })).toContain('CHF');
    expect(pluralCategory(2, 'es-ES')).toBe('other');
  });

  it('proves translation parity and interpolation compatibility', () => {
    const result = auditTranslationCatalog({ en, fr, es });
    expect(result.ok).toBe(true);
    expect(result.canonical_key_count).toBeGreaterThan(1200);
  });

  it('keeps legal translation separate from jurisdiction applicability', () => {
    for (const market of LOCALE_MARKETS) {
      expect(market.legal_translation_status).toBe('IMPLEMENTED_UNVERIFIED');
      expect(market.legal_applicability_status).toBe('LEGAL_REVIEW_REQUIRED');
    }
  });

  it('integrates localization status into the existing Europe admin source of truth', () => {
    const source = read('base44/functions/getEuropeMarketsCommandCenter/entry.ts');
    expect(source).toContain('localizationReadiness(market.iso2)');
    expect(source).toContain('fallback-only markets are not represented as native-localized');
  });

  it('does not emit false hreflang on a client-side single URL architecture', () => {
    const seo = read('src/lib/seoConfig.js');
    expect(seo).toContain('No hreflang is emitted');
    expect(seo).toContain('false signal');
  });
});
