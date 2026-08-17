#!/usr/bin/env node
// DASHBOARD-C12 (2026-08-17) — integration registration integrity.
//
// The defect this gate exists to prevent: the entity write becoming the trust decision
// again. Every server-side control in the OAuth flow is correct — oauthToken compares the
// client secret in constant time, oauthAuthorize validates the redirect URI against the
// stored allowlist and the requested scopes against the stored allowed_scopes — and every
// one of those reads a field that a generic CRUD call used to set.
//
// oauthAuthorize:77 is the sharpest case: `if (app.pkce_required && !code_challenge)`. PKCE
// is enforced only when the stored flag says so, so a caller able to write the entity could
// switch it off.
import fs from 'node:fs';
import process from 'node:process';

let failures = 0;
const fail = (m) => { console.error(`integration:check FAIL — ${m}`); failures += 1; };

const strip = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map((line) => line.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');

/**
 * Extracts a declared string array, THROWING if it finds none.
 *
 * A silent empty extraction is how a comparison check passes without comparing anything. It
 * happened while writing this chunk: two lists were reported as matching because both
 * extractions returned zero entries.
 */
const declaredList = (file, marker) => {
  const src = fs.readFileSync(file, 'utf8');
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`${marker} not found in ${file}`);
  const open = src.indexOf('[', start);
  const close = src.indexOf(']', open);
  const body = src.slice(open + 1, close);
  const found = [...body.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
  if (!found.length) throw new Error(`extracted 0 entries for ${marker} in ${file} — the check would be vacuous`);
  return found.sort();
};

const registryText = fs.readFileSync('base44/shared/integrationRegistryCore.ts', 'utf8');
const registry = strip(registryText);
const oauthPanel = strip(fs.readFileSync('src/components/admin/integrations/OAuthAppsPanel.jsx', 'utf8'));
const webhookTable = strip(fs.readFileSync('src/components/admin/integrations/WebhooksTable.jsx', 'utf8'));
const authorize = strip(fs.readFileSync('base44/functions/oauthAuthorize/entry.ts', 'utf8'));

// 1. The server owns every security-bearing field, and says why.
for (const field of ['client_id', 'client_secret_hash', 'pkce_required', 'status', 'is_first_party', 'owner_email']) {
  if (!new RegExp(`field: '${field}'`).test(registry)) {
    fail(`OAUTH_APP_SERVER_OWNED must claim ${field} — a caller that can set it decides the trust question`);
  }
}
// pkce_required must be forced, not defaulted.
if (!/pkce_required: true/.test(registry)) {
  fail('the registry must write pkce_required: true itself');
}
if ((registry.match(/OAUTH_APP_INPUT_FIELDS[\s\S]*?\]/) || [''])[0].includes('pkce_required')) {
  fail('pkce_required is accepted as input again — oauthAuthorize enforces PKCE only when this flag is set');
}
// The flag the gate protects must still be the one oauthAuthorize reads.
if (!/app\.pkce_required/.test(authorize)) {
  fail('oauthAuthorize no longer reads app.pkce_required — this gate is protecting the wrong field, so re-derive it');
}

// 2. Redirect URIs and webhook URLs are validated. Nothing validated them before.
for (const fn of ['validateRedirectUri', 'validateWebhookUrl']) {
  if (!registry.includes(`export function ${fn}`)) fail(`${fn} must exist`);
}
for (const needle of ["'https:'", 'BLOCKED_HOSTS', 'PRIVATE_IPV4']) {
  if (!registry.includes(needle)) fail(`URL validation must check ${needle}`);
}
if (!registryText.includes('169.254.169.254')) {
  fail('the blocked-host set must include the cloud metadata address');
}

// 3. Scopes come from the shared catalog, and the catalog is not duplicated a third time.
if (!registry.includes("from './apiScopeCatalog.ts'")) {
  fail('the registry must validate scopes against the shared catalog');
}
if (!/scope_not_in_catalog/.test(registry)) fail('an unknown scope must be refused by name');
if (!/privileged_scope_refused/.test(registry)) {
  fail('a third-party OAuth app must not be able to hold admin or platform scope');
}

// 4. The self-test list stays an INDEPENDENT second opinion, and the two must agree.
try {
  const catalog = declaredList('base44/shared/apiScopeCatalog.ts', 'VALID_SCOPES = Object.freeze');
  const selfTest = declaredList('base44/functions/runApiSelfTests/entry.ts', 'EXPECTED_SCOPES =');
  const onlyCatalog = catalog.filter((scope) => !selfTest.includes(scope));
  const onlySelfTest = selfTest.filter((scope) => !catalog.includes(scope));
  if (onlyCatalog.length || onlySelfTest.length) {
    fail(`the API scope catalog and runApiSelfTests disagree — catalog only: [${onlyCatalog}], self-test only: [${onlySelfTest}]`);
  }
  if (fs.readFileSync('base44/functions/runApiSelfTests/entry.ts', 'utf8').includes("from '../../shared/apiScopeCatalog.ts'")) {
    fail('runApiSelfTests must NOT import the catalog it checks — a self-test that imports its subject tests nothing');
  }
} catch (error) {
  fail(error.message);
}

