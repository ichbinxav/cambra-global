import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const R = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const r = (p) => fs.readFileSync(path.join(R, p), "utf8");

describe("acquisition economic provenance", () => {
  it("attributes only exact unique contact email and unique sent thread", () => {
    const s = r("base44/functions/acquisitionAttributionWorker/entry.ts");
    expect(s).toContain("contact_email: email");
    expect(s).toContain("eligibleLeads.length !== 1");
    expect(s).toContain("sent.length !== 1");
    expect(s).toContain('"exact_contact_email"');
    expect(s).not.toContain("fuzzy");
  });

  it("persists versioned exact/ambiguous/unattributed report lineage", () => {
    const worker = r(
      "base44/functions/acquisitionAttributionWorker/entry.ts",
    );
    const schema = JSON.parse(
      r("base44/entities/AcquisitionAttribution.jsonc"),
    );
    expect(worker).toContain("VERIFIED_SAVINGS_ATTRIBUTION_CONTRACT.version");
    expect(worker).toContain('attributionState === "EXACT"');
    expect(worker).toContain('attributionState === "AMBIGUOUS"');
    expect(worker).toContain('"UNATTRIBUTED"');
    expect(worker).toContain("source_run_id: body?.source_run_id ||");
    expect(worker).toContain("candidate_lineage_json");
    expect(worker).toContain("monthly_savings_report_id");
    expect(worker).toContain("deal_activation_id");
    for (
      const field of [
        "attribution_method_version",
        "attribution_state",
        "exposure_at",
        "thread_id",
        "source_event_id",
        "source_run_id",
        "candidate_lineage_json",
        "monthly_savings_report_id",
        "deal_activation_id",
      ]
    ) {
      expect(schema.properties[field]).toBeTruthy();
    }
  });

  it("fails closed for two leads on one Brand and for non-unique reports", () => {
    const s = r("base44/functions/acquisitionAttributionWorker/entry.ts");
    expect(s).toContain("eligibleLeads.length !== 1");
    expect(s).toContain("exactReports.length === 1");
    expect(s).toContain("exactReports.length > 1");
    expect(s).toContain("multiple_exact_temporal_report_candidates");
    expect(s).toContain("economic_attribution_eligible:");
  });

  it("requires report observation after exposure, onboarding and exact deal activation", () => {
    const s = r("base44/functions/acquisitionAttributionWorker/entry.ts");
    const observed = s.slice(
      s.indexOf("function reportObservedAt"),
      s.indexOf("function verifiedReport"),
    );
    expect(observed).toContain("report?.verified_at");
    expect(observed).not.toContain("updated_date");
    expect(observed).not.toContain("approved_for_invoicing_at");
    expect(s).toContain("brand.onboarding_complete === true");
    expect(s).toContain("deal?.conditions_activated_at || deal?.activated_at");
    expect(s).toContain("observedMs >= Date.parse(exposureAt)");
    expect(s).toContain("observedMs >= Date.parse(onboardingObservedAt)");
    expect(s).toContain("observedMs >= Date.parse(dealActivatedAt)");
  });

  it("verified savings learning resolves one exact report, never a Brand aggregate", () => {
    const s = r("base44/functions/acquisitionLearningWorker/entry.ts");
    expect(s).toContain("AcquisitionAttribution");
    expect(s).toMatch(/measurement_mode\s*:\s*["']fully_verified["']/);
    expect(s).toContain("reportById");
    expect(s).toContain("reportCandidatesByBrand");
    expect(s).toContain("exactTemporalReportCandidates.length === 1");
    expect(s).toContain("attribution.monthly_savings_report_id");
    expect(s).toContain('attribution?.attribution_state === "EXACT"');
    expect(s).not.toContain("verifiedByBrand");
    expect(s).toMatch(/outcomeValue\s*\([\s\S]*?["']verified_savings["']/);
  });

  it("makes no causal or model-training claim", () => {
    const shared = r("base44/shared/adaptiveLeadLearning.ts");
    const worker = r(
      "base44/functions/acquisitionAttributionWorker/entry.ts",
    );
    expect(shared).toContain("causal_claim: false");
    expect(shared).toContain("training_eligible: false");
    expect(worker).toContain("causal_claim: false");
    expect(worker).toContain("training_label: false");
  });

  it("learning cannot write financial records", () => {
    const s = r("base44/functions/acquisitionLearningWorker/entry.ts");
    expect(s).not.toContain("MonthlySavingsReport.update");
    expect(s).not.toContain("Invoice.update");
    expect(s).not.toContain("BillingRule.update");
  });
});
