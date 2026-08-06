// src/lib/productPolicySchema.js
//
// Canonical validation for config/product-policy.json.
// Imported by the generator (scripts/generate-product-policy.mjs) and by the
// drift test (src/lib/productPolicyDrift.test.js). Pure, no fs.
//
// v60 — Central Product Policy. This schema is the FORMAL contract a policy
// must satisfy before any artifact is generated. It enforces the invariants
// that protect v59.1: payments is the only active vertical, the standard fee
// and merchant share sum to 1, the referral floor never exceeds the start,
// Stripe is never classified as "live", and every rate is a fraction in [0,1].

import { z } from "zod";
// Relative (not "@/") — this module is also imported by the Node generator
// script, which has no Vite alias resolution.
import { isCalendarDate, CALENDAR_DATE_MESSAGE } from "./calendarDate.js";

const INTEGRATION_STATUS_ENUM = z.enum([
  "implemented_live_verification_pending",
  "available",
  "code_level_or_roadmap",
  "live",
  "disabled",
]);

const VERTICAL_KEYS = [
  "payments",
  "shipping",
  "saas",
  "insurance",
  "telecom",
  "energy",
  "banking",
  "financing",
];

const verticalEntry = z.object({
  productionEnabled: z.boolean(),
  merchantVisible: z.boolean(),
});

export const productPolicySchema = z
  .object({
    schemaVersion: z.literal(1),
    policyVersion: z.string().min(1),
    // v62 C5 — shape AND existence: 2026-99-99 / 2026-02-30 are rejected.
    effectiveDate: z
      .string()
      .refine(isCalendarDate, `effectiveDate ${CALENDAR_DATE_MESSAGE}`),
    currency: z.literal("EUR"),
    economicTerms: z.object({
      analyzerPriceEur: z.number().min(0),
      successFeeRate: z.number().min(0).max(1),
      merchantShareRate: z.number().min(0).max(1),
      feeDurationMonths: z.number().int().positive(),
      feeBase: z.string().min(1),
      recoveryOptional: z.boolean(),
    }),
    referralTerms: z.object({
      startRate: z.number().min(0).max(1),
      stepRate: z.number().min(0).max(1),
      floorRate: z.number().min(0).max(1),
    }),
    productScope: z.object(
      Object.fromEntries(VERTICAL_KEYS.map((k) => [k, verticalEntry])),
    ),
    supportedChannels: z.object({
      onlinePsp: z.boolean(),
      inStoreTpv: z.boolean(),
    }),
    integrationStatus: z.object({
      stripe: INTEGRATION_STATUS_ENUM,
      statementUpload: INTEGRATION_STATUS_ENUM,
      otherConnectors: INTEGRATION_STATUS_ENUM,
    }),
  })
  .superRefine((p, ctx) => {
    // successFeeRate + merchantShareRate must sum to 1 (the merchant keeps what
    // CAMBRA does not take of the savings).
    const sum = p.economicTerms.successFeeRate + p.economicTerms.merchantShareRate;
    if (Math.abs(sum - 1) > 1e-9) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["economicTerms", "merchantShareRate"],
        message: `successFeeRate + merchantShareRate must sum to 1 (got ${sum})`,
      });
    }
    // Referral floor must never exceed the start.
    if (p.referralTerms.floorRate > p.referralTerms.startRate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["referralTerms", "floorRate"],
        message: "floorRate must not exceed startRate",
      });
    }
    // Step must be strictly positive (a zero step would freeze the ladder).
    if (p.referralTerms.stepRate <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["referralTerms", "stepRate"],
        message: "stepRate must be > 0",
      });
    }
    // Payments is the only production-enabled, merchant-visible vertical.
    for (const k of VERTICAL_KEYS) {
      const v = p.productScope[k];
      if (k === "payments") {
        if (!v.productionEnabled || !v.merchantVisible) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["productScope", "payments"],
            message: "payments must be productionEnabled and merchantVisible",
          });
        }
      } else if (v.productionEnabled || v.merchantVisible) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["productScope", k],
          message: `${k} must not be productionEnabled or merchantVisible`,
        });
      }
    }
    // Stripe must never be classified as "live" (v59.1 honest classification).
    if (p.integrationStatus.stripe === "live") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["integrationStatus", "stripe"],
        message: 'stripe must not be "live" until manual verification is complete',
      });
    }
  });

