import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { requireFreshAgentTaskInventory } from "../../scripts/lib/agentTaskInventoryFreshness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONFIG_DIR = path.join(ROOT, "config", "intelligence");
const temporaryDirectories = [];
// The checker intentionally reruns the 36-file P0 ledger. It completes in a
// few seconds on the release runner but can exceed Vitest's 5 s default in the
// Base44 sandbox, so give this integration assertion a deterministic budget.
const CANONICAL_CHECK_TIMEOUT_MS = 30_000;
const read = (name, directory = CONFIG_DIR) =>
  JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
const canonicalJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256Text = (value) =>
  crypto.createHash("sha256").update(value, "utf8").digest("hex");

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    fs.rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

/* global process */
describe("CAMBRA Intelligence canonical reconciliation v2", () => {
  it("passes the fail-closed canonical v2 checker without implying external reverification", () => {
    const output = execFileSync(process.execPath, [
      "scripts/check-intelligence-canonical-v2.mjs",
    ], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, CAMBRA_INTELLIGENCE_SPEC_DIR: "" },
    });

    expect(output).toContain("intelligence-canonical-v2:check PASS");
    expect(output).toContain("source_binding=PASS");
    expect(output).toContain("attached_canonical_source_binding=NOT_RUN");
    expect(output).toContain("external_research_source_reverification=NOT_RUN");
    expect(output).toContain(
      "20/20 OTR PASSED_LOCAL(11 PARTIAL_CRITERION_ONLY + 9 REPOSITORY_CRITERION_COMPLETE_RUNTIME_PENDING)",
    );
    expect(output).toContain("20/20 OTR NOT_MET");
    expect(output).toContain("8/8 root seals NOT_SEALED");
  }, CANONICAL_CHECK_TIMEOUT_MS);

  it("pins the four authoritative physical locators and forbids filename-only legacy loaders", () => {
    const manifest = read("composition-manifest.v2.json");
    expect(manifest.specs.map((entry) => entry.physical_locator)).toEqual([
      "CAMBRA_INTELLIGENCE_MASTER_ORCHESTRATION_SPECxx.md",
      "CAMBRA_INTELLIGENCE_V2_MASTER_SPEC.md",
      "CAMBRA_ADAPTIVE_LEAD_INTELLIGENCE_FUNNEL_MASTER_SPEC.md",
      "CAMBRA_CPIC_ULTRA_MASTER_SPECx.md",
    ]);
    expect(manifest.source_binding).toMatchObject({
      status: "PASS",
      verification_level: "SOURCE_OBSERVED",
      method: "LOCAL_SHA256_AND_LINE_COUNT_RECOMPUTATION",
    });
    expect(manifest.legacy_logical_aliases).toHaveLength(2);
    expect(
      manifest.legacy_logical_aliases.every((entry) =>
        entry.alias_status === "CONTENT_MISMATCH" &&
        entry.lifecycle_status === "SUPERSEDED" &&
        entry.loader_eligible === false
      ),
    ).toBe(true);
    expect(manifest.seal_effect).toEqual({
      source_binding: "PASS",
      SPEC_SET_RECONCILED: "NOT_SEALED",
      reason: expect.any(String),
    });
  });

  it("binds all 538 ORCH requirements to source and normalized text hashes", () => {
    const ledger = read("requirement-ledger.v2.json");
    expect(ledger.requirement_counts).toEqual({ ORCH: 538 });
    expect(ledger.requirements).toHaveLength(538);
    expect(new Set(ledger.requirements.map((row) => row.requirement_uid)).size).toBe(538);
    expect(ledger.requirements[0]).toMatchObject({
      local_requirement_id: "ORCH-R-DOC-001",
      source_binding_status: "BOUND",
      requirement_progress: "NOT_STARTED",
      implementation_status: "TARGET",
      verification_level: "UNKNOWN",
    });
    expect(ledger.requirements.at(-1)?.local_requirement_id).toBe("ORCH-R-RESP-004");
    expect(
      ledger.requirements.every((row) =>
        row.requirement_uid ===
          `ORCH@${row.source_spec_hash}::${row.local_requirement_id}` &&
        /^[a-f0-9]{64}$/.test(row.requirement_text_hash) &&
        row.runtime_evidence_refs.length === 0
      ),
    ).toBe(true);
  });

  it("catalogs 200 root and 692 child tests with 22 collisions kept separate", () => {
    const catalog = read("acceptance-test-catalog.v2.json");
    expect(catalog.counts).toMatchObject({
      root: 200,
      child: 692,
      total: 892,
      literal_civ2_alif_collisions: 22,
      pass: 0,
      not_run: 892,
    });
    expect(catalog.tests).toHaveLength(892);
    expect(new Set(catalog.tests.map((row) => row.test_uid)).size).toBe(892);
    expect(catalog.tests.every((row) =>
      row.status === "NOT_RUN" &&
      row.executed_at === null &&
      row.evidence_refs.length === 0
    )).toBe(true);
    expect(catalog.alias_collisions).toHaveLength(22);
    expect(catalog.alias_collisions.every((row) =>
      row.test_uids.length === 2 &&
      row.test_uids[0].startsWith("CIV2@") &&
      row.test_uids[1].startsWith("ALIF@")
    )).toBe(true);
  });

  it("separates repository remediation from binary and runtime closure", () => {
    const ledger = read("orchestration-p0-remediation.v2.json");
    expect(ledger.status_axes).toEqual({
      implementation_status: ["NOT_STARTED", "PARTIAL", "IN_PROGRESS", "REPO_REMEDIATED_RUNTIME_PENDING"],
      binary_closure_status: ["NOT_MET", "CLOSED"],
      test_status: ["NOT_RUN", "PASSED_LOCAL", "FAILED_LOCAL"],
      verification_level: ["SOURCE_OBSERVED", "LOCAL_FAILURE_INJECTION", "RUNTIME_VERIFIED"],
    });
    expect(ledger.closure_rule).toMatchObject({
      expression: "binary_closure_status == CLOSED AND test_status == PASSED_LOCAL AND verification_level == RUNTIME_VERIFIED",
      all_conditions_required: true,
      partial_local_tests_can_close: false,
      repo_remediated_runtime_pending_definition:
        "REPO_REMEDIATED_RUNTIME_PENDING: criterio probado con inyección de fallo/concurrencia en repo; el cierre binario requiere drill, receipts o evidencia de runtime desplegado.",
    });
    expect(ledger.counts).toEqual({
      total: 20,
      implementation_partial: 11,
      implementation_repo_remediated_runtime_pending: 9,
      closed: 0,
      not_met: 20,
      test_not_run: 0,
      test_passed_local: 20,
      test_failed_local: 0,
      source_observed: 0,
      local_failure_injection: 20,
      runtime_verified: 0,
      local_partial_criterion_only: 11,
      local_repository_criterion_complete_runtime_pending: 9,
    });
    expect(ledger.local_test_runs).toHaveLength(1);
    expect(ledger.local_test_runs[0]).toMatchObject({
      run_id: "R5-LOCAL-VITEST-2026-08-14",
      status: "PASSED_LOCAL",
      local_test_scope: "MIXED_REPOSITORY_AND_PARTIAL_CRITERIA",
      runner: "vitest@4.1.10",
      current_validation: {
        mode: "REEXECUTE_JSON_REPORTER",
        reporter: "json",
        required_test_files: 36,
        zero_failed_pending_todo: true,
        all_tests_must_pass: true,
        exact_test_paths_required: true,
        nonempty_test_count_required: true,
        timeout_ms: 300000,
      },
    });
    expect(ledger.local_test_runs[0].test_files).toHaveLength(36);
    expect(ledger.local_test_runs[0].test_files).toEqual(expect.arrayContaining([
      "src/lib/recoverBillingReconcilerSelection.test.js",
      "src/lib/financialEntityServiceRoleRls.test.js",
    ]));
    expect(ledger.items).toHaveLength(20);
    const repoPending = new Set([
      "ROOT-OTR-004",
      "ROOT-OTR-006",
      "ROOT-OTR-007",
      "ROOT-OTR-008",
      "ROOT-OTR-009",
      "ROOT-OTR-010",
      "ROOT-OTR-014",
      "ROOT-OTR-015",
      "ROOT-OTR-020",
    ]);
    expect(ledger.items.every((row) =>
      row.implementation_status ===
        (repoPending.has(row.otr_id)
          ? "REPO_REMEDIATED_RUNTIME_PENDING"
          : "PARTIAL") &&
      ["SOURCE_OBSERVED", "LOCAL_FAILURE_INJECTION"].includes(row.verification_level) &&
      row.binary_closure_status === "NOT_MET" &&
      row.test_status === "PASSED_LOCAL" &&
      row.local_test_scope ===
        (repoPending.has(row.otr_id)
          ? "REPOSITORY_CRITERION_COMPLETE_RUNTIME_PENDING"
          : "PARTIAL_CRITERION_ONLY") &&
      row.local_test_run_ref === "R5-LOCAL-VITEST-2026-08-14" &&
      row.local_test_refs.length > 0 &&
      JSON.stringify(row.assessment_classification) === JSON.stringify(
        repoPending.has(row.otr_id)
          ? ["EXISTING", "RUNTIME_ONLY"]
          : ["EXISTING", "GAP", "RUNTIME_ONLY"],
      ) &&
      row.implementation_existing.length > 0 &&
      row.material_effect_covered.length > 0 &&
      row.local_partial_criterion_verified.length > 0 &&
      row.gap_local.length > 0 &&
      row.gap_runtime.length > 0 &&
      row.runtime_evidence_refs.length === 0 &&
      row.blockers.length > 0
    )).toBe(true);
    expect(ledger.items.flatMap((row) => row.local_test_refs).every((ref) =>
      fs.existsSync(path.join(ROOT, ref))
    )).toBe(true);
    const inventory = JSON.parse(fs.readFileSync(
      path.join(ROOT, "config", "agenttask-creator-inventory.json"),
      "utf8",
    ));
    const counts = inventory.counts;
    expect(
      ledger.items.find((row) => row.otr_id === "ROOT-OTR-013")?.gap_local,
    ).toBe(
      `Of ${counts.material_creator_files} material creator files, ${counts.material_terminal_adapted_files} expose canonical terminal adapters and ${counts.material_trace_adapted_files} expose the full root/terminal/Event adapter surface; ${counts.unresolved_material_route_files} registry-derived material source files remain without that full source-local surface. Static source inventory does not itself prove effect/cost/receipt lineage.`,
    );
  });

  it("rejects an internally rehashed stale ROOT-OTR-013 repository gap", () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "cambra-intel-otr013-"),
    );
    temporaryDirectories.push(temporaryRoot);
    const temporaryConfig = path.join(temporaryRoot, "intelligence");
    fs.cpSync(CONFIG_DIR, temporaryConfig, { recursive: true });
    const p0Path = path.join(
      temporaryConfig,
      "orchestration-p0-remediation.v2.json",
    );
    const manifestPath = path.join(
      temporaryConfig,
      "composition-manifest.v2.json",
    );
    const ledger = read("orchestration-p0-remediation.v2.json", temporaryConfig);
    ledger.items.find((row) => row.otr_id === "ROOT-OTR-013").gap_local =
      "stale but internally rehashed repository evidence";
    const p0Content = canonicalJson(ledger);
    fs.writeFileSync(p0Path, p0Content, "utf8");
    const manifest = read("composition-manifest.v2.json", temporaryConfig);
    manifest.artifacts.find((row) =>
      row.path ===
        "config/intelligence/orchestration-p0-remediation.v2.json"
    ).sha256 = sha256Text(p0Content);
    manifest.composition_hash = sha256Text(canonicalJson({
      composition_id: manifest.composition_id,
      root_version: manifest.root_version,
      sources: manifest.sources,
      artifacts: manifest.artifacts,
    }));
    fs.writeFileSync(manifestPath, canonicalJson(manifest), "utf8");

    const result = spawnSync(process.execPath, [
      "scripts/check-intelligence-canonical-v2.mjs",
      "--config-dir",
      temporaryConfig,
    ], { cwd: ROOT, encoding: "utf8" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("p0_otr_013_gap_local");
  });

  it("rejects a caller-supplied AgentTask inventory that differs from canonical bytes", () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "cambra-intel-agenttask-candidate-"),
    );
    temporaryDirectories.push(temporaryRoot);
    const candidatePath = path.join(temporaryRoot, "inventory.json");
    const candidate = JSON.parse(fs.readFileSync(
      path.join(ROOT, "config", "agenttask-creator-inventory.json"),
      "utf8",
    ));
    candidate.counts.unresolved_material_route_files += 1;
    fs.writeFileSync(candidatePath, canonicalJson(candidate), "utf8");

    const result = spawnSync(process.execPath, [
      "scripts/check-intelligence-canonical-v2.mjs",
      "--agenttask-inventory",
      candidatePath,
    ], { cwd: ROOT, encoding: "utf8" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "candidate_not_byte_identical_to_canonical",
    );
  });

  it("never consumes a byte-identical alternate inventory after verification", () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "cambra-intel-agenttask-mirror-"),
    );
    temporaryDirectories.push(temporaryRoot);
    const candidatePath = path.join(temporaryRoot, "inventory.json");
    fs.copyFileSync(
      path.join(ROOT, "config", "agenttask-creator-inventory.json"),
      candidatePath,
    );

    const snapshot = requireFreshAgentTaskInventory(".", candidatePath);

    expect(snapshot.canonicalRoot).toBe(fs.realpathSync(ROOT));
    expect(snapshot.canonicalPath).toBe(
      path.join(fs.realpathSync(ROOT), "config", "agenttask-creator-inventory.json"),
    );
    expect(snapshot.canonicalPath).not.toBe(candidatePath);
    expect(snapshot.canonicalBytes.equals(fs.readFileSync(candidatePath))).toBe(true);
  });

  it("uses scope-specific precedence, canonical aliases and no ninth seal", () => {
    const precedence = read("scope-precedence.v2.json");
    const aliases = read("canonical-alias-map.v2.json");
    const seals = read("root-seals.v2.json");

    expect(precedence.global_file_order_forbidden).toBe(true);
    expect(precedence.precedence).toHaveLength(8);
    expect(aliases.logical_contract_aliases).toHaveLength(8);
    expect(
      aliases.compatibility_aliases.find((row) =>
        row.legacy === "MASTER_ORCHESTRATION_READY"
      ),
    ).toMatchObject({
      canonical: "GOVERNED_EXECUTION_READY",
      status: "INTERNAL_GATE_ALIAS_NOT_A_NINTH_SEAL",
      auto_migrate: false,
    });
    expect(seals.seals.map((row) => row.seal_type)).toEqual([
      "SPEC_SET_RECONCILED",
      "INTELLIGENCE_FOUNDATION_INTEGRATED",
      "CPIC_INTEGRATED",
      "ADAPTIVE_LEAD_INTEGRATED",
      "GOVERNED_EXECUTION_READY",
      "FULL_CAMBRA_INTELLIGENCE_LOOP_SANDBOX_VERIFIED",
      "FULL_CAMBRA_INTELLIGENCE_LOOP_REAL_WORLD_VERIFIED",
      "CAMBRA_COMPOUND_INTELLIGENCE_SYSTEM_READY",
    ]);
    expect(seals.seals.every((row) => row.status === "NOT_SEALED")).toBe(true);
  });

  it("retains every v1 JSON artifact as readable legacy rather than mutating it", () => {
    const manifest = read("composition-manifest.v2.json");
    const activeResearchV1 = ["research-conflicts.v1.json", "research-knowledge.v1.json", "research-source-manifest.v1.json"];
    const v1Files = fs.readdirSync(CONFIG_DIR).filter((name) => name.endsWith(".v1.json") && !activeResearchV1.includes(name)).sort();
    expect(manifest.active_v1_artifacts.map((entry) => path.basename(entry.path)).sort()).toEqual(activeResearchV1);
    expect(manifest.active_v1_artifacts.every((entry) =>
      entry.lifecycle_status === "ACTIVE_RESEARCH_KNOWLEDGE_V1" &&
      entry.read_compatibility === "SUPPORTED" &&
      entry.write_target === true &&
      entry.authority === "CANDIDATE_ONLY_NON_EXECUTABLE"
    )).toBe(true);
    expect(manifest.legacy_v1_artifacts.map((entry) => path.basename(entry.path)).sort()).toEqual(v1Files);
    expect(manifest.legacy_v1_artifacts.every((entry) =>
      entry.lifecycle_status === "SUPERSEDED_FOR_CANONICAL_V2_RECONCILIATION" &&
      entry.read_compatibility === "SUPPORTED" &&
      entry.write_target === false
    )).toBe(true);
  });

  it("rejects a tampered canonical artifact before any seal can change", () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cambra-intel-v2-"));
    temporaryDirectories.push(temporaryRoot);
    const temporaryConfig = path.join(temporaryRoot, "intelligence");
    fs.cpSync(CONFIG_DIR, temporaryConfig, { recursive: true });
    const ledgerPath = path.join(temporaryConfig, "requirement-ledger.v2.json");
    const ledger = read("requirement-ledger.v2.json", temporaryConfig);
    ledger.requirements[0].requirement_text = "tampered";
    fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");

    const result = spawnSync(process.execPath, [
      "scripts/check-intelligence-canonical-v2.mjs",
      "--config-dir",
      temporaryConfig,
    ], { cwd: ROOT, encoding: "utf8" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("artifact_hash:config/intelligence/requirement-ledger.v2.json");
  });
});
