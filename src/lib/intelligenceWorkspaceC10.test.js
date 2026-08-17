// DASHBOARD-C10 (2026-08-17) — the Intelligence workspace projection.
//
// The KPI most easily made to lie here is coverage. "Markets with verified pricing: 0"
// and "pricing coverage could not be read" look nearly identical on a dashboard and mean
// opposite things: the first is a finding worth acting on, the second is a broken read.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildIntelligencePortfolio, INTELLIGENCE_AGGREGATORS, INTELLIGENCE_TABS,
} from "../../base44/shared/intelligenceWorkspaceCore.ts";
import { P3_MARKETS } from "../../base44/shared/p3RateIntelligence.ts";

const NOW = "2026-08-17T12:00:00.000Z";

function makeSvc(rows = {}, broken = []) {
  const stores = {}; const built = {};
  const entity = (name) => {
    if (!stores[name]) stores[name] = (rows[name] || []).map((r) => ({ ...r }));
    if (built[name]) return built[name];
    built[name] = {
      async list() { if (broken.includes(name)) throw new Error("down"); return stores[name].map((r) => ({ ...r })); },
    };
    return built[name];
  };
  return { stores, entities: new Proxy({}, { get: (_t, n) => entity(String(n)) }) };
}

const version = (extra = {}) => ({
  id: "ppv-1", provider_slug: "sumup", market: "FR", status: "CURRENT",
  verification_status: "VERIFIED_PRIMARY", variable_rate_bps: 175, ...extra,
});

const kpiOf = (out, key) => out.kpis.find((row) => row.metric_key === key);

describe("C10 — coverage counts what is verified, and null when it cannot be read", () => {
  it("counts a market with verified current pricing", async () => {
    const out = await buildIntelligencePortfolio({
      svc: makeSvc({ ProviderPricingVersion: [version(), version({ id: "ppv-2", market: "ES" })] }),
      now: NOW, contextId: "c",
    });
    expect(kpiOf(out, "markets_with_verified_pricing").value).toBe(2);
    expect(kpiOf(out, "markets_with_verified_pricing").denominator).toBe(P3_MARKETS.length);
  });

  it("does NOT count an observed-but-unverified price as coverage", async () => {
    const out = await buildIntelligencePortfolio({
      svc: makeSvc({ ProviderPricingVersion: [version({ verification_status: "RESEARCHED" })] }),
      now: NOW, contextId: "c",
    });
    expect(kpiOf(out, "markets_with_verified_pricing").value).toBe(0);
    expect(kpiOf(out, "markets_with_verified_pricing").claim_boundary).toContain("is NOT counted here");
  });

  it("excludes demo rows from coverage", async () => {
    const out = await buildIntelligencePortfolio({
      svc: makeSvc({ ProviderPricingVersion: [version({ is_demo: true })] }),
      now: NOW, contextId: "c",
    });
    // A seeded demo price is not coverage of a market.
    expect(kpiOf(out, "markets_with_verified_pricing").value).toBe(0);
  });

  it("excludes superseded versions from the current count", async () => {
    const out = await buildIntelligencePortfolio({
      svc: makeSvc({
        ProviderPricingVersion: [version(), version({ id: "ppv-old", status: "SUPERSEDED" })],
      }),
      now: NOW, contextId: "c",
    });
    expect(kpiOf(out, "current_pricing_versions").value).toBe(1);
  });

  it("reports null, not zero, when the pricing source is unreadable", async () => {
    const out = await buildIntelligencePortfolio({
      svc: makeSvc({ ProviderPricingVersion: [version()] }, ["ProviderPricingVersion"]),
      now: NOW, contextId: "c",
    });
    // This is the distinction the whole workspace rests on.
    expect(kpiOf(out, "markets_with_verified_pricing").value).toBeNull();
    expect(kpiOf(out, "current_pricing_versions").value).toBeNull();
    expect(out.items.total).toBeNull();
    expect(out.context.degraded_sources).toContain("ProviderPricingVersion");
  });

  it("distinguishes a market with no pricing recorded from one with unverified pricing", async () => {
    const out = await buildIntelligencePortfolio({
      svc: makeSvc({
        ProviderPricingVersion: [
          version({ market: "FR" }),
          version({ id: "ppv-2", market: "ES", verification_status: "RESEARCHED" }),
        ],
      }),
      now: NOW, contextId: "c",
    });
    const byMarket = new Map(out.items.rows.map((row) => [row.market, row]));
    expect(byMarket.get("FR").coverage_state).toBe("VERIFIED_PRESENT");
    expect(byMarket.get("ES").coverage_state).toBe("OBSERVED_ONLY");
    // Nobody has looked at DE. That is not "DE has no pricing".
    expect(byMarket.get("DE").coverage_state).toBe("NO_PRICING_RECORDED");
  });
});

