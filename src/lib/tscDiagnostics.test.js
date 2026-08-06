import { describe, it, expect } from "vitest";
import { parseTscOutput, compareToBaseline, countByFingerprint, fingerprintOf } from "../../scripts/lib/tscDiagnostics.mjs";

const FIXTURE = [
  "src/lib/a.js(10,5): error TS2339: Property 'x' does not exist on type 'Y'.",
  "src/lib/a.js(20,5): error TS2339: Property 'x' does not exist on type 'Y'.",
  "src/lib/b.js(3,1): error TS2304: Cannot find name 'foo'.",
  "not a diagnostic line",
].join("\n");

describe("tsc diagnostics (v62.2 CP4)", () => {
  it("parses diagnostics and assigns stable fingerprints", () => {
    const diags = parseTscOutput(FIXTURE);
    expect(diags).toHaveLength(3);
    // Same file+code+message on different lines → same fingerprint.
    expect(diags[0].fingerprint).toBe(diags[1].fingerprint);
    expect(diags[0].fingerprint).not.toBe(diags[2].fingerprint);
    expect(fingerprintOf("src/lib/a.js", "TS2339", "m")).toBe(fingerprintOf("src\\lib\\a.js", "TS2339", "m"));
  });

  const baselineEntries = () => {
    const entries = {};
    for (const [fp, e] of countByFingerprint(parseTscOutput(FIXTURE)).entries()) {
      entries[fp] = { file: e.file, code: e.code, count: e.count };
    }
    return entries;
  };

  it("passes when debt is unchanged and reports eliminated debt", () => {
    const base = baselineEntries();
    const same = compareToBaseline(parseTscOutput(FIXTURE), base);
    expect(same.ok).toBe(true);
    const fewer = compareToBaseline(parseTscOutput(FIXTURE.split("\n").slice(0, 2).join("\n")), base);
    expect(fewer.ok).toBe(true);
    expect(fewer.eliminated).toBe(1);
  });

  it("fails on a new fingerprint", () => {
    const withNew = FIXTURE + "\nsrc/lib/c.js(1,1): error TS7006: Parameter 'p' implicitly has an 'any' type.";
    const res = compareToBaseline(parseTscOutput(withNew), baselineEntries());
    expect(res.ok).toBe(false);
    expect(res.failures.some((f) => f.includes("new fingerprint"))).toBe(true);
  });

  it("fails on a worsened count of an existing fingerprint", () => {
    const worsened = FIXTURE + "\nsrc/lib/a.js(30,5): error TS2339: Property 'x' does not exist on type 'Y'.";
    const res = compareToBaseline(parseTscOutput(worsened), baselineEntries());
    expect(res.failures.some((f) => f.includes("worsened"))).toBe(true);
  });

  it("fails on ANY error in the critical set, even if baselined", () => {
    const res = compareToBaseline(parseTscOutput(FIXTURE), baselineEntries(), { criticalFiles: ["src/lib/b.js"] });
    expect(res.ok).toBe(false);
    expect(res.failures.some((f) => f.includes("critical-set"))).toBe(true);
  });

  it("fails on ANY error in a file modified this release, even if baselined", () => {
    const res = compareToBaseline(parseTscOutput(FIXTURE), baselineEntries(), { modifiedFiles: ["src/lib/a.js"] });
    expect(res.failures.some((f) => f.includes("modified-file"))).toBe(true);
  });
});