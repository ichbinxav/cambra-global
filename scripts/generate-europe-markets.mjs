import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CANONICAL_MARKETS = Object.freeze([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE',
  'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT',
  'RO', 'SK', 'SI', 'ES', 'SE', 'NO', 'IS', 'LI', 'CH', 'GB', 'AD',
]);
const ACTIVE_LAUNCH_MARKETS = Object.freeze(['ES', 'IT', 'PT', 'GB', 'GR', 'HR', 'DE', 'PL', 'CZ', 'CY']);
const PROTECTED_MARKETS = Object.freeze(['FR', 'BE', 'NL']);
const NOT_LAUNCH_MARKETS = Object.freeze(['AT', 'BG', 'CH', 'DK', 'EE', 'FI', 'HU', 'IE', 'LT', 'LU', 'LV', 'MT', 'NO', 'RO', 'SE', 'SI', 'SK']);
const OUTSIDE_LAUNCH_PERIMETER = Object.freeze(['IS', 'LI', 'AD']);

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourcePath = path.join(root, 'config/europe-markets.json');
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

function assertExact(actual, expected, label) {
  if (!Array.isArray(actual) || JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}_invalid`);
  }
}

const iso2 = new Set();
const iso3 = new Set();
if (source.schemaVersion !== 1 || !source.registryVersion || !Array.isArray(source.markets)) {
  throw new Error('europe_market_registry_shape_invalid');
}
assertExact(source.markets.map((market) => market.iso2), CANONICAL_MARKETS, 'canonical_markets');
for (const market of source.markets) {
  if (!/^[A-Z]{2}$/.test(market.iso2)
    || !/^[A-Z]{3}$/.test(market.iso3)
    || !/^[A-Z]{3}$/.test(market.primary_currency)) {
    throw new Error(`invalid_market:${market.iso2}`);
  }
  if (iso2.has(market.iso2) || iso3.has(market.iso3)) {
    throw new Error(`duplicate_market:${market.iso2}`);
  }
  iso2.add(market.iso2);
  iso3.add(market.iso3);
}

const scope = source.launchScope;
if (!scope || !scope.scopeVersion || !scope.effectiveDate) {
  throw new Error('market_launch_scope_missing');
}
assertExact(scope.active, ACTIVE_LAUNCH_MARKETS, 'active_launch_markets');
assertExact(scope.protected, PROTECTED_MARKETS, 'protected_markets');
assertExact(scope.notLaunch, NOT_LAUNCH_MARKETS, 'not_launch_markets');
assertExact(scope.outsideLaunchPerimeter, OUTSIDE_LAUNCH_PERIMETER, 'outside_launch_perimeter');
if (scope.canonical_market_count !== 33
  || scope.launch_perimeter_count !== 30
  || scope.active_launch_count !== 10
  || scope.licensing_blocked_count !== 3
  || scope.not_launch_market_count !== 17
  || scope.outside_launch_perimeter_count !== 3
  || scope.decisionStatus !== 'FOUNDER_DECIDED'
  || scope.protectedMode !== 'RESEARCH_ONLY'
  || scope.outboundMode !== 'PAUSED_ZERO'
  || scope.regulatedCapabilitiesMode !== 'SPECIFIC_POLICY_REQUIRED') {
  throw new Error('market_launch_scope_policy_invalid');
}
if (!scope.active.includes('ES')) throw new Error('spain_must_be_active');
const launchPerimeter = [...scope.active, ...scope.protected, ...scope.notLaunch];
if (new Set(launchPerimeter).size !== 30) throw new Error('market_launch_perimeter_invalid');
const scopeUnion = [...launchPerimeter, ...scope.outsideLaunchPerimeter];
if (new Set(scopeUnion).size !== CANONICAL_MARKETS.length
  || CANONICAL_MARKETS.some((market) => !scopeUnion.includes(market))) {
  throw new Error('market_launch_scope_partition_invalid');
}

const body = `// GENERATED from config/europe-markets.json — DO NOT EDIT.\nexport const EUROPE_MARKET_REGISTRY=${JSON.stringify(source, null, 2)};\nexport const EUROPE_MARKETS=Object.freeze(EUROPE_MARKET_REGISTRY.markets);\nexport const EUROPE_MARKET_BY_ISO2=Object.freeze(Object.fromEntries(EUROPE_MARKETS.map(m=>[m.iso2,m])));\nexport const EUROPE_MARKET_CODES=Object.freeze(EUROPE_MARKETS.map(m=>m.iso2));\nexport const CANONICAL_MARKET_CODES=EUROPE_MARKET_CODES;\nexport const EUROPE_CURRENCIES=Object.freeze([...new Set(EUROPE_MARKETS.map(m=>m.primary_currency))]);\nexport const MARKET_SCOPE_VERSION=EUROPE_MARKET_REGISTRY.launchScope.scopeVersion;\nexport const MARKET_SCOPE_DECISION_STATUS=EUROPE_MARKET_REGISTRY.launchScope.decisionStatus;\nexport const ACTIVE_LAUNCH_MARKETS=Object.freeze([...EUROPE_MARKET_REGISTRY.launchScope.active]);\nexport const PROTECTED_MARKETS=Object.freeze([...EUROPE_MARKET_REGISTRY.launchScope.protected]);\nexport const NOT_LAUNCH_MARKETS=Object.freeze([...EUROPE_MARKET_REGISTRY.launchScope.notLaunch]);\nexport const OUTSIDE_LAUNCH_PERIMETER=Object.freeze([...EUROPE_MARKET_REGISTRY.launchScope.outsideLaunchPerimeter]);\nexport const RESEARCH_ONLY_MARKETS=Object.freeze([...PROTECTED_MARKETS,...NOT_LAUNCH_MARKETS,...OUTSIDE_LAUNCH_PERIMETER]);\nexport const MARKET_SCOPE_COUNTS=Object.freeze({canonical_market_count:EUROPE_MARKET_CODES.length,launch_perimeter_count:ACTIVE_LAUNCH_MARKETS.length+PROTECTED_MARKETS.length+NOT_LAUNCH_MARKETS.length,active_launch_count:ACTIVE_LAUNCH_MARKETS.length,licensing_blocked_count:PROTECTED_MARKETS.length,not_launch_market_count:NOT_LAUNCH_MARKETS.length,outside_launch_perimeter_count:OUTSIDE_LAUNCH_PERIMETER.length});\nexport const MARKET_OUTBOUND_MODE=EUROPE_MARKET_REGISTRY.launchScope.outboundMode;\nexport const MARKET_REGULATED_CAPABILITIES_MODE=EUROPE_MARKET_REGISTRY.launchScope.regulatedCapabilitiesMode;\nexport const MARKET_SCOPE_BY_ISO2=Object.freeze(Object.fromEntries(EUROPE_MARKET_CODES.map(iso2=>{const launchActive=ACTIVE_LAUNCH_MARKETS.includes(iso2);const licensing=PROTECTED_MARKETS.includes(iso2);const notLaunch=NOT_LAUNCH_MARKETS.includes(iso2);const outside=OUTSIDE_LAUNCH_PERIMETER.includes(iso2);return[iso2,Object.freeze({iso2,scope_status:launchActive?'ACTIVE_LAUNCH':licensing?'LICENSING_RESEARCH_ONLY':notLaunch?'NOT_LAUNCH_RESEARCH_ONLY':'OUTSIDE_LAUNCH_PERIMETER',launch_active:launchActive,research_allowed:true,research_only:!launchActive,commercial_scope_eligible:launchActive,commercial_eligibility:outside?null:(launchActive?'ELIGIBLE':'BLOCKED'),blocked_reason:outside?null:(licensing?'licensing':notLaunch?'not_launch_market':null),outbound_allowed:false,regulated_capabilities_authorized:false})]})));\nexport function canonicalMarketIso2(value){const iso2=typeof value==='string'?value.trim().toUpperCase():'';return Object.prototype.hasOwnProperty.call(EUROPE_MARKET_BY_ISO2,iso2)?iso2:null}\nexport function marketScopeForIso2(value){const iso2=canonicalMarketIso2(value);return iso2?MARKET_SCOPE_BY_ISO2[iso2]:null}\nexport function paymentsRegionForCanonicalMarket(value){const iso2=canonicalMarketIso2(value);if(!iso2)return null;if(iso2==='GB')return'UK';if(iso2==='AD')return'RoW';return'EU'}\n`;

const targets = [
  'src/lib/generated/europeMarkets.js',
  'base44/shared/generated/europeMarkets.ts',
].map((relativePath) => path.join(root, relativePath));
const check = process.argv.includes('--check');
let drift = false;
for (const target of targets) {
  if (check) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== body) {
      console.error('market registry drift:', path.relative(root, target));
      drift = true;
    }
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
  }
}
if (drift) process.exit(1);
console.log(
  `markets:${check ? 'check' : 'generate'} PASS — ${source.markets.length} canonical · ${scope.active.length} active · ${scope.protected.length} protected`,
);
