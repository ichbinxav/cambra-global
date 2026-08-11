import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const check = process.argv.includes("--check");
const markets = JSON.parse(fs.readFileSync(path.join(root, "config/europe-markets.json"), "utf8"));
const locales = JSON.parse(fs.readFileSync(path.join(root, "config/europe-locales.json"), "utf8"));
const enabled = new Set(["FR", "ES"]);
const localeByMarket = new Map(locales.markets.map((row) => [row.market_code, row]));

if (markets.markets.length !== 33 || locales.markets.length !== 33) {
  throw new Error("landing readiness report requires the canonical 33-market registries");
}

const generatedAt = "2026-08-12";
const marketRows = markets.markets.map((market) => {
  const locale = localeByMarket.get(market.iso2);
  if (!locale) throw new Error(`missing locale registry row for ${market.iso2}`);
  return {
    market_code: market.iso2,
    market_name: market.canonical_name,
    currency: market.primary_currency,
    default_locale: locale.default_locale,
    translation_readiness: locale.translation_readiness,
    landing_status: "AVAILABLE",
    analyzer_status: enabled.has(market.iso2) ? "ENABLED" : "LIMITED",
    recovery_status: "REVIEW_REQUIRED",
    legal_applicability_status: "LEGAL_REVIEW_REQUIRED",
    legal_translation_status: "IMPLEMENTED_UNVERIFIED",
  };
});

const sources = [
  {
    scope: "EU personal-data baseline",
    authority: "EUR-Lex",
    url: "https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=EN",
    status: "AUTHORITATIVE_SOURCE_RECORDED",
  },
  {
    scope: "Electronic communications and device storage baseline",
    authority: "EUR-Lex",
    url: "https://eur-lex.europa.eu/eli/dir/2002/58/oj",
    status: "AUTHORITATIVE_SOURCE_RECORDED",
  },
  {
    scope: "Consent interpretation",
    authority: "European Data Protection Board",
    url: "https://www.edpb.europa.eu/documents/guideline/guidelines-052020-on-consent-under-regulation-2016679_en",
    status: "AUTHORITATIVE_GUIDANCE_RECORDED",
  },
  {
    scope: "EU online-service transparency baseline",
    authority: "European Commission",
    url: "https://digital-strategy.ec.europa.eu/en/policies/e-commerce-directive",
    status: "AUTHORITATIVE_SOURCE_RECORDED",
  },
];

const report = {
  schema_version: 1,
  generated_at: generatedAt,
  source_versions: {
    markets: markets.registryVersion,
    locales: locales.registryVersion,
  },
  truth_status: "PARTIAL_PRODUCTION_READINESS",
  launch_claim: "NOT_GO_READY_FROM_LANDING_WORK_ALONE",
  product_locales: locales.productLocales,
  market_rows: marketRows,
  legal_sources: sources,
  blockers: [
    "Native product translation is implemented only for en-GB, fr-FR and es-ES.",
    "Every market remains LEGAL_REVIEW_REQUIRED for market-specific applicability.",
    "Localized URL/SSR infrastructure does not exist, so hreflang is intentionally not emitted.",
    "Analyzer execution is enabled only for FR and ES; the other 31 markets are intelligence-only.",
  ],
};

const table = marketRows.map((row) => `| ${row.market_code} | ${row.market_name} | ${row.currency} | ${row.default_locale} | ${row.translation_readiness} | ${row.analyzer_status} | ${row.recovery_status} | ${row.legal_applicability_status} |`).join("\n");
const localeTable = locales.productLocales.map((row) => `| ${row.locale} | ${row.language} | ${row.translation_status} | ${row.quality_status} | ${row.legal_review_status} |`).join("\n");
const sourceList = sources.map((source) => `- [${source.authority} — ${source.scope}](${source.url}) — ${source.status}`).join("\n");

const markdown = `# CAMBRA landing release matrix\n\nGenerated ${generatedAt} from the canonical P1/P9 registries. This is an engineering-readiness artifact, not legal advice and not a GO decision.\n\n## Truth status\n\n- Overall: **PARTIAL_PRODUCTION_READINESS**\n- Landing informational coverage: **33/33 markets**\n- Analyzer action enabled: **2/33 markets (FR, ES)**\n- Product locales implemented: **3**\n- Market-specific legal applicability approved: **0/33**\n- Hreflang: **not emitted** because CAMBRA has no independent localized URLs or SSR/prerender surface\n\n## Market × experience matrix\n\n| Code | Market | Currency | Default locale | Translation | Analyzer | Recovery | Legal applicability |\n|---|---|---:|---|---|---|---|---|\n${table}\n\n## Product locale matrix\n\n| Locale | Language | Translation | Automated quality | Legal review |\n|---|---|---|---|---|\n${localeTable}\n\nLanguage choice and operating market are separate. Browser locale/timezone provides only a suggestion. An explicit market selection is authoritative for the public experience, but never grants legal or execution authority.\n\n## Authoritative European baseline sources\n\n${sourceList}\n\nThese sources establish research baselines only. They do not validate national implementation, B2B terms, tax, marketing, recovery mandates or regulated activity for any particular market.\n\n## Honest blockers\n\n${report.blockers.map((item) => `- ${item}`).join("\n")}\n\n## Implemented landing controls\n\n- Market and language selectors are distinct.\n- Market currency is sourced from the canonical P1 registry.\n- Unsupported markets route to access review instead of Analyzer execution.\n- Public claims no longer use a fabricated merchant example or universal savings claim.\n- Evidence states are explicit: estimated, provisional and verified.\n- Consent categories default off; accept, reject and granular choices are available.\n- Consent can be reopened and withdrawn from the Cookie Policy.\n- Legal pages identify their unverified market-specific translation/applicability status.\n- Unknown routes remain noindex by default; canonical metadata stays centralized.\n`;

const outputs = [
  [path.join(root, "src/docs/CAMBRA_LANDING_RELEASE_MATRIX.md"), `${markdown}\n`],
  [path.join(root, "src/docs/CAMBRA_LANDING_READINESS.json"), `${JSON.stringify(report, null, 2)}\n`],
];

let drift = false;
for (const [file, content] of outputs) {
  if (check) {
    if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== content) {
      console.error(`drift: ${path.relative(root, file)}`);
      drift = true;
    }
  } else {
    fs.writeFileSync(file, content);
    console.log(`generated ${path.relative(root, file)}`);
  }
}

if (drift) process.exit(1);
if (check) console.log("landing readiness report: clean");
