// v62.2 CP7 / v62.3 — pre-ECL freeze verification (pure, testable core).
// v62.3 made it STAGE-AWARE: the freeze is no longer a single boolean "nothing
// ECL may exist", it is a declared stage with a CODE-OWNED allowlist. This is
// deliberately not a weakening: an unknown or missing stage is a hard failure,
// the allowlist can only come from this module (never from the CLI or the JSON),
// and everything outside the allowlist stays as forbidden as it was.
import crypto from "node:crypto";

// Precise ECL artifact names — word-anchored so "declare"/"reclassify" never
// false-positive the way a bare /ecl/i would.
export const ECL_NAME_PATTERN = /ecl-policy|EvidenceAttestation|EvidenceLifecycleEvent|EvidenceStrike|ReviewCase|ReviewQueue|ConfidenceResult|NormalizedEvidence/;
export const ECL_FIELD_PATTERN = /confidence_level_ecl|freeze_eligibility|"evidence_status"/;

export const STAGE_PRE_ECL = "PRE_ECL";
export const STAGE_ECL_P1 = "ECL_P1_SCHEMA_ONLY";
// v62.4 — ECL P2: domain contracts + canonical policy. STILL no rule engine, no
// scheduler, no lifecycle handler, no UI and no billing integration: the stage
// widens the allowlist by EXACT PATHS only, never by category or pattern.
export const STAGE_ECL_P2 = "ECL_P2_DOMAIN_CONTRACTS";
// v62.5 — ECL P3: the lifecycle ENGINE (pure domain modules + one I/O handler).
// STILL no scheduler, no reminders, no ReviewQueue UI, no billing integration:
// the stage widens the allowlist by EXACT PATHS only, never by category.
export const STAGE_ECL_P3 = "ECL_P3_LIFECYCLE_ENGINE";
export const STAGES = [STAGE_PRE_ECL, STAGE_ECL_P1, STAGE_ECL_P2, STAGE_ECL_P3];

// Declared transitions. PRE_ECL → P2 is DELIBERATELY ABSENT: P1 cannot be
// skipped, so a repo that never applied the schemas can never reach the
// contracts stage. P2 → P1 exists so the stage is reversible. P3 is reachable
// ONLY from P2 (never from PRE_ECL or P1 — a repo without the domain
// contracts can never gain a lifecycle engine), and P3 → P2 is the rollback.
export const STAGE_TRANSITIONS = {
  [STAGE_PRE_ECL]: [STAGE_ECL_P1],
  [STAGE_ECL_P1]: [STAGE_PRE_ECL, STAGE_ECL_P2],
  [STAGE_ECL_P2]: [STAGE_ECL_P1, STAGE_ECL_P3],
  [STAGE_ECL_P3]: [STAGE_ECL_P2],
};

// CODE-OWNED allowlist for ECL P1. The six schema paths, nothing else — no
// functions, no policy file, no lifecycle engine, no UI.
export const P1_ALLOWLIST = [
  "base44/entities/StatementImport.jsonc",
  "base44/entities/SavingsEvidence.jsonc",
  "base44/entities/EvidenceAttestation.jsonc",
  "base44/entities/EvidenceLifecycleEvent.jsonc",
  "base44/entities/EvidenceStrike.jsonc",
  "base44/entities/ReviewCase.jsonc",
];

// The two schemas that are allowed to CARRY ECL fields in stage P1. Both are
// frozen entries, so their hashes still have to match exactly.
export const P1_ECL_FIELD_PATHS = [
  "base44/entities/StatementImport.jsonc",
  "base44/entities/SavingsEvidence.jsonc",
];

// CODE-OWNED allowlist for ECL P2 = the six P1 schemas plus the EXACT paths of
// the domain-contract layer. Every entry is a full path: no wildcard, no
// directory, no name pattern. Anything not literally listed here is as
// forbidden in P2 as it was in PRE_ECL — including ReviewQueue, rule engines,
// lifecycle handlers, schedulers and UI.
export const P2_ALLOWLIST = [
  ...P1_ALLOWLIST,
  "config/ecl-policy.json",
  "src/lib/eclPolicySchema.js",
  "scripts/generate-ecl-policy.mjs",
  "src/lib/normalizedEvidence.js",
  "src/lib/confidenceResult.js",
  "src/lib/eclGates.js",
  "src/lib/eclSerialize.js",
  // Generated artifacts — same layout product-policy already uses in this repo.
  "src/lib/generated/eclPolicy.js",
  "base44/shared/generated/eclPolicy.ts",
  "base44/shared/generated/eclDomain.ts",
  // P2 tests.
  "src/lib/eclPolicy.test.js",
  "src/lib/normalizedEvidence.test.js",
  "src/lib/confidenceResult.test.js",
  "src/lib/eclGates.test.js",
  "src/lib/eclParity.test.js",
];

