import { describe, expect, it } from "vitest";
import { collectSourceTreeEntries } from "../../scripts/lib/sourceTreeHash.mjs";
import {
  collectReleasePayloadPaths,
  RELEASE_CONTROL_FILES,
  RELEASE_GENERATED_DIRS,
} from "../../scripts/lib/releasePayload.mjs";
import { RELEASE_EVIDENCE_BINDINGS } from "../../scripts/lib/evidence.mjs";
import fs from "node:fs";

describe("release payload source binding", () => {
  it("contains every and only canonically selected source path plus explicit control evidence", () => {
    const sourcePaths = collectSourceTreeEntries(".").map((entry) => entry.path);
    const payload = collectReleasePayloadPaths(".");
    expect(sourcePaths.every((rel) => payload.includes(rel))).toBe(true);
    const allowedExtra = payload.filter((rel) => !sourcePaths.includes(rel));
    expect(allowedExtra.every((rel) => (
      RELEASE_CONTROL_FILES.includes(rel)
      || rel.startsWith(".release-evidence/")
      || RELEASE_GENERATED_DIRS.some((directory) => rel.startsWith(`${directory}/`))
    ))).toBe(true);
    expect(payload).toContain("base44/.deploy/manifest.json");
    expect(payload.some((rel) => rel.startsWith("base44/.deploy/functions/"))).toBe(true);
  });

  it("cannot silently package an excluded zip", () => {
    expect(collectReleasePayloadPaths(".").some((rel) => rel.endsWith(".zip"))).toBe(false);
  });

  it("validates the exact evidence keys emitted by RELEASE.json", () => {
    const packager = fs.readFileSync("scripts/package-release.mjs", "utf8");
    expect(Object.keys(RELEASE_EVIDENCE_BINDINGS)).toEqual([
      "testEvidence",
      "buildEvidence",
      "lintEvidence",
      "typecheckCriticalEvidence",
      "typecheckBaselineEvidence",
      "dependencyAuditEvidence",
    ]);
    expect(packager).toContain("RELEASE_EVIDENCE_BINDINGS");
    expect(packager).toContain("releaseEvidenceStatus");
    expect(packager).not.toContain('`${name}Evidence`');
  });

  it("re-runs canonical verification before reading or packaging RELEASE.json", () => {
    const packager = fs.readFileSync("scripts/package-release.mjs", "utf8");
    expect(packager).toContain('["run", "verify"]');
    expect(packager.indexOf("const verified = spawnSync")).toBeLessThan(
      packager.indexOf("const release = JSON.parse"),
    );
    expect(packager).toContain("releaseControlHash");
    expect(packager).toContain("source tree changed during packaging");
  });

  it("rejects every production-seal filename spelling while the manifest is ineligible", () => {
    const packager = fs.readFileSync("scripts/package-release.mjs", "utf8");
    expect(packager).toContain("/(?:production|prod)[-_ ]?seal(?:ed)?/i");
    expect(packager).toContain("release.productionSealEligible !== true");
  });

  it("projects market, intelligence-closure and research boundaries into the external integrity receipt", () => {
    const packager = fs.readFileSync("scripts/package-release.mjs", "utf8");
    expect(packager).toContain("market_launch_scope: release.marketLaunchScope");
    expect(packager).toContain("intelligence_closure: release.intelligenceClosure");
    expect(packager).toContain("research_corpus: release.researchCorpus");
  });
});
