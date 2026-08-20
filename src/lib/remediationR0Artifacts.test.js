import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  artifactMatches,
  buildEffectAuthorityRegistry,
  buildMaterialBoundaryRegistry,
  buildResearchCorpusInventory,
  buildTenantAuthorizationInventory,
  checkArtifacts,
  EFFECT_AUTHORITY_OUTPUT,
  MATERIAL_BOUNDARY_OUTPUT,
  REPO_ROOT,
  RESEARCH_CORPUS_OUTPUT,
  serializeArtifact,
  TENANT_AUTHORIZATION_OUTPUT,
  validateEffectAuthorityRegistry,
  validateMaterialBoundaryRegistry,
  validateResearchCorpusInventory,
  validateTenantAuthorizationInventory,
} from "../../scripts/generate-remediation-r0.mjs";

const temporaryDirectories = [];
const FILESYSTEM_TAMPER_TEST_TIMEOUT_MS = 15_000;

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function copyInputsToTemporaryRepo() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "cambra-r0-artifacts-"),
  );
  temporaryDirectories.push(directory);
  for (const relativePath of ["base44", "config", "research", "src"]) {
    fs.cpSync(
      path.join(REPO_ROOT, relativePath),
      path.join(directory, relativePath),
      { recursive: true },
    );
  }
  fs.mkdirSync(path.join(directory, "config/remediation"), { recursive: true });
  fs.copyFileSync(
    path.join(REPO_ROOT, MATERIAL_BOUNDARY_OUTPUT),
    path.join(directory, MATERIAL_BOUNDARY_OUTPUT),
  );
  fs.copyFileSync(
    path.join(REPO_ROOT, EFFECT_AUTHORITY_OUTPUT),
    path.join(directory, EFFECT_AUTHORITY_OUTPUT),
  );
  fs.copyFileSync(
    path.join(REPO_ROOT, RESEARCH_CORPUS_OUTPUT),
    path.join(directory, RESEARCH_CORPUS_OUTPUT),
  );
  fs.copyFileSync(
    path.join(REPO_ROOT, TENANT_AUTHORIZATION_OUTPUT),
    path.join(directory, TENANT_AUTHORIZATION_OUTPUT),
  );
  return directory;
}

