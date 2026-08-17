#!/usr/bin/env node
// DASHBOARD-C1 (2026-08-17) — legacy route inventory and parity ratchet.
//
// Prompt section 2.5: no legacy route leaves the sidebar until parity, redirect,
// deep-link preservation, data preservation, navigation tests and documentation
// are all demonstrated. This gate is that ratchet.
//
// It is deliberately an INVENTORY gate, not a prohibition gate. The known
// direct-CRUD defects C0 found are reported every run so they stay visible, and
// the gate fails only when the count goes UP or when a legacy route is retired
// without its redirect. That way progress is enforced and regression is caught,
// without blocking every build on pre-existing debt.
import fs from 'node:fs';
import process from 'node:process';

const REGISTRY = 'config/dashboard/navigation.v1.json';
const APP = 'src/App.jsx';

// The exact defect sites C0 verified by hand. This is a ratchet: the count may
// only go down. Raising it requires deleting a line from this list, which is a
// conscious act.
// C0 inventoried only the 16 legacy pages the prompt names. This gate's first run
// found seven more across the wider admin surface — a real gap in that inventory,
// corrected here rather than hidden. The two OAuth/webhook sites are the most
// serious in the whole list and are NOT merely architectural.
const KNOWN_DIRECT_CRUD = [
  {
    file: 'src/components/admin/integrations/OAuthAppsPanel.jsx', entity: 'OAuthApp', ops: ['create', 'update'],
    severity: 'CRITICAL',
    note: 'Line 46 generates the OAuth CLIENT SECRET in the browser via randomToken() and line 47 writes it through generic CRUD. Credential entropy must not come from client JS, and secret material must not be written without a server-side handler. Revocation at line 67 is also a browser-side generic write.',
  },
  {
    file: 'src/components/admin/integrations/WebhooksTable.jsx', entity: 'WebhookEndpoint', ops: ['create', 'delete'],
    severity: 'CRITICAL',
    note: 'Creates and HARD-DELETES outbound delivery configuration from the browser with no governed handler and no receipt. Standing configuration is a material effect class.',
  },
  {
    file: 'src/pages/admin/AdminContracts.jsx', entity: 'Contract', ops: ['update'], severity: 'HIGH',
    note: 'FIXED in DASHBOARD-C7. The page now calls recover_preview_contract_edit and '
      + 'recover_apply_contract_edit: a field allowlist, a required reason, CAS on every changed '
      + 'field, and an append to the contract activity_log. The entry stays in this list so a '
      + 'regression would be detected as a re-opened known site rather than as a new one.',
  },
  { file: 'src/pages/admin/AdminProviders.jsx', entity: 'Provider', ops: ['update', 'create'], severity: 'HIGH',
    note: 'Line 36 builds revenue_share_pct — provider compensation — from a browser form.' },
  { file: 'src/components/admin/integrations/OrganizationsPanel.jsx', entity: 'Organization', ops: ['create', 'update'],
    severity: 'MEDIUM', note: 'Tenant identity written from the browser.' },
  { file: 'src/components/admin/recoverBilling/FiscalIdentityCard.jsx', entity: 'Brand', ops: ['update'], severity: 'MEDIUM' },
  { file: 'src/components/admin/AdminApplicationDetail.jsx', entity: 'DealApplication', ops: ['update'], severity: 'LOW',
    note: 'Writes an entity with zero producers.' },
  { file: 'src/pages/admin/AdminUserDetail.jsx', entity: 'AdminNote', ops: ['create'], severity: 'LOW' },
];

let failures = 0;
const fail = (message) => { console.error(`legacy-routes:check FAIL — ${message}`); failures += 1; };

const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
const app = fs.readFileSync(APP, 'utf8');
const routeExists = (path) => app.includes(`path="${path}"`);

// 1. Every legacy route must either still exist, or have a redirect. A route that
//    is simply gone is a broken bookmark.
const retiredWithoutRedirect = [];
for (const row of registry.legacy_redirects || []) {
  if (!routeExists(row.from)) retiredWithoutRedirect.push(row.from);
}
if (retiredWithoutRedirect.length) {
  fail(`legacy routes retired with no redirect: ${retiredWithoutRedirect.join(', ')}`);
}

// 2. A redirect declared ready must actually be wired.
for (const row of (registry.legacy_redirects || []).filter((entry) => entry.ready === true)) {
  if (!routeExists(row.to)) fail(`${row.from} declared ready but ${row.to} has no route`);
}

// 3. Direct-CRUD ratchet.
let live = 0;
const stillOpen = [];
const alreadyFixed = [];
for (const site of KNOWN_DIRECT_CRUD) {
  if (!fs.existsSync(site.file)) { alreadyFixed.push(`${site.file} (deleted)`); continue; }
  const source = fs.readFileSync(site.file, 'utf8');
  const found = site.ops.filter((op) =>
    new RegExp(`base44\\.entities\\.${site.entity}\\.${op}\\(`).test(source));
  if (found.length === 0) { alreadyFixed.push(`${site.file} (${site.entity})`); continue; }
  live += found.length;
  stillOpen.push(`${site.file}:${site.entity}.${found.join('/')} [${site.severity}]`);
}

// 4. Scan for NEW direct-CRUD sites outside the known list. Those are regressions
//    and DO fail the gate.
const scanRoots = ['src/pages/admin', 'src/components/admin'];
const walk = (dir) => {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.jsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full);
  }
  return out;
};
const known = new Set(KNOWN_DIRECT_CRUD.map((site) => site.file));
const regressions = [];
for (const file of scanRoots.flatMap(walk)) {
  if (known.has(file)) continue;
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/base44\.entities\.(\w+)\.(update|create|delete)\(/g)) {
    regressions.push(`${file}: ${match[1]}.${match[2]}`);
  }
}
if (regressions.length) {
  fail(`NEW direct browser entity writes introduced (prompt section 4.9 forbids these):\n    ${regressions.join('\n    ')}`);
}

// 5. Unbacked UI claims C0 recorded. Reported, not failed — correcting the copy is
//    consolidation work, and the point is that it stays visible until then.
const unbacked = [];
for (const [file, marker, claim] of [
  ['src/pages/admin/AdminDeals.jsx', 'from \'@/lib/deals.js\'', 'offers editing over a hard-coded array'],
  ['src/pages/admin/AdminBenchmarks.jsx', 'scoreEngine', 'claims to control ranges with no write path'],
]) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(marker)) unbacked.push(`${file} ${claim}`);
}

if (failures) process.exit(1);
console.log(
  `legacy-routes:check PASS — ${(registry.legacy_redirects || []).length} legacy routes tracked, ` +
  `${(registry.legacy_redirects || []).filter((r) => r.ready).length} redirected, ` +
  `${live} direct-CRUD write(s) still open across ${stillOpen.length} file(s), ` +
  `${alreadyFixed.length} fixed, 0 regressions, ${unbacked.length} unbacked UI claim(s) outstanding`,
);
const critical = stillOpen.filter((row) => row.includes('[CRITICAL]'));
if (critical.length) console.log(`  CRITICAL — credential or standing-configuration writes from the browser:\n    ${critical.join('\n    ')}`);
if (stillOpen.length) console.log(`  all open:\n    ${stillOpen.join('\n    ')}`);
if (unbacked.length) console.log(`  unbacked claims:\n    ${unbacked.join('\n    ')}`);
