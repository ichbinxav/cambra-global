// src/lib/featureScope.js
//
// P0.9 — Feature-scope registry. Controls which infrastructure verticals
// are production-enabled and merchant-visible. Dormant verticals (shipping,
// SaaS, insurance, telecom, energy, banking, financing) are kept in the
// codebase as roadmap infrastructure but must NOT leak into merchant-facing
// surfaces.
//
// Usage:
//   import { isProductionEnabled, isMerchantVisible } from '@/lib/featureScope';
//   if (isMerchantVisible('shipping')) { ... }  // false — won't render
//
// This is the single source of truth. Navigation menus, Copilot, emails,
// reports, and onboarding all consult this registry before surfacing any
// vertical-specific UI.

export const FEATURE_SCOPE = Object.freeze({
  payments: {
    productionEnabled: true,
    merchantVisible: true,
    label: 'Card payments (online PSP + in-store TPV)',
  },
  shipping: {
    productionEnabled: false,
    merchantVisible: false,
    label: 'Shipping & logistics',
    dormantReason: 'roadmap_future_expansion',
  },
  saas: {
    productionEnabled: false,
    merchantVisible: false,
    label: 'Commerce SaaS',
    dormantReason: 'roadmap_future_expansion',
  },
  insurance: {
    productionEnabled: false,
    merchantVisible: false,
    label: 'Insurance',
    dormantReason: 'roadmap_future_expansion',
  },
  telecom: {
    productionEnabled: false,
    merchantVisible: false,
    label: 'Telecom',
    dormantReason: 'roadmap_future_expansion',
  },
  energy: {
    productionEnabled: false,
    merchantVisible: false,
    label: 'Energy',
    dormantReason: 'roadmap_future_expansion',
  },
  banking: {
    productionEnabled: false,
    merchantVisible: false,
    label: 'Banking',
    dormantReason: 'roadmap_future_expansion',
  },
  financing: {
    productionEnabled: false,
    merchantVisible: false,
    label: 'Financing',
    dormantReason: 'roadmap_future_expansion',
  },
});

export function isProductionEnabled(vertical) {
  return !!FEATURE_SCOPE[vertical]?.productionEnabled;
}

export function isMerchantVisible(vertical) {
  return !!FEATURE_SCOPE[vertical]?.merchantVisible;
}

export function getMerchantVisibleVerticals() {
  return Object.entries(FEATURE_SCOPE)
    .filter(([, v]) => v.merchantVisible)
    .map(([k]) => k);
}

export function getDormantVerticals() {
  return Object.entries(FEATURE_SCOPE)
    .filter(([, v]) => !v.productionEnabled)
    .map(([k]) => k);
}