describe("R0.C material boundary registry", () => {
  it("derives every material class, the exact scheduler census and the 38 AI callers", () => {
    const document = buildMaterialBoundaryRegistry(REPO_ROOT);
    expect(document.summary.boundary_count).toBe(42);
    expect(Object.keys(document.summary.material_kind_counts).sort()).toEqual([
      "billing_charge",
      "claim_outcome_dataset_promotion",
      "material_schedule",
      "migrate_go_live",
      "negotiate",
      "paid_spend",
      "provider_effect",
      "send",
      "sign_mandate",
      "terms",
    ]);
    expect(
      Object.values(document.summary.material_kind_counts).every((count) =>
        count > 0
      ),
    ).toBe(true);
    expect(document.scheduler_inventory).toMatchObject({
      // PROMPT_LAUNCH_10 (2026-08-20): includes both explicit Instantly hosted
      // routes. Guarded count moves with active so an unguarded route still fails.
      scheduled_automation_count: 72,
      active_count: 70,
      guarded_count: 70,
      unguarded_active: [],
    });
    expect(document.paid_ai_inventory.caller_count).toBe(38);
    // COMMAND-C0 (2026-08-17) closed the AI emergency gap: category=ai maps onto
    // the paid_discovery capability and reservePaidOperation captures the epoch
    // from it. This assertion and the registry both still claimed "NONE" and
    // still listed the gap as open, so the inventory was reporting a gap the code
    // had already closed. Repointed to the truth and kept just as strict —
    // proven end to end by src/lib/aiSpendEmergencyCoverage.test.js, which
    // asserts zero provider calls under safe mode.
    expect(document.paid_ai_inventory.emergency_capability).toBe("paid_discovery");
    expect(document.paid_ai_inventory.gap_codes).not.toContain(
      "EMERGENCY_CAPABILITY_MISSING_AI",
    );
    // The gaps that genuinely remain open are still pinned.
    expect(document.paid_ai_inventory.gap_codes).toContain("AI_RETRY_EFFECT_KEY_UNSTABLE");
    expect(document.paid_ai_inventory.gap_codes).toContain("PROVIDER_FINAL_RECEIPT_MISSING");
    // Both AI primitives must be visible to the census. Matching only
    // callCambraClaude made a migrated caller invisible to this registry.
    expect(document.paid_ai_inventory.primitive).toContain("callCambraModel");
    expect(
      document.boundaries.find((row) =>
        row.boundary_id === "MB-BILL-RECOVER-REPORT-GENERATION"
      ),
    ).toMatchObject({
      status: "PARTIAL",
      logical_route: "generateMonthlySavingsReport",
    });
    expect(
      document.boundaries.find((row) =>
        row.boundary_id === "MB-BILL-INVOICE-PDF-STORAGE"
      ),
    ).toMatchObject({
      status: "PARTIAL",
      logical_route: "generateInvoicePdf",
    });
  });

  it("keeps route-level actor, tenant, policy, emergency, claim, effect, reconciliation and receipt evidence", () => {
    const document = buildMaterialBoundaryRegistry(REPO_ROOT);
    expect(() => validateMaterialBoundaryRegistry(document)).not.toThrow();
    for (const boundary of document.boundaries) {
      expect(boundary.actor).toBeTruthy();
      expect(boundary.tenant_key).toBeTruthy();
      expect(boundary.policy.length).toBeGreaterThan(0);
      expect(boundary.emergency.epoch).toBeTruthy();
      expect(boundary.claim_primitive).toBeTruthy();
      expect(boundary.effect_key).toBeTruthy();
      expect(boundary.provider_idempotency).toBeTruthy();
      expect(boundary.provider_reconciliation).toBeTruthy();
      expect(boundary.receipt.length).toBeGreaterThan(0);
      expect(
        boundary.source_evidence.every((entry) =>
          /^[a-f0-9]{64}$/.test(entry.sha256)
        ),
      ).toBe(true);
    }
    expect(
      document.boundaries.find((row) =>
        row.boundary_id === "MB-DATASET-PROMOTION-ABSENT"
      ),
    ).toMatchObject({
      status: "ABSENT",
      logical_route: "NONE_FOUND",
    });
  });
});

