// v62.3 — the stage-aware freeze gate must be STRICTER, not looser.
// These tests prove: an unknown/missing stage is a hard failure, the allowlist
// is code-owned (never widened by config), P2 is unreachable, and everything
// outside the allowlist stays as forbidden as it was before P1.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { Buffer } from "node:buffer";
import {
  checkFreeze,
  resolveStage,
  allowlistForStage,
  sha256Hex,
  STAGES,
  STAGE_PRE_ECL,
  STAGE_ECL_P1,
  STAGE_ECL_P2,
  STAGE_ECL_P3,
  STAGE_ECL_P4,
  STAGE_ECL_P4_PROOF,
  STAGE_TRANSITIONS,
  P1_ALLOWLIST,
  P2_ALLOWLIST,
  P3_ALLOWLIST,
  P4_ALLOWLIST,
  P4_PROOF_ALLOWLIST,
  P1_ECL_FIELD_PATHS,
  ECL_NAME_PATTERN,
  eclPolicyFileAllowed,
} from "../../scripts/lib/preEclFreeze.mjs";

const entryFor = (path, content) => ({ path, sha256: sha256Hex(Buffer.from(content)), allowedChange: false });

describe("ECL stage gate (v62.3)", () => {
  it("refuses a missing stage instead of defaulting to permissive", () => {
    expect(() => resolveStage({})).toThrow(/declares no stage/);
  });

  it("refuses an unknown stage", () => {
    expect(() => resolveStage({ stage: "ECL_P3" })).toThrow(/unknown stage/);
    expect(() => allowlistForStage("ECL_P3")).toThrow(/unknown stage/);
    // The abbreviated name is NOT the declared P2 stage identifier.
    expect(() => allowlistForStage("ECL_P2")).toThrow(/unknown stage/);
  });

  it("declares exactly six stages and NEVER a skip shortcut (v0.63.3)", () => {
    expect(STAGES).toEqual([STAGE_PRE_ECL, STAGE_ECL_P1, STAGE_ECL_P2, STAGE_ECL_P3, STAGE_ECL_P4, STAGE_ECL_P4_PROOF]);
    // P1 cannot be skipped: the only way out of PRE_ECL is P1.
    expect(STAGE_TRANSITIONS[STAGE_PRE_ECL]).toEqual([STAGE_ECL_P1]);
    expect(STAGE_TRANSITIONS[STAGE_PRE_ECL]).not.toContain(STAGE_ECL_P2);
    expect(STAGE_TRANSITIONS[STAGE_ECL_P1]).toEqual([STAGE_PRE_ECL, STAGE_ECL_P2]);
    // P3 is reachable ONLY from P2. P4 is reachable ONLY from P3.
    expect(STAGE_TRANSITIONS[STAGE_ECL_P2]).toEqual([STAGE_ECL_P1, STAGE_ECL_P3]);
    expect(STAGE_TRANSITIONS[STAGE_ECL_P3]).toEqual([STAGE_ECL_P2, STAGE_ECL_P4]);
    expect(STAGE_TRANSITIONS[STAGE_ECL_P4]).toEqual([STAGE_ECL_P3, STAGE_ECL_P4_PROOF]);
    expect(STAGE_TRANSITIONS[STAGE_ECL_P4_PROOF]).toEqual([STAGE_ECL_P4]);
    expect(STAGE_TRANSITIONS[STAGE_PRE_ECL]).not.toContain(STAGE_ECL_P3);
    expect(STAGE_TRANSITIONS[STAGE_ECL_P1]).not.toContain(STAGE_ECL_P3);
    expect(STAGE_TRANSITIONS[STAGE_PRE_ECL]).not.toContain(STAGE_ECL_P4);
    expect(STAGE_TRANSITIONS[STAGE_ECL_P1]).not.toContain(STAGE_ECL_P4);
    expect(STAGE_TRANSITIONS[STAGE_ECL_P2]).not.toContain(STAGE_ECL_P4);
  });

  it("P2 artifacts stay blocked in stage P1 (v62.4)", () => {
    const p1 = allowlistForStage(STAGE_ECL_P1);
    for (const p of ["config/ecl-policy.json", "src/lib/confidenceResult.js", "src/lib/eclGates.js", "base44/shared/generated/eclDomain.ts"]) {
      expect(p1).not.toContain(p);
    }
    expect(eclPolicyFileAllowed(STAGE_PRE_ECL)).toBe(false);
    expect(eclPolicyFileAllowed(STAGE_ECL_P1)).toBe(false);
    expect(eclPolicyFileAllowed(STAGE_ECL_P2)).toBe(true);
    expect(eclPolicyFileAllowed(STAGE_ECL_P3)).toBe(true);
    expect(eclPolicyFileAllowed(STAGE_ECL_P4)).toBe(true);
    expect(eclPolicyFileAllowed(STAGE_ECL_P4_PROOF)).toBe(true);
  });

  it("the P2 allowlist is exact paths only — no wildcard, no directory, no pattern", () => {
    expect(P2_ALLOWLIST.slice(0, 6)).toEqual(P1_ALLOWLIST);
    expect(P2_ALLOWLIST).toHaveLength(21);
    for (const p of P2_ALLOWLIST) {
      expect(p).not.toMatch(/[*?]/);
      expect(p).toMatch(/\.(jsonc|json|js|ts|mjs)$/);
    }
    // Nothing beyond the declared contract layer is admitted.
    for (const p of P2_ALLOWLIST) {
      expect(p).not.toMatch(/ReviewQueue|lifecycle|scheduler|cron|entities\/Confidence/);
    }
  });

  it("P2 grants NO schema permission beyond P1 (Baseline and the handler stay excluded)", () => {
    const res = checkFreeze(
      [
        entryFor("base44/entities/Baseline.jsonc", '{"name":"Baseline","properties":{"freeze_eligibility":{}}}'),
        entryFor("base44/functions/processUploadedFile/entry.ts", "import { ConfidenceResult } from 'x';"),
      ],
      (p) => Buffer.from(p.endsWith(".jsonc") ? '{"name":"Baseline","properties":{"freeze_eligibility":{}}}' : "import { ConfidenceResult } from 'x';"),
      { stage: STAGE_ECL_P2 },
    );
    expect(res.failures.some((f) => f.includes("Baseline.jsonc"))).toBe(true);
    expect(res.failures.some((f) => f.includes("imports ECL code"))).toBe(true);
  });

  it("PRE_ECL has an empty allowlist; P1 allows exactly the six schemas", () => {
    expect(allowlistForStage(STAGE_PRE_ECL)).toEqual([]);
    expect(allowlistForStage(STAGE_ECL_P1)).toHaveLength(6);
    expect(P1_ALLOWLIST).toEqual([
      "base44/entities/StatementImport.jsonc",
      "base44/entities/SavingsEvidence.jsonc",
      "base44/entities/EvidenceAttestation.jsonc",
      "base44/entities/EvidenceLifecycleEvent.jsonc",
      "base44/entities/EvidenceStrike.jsonc",
      "base44/entities/ReviewCase.jsonc",
    ]);
  });

  it("only StatementImport and SavingsEvidence may carry ECL fields", () => {
    expect(P1_ECL_FIELD_PATHS).toEqual([
      "base44/entities/StatementImport.jsonc",
      "base44/entities/SavingsEvidence.jsonc",
    ]);
  });

  it("an omitted stage is treated as the STRICTEST stage (more checking, not less)", () => {
    const content = '{"name":"StatementImport","properties":{"evidence_status":{"type":"string"}}}';
    const entries = [entryFor("base44/entities/StatementImport.jsonc", content)];
    const strict = checkFreeze(entries, () => Buffer.from(content));
    expect(strict.failures.some((f) => f.includes("ECL field"))).toBe(true);
  });

  it("in stage P1 the two sanctioned schemas may carry ECL fields, Baseline may not", () => {
    const ok = '{"name":"SavingsEvidence","properties":{"confidence_level_ecl":{"type":"string"}}}';
    const bad = '{"name":"Baseline","properties":{"freeze_eligibility":{"type":"string"}}}';
    const res = checkFreeze(
      [entryFor("base44/entities/SavingsEvidence.jsonc", ok), entryFor("base44/entities/Baseline.jsonc", bad)],
      (p) => Buffer.from(p.includes("SavingsEvidence") ? ok : bad),
      { stage: STAGE_ECL_P1 },
    );
    expect(res.failures).toHaveLength(1);
    expect(res.failures[0]).toContain("base44/entities/Baseline.jsonc");
  });

  it("a hash mismatch still fails inside the allowlist (P1 is not a free pass)", () => {
    const entries = [entryFor("base44/entities/ReviewCase.jsonc", "original")];
    const res = checkFreeze(entries, () => Buffer.from("tampered"), { stage: STAGE_ECL_P1 });
    expect(res.failures[0]).toContain("frozen file modified");
  });

  it("the LIVE repo declares P4 Production Proof with an allowlist matching the code (v0.63.3)", () => {
    const freeze = JSON.parse(fs.readFileSync(new URL("../../config/pre-ecl-freeze.json", import.meta.url), "utf8"));
    expect(resolveStage(freeze)).toBe(STAGE_ECL_P4_PROOF);
    expect([...freeze.allowlist].sort()).toEqual([...P4_PROOF_ALLOWLIST].sort());
    // Still the same 8 frozen entries: Production Proof adds operator surfaces, not model count.
    expect(freeze.entries).toHaveLength(8);
  });

  it("the P3 allowlist widens P2 by EXACT engine paths only — no wildcard, no new schema, no scheduler (v62.5)", () => {
    expect(P3_ALLOWLIST.slice(0, P2_ALLOWLIST.length)).toEqual(P2_ALLOWLIST);
    expect(P3_ALLOWLIST).toHaveLength(31);
    for (const p of P3_ALLOWLIST) {
      expect(p).not.toMatch(/[*?]/);
      expect(p).not.toMatch(/ReviewQueue|scheduler|cron|reminder|entities\/Confidence/);
    }
    // P3 grants NO new entity permission: the only entities on the list are P1's six.
    expect(P3_ALLOWLIST.filter((p) => p.startsWith("base44/entities/"))).toEqual(P1_ALLOWLIST);
    // Exactly ONE I/O surface: the eclProcessEvidence handler.
    expect(P3_ALLOWLIST.filter((p) => p.startsWith("base44/functions/"))).toEqual(["base44/functions/eclProcessEvidence/entry.ts"]);
  });

  it("the LIVE change log records the P4 stage advance and every freeze mutation", () => {
    const log = JSON.parse(fs.readFileSync(new URL("../../config/freeze-change-log.json", import.meta.url), "utf8"));
    const types = log.changes.map((c) => c.type);
    expect(types.filter((t) => t === "stage_advance").length).toBeGreaterThanOrEqual(4);
    expect(types.filter((t) => t === "freeze_update").length).toBeGreaterThanOrEqual(2);
    expect(types.filter((t) => t === "freeze_add").length).toBeGreaterThanOrEqual(4);
    expect(log.changes.some((c) => c.type === "stage_advance" && c.fromStage === STAGE_ECL_P3 && c.toStage === STAGE_ECL_P4)).toBe(true);
    expect(log.changes.every((c) => typeof c.reason === "string" && c.reason.trim().length > 0)).toBe(true);
  });

  it("P3 historical scope stayed BOUNDED — no scheduler, no reminders, no ReviewQueue, no new entity (v62.5)", () => {
    const forbidden = [
      "base44/entities/ConfidenceResult.jsonc",
      "base44/entities/NormalizedEvidence.jsonc",
      "base44/entities/ReviewQueue.jsonc",
      "src/lib/eclRules.js",
      "base44/shared/eclRules.ts",
      "base44/functions/eclLifecycleTick/entry.ts",
      "base44/functions/evaluateEclConfidence/entry.ts",
    ];
    for (const p of forbidden) {
      expect(fs.existsSync(new URL(`../../${p}`, import.meta.url))).toBe(false);
    }
    // The generated domain artifact (engine included) stays PURE: no SDK, no
    // network, no clock. All I/O lives in the one allowlisted handler.
    const domain = fs.readFileSync(new URL("../../base44/shared/generated/eclDomain.ts", import.meta.url), "utf8");
    expect(domain).not.toMatch(/base44\.(entities|integrations)/);
    expect(domain).not.toMatch(/fetch\(/);
    expect(domain).not.toMatch(/new Date\(\)/);
    // No wall-clock CALL anywhere in code (the doctrine comment in eclGates
    // mentions the token, so comments are excluded line-by-line).
    const codeLines = domain.split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l));
    expect(codeLines.some((l) => l.includes("Date.now()"))).toBe(false);
  });

  it("P4 widens P3 by exact operational paths only — no billing surface", () => {
    expect(P4_ALLOWLIST.slice(0, P3_ALLOWLIST.length)).toEqual(P3_ALLOWLIST);
    expect(P4_ALLOWLIST).toHaveLength(36);
    for (const p of P4_ALLOWLIST) {
      expect(p).not.toMatch(/[*?]/);
      expect(p).not.toMatch(/Invoice|MonthlySavingsReport|BillingRule|stripe|payout|success_fee/i);
    }
    expect(P4_ALLOWLIST.filter((p) => p.startsWith("base44/functions/"))).toEqual([
      "base44/functions/eclProcessEvidence/entry.ts",
      "base44/functions/eclLifecycleScheduler/entry.ts",
      "base44/functions/eclReviewWorkflow/entry.ts",
    ]);
  });

  it("P4 Production Proof widens P4 by the exact operator surface only — still no billing", () => {
    expect(P4_PROOF_ALLOWLIST.slice(0, P4_ALLOWLIST.length)).toEqual(P4_ALLOWLIST);
    expect(P4_PROOF_ALLOWLIST).toHaveLength(39);
    expect(P4_PROOF_ALLOWLIST.slice(P4_ALLOWLIST.length)).toEqual([
      "src/pages/admin/ReviewQueue.jsx",
      "src/lib/eclP4ProductionProof.test.js",
      "base44/functions/eclLifecycleScheduler/function.jsonc",
    ]);
    for (const p of P4_PROOF_ALLOWLIST) {
      expect(p).not.toMatch(/[*?]/);
      expect(p).not.toMatch(/Invoice|MonthlySavingsReport|BillingRule|stripe|payout|success_fee/i);
    }
  });

  it("P4 name detection catches camelCase ECL production artifacts without bare-ecl false positives", () => {
    for (const name of ["eclOperations.js", "eclPersistence.ts", "eclLifecycleScheduler", "eclReviewWorkflow", "eclProcessEvidence", "eclP4ProductionProof.test.js"]) {
      expect(ECL_NAME_PATTERN.test(name), `must detect ${name}`).toBe(true);
    }
    for (const safe of ["declare.js", "reclassify.ts", "vehicle.js"]) {
      expect(ECL_NAME_PATTERN.test(safe), `must not false-positive ${safe}`).toBe(false);
    }
  });

  it("the ECL policy exists ONLY as an allowlisted P2+ artifact", () => {
    expect(fs.existsSync(new URL("../../config/ecl-policy.json", import.meta.url))).toBe(true);
    expect(P2_ALLOWLIST).toContain("config/ecl-policy.json");
    expect(P1_ALLOWLIST).not.toContain("config/ecl-policy.json");
  });
});