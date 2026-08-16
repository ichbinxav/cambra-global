import {
  MARKET_SCOPE_BY_ISO2,
  MARKET_SCOPE_COUNTS,
  MARKET_SCOPE_DECISION_STATUS,
  MARKET_SCOPE_VERSION,
  paymentsRegionForCanonicalMarket,
} from './generated/europeMarkets.ts';

export const REGULATED_CAPABILITIES = Object.freeze([
  'ACCESS_BANK_ACCOUNT_DATA',
  'INITIATE_PAYMENT',
  'HOLD_FUNDS',
  'ACT_AS_PSP',
  'ACT_AS_PSP_AGENT',
]);

export type PaymentsMarketValidation =
  | {
    ok: true;
    country: string;
    region: 'EU' | 'UK' | 'RoW';
    scope: Record<string, unknown>;
  }
  | {
    ok: false;
    failure: { field: 'body' | 'country' | 'region'; reason: string };
  };

export function evaluateMarketLaunchScope(value: unknown) {
  const iso2 = typeof value === 'string' ? value.trim().toUpperCase() : '';
  const scope = MARKET_SCOPE_BY_ISO2[iso2];
  if (!scope) {
    return Object.freeze({
      iso2: null,
      scope_status: 'UNKNOWN_BLOCKED',
      launch_active: false,
      research_allowed: false,
      research_only: false,
      commercial_scope_eligible: false,
      outbound_allowed: false,
      outbound_capacity: 0,
      regulated_capabilities_authorized: false,
      decision_status: MARKET_SCOPE_DECISION_STATUS,
      scope_version: MARKET_SCOPE_VERSION,
    });
  }
  return Object.freeze({
    ...scope,
    outbound_capacity: 0,
    regulated_capabilities_authorized: false,
    decision_status: MARKET_SCOPE_DECISION_STATUS,
    scope_version: MARKET_SCOPE_VERSION,
  });
}

export function validatePaymentsLaunchMarketInput(raw: unknown): PaymentsMarketValidation {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, failure: { field: 'body', reason: 'invalid_type' } };
  }
  const record = raw as Record<string, unknown>;
  const hasManualRegion = Object.keys(record).some((key) => key.toLowerCase() === 'region')
    || (Array.isArray(record.channels) && record.channels.some((channel) => (
      channel
      && typeof channel === 'object'
      && Object.keys(channel).some((key) => key.toLowerCase() === 'region')
    )));
  if (hasManualRegion) {
    return { ok: false, failure: { field: 'region', reason: 'manual_region_forbidden' } };
  }

  const countryValue = record.country;
  if (typeof countryValue !== 'string' || countryValue.trim() === '') {
    return { ok: false, failure: { field: 'country', reason: 'missing' } };
  }
  const scope = evaluateMarketLaunchScope(countryValue);
  if (!scope.iso2) {
    return { ok: false, failure: { field: 'country', reason: 'not_canonical_market' } };
  }
  if (!scope.launch_active) {
    return { ok: false, failure: { field: 'country', reason: 'protected_research_only' } };
  }

  const region = paymentsRegionForCanonicalMarket(scope.iso2);
  if (region !== 'EU' && region !== 'UK' && region !== 'RoW') {
    return { ok: false, failure: { field: 'country', reason: 'not_canonical_market' } };
  }
  return { ok: true, country: scope.iso2, region, scope };
}

export function marketSeedLaunchProjection(value: unknown) {
  const scope = evaluateMarketLaunchScope(value);
  if (!scope.iso2) return null;
  return Object.freeze({
    iso2: scope.iso2,
    launch_status: scope.launch_active ? 'ANALYZER_READY' : 'REGULATORY_HOLD',
    research_mode: scope.research_only ? 'RESEARCH_ONLY' : 'RESEARCH_ALLOWED',
    outbound_capacity: 0,
    regulated_capabilities_authorized: false,
    scope_version: MARKET_SCOPE_VERSION,
  });
}

export { MARKET_SCOPE_COUNTS, MARKET_SCOPE_DECISION_STATUS, MARKET_SCOPE_VERSION };
