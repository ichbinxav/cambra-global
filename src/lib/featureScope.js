// src/lib/featureScope.js
//
// v60 — Adapter over the generated product policy. The productionEnabled /
// merchantVisible booleans are no longer defined here; they derive from
// config/product-policy.json via src/lib/generated/productPolicy.js. The
// human-facing labels and dormantReason strings stay local (they are UI copy,
// not structured policy governed by the registry).
//
// This file preserves the v59.1 public API (FEATURE_SCOPE shape, the four
// helpers) so every existing consumer (helpCenterData, onboarding, tests) and
// the frozen-object invariant keep working without change.

import { PRODUCT_SCOPE_POLICY } from "@/lib/generated/productPolicy.js";

// UI copy kept local — labels are not structured policy and must not bloat the
// canonical JSON. Order matches the policy's vertical order.
const VERTICAL_LABELS = {
  payments: { label: "Card payments (online PSP + in-store TPV)" },
  shipping: { label: "Shipping & logistics", dormantReason: "roadmap_future_expansion" },
  saas: { label: "Commerce SaaS", dormantReason: "roadmap_future_expansion" },
  insurance: { label: "Insurance", dormantReason: "roadmap_future_expansion" },
  telecom: { label: "Telecom", dormantReason: "roadmap_future_expansion" },
  energy: { label: "Energy", dormantReason: "roadmap_future_expansion" },
  banking: { label: "Banking", dormantReason: "roadmap_future_expansion" },
  financing: { label: "Financing", dormantReason: "roadmap_future_expansion" },
};

export const FEATURE_SCOPE = Object.freeze(
  Object.fromEntries(
    Object.entries(PRODUCT_SCOPE_POLICY).map(([k, v]) => [
      k,
      Object.freeze({ ...v, ...VERTICAL_LABELS[k] }),
    ]),
  ),
);

export function isProductionEnabled(vertical) {
  return !!PRODUCT_SCOPE_POLICY[vertical]?.productionEnabled;
}

export function isMerchantVisible(vertical) {
  return !!PRODUCT_SCOPE_POLICY[vertical]?.merchantVisible;
}

export function getMerchantVisibleVerticals() {
  return Object.keys(PRODUCT_SCOPE_POLICY).filter((k) => PRODUCT_SCOPE_POLICY[k].merchantVisible);
}

export function getDormantVerticals() {
  return Object.keys(PRODUCT_SCOPE_POLICY).filter((k) => !PRODUCT_SCOPE_POLICY[k].productionEnabled);
}