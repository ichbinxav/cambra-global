import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = JSON.parse(fs.readFileSync(path.join(root, 'config/europe-locales.json'), 'utf8'));
const markets = JSON.parse(fs.readFileSync(path.join(root, 'config/europe-markets.json'), 'utf8'));
const knownLocales = new Set(source.productLocales.map((x) => x.locale));
const marketByCode = new Map(markets.markets.map((x) => [x.iso2, x]));
if (source.schemaVersion !== 1 || source.markets.length !== 33 || marketByCode.size !== 33) throw new Error('locale_registry_shape_invalid');
const seen = new Set();
const registryMarkets = source.markets.map((policy) => {
  const market = marketByCode.get(policy.market_code);
  if (!market || seen.has(policy.market_code)) throw new Error(`invalid_locale_market:${policy.market_code}`);
  seen.add(policy.market_code);
  if (!policy.supported_product_locales.length || !policy.supported_product_locales.every((x) => knownLocales.has(x))) throw new Error(`unsupported_product_locale:${policy.market_code}`);
  if (!policy.supported_product_locales.includes(policy.default_locale) || !knownLocales.has(source.fallbackLocale)) throw new Error(`invalid_locale_fallback:${policy.market_code}`);
  return {
    ...policy,
    fallback_locale: source.fallbackLocale,
    currency: market.primary_currency,
    timezone: market.timezones[0],
    legal_document_locales: source.legalDocumentLocales,
    legal_translation_status: 'IMPLEMENTED_UNVERIFIED',
    legal_applicability_status: 'LEGAL_REVIEW_REQUIRED',
  };
});
const output = {
  schemaVersion: source.schemaVersion,
  registryVersion: source.registryVersion,
  fallbackLocale: source.fallbackLocale,
  productLocales: source.productLocales,
  markets: registryMarkets,
};
const body = `// GENERATED from config/europe-locales.json + config/europe-markets.json — DO NOT EDIT.\nexport const LOCALE_REGISTRY=${JSON.stringify(output, null, 2)};\nexport const PRODUCT_LOCALES=Object.freeze(LOCALE_REGISTRY.productLocales);\nexport const LOCALE_MARKETS=Object.freeze(LOCALE_REGISTRY.markets);\nexport const LOCALE_MARKET_BY_CODE=Object.freeze(Object.fromEntries(LOCALE_MARKETS.map(m=>[m.market_code,m])));\n`;
const targets = ['src/lib/generated/localeRegistry.js', 'base44/shared/generated/localeRegistry.ts'].map((x) => path.join(root, x));
const check = process.argv.includes('--check');
let bad = false;
for (const target of targets) {
  if (check) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== body) {
      console.error('locale registry drift:', path.relative(root, target));
      bad = true;
    }
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
  }
}
if (bad) process.exit(1);
console.log(`locales:${check ? 'check' : 'generate'} PASS — ${registryMarkets.length} markets · ${source.productLocales.length} product locales`);
