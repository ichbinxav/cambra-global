import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import en from './locales/en.js';
import fr from './locales/fr.js';
import es from './locales/es.js';

const dictionaries = { en, fr, es };
const keys = Object.fromEntries(Object.entries(dictionaries).map(([lang, dict]) => [lang, Object.keys(dict).sort()]));
const INTENTIONAL_BLANKS = new Set(['ri_sub_post','su_badge_beta']);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

describe('global i18n contract — EN / FR / ES', () => {
  it('keeps dictionary keys exactly in parity', () => {
    expect(keys.fr).toEqual(keys.en);
    expect(keys.es).toEqual(keys.en);
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

  it('keeps the supported language contract fixed to the launch locales', () => {
    expect(Object.keys(dictionaries)).toEqual(['en','fr','es']);
    expect(keys.en.length).toBeGreaterThan(1200);
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
