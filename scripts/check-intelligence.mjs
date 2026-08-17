#!/usr/bin/env node
// DASHBOARD-C10 (2026-08-17) — Intelligence workspace and pricing promotion integrity.
//
// The invariant that must never rot: a detected source change is not a price. The
// watcher observes that a provider's pricing page changed; nothing in that observation
// contains a number. If any path can turn one into a ProviderPricingVersion, CAMBRA
// starts recommending prices it invented.
//
// The second invariant: promotion is additive. A corrected price never erases the price
// that was true last month, because decisions were made on it.
import fs from 'node:fs';
import process from 'node:process';

let failures = 0;
const fail = (m) => { console.error(`intelligence:check FAIL — ${m}`); failures += 1; };

// Structural checks read CODE, not comments — a comment naming a required pattern must
// not be able to satisfy a check. Checks that assert an explanation exists use the raw
// text and say so.
const strip = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map((line) => line.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');

/**
 * Collapses whitespace and comment markers so a prose assertion is not defeated by a
 * line wrap. Asserting on an exact multi-word phrase across a wrapped comment fails on
 * formatting rather than on meaning, which trains people to delete the check.
 */
const prose = (source) => source.replace(/^\s*\*\s?/gm, ' ').replace(/\s+/g, ' ');
let providerProse = () => '';

const promotionText = fs.readFileSync('base44/shared/intelligencePromotionCore.ts', 'utf8');
const promotionProse = prose(promotionText);
const promotion = strip(promotionText);
const workspace = strip(fs.readFileSync('base44/shared/intelligenceWorkspaceCore.ts', 'utf8'));
const watcher = strip(fs.readFileSync('base44/functions/rateIntelligenceWatchWorker/entry.ts', 'utf8'));
const maintenance = strip(fs.readFileSync('base44/functions/intelligenceMaintenanceWorker/entry.ts', 'utf8'));
const p3Backend = strip(fs.readFileSync('base44/shared/p3RateIntelligence.ts', 'utf8'));

// 1. The unstructured refusal must exist and must be unconditional.
if (!promotion.includes('UNSTRUCTURED_CHANGE_ONLY')) {
  fail('the promotion core must recognise the watcher\'s unstructured extraction status');
}
if (!/promotable: false/.test(promotion)) {
  fail('the promotion core must be able to return a non-promotable verdict');
}
// The refusal must be reached BEFORE any promotion logic. If canAutoPromote appears
// before the unstructured guard, a reordering has put the guard behind a branch.
const guardAt = promotion.indexOf('UNPROMOTABLE_EXTRACTION ||');
const autoAt = promotion.indexOf('canAutoPromote(');
if (guardAt === -1) fail('the unstructured guard must test the extraction status directly');
else if (autoAt !== -1 && autoAt < guardAt) {
  fail('canAutoPromote is reached before the unstructured guard — a changed page could become a price');
}
// apply must refuse a non-promotable candidate rather than trusting a supplied hash.
if (!/candidate_not_promotable/.test(promotion)) {
  fail('previewPromotion must refuse a non-promotable candidate by name');
}

// 2. Promotion is additive. History is never mutated.
for (const needle of ['supersedes_observation_id', 'superseded_by_observation_id', "status: 'SUPERSEDED'"]) {
  if (!promotion.includes(needle)) fail(`promotion must supersede rather than mutate: ${needle} missing`);
}
if (!promotionProse.includes('does not erase the price that was true last month')) {
  fail('the supersede-not-mutate rule must state why, or it reads as bookkeeping');
}
// A promoted observation is never born verified.
if (!/verification_status: 'RESEARCHED'/.test(promotion)) {
  fail('a promoted observation must not be created as VERIFIED — verification is a separate act');
}

// 3. A change to verified pricing raises a conflict rather than writing silently.
if (!promotion.includes('KnowledgeConflict')) {
  fail('superseding VERIFIED pricing must raise a KnowledgeConflict for impact review');
}
if (!/supersedes_verified_pricing/.test(promotion)) {
  fail('the verified-supersession case must carry its own reason code');
}

// 4. The copy-only rule, and the two C10 findings about how it was implemented.
if (!promotion.includes('economicFingerprint')) {
  fail('the copy-only rule needs a fingerprint over economic dimensions');
}
if (/source_snapshot_id/.test(promotion.split('export async function economicFingerprint')[1]?.split('export ')[0] || '')) {
  fail('economicFingerprint must NOT include source_snapshot_id — that is what defeats the copy-only property');
}
if (!/copy_only_change/.test(promotion)) fail('a copy-only change must be rejected by name');

// 5. The watcher must stay honest: no auto-promotion from unstructured text.
if (!watcher.includes('NO_DETERMINISTIC_RATE_EXTRACTION_PROMOTION')) {
  fail('rateIntelligenceWatchWorker must keep declaring that it does not promote from text');
}
if (/ProviderPricingVersion\.(create|update)/.test(watcher)) {
  fail('rateIntelligenceWatchWorker must never write pricing truth directly');
}

// 6. The maintenance worker stays projection-only for legacy pricing (P3 cutover).
if (/ProviderPricingVersion\.(create|update)/.test(maintenance)) {
  fail('intelligenceMaintenanceWorker became a pricing writer again — the P3 cutover made it projection-only');
}

// 7. canAutoPromote must actually be called now. It was dead code before C10, which is
// how a promotion gate ends up guarding nothing.
if (!p3Backend.includes('export function canAutoPromote')) {
  fail('the promotion predicate must stay in the backend module');
}
if (autoAt === -1) {
  fail('canAutoPromote is not called — the promotion predicate is dead code again');
}

// 8. The workspace stays a projection: no new authority, and a count is null when its
// source failed rather than zero.
if (/\.create\(|\.update\(/.test(workspace)) {
  fail('the Intelligence workspace projection must not write — C0 set it PROJECTION_ONLY');
}
if (!workspace.includes('available(') || !/: null/.test(workspace)) {
  fail('an unreadable source must project null, not zero');
}
if (!workspace.includes('is_demo')) {
  fail('demo pricing rows must be excluded from coverage counts');
}

// 9. Every intelligence redirect must point at a tab that exists. This caught two real
// drifts in C10: /admin/providers had no tab, and /admin/growth is declared a VIEW of
// markets rather than a tab. A redirect to a tab the workspace does not serve lands the
// operator on a blank page.
const registry = JSON.parse(fs.readFileSync('config/dashboard/navigation.v1.json', 'utf8'));
const declaredTabs = [...(workspace.match(/key: '([a-z-]+)'/g) || [])].map((m) => m.slice(6, -1));
for (const row of registry.legacy_redirects || []) {
  if (row.to !== '/admin/intelligence') continue;
  const tab = row.query?.tab;
  if (!tab) fail(`${row.from} redirects to Intelligence with no tab`);
  else if (!declaredTabs.includes(tab)) {
    fail(`${row.from} redirects to Intelligence tab "${tab}", which INTELLIGENCE_TABS does not declare`);
  }
  const view = row.query?.view;
  if (view && !workspace.includes(`'${view}'`)) {
    fail(`${row.from} redirects to view "${view}", which the tab registry does not declare`);
  }
}

// 10. DASHBOARD-C11 — the governed Provider registry, and the shadow-rate protection.
const providerText = fs.readFileSync('base44/shared/providerRegistryCore.ts', 'utf8');
providerProse = () => prose(providerText);
const provider = strip(providerText);
const providersPage = strip(fs.readFileSync('src/pages/admin/AdminProviders.jsx', 'utf8'));
const entity = JSON.parse(fs.readFileSync('base44/entities/Provider.jsonc', 'utf8'));

if (/revenue_share_pct/.test(provider.split('PROVIDER_EDITABLE_FIELDS')[1]?.split(']')[0] || '')) {
  fail('revenue_share_pct must not be an editable provider field — it is an unbound duplicate of ProviderRevenueLedger.rate_bps');
}
if (!provider.includes('PROVIDER_PROTECTED_FIELDS')) {
  fail('the provider handler must declare which fields it refuses');
}
if (!providerProse().includes('agreement_terms_hash')) {
  fail('the revenue_share_pct refusal must name the agreement-bound field that IS authoritative');
}
// The handler's enums must match the entity's, or the handler refuses valid input. Getting
// this wrong is easy: the first version of PROVIDER_CATEGORIES invented 'other' and
// dropped 'insurance' and 'logistics', both of which the page already offers.
for (const [constName, prop] of [['PROVIDER_CATEGORIES', 'category'], ['PROVIDER_API_STATUSES', 'api_status']]) {
  const declared = (provider.split(constName)[1] || '').split(']')[0];
  for (const value of entity.properties?.[prop]?.enum || []) {
    if (!declared.includes(`'${value}'`)) {
      fail(`${constName} is missing "${value}", which Provider.jsonc's ${prop} enum allows — the handler would refuse valid input`);
    }
  }
}
// The page must not write the entity, and must not send back the whole row.
if (/base44\.entities\.Provider\.(create|update)/.test(providersPage)) {
  fail('AdminProviders.jsx writes Provider directly again');
}
if (/setForm\(p\)/.test(providersPage)) {
  fail('AdminProviders.jsx copies the whole provider row into the form — the patch would carry protected and read-only fields and be refused on every save');
}
if (/parseFloat\([^)]*\)\s*\|\|\s*0/.test(providersPage)) {
  fail('AdminProviders.jsx coerces a rate with `|| 0` again — an empty field is not a 0% revenue share');
}

// 11. The stale governance claim must stay corrected, not quietly deleted.
const p12 = fs.readFileSync('src/docs/P12_INTELLIGENCE_ARCHITECTURE.md', 'utf8');
if (!p12.includes('Corrected DASHBOARD-C10')) {
  fail('the P12 doc claim about intelligenceMaintenanceWorker versioning pricing must stay corrected');
}
if (!p12.includes('intelligencePromotionCore')) {
  fail('the P12 doc must name the path that actually creates a pricing version');
}

if (failures) process.exit(1);
console.log(
  'intelligence:check PASS — an unstructured source change can never be promoted and the guard runs ' +
  'before any promotion logic, promotion supersedes without mutating history and is never born ' +
  'VERIFIED, superseding verified pricing raises a conflict, the copy-only rule uses an economic ' +
  'fingerprint that excludes the snapshot id, the watcher and the maintenance worker write no ' +
  'pricing truth, canAutoPromote is wired rather than dead, the workspace projects null for an ' +
  'unreadable source, and the corrected P12 claim names the real creator',
);
