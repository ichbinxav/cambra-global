// GENERATED FILE — DO NOT EDIT DIRECTLY.
// Source: config/product-policy.json
// policyVersion: 2026.08.09-recover-v2
// effectiveDate: 2026-08-09
// Regenerate: npm run policy:generate  ·  Drift check: npm run policy:check
export const POLICY_VERSION = "2026.08.09-recover-v2";
export const EFFECTIVE_DATE = "2026-08-09";

// Deep-frozen so no consumer can mutate the canonical values at runtime.
export const PRODUCT_POLICY = (function () {
  const o = {
  "schemaVersion": 1,
  "policyVersion": "2026.08.09-recover-v2",
  "effectiveDate": "2026-08-09",
  "currency": "EUR",
  "economicTerms": {
    "analyzerPriceEur": 0,
    "successFeeRate": 0.25,
    "merchantShareRate": 0.75,
    "feeDurationMonths": 24,
    "feeBase": "positive_verified_savings",
    "recoveryOptional": true
  },
  "referralTerms": {
    "startRate": 0.25,
    "stepRate": 0.05,
    "floorRate": 0.05
  },
  "productScope": {
    "payments": {
      "productionEnabled": true,
      "merchantVisible": true
    },
    "shipping": {
      "productionEnabled": false,
      "merchantVisible": false
    },
    "saas": {
      "productionEnabled": false,
      "merchantVisible": false
    },
    "insurance": {
      "productionEnabled": false,
      "merchantVisible": false
    },
    "telecom": {
      "productionEnabled": false,
      "merchantVisible": false
    },
    "energy": {
      "productionEnabled": false,
      "merchantVisible": false
    },
    "banking": {
      "productionEnabled": false,
      "merchantVisible": false
    },
    "financing": {
      "productionEnabled": false,
      "merchantVisible": false
    }
  },
  "supportedChannels": {
    "onlinePsp": true,
    "inStoreTpv": true
  },
  "integrationStatus": {
    "stripe": "implemented_live_verification_pending",
    "statementUpload": "available",
    "otherConnectors": "code_level_or_roadmap"
  }
};
  const f = (v) => { if (v && typeof v === "object") { Object.freeze(v); Object.values(v).forEach(f); } return v; };
  return f(o);
})();

export const ECONOMIC_TERMS_POLICY = PRODUCT_POLICY.economicTerms;
export const REFERRAL_POLICY = PRODUCT_POLICY.referralTerms;
export const PRODUCT_SCOPE_POLICY = PRODUCT_POLICY.productScope;
export const SUPPORTED_CHANNELS = PRODUCT_POLICY.supportedChannels;
export const INTEGRATION_STATUS = PRODUCT_POLICY.integrationStatus;

// ── Derived helpers (integer-percent + booleans) ─────────────────────
export function getSuccessFeePct() { return Math.round(ECONOMIC_TERMS_POLICY.successFeeRate * 100); }
export function getMerchantSharePct() { return Math.round(ECONOMIC_TERMS_POLICY.merchantShareRate * 100); }
export function getFeeDurationMonths() { return ECONOMIC_TERMS_POLICY.feeDurationMonths; }
export function getAnalyzerPriceEur() { return ECONOMIC_TERMS_POLICY.analyzerPriceEur; }
export function getReferralStartPct() { return Math.round(REFERRAL_POLICY.startRate * 100); }
export function getReferralStepPct() { return Math.round(REFERRAL_POLICY.stepRate * 100); }
export function getReferralFloorPct() { return Math.round(REFERRAL_POLICY.floorRate * 100); }
export function isProductionEnabled(v) { return !!PRODUCT_SCOPE_POLICY[v]?.productionEnabled; }
export function isMerchantVisible(v) { return !!PRODUCT_SCOPE_POLICY[v]?.merchantVisible; }
export function getMerchantVisibleVerticals() { return Object.keys(PRODUCT_SCOPE_POLICY).filter((k) => PRODUCT_SCOPE_POLICY[k].merchantVisible); }
export function getDormantVerticals() { return Object.keys(PRODUCT_SCOPE_POLICY).filter((k) => !PRODUCT_SCOPE_POLICY[k].productionEnabled); }
export function getIntegrationStatus(name) { return INTEGRATION_STATUS[name] || "unknown"; }
export function formatPercent(rate) { return Math.round(rate * 100) + "%"; }
export function formatDurationMonths(n) { return n + " months"; }
