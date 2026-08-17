#!/usr/bin/env node
// DASHBOARD-C1 (2026-08-17) — navigation registry integrity.
//
// config/dashboard/navigation.v1.json is the single source of truth for admin
// navigation. This gate stops it drifting from the code in either direction:
// a target entry whose route does not exist, a redirect whose destination does
// not exist, or a "ready" redirect whose blocker is still open.
//
// It deliberately does NOT require the sidebar to already be cut to twelve
// entries. Prompt section 2.5 forbids retiring a legacy route before parity, so
// during C1-C12 the registry legitimately describes a larger current state than
// the target. What the gate enforces is that the DIFFERENCE is declared.
import fs from 'node:fs';
import process from 'node:process';

const REGISTRY = 'config/dashboard/navigation.v1.json';
const APP = 'src/App.jsx';
const LAYOUT = 'src/pages/admin/AdminLayout.jsx';

let failures = 0;
const fail = (message) => { console.error(`dashboard:navigation:check FAIL — ${message}`); failures += 1; };

if (!fs.existsSync(REGISTRY)) { fail(`${REGISTRY} missing`); process.exit(1); }
let registry;
try { registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8')); }
catch (error) { fail(`invalid JSON: ${error.message}`); process.exit(1); }

if (registry.schema_version !== 'cambra-dashboard-navigation-v1') {
  fail(`unexpected schema_version: ${registry.schema_version}`);
}

const app = fs.readFileSync(APP, 'utf8');
const layout = fs.readFileSync(LAYOUT, 'utf8');
const routeExists = (path) => app.includes(`path="${path}"`);

const target = Array.isArray(registry.target_navigation) ? registry.target_navigation : [];
// DASHBOARD-C14: the count is read from the registry's own invariant rather than hard-coded at
// 12. The founder chose 13: Founder Control keeps its own entry because it carries the
// emergency stop, and two clicks to an emergency stop is one too many. A hard-coded 12 would
// have made the gate fight the architecture it is meant to protect.
const expectedEntries = registry.invariants?.target_entry_count;
if (typeof expectedEntries !== 'number') {
  fail('invariants.target_entry_count must declare how many entries the architecture has');
} else if (target.length !== expectedEntries) {
  fail(`target_navigation must hold exactly ${expectedEntries} entries, found ${target.length}`);
}

const groups = new Set(registry.target_group_order || []);
const seenOrders = new Set();
for (const entry of target) {
  if (!groups.has(entry.group)) fail(`${entry.path} in unknown group ${entry.group}`);
  if (seenOrders.has(entry.order)) fail(`duplicate order ${entry.order}`);
  seenOrders.add(entry.order);
  if (!entry.label_key) fail(`${entry.path} has no label_key`);

  const live = String(entry.state || '').startsWith('LIVE');
  if (live && !routeExists(entry.path)) {
    fail(`${entry.path} is declared ${entry.state} but no route exists in ${APP}`);
  }
  if (entry.state === 'NOT_BUILT' && routeExists(entry.path)) {
    // A built route declared NOT_BUILT means the registry is stale, which is
    // worse than the reverse: it hides finished work.
    fail(`${entry.path} is declared NOT_BUILT but a route exists — registry is stale`);
  }
}

// Every legacy redirect must name a destination that exists, and a redirect
// declared ready must not still carry a blocker.
for (const row of Array.isArray(registry.legacy_redirects) ? registry.legacy_redirects : []) {
  if (!routeExists(row.from)) {
    fail(`legacy redirect source ${row.from} does not exist — remove the row instead of pointing at nothing`);
  }
  if (row.ready === true) {
    if (row.blocker) fail(`${row.from} is marked ready but still declares a blocker: ${row.blocker}`);
    if (!routeExists(row.to)) fail(`${row.from} is marked ready but destination ${row.to} does not exist`);
    if (!app.includes(row.from)) fail(`${row.from} is marked ready but ${APP} has no redirect for it`);
  } else if (!row.blocker) {
    // An unready redirect with no stated blocker is an undeclared gap.
    fail(`${row.from} is not ready and states no blocker`);
  } else if (row.blocker_cleared === true && !/C13|retire/i.test(row.blocker)) {
    // A cleared blocker that does not say what still holds the redirect back would
    // read as "nearly done" with nothing naming the remaining step.
    fail(`${row.from} declares blocker_cleared but its blocker does not name the remaining step`);
  }
}

// ---------------------------------------------------------------------------
// DASHBOARD-C13 — parity. A redirect is only honest if the destination actually serves
// what the source served.
//
// Two real failures were caught by writing this: /admin/revenue pointed at the Finance
// OVERVIEW tab (the five-domain snapshot) rather than the revenue tab that carries the
// per-provider breakdown, and /admin/contracts pointed at /admin/recover?tab=contracts
// when AdminRecover had no tab handling at all — the entire Contracts surface would have
// become unreachable. A redirect to a tab nobody serves is a blank page.
// ---------------------------------------------------------------------------

/** Resolves a route path to the source file that serves it, via App.jsx. */
const pageFileFor = (routePath) => {
  const routeMatch = app.match(new RegExp(`path="${routePath.replace(/\//g, '\\/')}"\\s+element=\\{withBoundary\\(<([A-Za-z0-9_]+)`));
  if (!routeMatch) return null;
  const component = routeMatch[1];
  const importMatch = app.match(new RegExp(`const ${component} = lazy\\(\\(\\) => import\\('([^']+)'\\)`));
  if (!importMatch) return null;
  return importMatch[1].replace('@/', 'src/') + '.jsx';
};

for (const row of Array.isArray(registry.legacy_redirects) ? registry.legacy_redirects : []) {
  const wired = new RegExp(`path="${row.from.replace(/\//g, '\\/')}"\\s+element=\\{<Navigate to="([^"]+)"`).exec(app);

  if (row.ready === true && !wired) {
    fail(`${row.from} is marked ready but ${APP} does not redirect it`);
  }

  if (wired) {
    const query = row.query || {};
    const expected = Object.keys(query).length
      ? `${row.to}?${Object.entries(query).map(([k, v]) => `${k}=${v}`).join('&')}`
      : row.to;
    if (wired[1] !== expected) {
      fail(`${row.from} redirects to ${wired[1]} but the registry declares ${expected}`);
    }

    // The destination must actually serve the declared tab.
    if (query.tab) {
      const file = pageFileFor(row.to);
      if (!file) {
        fail(`cannot resolve the page that serves ${row.to} — parity for ${row.from} is unverifiable`);
      } else if (!fs.existsSync(file)) {
        fail(`${row.to} resolves to ${file}, which does not exist`);
      } else {
        const page = fs.readFileSync(file, 'utf8');
        // The tab must appear in a KEY position — as an object key in the tab-body map or as
        // a `key:` field in a tab list. Merely being mentioned somewhere in the file is not
        // evidence that the page dispatches on it, and matching a bare string would let a
        // comment satisfy this check.
        const tab = query.tab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const served = new RegExp(`(?:^|[{,\\s])${tab}\\s*:`, 'm').test(page)
          || new RegExp(`["']${tab}["']\\s*:`).test(page)
          || new RegExp(`key:\\s*["']${tab}["']`).test(page);
        if (!served) {
          fail(`${row.from} redirects to ${row.to}?tab=${query.tab} but ${file} never names that tab — the operator lands on a blank or wrong surface`);
        }
      }
    }
  }
}

// Reverse coverage: a target entry the sidebar does not offer is a workspace the operator
// cannot reach. /admin/audits was exactly this until C13 built the page.
// Sidebar coverage. Cutting the sidebar to twelve entries while a route is reachable from
// nowhere else silently removes navigation to a page that still exists.
const navPaths = [...layout.matchAll(/\{ path: "([^"]+)"/g)].map((m) => m[1]);
const targetPaths = new Set(target.map((row) => row.path));
const redirectSources = new Set((registry.legacy_redirects || []).map((row) => row.from));
const advancedPaths = new Set((registry.advanced_system_children || []).map((row) => row.path));
const declaredUnmapped = new Map((registry.unmapped_routes || []).map((row) => [row.path, row]));

const missingFromSidebar = target
  .filter((row) => String(row.state || '').startsWith('LIVE') && !navPaths.includes(row.path))
  .map((row) => row.path);
if (missingFromSidebar.length) {
  fail(`target entries that are LIVE but absent from the sidebar: ${missingFromSidebar.join(', ')} — the operator cannot reach them`);
}

const orphans = navPaths.filter((path) => !targetPaths.has(path) && !redirectSources.has(path)
  && !advancedPaths.has(path) && !declaredUnmapped.has(path));
if (orphans.length) {
  fail(`sidebar entries with no declared destination: ${orphans.join(', ')} — declare each in unmapped_routes before the sidebar is cut`);
}

// The cut itself is gated on those decisions being made.
// A stored entry count is a number that goes stale. The registry declares it is not stored;
// fail if someone puts it back, because then two places can disagree about the same fact.
if (registry.sidebar_cut && registry.sidebar_cut.current_entries !== undefined) {
  fail('sidebar_cut.current_entries is stored again — count it from the layout instead; the stored value went stale inside one chunk');
}

// Nested Advanced System children are reachable, so they do not count against the cut.
const nestedEntries = [...layout.matchAll(/\{ path: "[^"]+"[^\n]*advanced: true/g)].length;
const topLevelEntries = navPaths.length - nestedEntries;
const sidebarCut = typeof expectedEntries === 'number' && topLevelEntries <= expectedEntries;
const undecided = [...declaredUnmapped.values()].filter((row) => row.decision_required === true);
if (sidebarCut && undecided.length) {
  fail(`the sidebar has been cut to ${navPaths.length} entries while ${undecided.length} route(s) still await a destination decision: ${undecided.map((row) => row.path).join(', ')}`);
}

// The physical function quota this programme must not touch.
if (registry.invariants?.physical_function_target !== 276) {
  fail(`physical_function_target must stay 276, found ${registry.invariants?.physical_function_target}`);
}

// Advanced System children and Merchants children must be real routes.
for (const child of registry.advanced_system_children || []) {
  if (!routeExists(child.path)) fail(`advanced system child ${child.path} has no route`);
}

// The layout must render from the registry rather than an inline literal once the
// consolidation lands. Until then, record which one is authoritative.
// DASHBOARD-C13: this used to be `layout.includes('navigation.v1.json')`, which a COMMENT
// referencing the registry satisfied — and one did, making the gate report "renders from
// registry" while the inline NAV array was still the source. It must be an actual import.
const rendersFromRegistry = /^\s*import[^\n]*(dashboardNavigation|navigation\.v1\.json)/m.test(layout);

const readyRedirects = (registry.legacy_redirects || []).filter((row) => row.ready === true).length;
const clearedRedirects = (registry.legacy_redirects || []).filter((row) => row.blocker_cleared === true && row.ready !== true).length;
const pendingRedirects = (registry.legacy_redirects || []).length - readyRedirects;
const notBuilt = target.filter((row) => row.state === 'NOT_BUILT').map((row) => row.path);

if (failures) process.exit(1);
console.log(
  `dashboard:navigation:check PASS — ${target.length} target entries, ${readyRedirects} redirects ready, ` +
  `${pendingRedirects} pending with declared blockers (${clearedRedirects} blocker-cleared, awaiting C13 retirement), ${notBuilt.length} workspaces not built` +
  `${notBuilt.length ? ` (${notBuilt.join(', ')})` : ''}; ` +
  `${navPaths.length} sidebar entries (${topLevelEntries} top level, ${nestedEntries} nested under Advanced System; ` +
  `${undecided.length} route(s) awaiting a destination decision); ` +
  `layout renders from ${rendersFromRegistry ? 'registry' : 'inline NAV'}; ` +
  `physical function target 276 unchanged`,
);
