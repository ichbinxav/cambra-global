import { describe, expect, it } from "vitest";
import {
  ACTIVE_LAUNCH_MARKETS,
  EUROPE_MARKETS,
  MARKET_SCOPE_COUNTS,
  PROTECTED_MARKETS,
} from "./generated/europeMarkets.js";
import { LOCALE_MARKET_BY_CODE } from "./generated/localeRegistry.js";
import { ANALYZER_ENABLED_MARKETS, resolvePublicExperience } from "./publicExperience.jsx";

describe("public market experience", () => {
  it("projects exactly 33 canonical markets from the generated authority", () => {
    expect(EUROPE_MARKETS).toHaveLength(33);
    expect(MARKET_SCOPE_COUNTS).toEqual({
      canonical_market_count: 33,
      launch_perimeter_count: 30,
      active_launch_count: 10,
      licensing_blocked_count: 3,
      not_launch_market_count: 17,
      outside_launch_perimeter_count: 3,
    });
    const resolved = EUROPE_MARKETS.map((market) => resolvePublicExperience(market.iso2));
    expect(new Set(resolved.map((row) => row.marketCode)).size).toBe(33);
    for (const row of resolved) {
      expect(row.landing.status).toBe("AVAILABLE");
      expect(row.currency).toBe(row.market.primary_currency);
      expect(row.locale).toBe(LOCALE_MARKET_BY_CODE[row.marketCode]);
      expect(row.legal.status).toBe("LEGAL_REVIEW_REQUIRED");
      expect(row.outbound).toMatchObject({ status: "PAUSED_ZERO", capacity: 0, allowed: false });
      expect(row.regulated.authorizedByMarketMembership).toBe(false);
    }
  });

  it("enables Analyzer for exactly the 10 launch markets", () => {
    expect(ANALYZER_ENABLED_MARKETS).toBe(ACTIVE_LAUNCH_MARKETS);
    expect(ACTIVE_LAUNCH_MARKETS).toHaveLength(10);
    expect(ACTIVE_LAUNCH_MARKETS).toContain("ES");
    for (const market of ACTIVE_LAUNCH_MARKETS) {
      const row = resolvePublicExperience(market);
      expect(row.scope).toMatchObject({ status: "ACTIVE_LAUNCH", launchActive: true, researchOnly: false });
      expect(row.analyzer).toMatchObject({ status: "ENABLED", href: `/Analyzer?market=${market}` });
    }
  });

  it("keeps FR, BE and NL visibly protected and research-only", () => {
    expect(PROTECTED_MARKETS).toEqual(["FR", "BE", "NL"]);
    for (const market of PROTECTED_MARKETS) {
      const row = resolvePublicExperience(market);
      expect(row.scope).toMatchObject({
        status: "LICENSING_RESEARCH_ONLY",
        launchActive: false,
        researchAllowed: true,
        researchOnly: true,
      });
      expect(row.analyzer).toMatchObject({ status: "WAITLIST", reason: "NOT_AVAILABLE_IN_MARKET" });
      expect(row.recovery.status).toBe("BLOCKED");
    }
  });

  it("fails closed instead of silently mapping an unknown market to GB", () => {
    const row = resolvePublicExperience("ZZ");
    expect(row.marketCode).toBeNull();
    expect(row.scope.status).toBe("UNKNOWN_BLOCKED");
    expect(row.analyzer.status).toBe("BLOCKED");
    expect(row.outbound.capacity).toBe(0);
  });
});
