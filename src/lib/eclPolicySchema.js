// v62.4 — ECL P2: canonical validation for config/ecl-policy.json.
//
// Imported by the generator (scripts/generate-ecl-policy.mjs) and by the drift
// test. Pure, no fs. Same pattern as productPolicySchema.js: JSON is the single
// source of truth, the schema is the FORMAL contract it must satisfy, and the
// artifacts are generated deterministically from the validated object.
//
// The invariants below are the point of this file. A policy that merely parses
// is not enough: the shape must make an unsafe policy IMPOSSIBLE to express —
// most importantly, create_invoice can never be relaxed into accepting
// unverified or merely attested evidence.

import { z } from "zod";
// Relative (not "@/") — also imported by a Node script with no Vite aliases.
import { isCalendarDate, CALENDAR_DATE_MESSAGE } from "./calendarDate.js";
import { CONFIDENCE_LEVELS, EVIDENCE_STATUSES, VERIFICATION_METHODS } from "./confidenceResult.js";

// Verification methods that are NOT independent evidence of a figure.
const NON_INDEPENDENT_METHODS = ["attested_only", "none"];

const confidenceEnum = z.enum(["high", "medium", "low", "unknown"]);

const evaluableGate = z.object({
  minConfidence: confidenceEnum,
  allowedStatuses: z.array(z.enum(EVIDENCE_STATUSES)).min(1),
  allowedVerificationMethods: z.array(z.enum(VERIFICATION_METHODS)).min(1).optional(),
  requiresAttestation: z.boolean().optional(),
  requiresNotExpired: z.boolean().optional(),
  requiresNoOpenConflicts: z.boolean().optional(),
  requiresBaselineLocked: z.boolean().optional(),
  requiresNoBlockingReviewCase: z.boolean().optional(),
  blockingStrikeThreshold: z.number().int().min(1).optional(),
  blockingStrikeScopes: z.array(z.string().min(1)).min(1).optional(),
});

const nonAutomatableGate = z.object({
  automation: z.literal("forbidden"),
  manualResolution: z.string().min(1).optional(),
  requiresHumanReview: z.boolean().optional(),
});

const gateSchema = z.union([nonAutomatableGate, evaluableGate]);

