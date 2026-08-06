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
  STAGE_TRANSITIONS,
  P1_ALLOWLIST,
  P1_ECL_FIELD_PATHS,
} from "../../scripts/lib/preEclFreeze.mjs";

const entryFor = (path, content) => ({ path, sha256: sha256Hex(Buffer.from(content)), allowedChange: false });

describe("ECL stage gate (v62.3)", () => {
  it("refuses a missing stage instead of defaulting to permissive", () => {
    expect(() => resolveStage({})).toThrow(/declares no stage/);
  });

  it("refuses an unknown stage", () => {
    expect(() => resolveStage({ stage: "ECL_P2" })).toThrow(/unknown stage/);
    expect(() => allowlistForStage("ECL_P2")).toThrow(/unknown stage/);
  });

  it("declares exactly two stages and never a P2 transition", () => {
    expect(STAGES).toEqual([STAGE_PRE_ECL, STAGE_ECL_P1]);
    expect(STAGE_TRANSITIONS[STAGE_PRE_ECL]).toEqual([STAGE_ECL_P1]);
    expect(Object.values(STAGE_TRANSITIONS).flat()).not.toContain("ECL_P2");
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

  it("the LIVE repo declares stage P1 with an allowlist matching the code", () => {
    const freeze = JSON.parse(fs.readFileSync(new URL("../../config/pre-ecl-freeze.json", import.meta.url), "utf8"));
    expect(resolveStage(freeze)).toBe(STAGE_ECL_P1);
    expect([...freeze.allowlist].sort()).toEqual([...P1_ALLOWLIST].sort());
    expect(freeze.entries).toHaveLength(8);
  });

  it("the LIVE change log records the stage advance and every freeze mutation", () => {
    const log = JSON.parse(fs.readFileSync(new URL("../../config/freeze-change-log.json", import.meta.url), "utf8"));
    const types = log.changes.map((c) => c.type);
    expect(types.filter((t) => t === "stage_advance")).toHaveLength(1);
    expect(types.filter((t) => t === "freeze_update")).toHaveLength(2);
    expect(types.filter((t) => t === "freeze_add")).toHaveLength(4);
    expect(log.changes.every((c) => typeof c.reason === "string" && c.reason.trim().length > 0)).toBe(true);
  });

  it("P2 has NOT started — no policy, engine, scheduler or review-queue artifact exists", () => {
    const forbidden = [
      "config/ecl-policy.json",
      "base44/entities/ConfidenceResult.jsonc",
      "base44/entities/NormalizedEvidence.jsonc",
      "base44/entities/ReviewQueue.jsonc",
    ];
    for (const p of forbidden) {
      expect(fs.existsSync(new URL(`../../${p}`, import.meta.url))).toBe(false);
    }
  });
});