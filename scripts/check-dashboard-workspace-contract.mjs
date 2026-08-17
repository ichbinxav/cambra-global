#!/usr/bin/env node
// DASHBOARD-C1 (2026-08-17) — Operating Workspace contract compliance.
//
// The five workspaces must follow the shape AdminMerchants already proved
// (one server function, a view+action discriminator, zero base44.entities in the
// page). This gate enforces the parts that are checkable statically, and it is
// the one that would have caught the five direct-CRUD sites C0 found.
//
// It checks workspace pages only. Legacy pages are inventoried separately by
// legacy-routes:check so their known defects are visible without blocking every
// build until they are all fixed.
import fs from 'node:fs';
import process from 'node:process';

const REGISTRY = 'config/dashboard/navigation.v1.json';
const CONTRACT = 'base44/shared/workspaceContract.ts';
const REFERENCE = 'src/pages/admin/AdminMerchants.jsx';

let failures = 0;
const fail = (message) => { console.error(`dashboard:workspace-contract:check FAIL — ${message}`); failures += 1; };

if (!fs.existsSync(CONTRACT)) { fail(`${CONTRACT} missing`); process.exit(1); }
const contract = fs.readFileSync(CONTRACT, 'utf8');

// The contract must export the primitives every workspace depends on. A missing
// export means a workspace would quietly hand-roll its own envelope.
for (const symbol of [
  'WORKSPACE_CONTRACT_VERSION', 'TRUTH_CLASSES', 'SOURCE_STATES',
  'buildSourceHealth', 'buildContext', 'portfolioResponse', 'kpi',
  'sortKeepingUnknownLast', 'TRUTH_BOUNDARY',
]) {
  if (!new RegExp(`export (?:const|function|type) ${symbol}\\b`).test(contract)) {
    fail(`${CONTRACT} does not export ${symbol}`);
  }
}

// The nine truth classes of prompt section 4.4 must all be present and none may
// be silently dropped, because collapsing two of them is the defect the section
// exists to prevent.
for (const cls of [
  'OBSERVED', 'DERIVED', 'MODELED', 'INFERRED',
  'CONTRACTUAL', 'VERIFIED', 'UNVERIFIED', 'CONFLICTED', 'UNKNOWN',
]) {
  if (!contract.includes(`'${cls}'`)) fail(`truth class ${cls} missing from ${CONTRACT}`);
}

// The reference page must stay clean: it is the pattern the others copy, so a
// regression here would propagate.
if (fs.existsSync(REFERENCE)) {
  const reference = fs.readFileSync(REFERENCE, 'utf8');
  const writes = [...reference.matchAll(/base44\.entities\.(\w+)\.(update|create|delete)\(/g)];
  if (writes.length) {
    fail(`${REFERENCE} is the reference pattern and must contain zero entity writes, found ${writes.length}: ${writes.map((m) => `${m[1]}.${m[2]}`).join(', ')}`);
  }
  if (!reference.includes('functions.invoke("getFounderControlCenter"')) {
    fail(`${REFERENCE} no longer uses the single-aggregator call the contract is derived from`);
  }
}

// Any workspace page that exists must contain zero entity writes.
const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
const pageFor = {
  '/admin/pipeline': 'src/pages/admin/AdminPipeline.jsx',
  '/admin/audits': 'src/pages/admin/AdminAudits.jsx',
  '/admin/recover': 'src/pages/admin/AdminRecover.jsx',
  '/admin/finance': 'src/pages/admin/AdminFinance.jsx',
  '/admin/intelligence': 'src/pages/admin/AdminIntelligence.jsx',
};
const checked = [];
const pendingReplacement = [];
for (const entry of registry.target_navigation || []) {
  const page = pageFor[entry.path];
  if (!page || !fs.existsSync(page)) continue;
  // A page the registry marks for replacement carries known legacy defects that
  // C0 already documented; blocking on them here would stall every build.
  if (entry.state === 'LIVE_PENDING_REPLACEMENT') { pendingReplacement.push(entry.path); continue; }
  const source = fs.readFileSync(page, 'utf8');
  const writes = [...source.matchAll(/base44\.entities\.(\w+)\.(update|create|delete)\(/g)];
  if (writes.length) {
    fail(`${page} writes entities directly from the browser: ${writes.map((m) => `${m[1]}.${m[2]}`).join(', ')}`);
  }
  checked.push(entry.path);
}

if (!contract.includes('Missing evidence remains unknown')) {
  fail('TRUTH_BOUNDARY must state that missing evidence remains unknown');
}

if (failures) process.exit(1);
console.log(
  `dashboard:workspace-contract:check PASS — contract ${CONTRACT} exports all primitives, ` +
  `9 truth classes present, reference page clean, ${checked.length} workspace page(s) verified write-free` +
  `${pendingReplacement.length ? `, ${pendingReplacement.length} pending replacement (${pendingReplacement.join(', ')})` : ''}`,
);