export const eclPolicySchema = z
  .object({
    schemaVersion: z.literal(1),
    policyVersion: z.string().min(1),
    effectiveDate: z.string().refine(isCalendarDate, `effectiveDate ${CALENDAR_DATE_MESSAGE}`),
    confidenceOrder: z.array(confidenceEnum).length(4),
    windows: z.object({
      provisionalDays: z.number().int().positive(),
      remindAtHours: z.array(z.number().int().positive()).min(1),
    }),
    strikes: z.object({
      threshold: z.number().int().min(1),
      windowDays: z.number().int().positive(),
    }),
    attestationRetentionYears: z.number().int().positive(),
    reconciliation: z.object({ commerceVsPaymentsMaxDeltaPct: z.number().min(0).max(100) }),
    plausibility: z.object({ feeVsRateTableMaxMultiple: z.number().positive() }),
    gates: z.record(z.string(), gateSchema),
    notes: z.record(z.string(), z.string()).optional(),
  })
  .superRefine((p, ctx) => {
    const issue = (path, message) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

    // confidenceOrder must contain the four levels exactly once, ascending from
    // the weakest: it is the ONLY ordering the gate layer is allowed to use.
    const seen = new Set(p.confidenceOrder);
    if (seen.size !== 4 || CONFIDENCE_LEVELS.some((l) => !seen.has(l))) {
      issue(["confidenceOrder"], `must contain each of ${CONFIDENCE_LEVELS.join(", ")} exactly once`);
    }
    if (p.confidenceOrder[0] !== "unknown" || p.confidenceOrder[3] !== "high") {
      issue(["confidenceOrder"], 'must be ordered weakest→strongest, starting at "unknown" and ending at "high"');
    }

    // Reminders: strictly increasing, and inside the provisional window — a
    // reminder scheduled after the window closes would never be sent.
    const maxHours = p.windows.provisionalDays * 24;
    p.windows.remindAtHours.forEach((h, i) => {
      if (i > 0 && h <= p.windows.remindAtHours[i - 1]) {
        issue(["windows", "remindAtHours", i], "remindAtHours must be strictly increasing");
      }
      if (h >= maxHours) {
        issue(["windows", "remindAtHours", i], `remindAtHours must be < provisionalDays × 24 (${maxHours})`);
      }
    });

    // Every non-automatable gate must name a human owner for the decision.
    for (const [name, gate] of Object.entries(p.gates)) {
      if (gate.automation === "forbidden" && gate.requiresHumanReview !== true) {
        issue(["gates", name, "requiresHumanReview"], 'a gate with automation "forbidden" must set requiresHumanReview: true');
      }
      if (gate.blockingStrikeThreshold !== undefined && !gate.blockingStrikeScopes) {
        issue(["gates", name, "blockingStrikeScopes"], "blockingStrikeThreshold requires blockingStrikeScopes");
      }
      if (gate.minConfidence && !p.confidenceOrder.includes(gate.minConfidence)) {
        issue(["gates", name, "minConfidence"], "minConfidence must appear in confidenceOrder");
      }
      // Statuses are a set, never a scale.
      if (Object.prototype.hasOwnProperty.call(gate, "minStatus")) {
        issue(["gates", name, "minStatus"], "minStatus is forbidden: evidence statuses are not an ordered scale");
      }
    }

    // STRUCTURAL INVARIANT — create_invoice can never admit unverified evidence.
    const inv = p.gates.create_invoice;
    if (!inv) {
      issue(["gates", "create_invoice"], "create_invoice gate is required");
    } else if (inv.automation === "forbidden") {
      issue(["gates", "create_invoice"], "create_invoice must be an evaluable gate, not automation: forbidden");
    } else {
      if (inv.minConfidence !== "high") {
        issue(["gates", "create_invoice", "minConfidence"], 'create_invoice requires minConfidence "high"');
      }
      if (inv.allowedStatuses.length !== 1 || inv.allowedStatuses[0] !== "verified") {
        issue(["gates", "create_invoice", "allowedStatuses"], 'create_invoice may only allow the "verified" status');
      }
      if (!inv.allowedVerificationMethods) {
        issue(["gates", "create_invoice", "allowedVerificationMethods"], "create_invoice must restrict verification methods to independent evidence");
      } else if (inv.allowedVerificationMethods.some((m) => NON_INDEPENDENT_METHODS.includes(m))) {
        issue(["gates", "create_invoice", "allowedVerificationMethods"], `create_invoice must not accept ${NON_INDEPENDENT_METHODS.join(" or ")}`);
      }
      if (inv.requiresNotExpired !== true) {
        issue(["gates", "create_invoice", "requiresNotExpired"], "create_invoice requires requiresNotExpired: true");
      }
      if (inv.requiresNoOpenConflicts !== true) {
        issue(["gates", "create_invoice", "requiresNoOpenConflicts"], "create_invoice requires requiresNoOpenConflicts: true");
      }
    }

    // freeze_baseline is the strongest gate: independent evidence only.
    const fb = p.gates.freeze_baseline;
    if (fb && fb.automation !== "forbidden") {
      if (!fb.allowedVerificationMethods || fb.allowedVerificationMethods.some((m) => NON_INDEPENDENT_METHODS.includes(m))) {
        issue(["gates", "freeze_baseline", "allowedVerificationMethods"], "freeze_baseline must require independent verification");
      }
    }
  });

export function validateEclPolicy(json) {
  return eclPolicySchema.parse(json);
}