describe("R1.E material tenant authorization proof inventory", () => {
  it("maps every material boundary without claiming universal or runtime closure", () => {
    const material = buildMaterialBoundaryRegistry(REPO_ROOT);
    const document = buildTenantAuthorizationInventory(REPO_ROOT, material);
    expect(() => validateTenantAuthorizationInventory(document, material)).not
      .toThrow();
    expect(document.routes).toHaveLength(42);
    expect(document.routes.map((row) => row.boundary_id)).toEqual(
      material.boundaries.map((row) => row.boundary_id),
    );
    expect(
      document.routes.every((row) => row.implementation_status === "PARTIAL"),
    ).toBe(true);
    expect(
      document.routes.every((row) => row.binary_closure_status === "NOT_MET"),
    ).toBe(true);
    expect(
      document.routes.every((row) =>
        row.local_test_scope === "PARTIAL_CRITERION_ONLY"
      ),
    ).toBe(true);
    expect(document.summary).toMatchObject({
      route_count: 42,
      implementation_partial_count: 42,
      binary_closed_count: 0,
      runtime_verified_count: 0,
    });
  });

  it("binds real gate execution tests to the high-risk owned material routes", () => {
    const document = buildTenantAuthorizationInventory(REPO_ROOT);
    const byId = new Map(document.routes.map((row) => [row.boundary_id, row]));
    for (
      const boundaryId of [
        "MB-PAID-AI",
        "MB-MANDATE-ACCEPT",
        "MB-BILL-PAYMENT-METHOD",
      ]
    ) {
      const row = byId.get(boundaryId);
      expect(row).toMatchObject({
        proof_class: "REAL_SHARED_GATE_EXECUTION",
        test_status: "PASSED_LOCAL",
        verification_level: "LOCAL_FAILURE_INJECTION",
        gate_coverage: {
          actor_denial_equivalence: "PASSED_LOCAL",
          authority_unavailable: "PASSED_LOCAL",
          authority_ambiguous: "PASSED_LOCAL",
        },
      });
      expect(row.gate_evidence.length).toBeGreaterThan(0);
      expect(row.test_evidence.length).toBeGreaterThan(0);
    }
    expect(byId.get("MB-PAID-AI").covered_route_members).toEqual([
      "discoveryTechStackAgent",
      "recommendationEngineAgent",
      "spendIntelligenceAgent",
    ]);
    expect(byId.get("MB-PAID-AI").remaining_gaps).toContain(
      "only 3 of the dynamically inventoried AI callers are wired to the canonical owner gate",
    );
  });

  it("keeps unmapped and source-only route gaps explicit instead of upgrading them from a static tripwire", () => {
    const document = buildTenantAuthorizationInventory(REPO_ROOT);
    const sourceOnly = document.routes.filter((row) =>
      row.proof_class === "SOURCE_OBSERVED_ONLY"
    );
    expect(sourceOnly.length).toBeGreaterThan(0);
    expect(sourceOnly.every((row) => row.test_status === "NOT_RUN")).toBe(true);
    expect(
      sourceOnly.every((row) =>
        row.gate_coverage.actor_denial_equivalence === "NOT_PROVEN"
      ),
    ).toBe(true);
    const absent = document.routes.find((row) =>
      row.boundary_id === "MB-DATASET-PROMOTION-ABSENT"
    );
    expect(absent).toMatchObject({
      proof_class: "NO_PHYSICAL_ROUTE",
      implementation_status: "PARTIAL",
      binary_closure_status: "NOT_MET",
    });
  });
});

describe("R5.A generated effect authority registry", () => {
  it("derives the exact ten effect classes from all 42 R0 material boundaries", () => {
    const material = buildMaterialBoundaryRegistry(REPO_ROOT);
    const document = buildEffectAuthorityRegistry(REPO_ROOT, material);
    expect(() => validateEffectAuthorityRegistry(document, material)).not
      .toThrow();
    expect(document.effect_classes.map((row) => row.key)).toEqual([
      "SEND",
      "NEGOTIATE",
      "SCHEDULE_MATERIAL",
      "EXECUTE",
      "APPROVE",
      "SIGN_MANDATE",
      "SPEND",
      "BILL_CHARGE",
      "MIGRATE_GO_LIVE",
      "PROMOTE_LEARNING",
    ]);
    expect(
      document.effect_classes.find((row) => row.key === "SIGN_MANDATE")
        .literal_label,
    ).toBe("SIGN/MANDATE");
    expect(
      document.effect_classes.find((row) => row.key === "BILL_CHARGE")
        .literal_label,
    ).toBe("BILL/CHARGE");
    expect(document.summary).toMatchObject({
      effect_class_count: 10,
      boundary_count: 42,
      locally_wired_boundary_count: 5,
      source_observed_only_boundary_count: 37,
      implementation_partial_count: 42,
      binary_closed_count: 0,
      runtime_verified_count: 0,
    });
    expect(document.effect_classes.every((row) => row.boundary_ids.length > 0))
      .toBe(true);
    expect(
      document.effect_classes.every((row) => row.wired_boundary_ids.length > 0),
    ).toBe(true);
  });

  it("keeps local route wiring partial and lists every unwired boundary literally", () => {
    const document = buildEffectAuthorityRegistry(REPO_ROOT);
    const wired = document.boundaries.filter((row) =>
      row.wiring_status === "PARTIAL_ROUTE_WIRING"
    );
    expect(wired.map((row) => row.boundary_id)).toEqual([
      "MB-SEND-COMMERCIAL",
      "MB-MANDATE-ACCEPT",
      "MB-MIGRATE-PAYMENTS",
      "MB-BILL-PAYMENT-LINK",
      "MB-INTEL-CLAIM-PROMOTE",
    ]);
    expect(
      document.boundaries.every((row) =>
        row.implementation_status === "PARTIAL"
      ),
    ).toBe(true);
    expect(
      document.boundaries.every((row) =>
        row.binary_closure_status === "NOT_MET"
      ),
    ).toBe(true);
    expect(document.boundaries.every((row) => row.runtime_verified === false))
      .toBe(true);
    expect(
      document.boundaries.filter((row) =>
        row.wiring_status === "SOURCE_OBSERVED_ONLY"
      ),
    )
      .toHaveLength(37);
  });
});