// 5. The hard delete is gone and disabling is the operation.
if (/WebhookEndpoint\.delete\(/.test(webhookTable)) {
  fail('WebhooksTable.jsx hard-deletes a webhook again — that destroys the signing secret and the delivery history with no undo');
}
if (!registry.includes('hard_delete_refused')) {
  fail('the registry must refuse a hard delete by name and point at disable');
}
if (!/status: 'disabled'/.test(registry)) fail('disabling must set the status the entity already declares');
// Structural, plus a short phrase that survives string concatenation. A long exact phrase
// breaks on a line wrap or a `' + '` join, which fails on formatting rather than meaning.
for (const key of ['retained:', 'retention_note:', 'deleted: false']) {
  if (!registry.includes(key)) fail(`the disable path must report ${key} so "disabled" is not read as "gone"`);
}
if (!registryText.includes('disable is reversible')) {
  fail('the disable path must state that it is reversible, which is the reason it replaces a delete');
}

// 6. Neither panel writes the entity, and neither generates a credential any more.
for (const [name, source] of [['OAuthAppsPanel.jsx', oauthPanel], ['WebhooksTable.jsx', webhookTable]]) {
  if (/base44\.entities\.(OAuthApp|WebhookEndpoint)\.(create|update|delete)/.test(source)) {
    fail(`${name} writes the entity directly again`);
  }
  if (/crypto\.getRandomValues/.test(source)) {
    fail(`${name} generates a credential in the browser again — the server owns the secret so it can bind it to the row it writes`);
  }
}
// The secret must still be shown exactly once, which is the property worth keeping.
if (!registry.includes('secret_shown_once')) {
  fail('the plaintext secret must be returned once and declared as such');
}


// ---------------------------------------------------------------------------
// DASHBOARD-C15 — the last three browser writes, and what each was really doing.
// ---------------------------------------------------------------------------
const platformText = fs.readFileSync('base44/shared/platformAdminCore.ts', 'utf8');
const platform = strip(platformText);
const orgPanel = strip(fs.readFileSync('src/components/admin/integrations/OrganizationsPanel.jsx', 'utf8'));
const appDetail = strip(fs.readFileSync('src/components/admin/AdminApplicationDetail.jsx', 'utf8'));
const userDetail = strip(fs.readFileSync('src/pages/admin/AdminUserDetail.jsx', 'utf8'));
const organizationEntity = JSON.parse(fs.readFileSync('base44/entities/Organization.jsonc', 'utf8'));

// 7. Plan terms are server-side, and the browser no longer holds the mapping. These three
// fields are ENFORCED in production, so a caller-supplied value grants itself capacity.
if (!platform.includes('PLAN_CATALOG')) fail('the plan catalogue must live server-side');
for (const field of ['monthly_api_quota', 'overage_price_per_1k', 'rate_limit_per_minute']) {
  if (!new RegExp(`field: '${field}'`).test(platform)) {
    fail(`ORGANIZATION_SERVER_OWNED must claim ${field} — apiV1, mcpServer and apiUsageBilling enforce it`);
  }
}
if (/quota:\s*\d/.test(orgPanel) || /overage:\s*[\d.]/.test(orgPanel)) {
  fail('OrganizationsPanel.jsx holds plan terms in the browser again — those numbers gate API access and bill overage');
}

// 8. There is no suspended state. The panel used to offer one.
const statuses = organizationEntity.properties?.billing_status?.enum || [];
if (statuses.includes('suspended')) {
  fail('Organization.billing_status now has a suspended state — re-derive this check and the cancel wording, which exists because it did NOT');
}
if (/Suspend this organization/.test(orgPanel)) {
  fail('OrganizationsPanel.jsx offers a "suspend" again — billing_status has no suspended value, so it writes canceled');
}
if (!platform.includes('cancelOrganization') || !/reversible: false/.test(platform)) {
  fail('cancelling must be named cancel and must state that it is terminal');
}

// 9. A note author is the authenticated actor, never a literal.
if (!platform.includes('unidentified_author')) {
  fail('recordAdminNote must refuse when there is no identified author');
}
for (const [name, source] of [['AdminApplicationDetail.jsx', appDetail], ['AdminUserDetail.jsx', userDetail]]) {
  if (/author:\s*[a-zA-Z?.]*\s*\|\|\s*["']/.test(source)) {
    fail(`${name} falls back to a literal note author again — an unknown author stored as a name is indistinguishable from a real one`);
  }
  if (/entities\.AdminNote\.create/.test(source)) fail(`${name} writes AdminNote directly again`);
}

// 10. DealApplication stays retired.
if (/entities\.DealApplication\.(create|update)/.test(appDetail)) {
  fail('AdminApplicationDetail.jsx writes DealApplication again — the pipeline registry declares it ZERO_PRODUCERS');
}
if (!platform.includes('deal_application_retired')) {
  fail('a DealApplication write must be refused by name with the registry evidence');
}

if (failures) process.exit(1);
console.log(
  'integration:check PASS — the server owns client_id, the secret, pkce_required, status, ' +
  'is_first_party and owner_email with reasons; pkce_required is forced true and still the flag ' +
  'oauthAuthorize reads; redirect and webhook URLs are https-only and refuse loopback, private and ' +
  'metadata hosts; scopes validate against the one shared catalog with privileged scopes refused; ' +
  'runApiSelfTests stays an independent second opinion that agrees with it; the webhook hard delete ' +
  'is refused in favour of disable; neither panel writes an entity or mints a credential; ' +
  'organization plan terms are server-side and the enforced fields are server-owned, cancelling is ' +
  'named cancel and states it is terminal because there is no suspended state, a note author is the ' +
  'authenticated actor with no literal fallback, and DealApplication stays retired',
);