// CODE-OWNED allowlist for ECL P3 = everything P2 allowed plus the EXACT paths
// of the lifecycle engine: four pure domain modules, their tests, and ONE I/O
// handler. NO scheduler, NO reminder job, NO ReviewQueue UI, NO billing file is
// listed — adding any of those requires a new stage, not an edit here.
export const P3_ALLOWLIST = [
  ...P2_ALLOWLIST,
  "src/lib/eclLifecycle.js",
  "src/lib/eclReconcile.js",
  "src/lib/eclStrikes.js",
  "src/lib/eclEngine.js",
  "src/lib/eclLifecycle.test.js",
  "src/lib/eclReconcile.test.js",
  "src/lib/eclStrikes.test.js",
  "src/lib/eclEngine.test.js",
  // v62.6 — P3 CLOSURE regression matrix (release-created critical test).
  "src/lib/eclP3Closure.test.js",
  "base44/functions/eclProcessEvidence/entry.ts",
];

export function allowlistForStage(stage) {
  if (stage === STAGE_ECL_P3) return [...P3_ALLOWLIST];
  if (stage === STAGE_ECL_P2) return [...P2_ALLOWLIST];
  if (stage === STAGE_ECL_P1) return [...P1_ALLOWLIST];
  if (stage === STAGE_PRE_ECL) return [];
  throw new Error(`unknown stage: ${stage}`);
}

// Stages in which the ECL policy file (config/ecl-policy.json) may exist.
// PRE_ECL and P1 must keep failing on it — the policy layer starts in P2.
export function eclPolicyFileAllowed(stage) {
  return stage === STAGE_ECL_P2 || stage === STAGE_ECL_P3;
}

/**
 * Resolve the stage declared by config/pre-ecl-freeze.json.
 * A missing or unknown stage THROWS — never defaults to the permissive one.
 */
export function resolveStage(freeze) {
  const stage = freeze?.stage;
  if (!stage) throw new Error("config/pre-ecl-freeze.json declares no stage — refusing to guess");
  if (!STAGES.includes(stage)) throw new Error(`config/pre-ecl-freeze.json declares unknown stage "${stage}"`);
  return stage;
}

export const normalizePath = (p) => String(p).replace(/^\.\//, "");

export const sha256Hex = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

/**
 * entries: [{ path, sha256, allowedChange }] · readFile(path) → Buffer|null.
 * options: { stage } — defaults to the STRICTEST stage (PRE_ECL) when omitted,
 * so a caller that forgets to pass a stage gets more checking, never less.
 * Returns { ok, failures[] }. Detects: missing file / moved path, content
 * change (full-hash), unsanctioned ECL fields, and ECL imports in handlers.
 */
export function checkFreeze(entries, readFile, options = {}) {
  const stage = options.stage || STAGE_PRE_ECL;
  // P2 adds NO schema permission: the same two schemas, and only those, may
  // carry ECL fields. Baseline.jsonc and processUploadedFile stay excluded in
  // every stage, and their hashes are still checked below without exception.
  const eclFieldsAllowedIn =
    stage === STAGE_ECL_P1 || stage === STAGE_ECL_P2 || stage === STAGE_ECL_P3 ? P1_ECL_FIELD_PATHS : [];
  const failures = [];
  for (const entry of entries) {
    const content = readFile(entry.path);
    if (content === null) {
      failures.push(`frozen file missing or moved: ${entry.path}`);
      continue;
    }
    const actual = sha256Hex(content);
    if (actual !== entry.sha256) {
      failures.push(`frozen file modified: ${entry.path} (expected ${entry.sha256.slice(0, 12)}…, got ${actual.slice(0, 12)}…)`);
    }
    const text = content.toString("utf8");
    if (entry.path.endsWith(".jsonc") && ECL_FIELD_PATTERN.test(text) && !eclFieldsAllowedIn.includes(normalizePath(entry.path))) {
      failures.push(`frozen schema contains ECL field: ${entry.path} (stage ${stage})`);
    }
    if (entry.path.endsWith(".ts") && hasEclImports(text)) {
      failures.push(`frozen handler imports ECL code: ${entry.path}`);
    }
  }
  return { ok: failures.length === 0, failures };
}

export function hasEclImports(source) {
  for (const line of source.split("\n")) {
    if (/^\s*import\b/.test(line) && ECL_NAME_PATTERN.test(line)) return true;
  }
  return ECL_NAME_PATTERN.test(source);
}