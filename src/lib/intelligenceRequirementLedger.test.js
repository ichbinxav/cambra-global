import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const read = (name) =>
  JSON.parse(
    fs.readFileSync(path.join(ROOT, "config", "intelligence", name), "utf8"),
  );

/* global process */
describe("CAMBRA Intelligence Phase 0 requirement governance", () => {
  it("passes the deterministic ledger integrity checker", () => {
    const output = execFileSync(process.execPath, [
      "scripts/check-intelligence-ledger.mjs",
    ], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(output).toContain("intelligence-ledger:check PASS");
    expect(output).toContain("177 requirements");
    expect(output).toContain("0 runtime-verified requirements");
    expect(output).toContain("0 passed gates");
  });

  it("covers every major section of all four source specifications", () => {
    const ledger = read("requirement-ledger.v1.json");
    expect(ledger.requirement_counts).toEqual({
      CIV2: 37,
      ORCH: 38,
      CPIC: 56,
      ALI: 46,
    });
    expect(ledger.requirements).toHaveLength(177);
    expect(
      new Set(ledger.requirements.map((entry) => entry.requirement_id)).size,
    ).toBe(177);
    for (const namespace of ["CIV2", "ORCH", "CPIC", "ALI"]) {
      expect(
        ledger.requirements.some((entry) =>
          entry.requirement_id.startsWith(`${namespace}.`)
        ),
      ).toBe(true);
    }
  });

  it("separates static capability from delivery and withholds verification", () => {
    const ledger = read("requirement-ledger.v1.json");
    expect(ledger.capability_state_enum).toEqual([
      "EXISTING",
      "PARTIAL",
      "TARGET",
    ]);
    expect(ledger.delivery_status_enum).toContain("VERIFIED");
    expect(
      ledger.requirements.filter((entry) =>
        entry.delivery_status === "VERIFIED"
      ),
    ).toHaveLength(0);
    expect(ledger.audit_baseline).toMatchObject({
      status: "DIRTY_STATIC_BASELINE",
      runtime_parity: "UNVERIFIED",
      production_runtime: "UNVERIFIED",
      working_tree: { clean: false },
      release: {
        final_verdict: "NOT_GO_READY",
        production_seal_eligible: false,
      },
    });
  });

  it("records resolved cross-spec decisions without inventing runtime integration", () => {
    const matrix = read("spec-compatibility-matrix.v1.json");
    expect(matrix.conflicts.length).toBeGreaterThanOrEqual(20);
    expect(
      matrix.conflicts.every((entry) => entry.decision_status === "RESOLVED"),
    ).toBe(true);
    expect(
      matrix.conflicts.every((entry) => entry.runtime_evidence.length === 0),
    ).toBe(true);
    expect(
      matrix.conflicts.find((entry) =>
        entry.compatibility_id === "DETERMINISTIC_VS_INFERRED"
      )?.resolution,
    )
      .toContain("Verified Savings");
    expect(
      matrix.conflicts.find((entry) =>
        entry.compatibility_id === "MODEL_FACTORY"
      )?.resolution,
    )
      .toContain("contract-only registry family");
    const runtimeTruth = matrix.conflicts.find((entry) =>
      entry.compatibility_id === "RUNTIME_TRUTH"
    );
    expect(runtimeTruth?.implementation_refs).toEqual(expect.arrayContaining([
      "base44/shared/runtimeEvidence.ts",
      "base44/shared/goLiveHardGates.ts",
      "scripts/generate-release-manifest.mjs",
    ]));
    expect(runtimeTruth?.implementation_refs).not.toContain("RELEASE.json");
  });

  it("reuses authoritative resources and makes target registries explicit", () => {
    const matrix = read("resource-reuse-matrix.v1.json");
    const byResource = new Map(
      matrix.resources.map((entry) => [entry.resource, entry]),
    );
    expect(byResource.get("IntelligenceEvidence")).toMatchObject({
      decision: "REUSE",
      capability_state: "EXISTING",
    });
    expect(byResource.get("Provider")).toMatchObject({
      decision: "REUSE_AS_AUTHORITY",
    });
    expect(byResource.get("CanonicalProvider")).toMatchObject({
      decision: "MIGRATE_OR_DEPRECATE_AFTER_AUDIT",
    });
    expect(byResource.get("ModelRegistry")).toMatchObject({
      decision: "NEW_LOGICAL_CONTRACT",
      capability_state: "PARTIAL",
      delivery_status: "IMPLEMENTED",
    });
    expect(byResource.get("FeatureRegistry")).toMatchObject({
      decision: "NEW_LOGICAL_CONTRACT",
      capability_state: "PARTIAL",
      delivery_status: "IMPLEMENTED",
    });
    expect(byResource.get("PredictionRegistry")).toMatchObject({
      decision: "NEW_LOGICAL_CONTRACT",
      capability_state: "PARTIAL",
      delivery_status: "IMPLEMENTED",
    });
  });

  it("defines exactly one shared semantic map for the eight mandatory contracts", () => {
    const contracts = read("shared-contract-map.v1.json");
    expect(contracts.contracts.map((entry) => entry.name)).toEqual([
      "Identity",
      "Time",
      "Evidence",
      "Decision",
      "Execution",
      "Outcome",
      "Learning",
      "Model",
    ]);
    expect(contracts.contracts.find((entry) => entry.name === "Learning"))
      .toMatchObject({
        capability_state: "PARTIAL",
        delivery_status: "IMPLEMENTED",
      });
    expect(
      contracts.contracts.find((entry) => entry.name === "Model")?.invariants,
    )
      .toContain("No automatic promotion");
  });

  it("keeps every integration/model/production gate fail-closed", () => {
    const gates = read("gates.v1.json");
    expect(gates.global_state).toBe("NOT_VERIFIED");
    expect(gates.gates).toHaveLength(32);
    expect(gates.gates.every((gate) => gate.gate_status === "BLOCKED")).toBe(
      true,
    );
    expect(gates.gates.every((gate) => gate.runtime_evidence.length === 0))
      .toBe(true);
    expect(
      gates.gates.find((gate) => gate.gate_id === "CPIC_MODEL_READY")?.blockers,
    )
      .toContain("NO_VERSIONED_DATASET_OR_FROZEN_HOLDOUT");
    expect(
      gates.gates.find((gate) =>
        gate.gate_id === "FULL_CAMBRA_INTELLIGENCE_LOOP_VERIFIED"
      )?.blockers,
    )
      .toContain("GOLDEN_PATH_NOT_EXECUTED");
    const runtimeParity = gates.gates.find((gate) =>
      gate.gate_id === "IMMUTABLE_RUNTIME_PARITY"
    );
    expect(runtimeParity?.evidence_refs).toEqual(expect.arrayContaining([
      "base44/shared/runtimeEvidence.ts",
      "base44/shared/goLiveHardGates.ts",
      "scripts/generate-release-manifest.mjs",
    ]));
    expect(runtimeParity?.evidence_refs).not.toContain("RELEASE.json");
  });
});
