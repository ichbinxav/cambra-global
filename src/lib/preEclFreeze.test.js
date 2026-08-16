import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { Buffer } from "node:buffer";
import { checkFreeze, hasEclImports, sha256Hex, ECL_NAME_PATTERN, resolveStage, STAGE_ECL_P8 } from "../../scripts/lib/preEclFreeze.mjs";

const entryFor = (path, content) => ({ path, sha256: sha256Hex(Buffer.from(content)), allowedChange: false });

describe("pre-ECL freeze (v62.2 CP7)", () => {
  it("passes when the repo is intact", () => {
    const files = { "base44/entities/Baseline.jsonc": '{"name":"Baseline"}' };
    const entries = [entryFor("base44/entities/Baseline.jsonc", files["base44/entities/Baseline.jsonc"])];
    const res = checkFreeze(entries, (p) => (files[p] ? Buffer.from(files[p]) : null));
    expect(res.ok).toBe(true);
  });

  it("fails when a frozen schema is modified", () => {
    const entries = [entryFor("base44/entities/Baseline.jsonc", "original")];
    const res = checkFreeze(entries, () => Buffer.from("tampered"));
    expect(res.ok).toBe(false);
    expect(res.failures[0]).toContain("frozen file modified");
  });

  it("fails when a frozen file is missing or moved", () => {
    const entries = [entryFor("base44/functions/processUploadedFile/entry.ts", "code")];
    const res = checkFreeze(entries, () => null);
    expect(res.failures[0]).toContain("missing or moved");
  });

  it("fails when a frozen schema gains an ECL field", () => {
    const content = '{"name":"Baseline","properties":{"confidence_level_ecl":{"type":"string"}}}';
    const entries = [entryFor("base44/entities/Baseline.jsonc", content)];
    const res = checkFreeze(entries, () => Buffer.from(content));
    expect(res.failures.some((f) => f.includes("ECL field"))).toBe(true);
  });

  it("fails when processUploadedFile imports ECL code", () => {
    const content = "import { attest } from '../../shared/EvidenceAttestation.ts';\nDeno.serve(()=>{});";
    const entries = [entryFor("base44/functions/processUploadedFile/entry.ts", content)];
    const res = checkFreeze(entries, () => Buffer.from(content));
    expect(res.failures.some((f) => f.includes("imports ECL"))).toBe(true);
  });

  it("allows an exactly allowlisted ECL-owned handler to be hash-frozen without widening non-ECL handlers", () => {
    const eclContent = "import { workerFreshness } from '../../shared/eclOperationalRecovery.ts';\nexport default () => null;";
    const ordinaryContent = "import { workerFreshness } from '../../shared/eclOperationalRecovery.ts';\nexport default () => null;";
    const entries = [
      entryFor("base44/functions/eclProductionHealth/entry.ts", eclContent),
      entryFor("base44/functions/processUploadedFile/entry.ts", ordinaryContent),
    ];
    const res = checkFreeze(
      entries,
      (path) => Buffer.from(path.includes("eclProductionHealth") ? eclContent : ordinaryContent),
      { stage: STAGE_ECL_P8 },
    );
    expect(res.failures).toEqual([
      "frozen handler imports ECL code: base44/functions/processUploadedFile/entry.ts",
    ]);
  });

  it("hasEclImports does not false-positive on ordinary code (declare, reclassify)", () => {
    expect(hasEclImports("declare const x = 1; // reclassify records")).toBe(false);
    expect(ECL_NAME_PATTERN.test("declare")).toBe(false);
  });

  it("the LIVE repo satisfies the freeze right now (schemas + processUploadedFile)", () => {
    const freeze = JSON.parse(fs.readFileSync(new URL("../../config/pre-ecl-freeze.json", import.meta.url), "utf8"));
    expect(freeze.entries.map((e) => e.path)).toContain("base44/functions/processUploadedFile/entry.ts");
    const res = checkFreeze(freeze.entries, (p) => {
      const abs = new URL(`../../${p}`, import.meta.url);
      return fs.existsSync(abs) ? fs.readFileSync(abs) : null;
    }, { stage: resolveStage(freeze) });
    expect(res.failures).toEqual([]);
  });
});