export function validateProductPolicy(json) {
  return productPolicySchema.parse(json);
}

// ── Deterministic artifact builder ──────────────────────────────────────
// Produces the EXACT text written to both generated artifacts. The frontend
// (.js) and backend (.ts) files are byte-identical, which is what makes the
// "frontend and backend are equivalent" test trivially true and the drift
// check a plain string comparison.
export function buildArtifacts(policy) {
  const header = [
    "// GENERATED FILE — DO NOT EDIT DIRECTLY.",
    "// Source: config/product-policy.json",
    `// policyVersion: ${policy.policyVersion}`,
    `// effectiveDate: ${policy.effectiveDate}`,
    "// Regenerate: npm run policy:generate  ·  Drift check: npm run policy:check",
    "",
  ].join("\n");

  const json = JSON.stringify(policy, null, 2);

  const body = [
    `export const POLICY_VERSION = ${JSON.stringify(policy.policyVersion)};`,
    `export const EFFECTIVE_DATE = ${JSON.stringify(policy.effectiveDate)};`,
    "",
    "// Deep-frozen so no consumer can mutate the canonical values at runtime.",
    "export const PRODUCT_POLICY = (function () {",
    `  const o = ${json};`,
    `  const f = (v) => { if (v && typeof v === "object") { Object.freeze(v); Object.values(v).forEach(f); } return v; };`,
    "  return f(o);",
    "})();",
    "",
    "export const ECONOMIC_TERMS_POLICY = PRODUCT_POLICY.economicTerms;",
    "export const REFERRAL_POLICY = PRODUCT_POLICY.referralTerms;",
    "export const PRODUCT_SCOPE_POLICY = PRODUCT_POLICY.productScope;",
    "export const SUPPORTED_CHANNELS = PRODUCT_POLICY.supportedChannels;",
    "export const INTEGRATION_STATUS = PRODUCT_POLICY.integrationStatus;",
    "",
    "// ── Derived helpers (integer-percent + booleans) ─────────────────────",
    "export function getSuccessFeePct() { return Math.round(ECONOMIC_TERMS_POLICY.successFeeRate * 100); }",
    "export function getMerchantSharePct() { return Math.round(ECONOMIC_TERMS_POLICY.merchantShareRate * 100); }",
    "export function getFeeDurationMonths() { return ECONOMIC_TERMS_POLICY.feeDurationMonths; }",
    "export function getAnalyzerPriceEur() { return ECONOMIC_TERMS_POLICY.analyzerPriceEur; }",
    "export function getReferralStartPct() { return Math.round(REFERRAL_POLICY.startRate * 100); }",
    "export function getReferralStepPct() { return Math.round(REFERRAL_POLICY.stepRate * 100); }",
    "export function getReferralFloorPct() { return Math.round(REFERRAL_POLICY.floorRate * 100); }",
    "export function isProductionEnabled(v) { return !!PRODUCT_SCOPE_POLICY[v]?.productionEnabled; }",
    "export function isMerchantVisible(v) { return !!PRODUCT_SCOPE_POLICY[v]?.merchantVisible; }",
    "export function getMerchantVisibleVerticals() { return Object.keys(PRODUCT_SCOPE_POLICY).filter((k) => PRODUCT_SCOPE_POLICY[k].merchantVisible); }",
    "export function getDormantVerticals() { return Object.keys(PRODUCT_SCOPE_POLICY).filter((k) => !PRODUCT_SCOPE_POLICY[k].productionEnabled); }",
    'export function getIntegrationStatus(name) { return INTEGRATION_STATUS[name] || "unknown"; }',
    'export function formatPercent(rate) { return Math.round(rate * 100) + "%"; }',
    'export function formatDurationMonths(n) { return n + " months"; }',
    "",
  ].join("\n");

  return header + body;
}