describe("R0.D physical research corpus inventory", () => {
  it("recomputes 11 physical, 9 SHA-unique and 2 exact duplicate files", () => {
    const document = buildResearchCorpusInventory(REPO_ROOT);
    expect(document.physical).toMatchObject({
      physical_files: 11,
      unique_sha256: 9,
      exact_duplicates: 2,
      bytes_physical: 516994,
      bytes_unique: 419567,
      lf_count_physical: 5309,
    });
    // Grouped with reduce instead of Object.groupBy: the runtime baseline this
    // suite must pass on does not expose Object.groupBy, and an environment
    // capability gap must never be reported as a corpus failure.
    const groups = document.physical_sources.reduce((acc, row) => {
      (acc[row.sha256] ||= []).push(row);
      return acc;
    }, {});
    const duplicateGroups = Object.values(groups)
      .filter((rows) => rows.length > 1)
      .map((rows) => rows.map((row) => row.file_name).sort());
    expect(duplicateGroups).toEqual(expect.arrayContaining([
      ["deep-research-report 10.md", "deep-research-report 4.md"],
      ["deep-research-report 7.md", "deep-research-report.md"],
    ]));
  });

  it("closes only repository intake for the founder-declared canonical corpus", () => {
    const document = buildResearchCorpusInventory(REPO_ROOT);
    expect(() => validateResearchCorpusInventory(document)).not.toThrow();
    expect(document.status).toBe(
      "FOUNDER_CORPUS_PRESENT_UNTRUSTED_INTEGRATED",
    );
    expect(document.canonical_corpus).toEqual({
      authority: "FOUNDER_DECISION",
      scope: "EXACT_DECLARED_CORPUS",
      complete_as_declared: true,
      physical_files: 11,
      unique_sha256: 9,
      exact_duplicates: 2,
    });
    expect(document).not.toHaveProperty("expected_unique_sources");
    expect(document).not.toHaveProperty("shortfall");
    expect(document.r6_gate).toEqual({
      status: "REPO_INTEGRATED_RUNTIME_REVERIFICATION_PENDING",
      reason: "FOUNDER_CANONICAL_CORPUS_BOUND_AS_UNTRUSTED_INPUT",
      closure_scope: "REPOSITORY_INTAKE_ONLY",
      may_mark_pass: true,
      production_seal_eligible: false,
    });
    expect(document.research_policy).toEqual({
      truth_level: "UNVERIFIED_EXTERNAL_RESEARCH",
      execution_eligible: false,
      training_eligible: false,
      model_input_eligible: false,
      calibration_eligible: false,
      auto_promote_eligible: false,
    });
    expect(document.external_source_reverification).toBe("NOT_RUN");
    expect(document.near_duplicate_detection).toBe("NOT_RUN");
    expect(
      document.physical_sources.every((row) =>
        row.truth_level === "UNVERIFIED_EXTERNAL_RESEARCH"
      ),
    ).toBe(true);
    expect(document.country_payments_economics_gate.exact_33_of_33_demonstrated)
      .toBe(false);
    expect(document.country_payments_economics_gate.status).toBe("INCOMPLETE");
    expect(document.conflict_snapshot.conflicts).toContainEqual({
      conflict_id: "research-conflict:r9-missing-package",
      status: "OPEN_ARTIFACT_RECOVERY_REQUIRED",
    });
    expect(document.expected_topic_coverage).toHaveLength(25);
    expect(
      document.expected_topic_coverage.some((row) => row.status === "MISSING"),
    ).toBe(true);
  });

  it("fails closed on founder-count, safety-policy or R9 conflict drift", () => {
    const cases = [
      {
        mutate: (document) => {
          document.canonical_corpus.unique_sha256 = 10;
        },
        error: /research_corpus_founder_count_drift:unique_sha256/,
      },
      {
        mutate: (document) => {
          document.research_policy.training_eligible = true;
        },
        error: /research_corpus_safety_policy_drift:training_eligible/,
      },
      {
        mutate: (document) => {
          document.conflict_snapshot.conflicts.find((row) =>
            row.conflict_id === "research-conflict:r9-missing-package"
          ).status = "RESOLVED";
        },
        error: /research_corpus_r9_missing_package_conflict_required/,
      },
    ];

    for (const { mutate, error } of cases) {
      const document = structuredClone(buildResearchCorpusInventory(REPO_ROOT));
      mutate(document);
      expect(() => validateResearchCorpusInventory(document)).toThrow(error);
    }
  });
});

