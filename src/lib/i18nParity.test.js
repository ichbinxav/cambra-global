import { describe, expect, it } from 'vitest';
import en from './locales/en.js';
import fr from './locales/fr.js';
import es from './locales/es.js';

const dictionaries = { en, fr, es };
const keys = Object.fromEntries(Object.entries(dictionaries).map(([lang, dict]) => [lang, Object.keys(dict).sort()]));

describe('global i18n contract — EN / FR / ES', () => {
  it('keeps dictionary keys exactly in parity', () => {
    expect(keys.fr).toEqual(keys.en);
    expect(keys.es).toEqual(keys.en);
  });

  it('does not ship empty translation values', () => {
    for (const [lang, dict] of Object.entries(dictionaries)) {
      const empty = Object.entries(dict).filter(([, value]) => typeof value !== 'string' || value.trim().length === 0).map(([key]) => `${lang}:${key}`);
      expect(empty).toEqual([]);
    }
  });

  it('keeps the supported language contract fixed to the launch locales', () => {
    expect(Object.keys(dictionaries)).toEqual(['en','fr','es']);
    expect(keys.en.length).toBeGreaterThan(1200);
  });
});
