// GENERATED FILE — DO NOT EDIT DIRECTLY.
// Source: config/ecl-policy.json
// policyVersion: ecl-2026.08
// effectiveDate: 2026-08-06
// Regenerate: npm run ecl:generate  ·  Drift check: npm run ecl:check
export const ECL_POLICY_VERSION = "ecl-2026.08";
export const ECL_EFFECTIVE_DATE = "2026-08-06";

// Deep-frozen so no consumer can mutate the canonical policy at runtime.
export const ECL_POLICY = (function () {
  const o = {
  "schemaVersion": 1,
  "policyVersion": "ecl-2026.08",
  "effectiveDate": "2026-08-06",
  "confidenceOrder": [
    "unknown",
    "low",
    "medium",
    "high"
  ],
  "windows": {
    "provisionalDays": 7,
    "remindAtHours": [
      72,
      144
    ]
  },
  "strikes": {
    "threshold": 2,
    "windowDays": 90
  },
  "attestationRetentionYears": 5,
  "reconciliation": {
    "commerceVsPaymentsMaxDeltaPct": 15
  },
  "plausibility": {
    "feeVsRateTableMaxMultiple": 3
  },
  "gates": {
    "show_estimate": {
      "minConfidence": "low",
      "allowedStatuses": [
        "estimated",
        "accepted_provisionally",
        "verified"
      ]
    },
    "show_dashboard": {
      "minConfidence": "medium",
      "allowedStatuses": [
        "estimated",
        "accepted_provisionally",
        "verified"
      ],
      "requiresNotExpired": true
    },
    "benchmark_include": {
      "minConfidence": "high",
      "allowedStatuses": [
        "verified"
      ],
      "allowedVerificationMethods": [
        "independent_api",
        "independent_document"
      ]
    },
    "recover_proposal": {
      "minConfidence": "medium",
      "allowedStatuses": [
        "accepted_provisionally",
        "verified"
      ],
      "requiresAttestation": true,
      "requiresNotExpired": true
    },
    "baseline_provisional": {
      "minConfidence": "high",
      "allowedStatuses": [
        "accepted_provisionally",
        "verified"
      ],
      "requiresAttestation": true,
      "requiresNotExpired": true
    },
    "freeze_baseline": {
      "minConfidence": "high",
      "allowedStatuses": [
        "verified"
      ],
      "allowedVerificationMethods": [
        "independent_api",
        "independent_document"
      ],
      "requiresNotExpired": true
    },
    "approve_report": {
      "minConfidence": "high",
      "allowedStatuses": [
        "verified"
      ],
      "requiresNotExpired": true,
      "requiresNoOpenConflicts": true
    },
    "create_invoice": {
      "minConfidence": "high",
      "allowedStatuses": [
        "verified"
      ],
      "allowedVerificationMethods": [
        "independent_api",
        "independent_document"
      ],
      "requiresNotExpired": true,
      "requiresNoOpenConflicts": true,
      "requiresBaselineLocked": true,
      "requiresNoBlockingReviewCase": true,
      "blockingStrikeThreshold": 2,
      "blockingStrikeScopes": [
        "payments"
      ]
    },
    "recalc_billed_period": {
      "automation": "forbidden",
      "manualResolution": "credit_note_or_adjustment_only",
      "requiresHumanReview": true
    }
  },
  "notes": {
    "scope": "v62.4 ECL P2 — DOMAIN CONTRACTS AND POLICY ONLY. Nothing in this repo reads these gates yet: there is no rule engine, no scheduler, no lifecycle handler, no ReviewQueue, no UI and no billing integration. Recover Margin billing remains governed exclusively by the pre-existing verified-savings machinery.",
    "noMinStatus": "Statuses are deliberately expressed as allowedStatuses (a SET), never as a minStatus (a SCALE): 'rejected' is not a lesser 'verified', and 'superseded' is not a step on the way to it. Any ordering over statuses would be a fiction.",
    "attestationRetentionYears": "PROVISIONAL — 5 years is a working assumption, NOT validated by FR counsel. It must be reviewed and confirmed by a French lawyer before P7, and no purge or deletion job may be built on it until then.",
    "createInvoiceInvariant": "create_invoice may never admit unverified evidence: verified status, high confidence and an INDEPENDENT verification method are structural requirements enforced by the schema, not merely values in this file.",
    "recalcBilledPeriod": "Recalculating an already-billed period is never automatable. The only sanctioned resolution is a credit note or an adjustment, decided by a human."
  }
};
  const f = (v) => { if (v && typeof v === "object") { Object.freeze(v); Object.values(v).forEach(f); } return v; };
  return f(o);
})();

export const ECL_GATES = ECL_POLICY.gates;
export const ECL_CONFIDENCE_ORDER = ECL_POLICY.confidenceOrder;
export const ECL_WINDOWS = ECL_POLICY.windows;
export const ECL_STRIKES = ECL_POLICY.strikes;

export function getEclGate(name) { return ECL_GATES[name]; }
export function getEclConfidenceRank(level) { return ECL_CONFIDENCE_ORDER.indexOf(level); }
export function getProvisionalWindowDays() { return ECL_WINDOWS.provisionalDays; }
export function getReminderHours() { return ECL_WINDOWS.remindAtHours; }
export function getStrikeThreshold() { return ECL_STRIKES.threshold; }
