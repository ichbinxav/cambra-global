// src/lib/productPolicy.js
//
// v60 — Public facade over the generated product policy. Frontend surfaces
// import helpers from here (not from the generated file directly) so the
// generated artifact stays a stable, low-churn target and the public API is
// owned by this module.
//
// All values derive from config/product-policy.json via the generated artifact
// (src/lib/generated/productPolicy.js). Nothing in this file is a hardcoded
// economic value.

export {
  POLICY_VERSION,
  EFFECTIVE_DATE,
  PRODUCT_POLICY,
  ECONOMIC_TERMS_POLICY,
  REFERRAL_POLICY,
  PRODUCT_SCOPE_POLICY,
  SUPPORTED_CHANNELS,
  INTEGRATION_STATUS,
  getSuccessFeePct,
  getMerchantSharePct,
  getFeeDurationMonths,
  getAnalyzerPriceEur,
  getReferralStartPct,
  getReferralStepPct,
  getReferralFloorPct,
  isProductionEnabled,
  isMerchantVisible,
  getMerchantVisibleVerticals,
  getDormantVerticals,
  getIntegrationStatus,
  formatPercent,
  formatDurationMonths,
} from "@/lib/generated/productPolicy.js";