import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assessClaimPromotionLineage,
  callerLearningAuthorityRejected,
  CLAIM_PROMOTION_POLICY_VERSION,
} from "../../base44/shared/intelligenceLearningLineage.ts";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const json = (file) => JSON.parse(read(file));
const functionEntries = () => fs.readdirSync(path.join(ROOT, "base44/functions"))
  .filter((name) =>
    fs.existsSync(path.join(ROOT, "base44/functions", name, "entry.ts"))
  )
  .map((name) => ({
    name,
    source: read(`base44/functions/${name}/entry.ts`),
  }));

const binding = {
  tenant_scope: "tenant",
  brand_id: "brand_001",
  domain: "payments_intelligence",
  purpose: "verified_payments_analysis",
};
const evidence = (overrides = {}) => ({
  id: "evidence_001",
  ...binding,
  retention_policy_key: "payments-intelligence-v1",
  legal_basis: "contract",
  source_reference: "MonthlySavingsReport:report_001",
  truth_level: "verified_official",
  observed_at: "2026-01-10T00:00:00.000Z",
  recorded_at: "2026-01-10T00:00:01.000Z",
  quarantined: false,
  is_demo: false,
  ...overrides,
});
const observation = (overrides = {}) => ({
  id: "observation_001",
  ...binding,
  evidence_id: "evidence_001",
  semantic_key: "payments:verified-rate",
  truth_level: "verified_official",
  status: "verified",
  observed_at: "2026-01-10T00:00:02.000Z",
  ...overrides,
});
const claim = (overrides = {}) => ({
  id: "claim_001",
  ...binding,
  semantic_key: "payments:verified-rate",
  truth_level: "verified_official",
  evidence_ids: ["evidence_001"],
  observation_ids: ["observation_001"],
  effective_at: "2026-01-01T00:00:00.000Z",
  observed_at: "2026-01-11T00:00:00.000Z",
  ...overrides,
});

describe("P12 exact learning and claim lineage", () => {
  it("derives promotion authority from exact loaded lineage, not caller counts", () => {
    expect(assessClaimPromotionLineage({
      claim: claim(),
      evidence_rows: [evidence()],
      observation_rows: [observation()],
      evaluated_at: "2026-01-12T00:00:00.000Z",
    })).toEqual({
      ok: true,
      policy_version: CLAIM_PROMOTION_POLICY_VERSION,
      reason_codes: [],
      derived_truth_level: "verified_official",
      evidence_ids: ["evidence_001"],
      observation_ids: ["observation_001"],
      manual_decision_is_descriptive_only: true,
      training_eligible: false,
      model_eligible: false,
      calibration_eligible: false,
    });
  });

  it("blocks missing, cross-purpose, weak and future lineage", () => {
    expect(assessClaimPromotionLineage({
      claim: claim(),
      evidence_rows: [],
      observation_rows: [],
      evaluated_at: "2026-01-12T00:00:00.000Z",
    }).reason_codes).toEqual(expect.arrayContaining([
      "EVIDENCE_REFERENCE_SET_MISMATCH",
      "OBSERVATION_REFERENCE_SET_MISMATCH",
      "INSUFFICIENT_INDEPENDENT_LINEAGE",
    ]));

    expect(assessClaimPromotionLineage({
      claim: claim(),
      evidence_rows: [evidence({ purpose: "another_purpose" })],
      observation_rows: [observation({
        truth_level: "inferred",
        observed_at: "2026-01-13T00:00:00.000Z",
      })],
      evaluated_at: "2026-01-12T00:00:00.000Z",
    })).toMatchObject({
      ok: false,
      reason_codes: expect.arrayContaining([
        "EVIDENCE_TENANT_PURPOSE_MISMATCH",
        "INFERRED_OBSERVATION_NOT_PROMOTABLE",
        "CLAIM_USES_FUTURE_LINEAGE",
      ]),
    });
  });

  it("rejects caller flags and keeps all claim/outcome writers fail-closed", () => {
    expect(callerLearningAuthorityRejected({ training_eligible: true })).toBe(true);
    expect(callerLearningAuthorityRejected({ training_eligible_core: true })).toBe(true);
    expect(callerLearningAuthorityRejected({})).toBe(false);

    const access = read("base44/functions/intelligenceAccess/entry.ts");
    const admin = read("base44/functions/intelligenceAdmin/entry.ts");
    const worker = read("base44/functions/outcomeLearningWorker/entry.ts");
    for (const source of [access, admin, worker]) {
      expect(source).toMatch(/training_eligible:\s*false/);
      expect(source).toMatch(/model_eligible:\s*false/);
      expect(source).toMatch(/calibration_eligible:\s*false/);
    }
    expect(access).toContain("INDEPENDENT_LEARNING_ELIGIBILITY_DECISION_REQUIRED");
    expect(admin).toContain("claim_promotion_lineage_not_verified");
  });

  it("extends existing schemas only and leaves an absent decision non-eligible", () => {
    const claimSchema = json("base44/entities/KnowledgeClaim.jsonc");
    const outcomeSchema = json("base44/entities/IntelligenceOutcome.jsonc");
    for (const schema of [claimSchema, outcomeSchema]) {
      expect(schema.properties.learning_eligibility_decision_id).toBeTruthy();
      expect(schema.properties.training_eligible.default).toBe(false);
      expect(schema.properties.model_eligible.default).toBe(false);
      expect(schema.properties.calibration_eligible.default).toBe(false);
    }
    expect(outcomeSchema.properties.learning_eligibility_status.enum).toContain(
      "PENDING_PROVENANCE",
    );
  });

  it("has no unreviewed KnowledgeClaim or IntelligenceOutcome writer bypass", () => {
    const entries = functionEntries();
    expect(entries.filter(({ source }) =>
      source.includes("entities.KnowledgeClaim.create")
    ).map(({ name }) => name)).toEqual(["intelligenceAccess"]);
    expect(entries.filter(({ source }) =>
      source.includes("entities.KnowledgeClaim.update")
    ).map(({ name }) => name).sort()).toEqual([
      "intelligenceAccess",
      "intelligenceAdmin",
      "knowledgeIntegrityWorker",
    ]);
    expect(entries.filter(({ source }) =>
      source.includes("entities.IntelligenceOutcome.create")
    ).map(({ name }) => name).sort()).toEqual([
      "intelligenceAccess",
      "outcomeLearningWorker",
    ]);
  });
});
