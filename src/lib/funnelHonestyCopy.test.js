// MASTER T5 — honest anonymous funnel: the estimated-mode copy must never
// present the public-list-price assumption as a measured fact.
//
// These run against the real dictionaries (all product locales), not grep
// over component source: the invariant is about what the user reads.
import { describe, expect, it } from "vitest";
import en from "./locales/en.js";
import es from "./locales/es.js";
import fr from "./locales/fr.js";

const DICTS = { en, es, fr };
// Hedge words per locale — the estimated claim must be conditional.
const HEDGE = {
  en: /may be/i,
  es: /podrías/i,
  fr: /peut-être/i,
};

describe("estimated-mode gap copy is conditional, measured-mode is not", () => {
  for (const [lang, dict] of Object.entries(DICTS)) {
    it(`${lang}: estimated hedges, measured asserts, and they differ`, () => {
      const measured = dict.gap_overpaying_measured;
      const estimated = dict.gap_overpaying_estimated;
      expect(typeof measured).toBe("string");
      expect(typeof estimated).toBe("string");
      expect(estimated).not.toBe(measured);
      expect(estimated).toMatch(HEDGE[lang]);
      expect(measured).not.toMatch(HEDGE[lang]);
    });

    it(`${lang}: the "you pay today" caption names the LIST PRICE, not the merchant's rate`, () => {
      const caption = dict.gap_you_pay_today_estimated;
      expect(caption).toContain("{provider}");
      // Every locale's caption must say it's the public/list price…
      expect(caption).toMatch(/public|pública|tarif public/i);
      // …and must not read as "what you pay" (the dishonest original).
      expect(caption.toLowerCase()).not.toContain("what you pay");
    });

    it(`${lang}: both always-visible teaser assumptions exist and interpolate the provider`, () => {
      expect(dict.assumption_list_price).toContain("{provider}");
      expect(dict.assumption_card_mix.length).toBeGreaterThan(10);
      expect(dict.your_provider.length).toBeGreaterThan(3);
    });
  }
});
