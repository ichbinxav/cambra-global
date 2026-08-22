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
import ro from './locales/ro.js';
import hu from './locales/hu.js';
import bg from './locales/bg.js';
import hr from './locales/hr.js';
import et from './locales/et.js';
import lv from './locales/lv.js';
import lt from './locales/lt.js';
import sk from './locales/sk.js';
import sl from './locales/sl.js';
import nb from './locales/nb.js';
// aliased: `is` is not a vitest global, but the pair reads clearer next to itDict.
import isDict from './locales/is.js';

const dictionaries = { en, fr, es, de, it: itDict, pl, pt, el, sv, da, fi, cs, ro, hu, bg, hr, et, lv, lt, sk, sl, nb, is: isDict };
// The supported-language contract, extended deliberately per market rollout —
// decisions in src/docs/Decision_Log_I18N_30_MERCADOS.md. Order: en first,
// then launch locales, then 30-market additions in rollout order.
const SUPPORTED_LANGUAGES = ['en', 'fr', 'es', 'de', 'it', 'pl', 'pt', 'el', 'sv', 'da', 'fi', 'cs', 'ro', 'hu', 'bg', 'hr', 'et', 'lv', 'lt', 'sk', 'sl', 'nb', 'is'];
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

  it('never presents score context C as a market average', () => {
    const marketAverageClaim = /mid-market|market average|market mean|media del mercado|moyenne du marché|marktmittel|media di mercato|meio do mercado|μέσο της αγοράς|mitt i marknaden|midt i markedet|markkinoiden keskitasoa|uprostřed trhu|mijlocul pieței|piac közepén|средата на пазара|sredini tržišta|turu keskel|tirgus vidū|rinkos viduryje|strede trhu|sredini trga|miðjum markaði/i;
    for (const [lang, dict] of Object.entries(dictionaries)) {
      expect(dict.score_ctx_C, `${lang}:score_ctx_C must identify the observed CAMBRA population`).toContain('CAMBRA');
      expect(dict.score_ctx_C, `${lang}:score_ctx_C must not claim a market average`).not.toMatch(marketAverageClaim);
    }
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

  // AUDIT I18N-08 (2026-08-17): structural test for parallel copy maps OUTSIDE
  // src/lib/locales. The dictionary-parity assertions above cover the main dict but a
  // component that ships its own `const COPY = { en, fr, es }` map is invisible to them.
  // Each parallel map is enumerated below with the languages it must have OR a declared
  // exception with a reason. Adding a new map without registering it here trips the check.
  it('every parallel copy map declares the languages it covers, or an explicit exception', () => {
    const PARALLEL_MAPS = [
      // Merchant UI — must reach 23 langs (English fallback for non-legal-critical UI is OK).
      { file: 'src/components/recover/recoverUiCopy.js', requiredLangs: SUPPORTED_LANGUAGES, marker: '__translation_readiness' },
      { file: 'base44/shared/recoveryEconomicsCopy.ts', requiredLangs: SUPPORTED_LANGUAGES, marker: '__translation_readiness' },
      { file: 'src/components/recover/PaymentsMigrationCard.jsx', requiredLangs: SUPPORTED_LANGUAGES },
      { file: 'src/components/recover/ContractDocumentCard.jsx', requiredLangs: SUPPORTED_LANGUAGES },
      { file: 'src/components/account/RecoverCommitmentsCard.jsx', requiredLangs: SUPPORTED_LANGUAGES },
      { file: 'src/pages/PaymentsMigration.jsx', requiredLangs: SUPPORTED_LANGUAGES },
      // Declared exceptions (scope calls with an owner and a reason).
      { file: 'src/pages/Pricing.jsx', requiredLangs: ['en','fr','es'], exceptionReason: 'JSX-fragment lookup; per-market pricing wording pending legal review, tracked as I18N-08' },
      { file: 'src/lib/seoConfig.js', requiredLangs: ['en','fr','es'], exceptionReason: 'OG_LOCALE + per-route SEO wording; header comment declares en/fr/es scope' },
      { file: 'src/pages/Privacy.jsx', requiredLangs: ['en','fr','es'], exceptionReason: 'Legal document — legal_review PENDING per config/legal/dpa-status.json' },
      { file: 'src/pages/Terms.jsx', requiredLangs: ['en','fr','es'], exceptionReason: 'Legal document — legal_review PENDING' },
      { file: 'src/pages/Cookies.jsx', requiredLangs: ['en','fr','es'], exceptionReason: 'Legal document — legal_review PENDING' },
      { file: 'src/pages/Dpa.jsx', requiredLangs: ['en','fr','es'], exceptionReason: 'Legal document — legal_review PENDING' },
      { file: 'src/pages/Subprocessors.jsx', requiredLangs: ['en','fr','es'], exceptionReason: 'Legal document — legal_review PENDING' },
    ];
    const failures = [];
    for (const entry of PARALLEL_MAPS) {
      const body = source(entry.file);
      for (const lang of entry.requiredLangs) {
        // Match the lang either as `en:` (explicit key), `en,`/`en }` (object shorthand)
        // or as `from "@/content/legal/en/…` (per-locale content module import).
        const keyRe = new RegExp(`(?:^|[\\s{,\\[])['\"]?${lang}['\"]?\\s*[,:}\\]]`, 'm');
        const importRe = new RegExp(`/${lang}/[\\w-]+["']`, 'm');
        if (!keyRe.test(body) && !importRe.test(body)) {
          failures.push(`${entry.file} missing lang ${lang}` + (entry.exceptionReason ? ` (exception scope: ${entry.exceptionReason})` : ''));
        }
      }
      if (entry.marker && !body.includes(entry.marker)) {
        failures.push(`${entry.file} missing translation_readiness marker (${entry.marker})`);
      }
    }
    expect(failures, 'parallel copy maps must all declare their language coverage explicitly').toEqual([]);
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
