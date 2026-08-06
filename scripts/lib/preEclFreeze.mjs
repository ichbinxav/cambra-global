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
export const STAGES = [STAGE_PRE_ECL, STAGE_ECL_P1];

// Declared transitions. P2 is NOT a declared stage: it cannot be reached.
export const STAGE_TRANSITIONS = {
  [STAGE_PRE_ECL]: [STAGE_ECL_P1],
  [STAGE_ECL_P1]: [STAGE_PRE_ECL],
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

export function allowlistForStage(stage) {
  if (stage === STAGE_ECL_P1) return [...P1_ALLOWLIST];
  if (stage === STAGE_PRE_ECL) return [];
  throw new Error(`unknown stage: ${stage}`);
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
  const eclFieldsAllowedIn = stage === STAGE_ECL_P1 ? P1_ECL_FIELD_PATHS : [];
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