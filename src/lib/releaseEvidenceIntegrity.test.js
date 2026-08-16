import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  evidenceIntegrityStatus,
  evidenceStatus,
  releaseControlHash,
  releaseEvidenceStatus,
  releaseManifestCanonicalStatus,
  sealEvidence,
} from "../../scripts/lib/evidence.mjs";

const TREE = "a".repeat(64);
const testEvidence = (overrides = {}) =>
  sealEvidence({
    command: "npx vitest run --maxWorkers=2 --reporter=default --reporter=json --outputFile=.release-evidence/vitest-raw.json",
    sourceTreeHash: TREE,
    startedAt: "2026-08-13T10:00:00.000Z",
    completedAt: "2026-08-13T10:01:00.000Z",
    exitCode: 0,
    ciRunId: null,
    testFiles: 210,
    passed: 2656,
    failed: 0,
    skipped: 0,
    frameworkVersion: "^4.1.10",
    ...overrides,
  });

describe("release evidence anti-forgery contract", () => {
  it("seals evidence and rejects any post-execution field edit", () => {
    const evidence = testEvidence();
    expect(evidenceIntegrityStatus(evidence)).toBe("valid");
    expect(evidenceStatus(evidence, TREE)).toBe("valid");
    evidence.passed = 999999;
    expect(evidenceIntegrityStatus(evidence)).toBe("tampered");
    expect(evidenceStatus(evidence, TREE)).toBe("tampered");
  });

  it("requires exact on-disk evidence, exact command and plausible totals", () => {
    const onDisk = testEvidence();
    expect(releaseEvidenceStatus("testEvidence", structuredClone(onDisk), onDisk, TREE)).toBe("valid");

    const editedManifestCopy = structuredClone(onDisk);
    editedManifestCopy.passed += 1;
    expect(releaseEvidenceStatus("testEvidence", editedManifestCopy, onDisk, TREE)).toBe("manifest_mismatch");

    const wrongCommand = testEvidence({ command: "node fake-green-tests.mjs" });
    expect(releaseEvidenceStatus("testEvidence", wrongCommand, wrongCommand, TREE)).toBe("wrong_command");

    const impossibleTotals = testEvidence({ passed: 0, testFiles: 0 });
    expect(releaseEvidenceStatus("testEvidence", impossibleTotals, impossibleTotals, TREE)).toBe("failed");
  });

  it("rejects readiness arrays or PRODUCTION_SEALED fields changed after canonical generation", () => {
    const canonical = {
      completedProductionRequirements: ["source verified"],
      pendingProductionRequirements: ["runtime proof required"],
      futureActivationRequirements: ["PAYMENTS V1 REAL-WORLD VALIDATION required"],
      pilotReadyEligible: false,
      realWorldValidatedEligible: false,
      productionSealEligible: false,
      readinessLevel: "NOT_GO_READY",
      finalVerdict: "NOT_GO_READY",
      generatedAt: "2026-08-13T10:00:00.000Z",
    };
    expect(releaseManifestCanonicalStatus(
      { ...canonical, generatedAt: "2026-08-13T10:05:00.000Z" },
      canonical,
    )).toBe("valid");

    const forged = {
      ...canonical,
      pendingProductionRequirements: [],
      futureActivationRequirements: [],
      pilotReadyEligible: true,
      realWorldValidatedEligible: true,
      productionSealEligible: true,
      readinessLevel: "REAL_WORLD_VALIDATED",
      finalVerdict: "PRODUCTION_SEALED",
    };
    expect(releaseManifestCanonicalStatus(forged, canonical)).toBe("canonical_mismatch");
  });

  it("binds RELEASE.json and all evidence/control files into one race-checkable hash", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cambra-evidence-test-"));
    try {
      fs.mkdirSync(path.join(root, ".release-evidence"), { recursive: true });
      fs.writeFileSync(path.join(root, "RELEASE.json"), "{}\n");
      fs.writeFileSync(
        path.join(root, ".release-evidence", "tests.json"),
        `${JSON.stringify(testEvidence())}\n`,
      );
      const before = releaseControlHash(root);
      fs.writeFileSync(path.join(root, "RELEASE.json"), '{"finalVerdict":"PRODUCTION_SEALED"}\n');
      const after = releaseControlHash(root);
      expect(before.fileCount).toBe(2);
      expect(after.hash).not.toBe(before.hash);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("makes standalone release:check replay the canonical generator", () => {
    const checker = fs.readFileSync("scripts/check-release-manifest.mjs", "utf8");
    expect(checker).toContain("regenerateCanonicalManifest");
    expect(checker).toContain("releaseManifestCanonicalStatus");
    expect(checker).toContain("hand-edited readiness/evidence fields are forbidden");
  });
});
