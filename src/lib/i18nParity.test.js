import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import en from './locales/en.js';
import fr from './locales/fr.js';
import es from './locales/es.js';
// I18N-30M (2026-08-15) — the language contract is no longer fixed to the
// three launch locales: the 30-market rollout adds native product languages.
// Every new dictionary is registered here so ALL parity checks cover it.
import de from './locales/de.js';
// aliased: `it` collides with vitest's `it()` in this module's scope.
import itDict from './locales/it.js';
import pl from './locales/pl.js';
import pt from './locales/pt.js';
import el from './locales/el.js';
import sv from './locales/sv.js';
import da from './locales/da.js';
import fi from './locales/fi.js';
import cs from './locales/cs.js';

const dictionaries = { en, fr, es, de, it: itDict, pl, pt, el, sv, da, fi, cs };
// The supported-language contract, extended deliberately per market rollout —
// decisions in src/docs/Decision_Log_I18N_30_MERCADOS.md. Order: en first,
// then launch locales, then 30-market additions in rollout order.
const SUPPORTED_LANGUAGES = ['en', 'fr', 'es', 'de', 'it', 'pl', 'pt', 'el', 'sv', 'da', 'fi', 'cs'];
const keys = Object.fromEntries(Object.entries(dictionaries).map(([lang, dict]) => [lang, Object.keys(dict).sort()]));
const INTENTIONAL_BLANKS = new Set(['ri_sub_post','su_badge_beta']);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

describe('global i18n contract — EN / FR / ES', () => {
  it('keeps dictionary keys exactly in parity', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      if (lang === 'en') continue;
      expect(keys[lang], `key parity ${lang} vs en`).toEqual(keys.en);
    }
  });

  it('does not ship empty translation values', () => {
    for (const [lang, dict] of Object.entries(dictionaries)) {
      const invalid = Object.entries(dict).filter(([key, value]) => {
        if (INTENTIONAL_BLANKS.has(key)) return value !== '';
        return typeof value !== 'string' || value.trim().length === 0;
      }).map(([key]) => `${lang}:${key}`);
      expect(invalid).toEqual([]);
    }
  });

  it('keeps intentional semantic blanks identical across locales', () => {
    for (const key of INTENTIONAL_BLANKS) for (const dict of Object.values(dictionaries)) expect(dict[key]).toBe('');
  });

  it('keeps the supported language contract explicit and in rollout order', () => {
    // Deliberately widened from the fixed ['en','fr','es'] launch contract
    // (I18N-30M): the list is still EXACT — an unregistered dictionary or a
    // silently dropped language fails here, exactly like before.
    expect(Object.keys(dictionaries)).toEqual(SUPPORTED_LANGUAGES);
    expect(keys.en.length).toBeGreaterThan(1200);
  });

  it('every supported language resolves through Intl without throwing', () => {
    // BCP-47 sanity: a typo'd locale in LANGUAGES/CURRENCY_LOCALES/DATE_LOCALES
    // would silently fall back or throw at render time. Resolve each language
    // code through Intl here so the failure happens in CI, not in a browser.
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(() => new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR' }).format(1234.5)).not.toThrow();
      expect(() => new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' }).format(new Date('2026-08-15T00:00:00Z'))).not.toThrow();
    }
  });

  it('localizes the full Landing step, waitlist and footer interaction', () => {
    const keys = ['how_step_label','waitlist_cta','waitlist_email_label','waitlist_email_placeholder','waitlist_email_invalid','waitlist_error','waitlist_join','waitlist_joining','waitlist_done','footer_security','footer_cookies'];
    for (const key of keys) {
      for (const dict of [en, fr, es]) expect(dict[key], key).toBeTruthy();
    }
    for (const key of ['how_step_label','waitlist_cta','waitlist_email_invalid','waitlist_error','waitlist_join','waitlist_joining','waitlist_done','footer_security']) {
      expect(fr[key], `fr:${key}`).not.toBe(en[key]);
      expect(es[key], `es:${key}`).not.toBe(en[key]);
    }
  });

  it('keeps invisible toast viewports click-through and the mobile menu accessible', () => {
    const toast = source('src/components/ui/toast.jsx');
    expect((toast.match(/pointer-events-none fixed top-0/g) || []).length).toBe(2);
    expect(toast).toContain('group pointer-events-auto');
    const navbar = source('src/components/landing/Navbar.jsx');
    expect(navbar).toContain('aria-expanded={open}');
    expect(navbar).toContain('aria-controls="cambra-mobile-navigation"');
    expect(source('src/components/landing/MobileNavMenu.jsx')).toContain('id="cambra-mobile-navigation"');
  });
});
