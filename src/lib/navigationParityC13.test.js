// DASHBOARD-C13 (2026-08-17) — redirect parity and sidebar coverage.
//
// A redirect is only honest if the destination actually serves what the source served. Writing
// these checks caught four real problems:
//
//   1. /admin/revenue pointed at the Finance OVERVIEW tab — the C8 five-domain snapshot —
//      rather than the revenue tab that carries the per-provider breakdown and the monthly
//      series.
//   2. /admin/contracts pointed at /admin/recover?tab=contracts while AdminRecover had no tab
//      handling at all, so the entire Contracts surface would have become unreachable.
//   3. /admin/recover itself was never in the sidebar. It has been reachable only by typing
//      the URL since C7 built it.
//   4. Cutting the sidebar to twelve entries would have orphaned ten routes that are reachable
//      from nowhere else.
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const registry = JSON.parse(fs.readFileSync("config/dashboard/navigation.v1.json", "utf8"));
const app = fs.readFileSync("src/App.jsx", "utf8");
const layout = fs.readFileSync("src/pages/admin/AdminLayout.jsx", "utf8");
const navPaths = [...layout.matchAll(/\{ path: "([^"]+)"/g)].map((m) => m[1]);

const ready = registry.legacy_redirects.filter((row) => row.ready === true);
const pending = registry.legacy_redirects.filter((row) => row.ready !== true);

describe("C13 — every retired route redirects to exactly what the registry declares", () => {
  it("retires ten routes and leaves none pending", () => {
    expect(ready).toHaveLength(10);
    // C16 resolved the last two WITHOUT a redirect, so they left legacy_redirects: a row
    // pointing at a route that no longer exists points at nothing, which the gate rejects.
    expect(pending).toEqual([]);
    expect(registry.resolved_without_redirect.map((row) => row.from).sort())
      .toEqual(["/admin/applications", "/admin/deals"]);
  });

  it("wires each ready redirect in App.jsx to the declared destination and query", () => {
    for (const row of ready) {
      const query = row.query || {};
      const expected = Object.keys(query).length
        ? `${row.to}?${Object.entries(query).map(([k, v]) => `${k}=${v}`).join("&")}`
        : row.to;
      expect(app, row.from).toContain(`<Route path="${row.from}" element={<Navigate to="${expected}" replace />} />`);
    }
  });

  it("sends /admin/revenue to the tab that carries its content, not to the overview", () => {
    const row = ready.find((entry) => entry.from === "/admin/revenue");
    // The overview tab is the five-domain snapshot. The revenue content is a different tab.
    expect(row.query.tab).toBe("revenue");
    expect(row.parity_note).toContain("five-domain snapshot");
  });

  it("keeps no blocker on a retired route and records why it was cleared", () => {
    for (const row of ready) {
      expect(row.blocker, row.from).toBeUndefined();
      expect(row.retired_note, row.from).toBeTruthy();
      expect(row.retired_in, row.from).toBe("C13");
    }
  });

  it("says why the last two were resolved without a redirect", () => {
    const byPath = new Map(registry.resolved_without_redirect.map((row) => [row.from, row]));
    // /admin/deals: the proposed destination was wrong, not just unbuilt.
    expect(byPath.get("/admin/deals").why_not_a_redirect).toContain("not a pipeline");
    expect(byPath.get("/admin/deals").resolution).toContain("compile-time constant");
    // /admin/applications: there is nowhere to redirect a surface over an entity with no rows.
    expect(byPath.get("/admin/applications").why_not_a_redirect).toContain("nowhere to redirect");
    expect(byPath.get("/admin/applications").resolution).toContain("ZERO_PRODUCERS");
  });
});

describe("C13 — the destination page actually serves the declared tab", () => {
  const pageFor = (routePath) => {
    const route = app.match(new RegExp(`path="${routePath.replace(/\//g, "\\/")}"\\s+element=\\{withBoundary\\(<([A-Za-z0-9_]+)`));
    if (!route) return null;
    const imported = app.match(new RegExp(`const ${route[1]} = lazy\\(\\(\\) => import\\('([^']+)'\\)`));
    return imported ? `${imported[1].replace("@/", "src/")}.jsx` : null;
  };

  it("resolves every redirect destination to a real page", () => {
    for (const row of ready) {
      const file = pageFor(row.to);
      expect(file, row.to).toBeTruthy();
      expect(fs.existsSync(file), file).toBe(true);
    }
  });

  it("finds the tab in a key position on the destination page", () => {
    for (const row of ready) {
      if (!row.query?.tab) continue;
      const page = fs.readFileSync(pageFor(row.to), "utf8");
      const tab = row.query.tab.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // A key position, not a bare mention: a comment naming the tab must not satisfy this.
      const served = new RegExp(`(?:^|[{,\\s])${tab}\\s*:`, "m").test(page)
        || new RegExp(`["']${tab}["']\\s*:`).test(page)
        || new RegExp(`key:\\s*["']${tab}["']`).test(page);
      expect(served, `${row.from} -> ${row.to}?tab=${row.query.tab}`).toBe(true);
    }
  });

  it("serves the contracts tab from Recover, which had no tabs before C13", () => {
    const recover = fs.readFileSync("src/pages/admin/AdminRecover.jsx", "utf8");
    expect(recover).toContain('key: "contracts"');
    expect(recover).toContain("AdminContracts");
    expect(recover).toContain("useSearchParams");
  });
});

describe("C13 — nothing is reachable from nowhere", () => {
  it("offers every LIVE target entry in the sidebar", () => {
    const live = registry.target_navigation.filter((row) => String(row.state).startsWith("LIVE"));
    for (const row of live) {
      expect(navPaths, `${row.path} (${row.label})`).toContain(row.path);
    }
  });

  it("has every target entry live, with no workspace unbuilt", () => {
    // C14: thirteen, not twelve — read from the invariant so the test does not fight an
    // architecture decision.
    expect(registry.target_navigation).toHaveLength(registry.invariants.target_entry_count);
    expect(registry.target_navigation.filter((row) => row.state === "NOT_BUILT")).toEqual([]);
  });

  it("removed the ten redirected routes from the sidebar", () => {
    for (const row of ready) expect(navPaths, row.from).not.toContain(row.from);
  });

  it("declares a destination for every remaining sidebar entry", () => {
    const targets = new Set(registry.target_navigation.map((row) => row.path));
    const sources = new Set(registry.legacy_redirects.map((row) => row.from));
    const advanced = new Set((registry.advanced_system_children || []).map((row) => row.path));
    const unmapped = new Set((registry.unmapped_routes || []).map((row) => row.path));
    const orphans = navPaths.filter((path) => !targets.has(path) && !sources.has(path)
      && !advanced.has(path) && !unmapped.has(path));
    expect(orphans).toEqual([]);
  });
});

describe("C13/C14 — every route has a decided destination, each with evidence", () => {
  it("keeps the evidence and the decision on every decided route", () => {
    // Ten from the founder in C14, plus /admin/applications retired in C16.
    expect(registry.unmapped_routes).toHaveLength(11);
    for (const row of registry.unmapped_routes) {
      expect(row.evidence, row.path).toBeTruthy();
      // C14: the founder decided all ten. The evidence stays: a decision without the evidence
      // it was made on cannot be revisited.
      expect(row.decision_required, row.path).toBe(false);
      // WHO decided is recorded and must be distinguishable. Ten were the founder's calls in
      // C14; /admin/applications was mine in C16, and a decision log that flattens the two
      // cannot be audited.
      expect(["founder", "claude"], row.path).toContain(row.decided_by);
      expect(row.mode, row.path).toBeTruthy();
    }

    const founderCalls = registry.unmapped_routes.filter((row) => row.decided_by === "founder");
    expect(founderCalls).toHaveLength(10);
    expect(founderCalls.every((row) => row.decided_in === "C14")).toBe(true);

    const mine = registry.unmapped_routes.filter((row) => row.decided_by === "claude");
    expect(mine.map((row) => row.path)).toEqual(["/admin/applications"]);
  });

  it("records the two retirements as retirements, not as mappings", () => {
    const byPath = new Map(registry.unmapped_routes.map((row) => [row.path, row]));
    expect(byPath.get("/admin/copilot").mode).toBe("RETIRED");
    expect(byPath.get("/admin/aggregate").mode).toBe("DEFERRED");
    // Neither deletes a backend. Aggregate returns when there is a negotiation to run.
    expect(byPath.get("/admin/aggregate").note).toContain("NOT deleted");
    expect(byPath.get("/admin/copilot").note).toContain("NOT deleted");
  });

  it("records that Overview is the body of Founder OS, not a page it absorbed", () => {
    const overview = registry.unmapped_routes.find((row) => row.path === "/admin/overview");
    expect(overview.mode).toBe("BODY_OF");
    expect(overview.destination).toBe("/admin");
  });

  it("declares the target as thirteen, why it is not twelve, and that the cut is done", () => {
    expect(registry.sidebar_cut.target_entries).toBe(13);
    expect(registry.sidebar_cut.state).toBe("COMPLETE");
    expect(registry.sidebar_cut.completed_in).toBe("C16");
    expect(registry.sidebar_cut.target_change_note).toContain("emergency stop");
  });

  it("has exactly the declared number of top-level entries", () => {
    const nested = [...layout.matchAll(/\{ path: "[^"]+"[^\n]*advanced: true/g)].length;
    const topLevel = navPaths.length - nested;
    expect(topLevel).toBe(registry.invariants.target_entry_count);
  });

  it("does not store the sidebar entry count, which went stale inside one chunk", () => {
    expect(registry.sidebar_cut.current_entries).toBeUndefined();
    expect(registry.sidebar_cut.current_entries_note).toContain("went stale");
  });

  it("decided every route without one still awaiting a decision", () => {
    const undecided = registry.unmapped_routes.filter((row) => row.decision_required === true);
    expect(undecided).toEqual([]);
  });

  it("keeps every nested Advanced System child reachable", () => {
    // Excluding them from the top-level list without rendering them nested would have made
    // eleven routes unreachable — the orphaning C13 refused to do.
    const advanced = registry.advanced_system_children.map((row) => row.path);
    expect(advanced.length).toBeGreaterThan(0);
    for (const path of advanced) expect(navPaths, path).toContain(path);
    expect(layout).toContain('data-testid="advanced-system"');
    expect(layout).toContain("ADVANCED_NAV.map");
  });
});
