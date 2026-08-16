import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildResilientLeadScore } from "../../base44/shared/leadScoringResilience.ts";

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const r = (p) => fs.readFileSync(path.join(R, p), "utf8");

describe("merchant opportunity v2 compatibility", () => {
  it("uses deterministic-majority company scoring with explicit provenance/confidence", () => {
    const result = buildResilientLeadScore(
      {
        id: "lead-1",
        company_name: "Merchant",
        company_domain: "merchant.eu",
        source: "apollo",
        industry: "ecommerce",
        raw_json: {
          organization: {
            estimated_num_employees: 100,
            technologies: ["Shopify", "Stripe"],
          },
        },
      },
      { id: "lead-1", score: 80, reasoning: "Company evidence only" },
      "PARSED",
    );

    expect(result.score_breakdown_json).toMatchObject({
      company_only: true,
      contact_features_used: false,
      probabilistic_calibration: false,
      weights: { deterministic: 0.7, llm: 0.3 },
    });
    expect(result.score_breakdown_json.scoring_version).toContain(
      "merchant-company-opportunity-v3",
    );
    expect(result.score_breakdown_json.evidence_confidence).toBeTypeOf(
      "number",
    );
  });

  it("prioritizes opportunity x confidence and dedupes company before send", () => {
    const s = r("base44/functions/outboundVolumeWorker/entry.ts");
    expect(s).toContain("learnedPriority");
    expect(s).toMatch(/b\.priority\s*-\s*a\.priority/);
    expect(s).toContain("seenCompanies");
    expect(s).toMatch(/<\s*0\.55/);
  });

  it("deterministic model includes size, commerce, payments and timing evidence", () => {
    const s = r("base44/shared/merchantOpportunity.ts");
    for (const key of [
      "employees",
      "revenue",
      "monthly_traffic",
      "store_count",
      "payment_provider",
      "commerce_platform",
      "evidence_count",
    ]) expect(s).toContain(key);
    expect(s).toContain("contact_features_used: false");
  });
});
