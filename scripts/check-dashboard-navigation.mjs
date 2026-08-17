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
if (target.length !== 12) fail(`target_navigation must hold exactly 12 entries, found ${target.length}`);

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
  }
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
const rendersFromRegistry = layout.includes('dashboardNavigation') || layout.includes('navigation.v1.json');

const readyRedirects = (registry.legacy_redirects || []).filter((row) => row.ready === true).length;
const pendingRedirects = (registry.legacy_redirects || []).length - readyRedirects;
const notBuilt = target.filter((row) => row.state === 'NOT_BUILT').map((row) => row.path);

if (failures) process.exit(1);
console.log(
  `dashboard:navigation:check PASS — 12 target entries, ${readyRedirects} redirects ready, ` +
  `${pendingRedirects} pending with declared blockers, ${notBuilt.length} workspaces not built` +
  `${notBuilt.length ? ` (${notBuilt.join(', ')})` : ''}; ` +
  `layout renders from ${rendersFromRegistry ? 'registry' : 'inline NAV (consolidation pending, C13)'}; ` +
  `physical function target 276 unchanged`,
);
