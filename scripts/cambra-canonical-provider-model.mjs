import fs from "node:fs";
import path from "node:path";
import { forProvidersLocaleMapping } from "./forproviders-locale-mapping.mjs";

const root = process.cwd();
const changed = [];
const pending = new Map();

function read(rel) {
  if (pending.has(rel)) return pending.get(rel);
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function write(rel, value) {
  const before = read(rel);
  if (before === value) return;
  pending.set(rel, value);
  if (!changed.includes(rel)) changed.push(rel);
}

function replaceUnique(source, needle, replacement, label) {
  const matches = typeof needle === "string"
    ? source.split(needle).length - 1
    : [...source.matchAll(new RegExp(needle.source, needle.flags.includes("g") ? needle.flags : `${needle.flags}g`))].length;
  if (matches !== 1) throw new Error(`${label}: expected exactly one match, found ${matches}`);
  return source.replace(needle, replacement);
}

function replacePropertyLine(source, key, value, rel) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^(\\s*)${escaped}\\s*:\\s*.*,$`, "m");
  const matches = source.match(new RegExp(re.source, "gm")) || [];
  if (matches.length !== 1) throw new Error(`${rel}:${key}: expected one property line, found ${matches.length}`);
  return source.replace(re, (_, indent) => `${indent}${key}: ${JSON.stringify(value)},`);
}

// Public provider-program copy in every supported locale.
for (const [locale, values] of Object.entries(forProvidersLocaleMapping)) {
  const rel = `src/lib/locales/${locale}.js`;
  let source = read(rel);
  for (const [key, value] of Object.entries(values)) {
    source = replacePropertyLine(source, key, value, rel);
  }
  write(rel, source);
}

// Keep the implementation note aligned with what the page actually promises.
{
  const rel = "src/pages/ForProviders.jsx";
  let source = read(rel);
  const oldHeader = `// ForProviders v2 — provider program page. PAPER-FIRST (Chunk 1d).
//
// Two-tier model:
//   Nivel 1 · Listed → provider publishes public pricing → enters CAMBRA's
//     achievable benchmark (PaymentsRateTable, verified=true, source_url +
//     source_quote citable). Auditability rule non-negotiable.
//   Nivel 2 · Partner → provider offers an EXCLUSIVE rate for merchants
//     arriving via CAMBRA (better than public) + referral agreement. Shown
//     on /Results as a labeled "CAMBRA exclusive offer" — NEVER folded into
//     the public benchmark. Benchmark stays 100% public and auditable.
//
// This page has ZERO fabricated network figures (no "X merchants
// connected"). If we need social proof we say "founding cohort in progress".
`;
  const newHeader = `// ForProviders v3 — provider cooperation page. PAPER-FIRST.
//
// Two opt-in routes:
//   Nivel 1 · Listed → source-linked public pricing enters the achievable benchmark.
//   Nivel 2 · Partner → the PSP submits one preferred indicative rate or a
//     cohort/tier matrix. Every rate remains subject to underwriting, merchant
//     eligibility and the PSP's final written approval.
// The PSP contracts with and invoices the merchant directly. CAMBRA receives no
// PSP commission, referral fee, revenue share or other compensation. Merchant
// identity is disclosed only after specific consent and written acknowledgement
// of the Opportunity ID. Any 18-month protection exists only in a signed agreement.
//
// This page has ZERO fabricated network figures (no "X merchants
// connected"). If we need social proof we say "founding cohort in progress".
`;
  source = replaceUnique(source, oldHeader, newHeader, `${rel}:header`);
  write(rel, source);
}

const legalSection9 = {
  en: "CAMBRA operates a provider cooperation programme described on our For Providers page (/ForProviders). Listed providers may appear in the public benchmark using source-linked public pricing. A Partner PSP may instead submit one preferred indicative rate or a cohort/tier matrix by country, channel, sector, processing volume, average ticket and payment mix. Those terms are not a general price promise: they remain subject to the PSP's underwriting, merchant eligibility and final written approval. The PSP quotes, contracts with and invoices the merchant directly. CAMBRA receives no commission, referral fee, revenue share or other compensation from the PSP, and no provider may buy ranking or influence a recommendation. Before revealing a merchant's identity, CAMBRA obtains merchant-specific consent, sends an anonymised summary with an Opportunity ID and seeks the PSP's written acknowledgement. Any 18-month opportunity protection, including affiliates and indirect routes, applies only if expressly set out in a signed agreement. Until a PSP contract is signed, CAMBRA does not describe itself as that PSP's ISO, reseller, agent or authorised representative.",
  es: "CAMBRA opera un programa de colaboración con proveedores descrito en nuestra página For Providers (/ForProviders). Los proveedores Listed pueden aparecer en el benchmark público mediante tarifas públicas enlazadas a su fuente. Un PSP Partner puede, en su lugar, presentar una tarifa preferente indicativa o una matriz por cohorte o tramo según país, canal, sector, volumen procesado, ticket medio y mix de pagos. Esas condiciones no constituyen una promesa general de precio: quedan sujetas al underwriting del PSP, a la elegibilidad del comercio y a su aprobación final por escrito. El PSP cotiza, contrata y factura directamente al comercio. CAMBRA no recibe del PSP comisión, pago por recomendación, participación en ingresos ni ninguna otra compensación, y ningún proveedor puede comprar posicionamiento o influir en una recomendación. Antes de revelar la identidad de un comercio, CAMBRA obtiene su consentimiento específico, envía un resumen anonimizado con un Opportunity ID y solicita el acuse de recibo escrito del PSP. Cualquier protección de la oportunidad durante 18 meses, incluidas filiales y vías indirectas, solo se aplica si está prevista expresamente en un acuerdo firmado. Hasta que exista un contrato firmado con un PSP, CAMBRA no se presenta como ISO, reseller, agente ni representante autorizado de ese PSP.",
  fr: "CAMBRA exploite un programme de coopération avec les prestataires, décrit sur notre page For Providers (/ForProviders). Les prestataires Listed peuvent figurer dans le benchmark public au moyen de tarifs publics reliés à leur source. Un PSP Partner peut à la place soumettre un tarif préférentiel indicatif ou une matrice par cohorte ou palier selon le pays, le canal, le secteur, le volume traité, le panier moyen et le mix de paiements. Ces conditions ne constituent pas une promesse générale de prix : elles restent soumises à l'underwriting du PSP, à l'éligibilité du commerçant et à son approbation écrite définitive. Le PSP établit l'offre, conclut le contrat avec le commerçant et le facture directement. CAMBRA ne reçoit du PSP aucune commission, rémunération d'apport, participation aux revenus ni autre contrepartie, et aucun prestataire ne peut acheter un classement ou influencer une recommandation. Avant de révéler l'identité d'un commerçant, CAMBRA obtient son consentement spécifique, envoie un résumé anonymisé avec un Opportunity ID et demande l'accusé de réception écrit du PSP. Toute protection de l'opportunité pendant 18 mois, y compris les sociétés affiliées et les voies indirectes, ne s'applique que si elle est expressément prévue dans un accord signé. Tant qu'un contrat avec un PSP n'est pas signé, CAMBRA ne se présente pas comme l'ISO, le revendeur, l'agent ou le représentant autorisé de ce PSP.",
};

const legalMeta = {
  en: { updated: "Last updated: 10 September 2026", title: "9. Provider cooperation programme" },
  es: { updated: "Última actualización: 10 de septiembre de 2026", title: "9. Programa de colaboración con proveedores" },
  fr: { updated: "Dernière mise à jour : 10 septembre 2026", title: "9. Programme de coopération avec les prestataires" },
};

for (const locale of ["en", "es", "fr"]) {
  const rel = `src/content/legal/${locale}/terms.js`;
  let source = read(rel);
  source = source.replace(/^  version: ".*",$/m, '  version: "2026-09-10",');
  source = source.replace(/^  lastUpdated: ".*",$/m, `  lastUpdated: ${JSON.stringify(legalMeta[locale].updated)},`);
  const section = `    { title: ${JSON.stringify(legalMeta[locale].title)}, content: ${JSON.stringify(legalSection9[locale])} },`;
  source = replaceUnique(source, /^    \{ title: "9\.[^\n]+$/m, section, `${rel}:section9`);
  write(rel, source);
}

// Canonical product policy: provider economics are merchant pricing only.
{
  const rel = "config/product-policy.json";
  const policy = JSON.parse(read(rel));
  policy.policyVersion = "2026.09.10-provider-no-compensation";
  policy.effectiveDate = "2026-09-10";
  policy.providerProgram = {
    pspCompensationAccepted: false,
    pspContractsMerchantDirectly: true,
    pspInvoicesMerchantDirectly: true,
    pricingModes: ["preferred_rate", "cohort_or_tier_matrix"],
    indicativeUntilWrittenPspApproval: true,
    merchantConsentBeforeIdentityDisclosure: true,
    writtenOpportunityAcknowledgementRequired: true,
    proposedProtectionMonths: 18,
  };
  write(rel, `${JSON.stringify(policy, null, 2)}\n`);
}

{
  const rel = "src/lib/productPolicySchema.js";
  let source = read(rel);
  const anchor = `    supportedChannels: z.object({
      onlinePsp: z.boolean(),
      inStoreTpv: z.boolean(),
    }),
    integrationStatus: z.object({`;
  const replacement = `    supportedChannels: z.object({
      onlinePsp: z.boolean(),
      inStoreTpv: z.boolean(),
    }),
    providerProgram: z.object({
      pspCompensationAccepted: z.literal(false),
      pspContractsMerchantDirectly: z.literal(true),
      pspInvoicesMerchantDirectly: z.literal(true),
      pricingModes: z.tuple([
        z.literal("preferred_rate"),
        z.literal("cohort_or_tier_matrix"),
      ]),
      indicativeUntilWrittenPspApproval: z.literal(true),
      merchantConsentBeforeIdentityDisclosure: z.literal(true),
      writtenOpportunityAcknowledgementRequired: z.literal(true),
      proposedProtectionMonths: z.literal(18),
    }),
    integrationStatus: z.object({`;
  source = replaceUnique(source, anchor, replacement, `${rel}:providerProgram schema`);
  const exportAnchor = `    "export const SUPPORTED_CHANNELS = PRODUCT_POLICY.supportedChannels;",
    "export const INTEGRATION_STATUS = PRODUCT_POLICY.integrationStatus;",`;
  const exportReplacement = `    "export const SUPPORTED_CHANNELS = PRODUCT_POLICY.supportedChannels;",
    "export const PROVIDER_PROGRAM_POLICY = PRODUCT_POLICY.providerProgram;",
    "export const INTEGRATION_STATUS = PRODUCT_POLICY.integrationStatus;",`;
  source = replaceUnique(source, exportAnchor, exportReplacement, `${rel}:providerProgram export`);
  const helperAnchor = `    "export function getAnalyzerPriceEur() { return ECONOMIC_TERMS_POLICY.analyzerPriceEur; }",
    "export function getReferralStartPct() { return Math.round(REFERRAL_POLICY.startRate * 100); }",`;
  const helperReplacement = `    "export function getAnalyzerPriceEur() { return ECONOMIC_TERMS_POLICY.analyzerPriceEur; }",
    "export function isPspCompensationAccepted() { return PROVIDER_PROGRAM_POLICY.pspCompensationAccepted; }",
    "export function getProviderPricingModes() { return [...PROVIDER_PROGRAM_POLICY.pricingModes]; }",
    "export function getReferralStartPct() { return Math.round(REFERRAL_POLICY.startRate * 100); }",`;
  source = replaceUnique(source, helperAnchor, helperReplacement, `${rel}:providerProgram helpers`);
  write(rel, source);
}

// The implementation already uses 25% throughout the 24-month term; remove
// obsolete Year-2 expectations from its tests.
{
  const rel = "src/lib/recoveryEconomicsV2.test.js";
  let source = read(rel);
  source = replaceUnique(
    source,
    "expect(recoveryTermFromActivation('2026-10-01T12:00:00Z')).toEqual({start:'2026-10-01',year2Start:'2027-10-01',endExclusive:'2028-10-01',months:24});",
    "expect(recoveryTermFromActivation('2026-10-01T12:00:00Z')).toEqual({start:'2026-10-01',endExclusive:'2028-10-01',months:24});",
    `${rel}:term shape`,
  );
  source = replaceUnique(source, "it('uses 25 in year 1, 15 in year 2, 0 after 24 months', () => {", "it('uses 25 throughout months 1–24 and 0 afterwards', () => {", `${rel}:term test title`);
  source = replaceUnique(
    source,
    "expect(periodEconomicsV2({activationIso:'2026-10-01',periodStart:'2027-10-01',periodEndExclusive:'2027-11-01'}).effective_fee_pct).toBe(15);",
    "expect(periodEconomicsV2({activationIso:'2026-10-01',periodStart:'2027-10-01',periodEndExclusive:'2027-11-01'}).effective_fee_pct).toBe(25);",
    `${rel}:old year2 fee`,
  );
  source = replaceUnique(source, "it('segments a period crossing the 12-month boundary deterministically', () => {", "it('keeps one 25% segment across the former 12-month boundary', () => {", `${rel}:boundary title`);
  source = replaceUnique(source, "expect(x.segments.map(s=>[s.standard_fee_pct,s.days])).toEqual([[25,16],[15,14]]);", "expect(x.segments.map(s=>[s.standard_fee_pct,s.days])).toEqual([[25,30]]);", `${rel}:boundary segments`);
  source = replaceUnique(source, "expect(x.effective_fee_pct).toBeCloseTo((25*16+15*14)/30,10);", "expect(x.effective_fee_pct).toBe(25);", `${rel}:boundary weighted fee`);
  source = replaceUnique(source, "expect(recoveryTermFromActivation('2026-08-31T10:00:00Z').year2Start).toBe('2027-08-31');", "expect(recoveryTermFromActivation('2026-08-31T10:00:00Z').endExclusive).toBe('2028-08-31');", `${rel}:month end`);
  source = replaceUnique(source, "expect(recoveryTermFromActivation('2024-02-29T10:00:00Z').year2Start).toBe('2025-02-28');", "expect(recoveryTermFromActivation('2024-02-29T10:00:00Z').endExclusive).toBe('2026-02-28');", `${rel}:leap end`);
  source = source.replace("standard_fee_pct: 15, effective_fee_pct: 5", "standard_fee_pct: 25, effective_fee_pct: 5");
  source = replaceUnique(source, "it('applies referrals acquired in Year 2 against 15%, not against the old 25% absolute fee', () => {", "it('applies referrals against the same 25% standard fee throughout the term', () => {", `${rel}:referral title`);
  source = replaceUnique(source, ").effective_fee_pct).toBe(15);\n    expect(periodEconomicsV2({activationIso:'2026-10-01',periodStart:'2028-02-01'", ").effective_fee_pct).toBe(25);\n    expect(periodEconomicsV2({activationIso:'2026-10-01',periodStart:'2028-02-01'", `${rel}:referral base`);
  source = replaceUnique(source, ").effective_fee_pct).toBe(10);\n    expect(periodEconomicsV2({activationIso:'2026-10-01',periodStart:'2028-03-01'", ").effective_fee_pct).toBe(20);\n    expect(periodEconomicsV2({activationIso:'2026-10-01',periodStart:'2028-03-01'", `${rel}:referral one`);
  source = replaceUnique(source, ").effective_fee_pct).toBe(5);\n  });\n  it('scopes an activation-month", ").effective_fee_pct).toBe(15);\n  });\n  it('scopes an activation-month", `${rel}:referral two`);
  write(rel, source);
}

const dryRun = process.argv.includes("--check");
if (!dryRun) {
  for (const [rel, value] of pending) fs.writeFileSync(path.join(root, rel), value);
}

console.log(JSON.stringify({ changed, count: changed.length, dryRun }, null, 2));
