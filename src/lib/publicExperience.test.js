import { describe, expect, it } from "vitest";
import { EUROPE_MARKETS } from "./generated/europeMarkets.js";
import { LOCALE_MARKET_BY_CODE } from "./generated/localeRegistry.js";
import { ANALYZER_ENABLED_MARKETS, resolvePublicExperience } from "./publicExperience.jsx";

describe("public market experience", () => {
  it("covers exactly the canonical 33 markets", () => {
    expect(EUROPE_MARKETS).toHaveLength(33);
    const resolved = EUROPE_MARKETS.map((market) => resolvePublicExperience(market.iso2));
    expect(new Set(resolved.map((row) => row.marketCode)).size).toBe(33);
    for (const row of resolved) {
      expect(row.landing.status).toBe("AVAILABLE");
      expect(row.currency).toBe(row.market.primary_currency);
      expect(row.locale).toBe(LOCALE_MARKET_BY_CODE[row.marketCode]);
      expect(row.legal.status).toBe("LEGAL_REVIEW_REQUIRED");
      expect(row.recovery.status).toBe("REVIEW_REQUIRED");
    }
  });

  it("enables Analyzer only where existing market policy supports it", () => {
    expect(ANALYZER_ENABLED_MARKETS).toEqual(["FR", "ES"]);
    for (const market of EUROPE_MARKETS) {
      const row = resolvePublicExperience(market.iso2);
      if (["FR", "ES"].includes(market.iso2)) {
        expect(row.analyzer.status).toBe("ENABLED");
        expect(row.analyzer.href).toBe(`/Analyzer?market=${market.iso2}`);
      } else {
        expect(row.analyzer.status).toBe("LIMITED");
        expect(row.analyzer.href).toContain("/Contact?");
      }
    }
  });

  it("fails closed for unknown market values", () => {
    const row = resolvePublicExperience("ZZ");
    expect(row.marketCode).toBe("GB");
    expect(row.analyzer.status).toBe("LIMITED");
  });
});