// ── Deterministic artifact builder ──────────────────────────────────────
// The frontend (.js) and backend (.ts) policy artifacts are byte-identical, so
// "frontend and backend are equivalent" is a plain string comparison.
export function buildEclPolicyArtifact(policy) {
  const header = [
    "// GENERATED FILE — DO NOT EDIT DIRECTLY.",
    "// Source: config/ecl-policy.json",
    `// policyVersion: ${policy.policyVersion}`,
    `// effectiveDate: ${policy.effectiveDate}`,
    "// Regenerate: npm run ecl:generate  ·  Drift check: npm run ecl:check",
    "",
  ].join("\n");

  const json = JSON.stringify(policy, null, 2);

  const body = [
    `export const ECL_POLICY_VERSION = ${JSON.stringify(policy.policyVersion)};`,
    `export const ECL_EFFECTIVE_DATE = ${JSON.stringify(policy.effectiveDate)};`,
    "",
    "// Deep-frozen so no consumer can mutate the canonical policy at runtime.",
    "export const ECL_POLICY = (function () {",
    `  const o = ${json};`,
    `  const f = (v) => { if (v && typeof v === "object") { Object.freeze(v); Object.values(v).forEach(f); } return v; };`,
    "  return f(o);",
    "})();",
    "",
    "export const ECL_GATES = ECL_POLICY.gates;",
    "export const ECL_CONFIDENCE_ORDER = ECL_POLICY.confidenceOrder;",
    "export const ECL_WINDOWS = ECL_POLICY.windows;",
    "export const ECL_STRIKES = ECL_POLICY.strikes;",
    "",
    "export function getEclGate(name) { return ECL_GATES[name]; }",
    "export function getEclConfidenceRank(level) { return ECL_CONFIDENCE_ORDER.indexOf(level); }",
    "export function getProvisionalWindowDays() { return ECL_WINDOWS.provisionalDays; }",
    "export function getReminderHours() { return ECL_WINDOWS.remindAtHours; }",
    "export function getStrikeThreshold() { return ECL_STRIKES.threshold; }",
    "",
  ].join("\n");

  return header + body;
}

// ── Domain artifact builder ─────────────────────────────────────────────
// The backend domain module is CONCATENATED from the canonical frontend
// modules, in dependency order, with sibling import lines removed. This is what
// makes a second hand-written backend implementation impossible: there is only
// one source of these functions, and the backend copy is generated from it.
export const DOMAIN_SOURCE_ORDER = [
  "src/lib/calendarDate.js",
  "src/lib/eclSerialize.js",
  "src/lib/normalizedEvidence.js",
  "src/lib/confidenceResult.js",
  "src/lib/eclGates.js",
];

// Matches a whole import statement, including the multi-line brace form.
const SIBLING_IMPORT_BLOCK =
  /^import\s+[^;]*?from\s+"\.\/(?:calendarDate|eclSerialize|normalizedEvidence|confidenceResult)\.js";[ \t]*\r?\n/gm;

export function buildEclDomainArtifact(sources) {
  const header = [
    "// GENERATED FILE — DO NOT EDIT DIRECTLY.",
    "// Source (concatenated, in dependency order):",
    ...DOMAIN_SOURCE_ORDER.map((p) => `//   · ${p}`),
    "// Regenerate: npm run ecl:generate  ·  Drift check: npm run ecl:check",
    "//",
    "// This is the BACKEND artifact of the ECL P2 domain contracts. It is not a",
    "// second implementation: every function below is generated verbatim from the",
    "// canonical frontend modules, so frontend and backend cannot diverge.",
    "",
  ].join("\n");

  const parts = DOMAIN_SOURCE_ORDER.map((rel) => {
    const text = sources[rel];
    if (typeof text !== "string") throw new Error(`missing domain source: ${rel}`);
    // Drop only sibling imports; any OTHER import is a real dependency and must
    // fail loudly rather than be silently stripped into a broken artifact.
    const kept = text.replace(SIBLING_IMPORT_BLOCK, "").trim();
    if (/^import\s/m.test(kept)) {
      throw new Error(`${rel} has a non-sibling import: the domain artifact must be self-contained`);
    }
    return [`// ──── ${rel} ────`, kept, ""].join("\n");
  });

  // v62.4.1 — emitted WITHOUT a trailing newline: the platform's durable write
  // path strips a final newline, so an artifact ending in "\n" could never be
  // persisted byte-identical to the generator output (permanent ecl:check drift).
  return (header + parts.join("\n")).replace(/\n+$/, "");
}