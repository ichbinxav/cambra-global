// v62.2 CP7 — pre-ECL freeze verification (pure, testable core).
import crypto from "node:crypto";

// Precise ECL artifact names — word-anchored so "declare"/"reclassify" never
// false-positive the way a bare /ecl/i would.
export const ECL_NAME_PATTERN = /ecl-policy|EvidenceAttestation|EvidenceLifecycleEvent|EvidenceStrike|ReviewCase|ReviewQueue|ConfidenceResult|NormalizedEvidence/;
export const ECL_FIELD_PATTERN = /confidence_level_ecl|freeze_eligibility|"evidence_status"/;

export const sha256Hex = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

/**
 * entries: [{ path, sha256, allowedChange }] · readFile(path) → Buffer|null.
 * Returns { ok, failures[] }. Detects: missing file / moved path, content
 * change (full-hash), and — for the frozen handler — ECL imports.
 */
export function checkFreeze(entries, readFile) {
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
    if (entry.path.endsWith(".jsonc") && ECL_FIELD_PATTERN.test(text)) {
      failures.push(`frozen schema contains ECL field: ${entry.path}`);
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