describe("R0 artifact drift and tamper checks", () => {
  it("matches the committed deterministic bytes exactly", () => {
    const material = buildMaterialBoundaryRegistry(REPO_ROOT);
    const effectAuthority = buildEffectAuthorityRegistry(REPO_ROOT, material);
    const tenantAuthorization = buildTenantAuthorizationInventory(
      REPO_ROOT,
      material,
    );
    const research = buildResearchCorpusInventory(REPO_ROOT);
    expect(
      artifactMatches(
        material,
        fs.readFileSync(path.join(REPO_ROOT, MATERIAL_BOUNDARY_OUTPUT), "utf8"),
      ),
    ).toBe(true);
    expect(
      artifactMatches(
        effectAuthority,
        fs.readFileSync(path.join(REPO_ROOT, EFFECT_AUTHORITY_OUTPUT), "utf8"),
      ),
    ).toBe(true);
    expect(
      artifactMatches(
        tenantAuthorization,
        fs.readFileSync(
          path.join(REPO_ROOT, TENANT_AUTHORIZATION_OUTPUT),
          "utf8",
        ),
      ),
    ).toBe(true);
    expect(
      artifactMatches(
        research,
        fs.readFileSync(path.join(REPO_ROOT, RESEARCH_CORPUS_OUTPUT), "utf8"),
      ),
    ).toBe(true);
    expect(serializeArtifact(material)).toBe(
      serializeArtifact(buildMaterialBoundaryRegistry(REPO_ROOT)),
    );
  });

  it(
    "detects a one-byte corpus tamper through the physical SHA binding",
    () => {
      const root = copyInputsToTemporaryRepo();
      const source = path.join(
        root,
        "research/external/2026-08-13/originals/deep-research-report 9.md",
      );
      fs.appendFileSync(source, "x");
      expect(() => buildResearchCorpusInventory(root)).toThrow(
        /research_corpus_manifest_sha_drift/,
      );
    },
    FILESYSTEM_TAMPER_TEST_TIMEOUT_MS,
  );

  it("detects committed artifact drift without rewriting it", () => {
    const root = copyInputsToTemporaryRepo();
    const artifact = path.join(root, MATERIAL_BOUNDARY_OUTPUT);
    const before = fs.readFileSync(artifact);
    fs.appendFileSync(artifact, "\n");
    const tampered = fs.readFileSync(artifact);
    expect(crypto.createHash("sha256").update(tampered).digest("hex")).not.toBe(
      crypto.createHash("sha256").update(before).digest("hex"),
    );
    expect(() => checkArtifacts(root)).toThrow(/remediation_r0_artifact_drift/);
    expect(fs.readFileSync(artifact)).toEqual(tampered);
  }, FILESYSTEM_TAMPER_TEST_TIMEOUT_MS);
});