describe("C10 — the unresolved queue reports its age, not just its size", () => {
  it("reports how long the oldest unresolved change has been waiting", async () => {
    const out = await buildIntelligencePortfolio({
      svc: makeSvc({
        RateChangeCandidate: [
          { id: "c1", state: "REVIEW_REQUIRED", detected_at: "2026-07-18T00:00:00.000Z" },
          { id: "c2", state: "REVIEW_REQUIRED", detected_at: "2026-08-15T00:00:00.000Z" },
          { id: "c3", state: "PROMOTED", detected_at: "2026-01-01T00:00:00.000Z" },
        ],
      }),
      now: NOW, contextId: "c",
    });
    const queue = kpiOf(out, "open_pricing_candidates");
    // A backlog nobody could clear is invisible in a count and obvious in an age.
    expect(queue.value).toBe(2);
    expect(queue.oldest_open_days).toBe(30);
    expect(queue.claim_boundary).toContain("had no exit");
  });

  it("reports null when the candidate source is unreadable", async () => {
    const out = await buildIntelligencePortfolio({
      svc: makeSvc({ RateChangeCandidate: [{ id: "c1", state: "REVIEW_REQUIRED" }] }, ["RateChangeCandidate"]),
      now: NOW, contextId: "c",
    });
    expect(kpiOf(out, "open_pricing_candidates").value).toBeNull();
  });

  it("reports no oldest age when the queue is genuinely empty", async () => {
    const out = await buildIntelligencePortfolio({ svc: makeSvc({}), now: NOW, contextId: "c" });
    expect(kpiOf(out, "open_pricing_candidates").oldest_open_days).toBeNull();
  });
});

describe("C10 — the workspace is a projection, not a sixth authority", () => {
  it("declares the five existing aggregators it consolidates", async () => {
    const out = await buildIntelligencePortfolio({ svc: makeSvc({}), now: NOW, contextId: "c" });
    expect(out.aggregators).toEqual([...INTELLIGENCE_AGGREGATORS]);
    expect(out.aggregators).toHaveLength(5);
  });

  it("cannot operate — only read and prepare", async () => {
    const out = await buildIntelligencePortfolio({ svc: makeSvc({}), now: NOW, contextId: "c" });
    expect(out.permissions.operate).toBe(false);
    expect(out.external_send_performed).toBe(false);
  });

  it("states the provider firewall", async () => {
    const out = await buildIntelligencePortfolio({ svc: makeSvc({}), now: NOW, contextId: "c" });
    expect(out.provider_firewall.disclosed).toBe(true);
    expect(out.provider_firewall.note).toContain("never influences a merchant recommendation");
  });

  it("names the legacy page each tab absorbs", async () => {
    const hosted = INTELLIGENCE_TABS.filter((tab) => tab.hosts).map((tab) => tab.hosts);
    expect(hosted).toEqual([
      "/admin/intelligence", "/admin/markets", "/admin/routing-intelligence",
      "/admin/benchmarks", "/admin/recommendations", "/admin/providers",
    ]);
  });

  it("declares a tab for every intelligence redirect in the navigation registry", async () => {
    // The registry is the single source of truth. A redirect to a tab the workspace does
    // not serve lands the operator on a blank page, and this caught two real drifts.
    const registry = JSON.parse(fs.readFileSync("config/dashboard/navigation.v1.json", "utf8"));
    const keys = INTELLIGENCE_TABS.map((tab) => tab.key);
    const targets = registry.legacy_redirects
      .filter((row) => row.to === "/admin/intelligence")
      .map((row) => row.query?.tab);
    expect(targets.length).toBeGreaterThan(0);
    for (const tab of targets) expect(keys, `redirect target ${tab}`).toContain(tab);
  });

  it("declares growth as a view of markets, matching the registry", async () => {
    const markets = INTELLIGENCE_TABS.find((tab) => tab.key === "markets");
    expect([...markets.views]).toContain("growth");
    expect(INTELLIGENCE_TABS.map((tab) => tab.key)).not.toContain("growth");
  });
});
