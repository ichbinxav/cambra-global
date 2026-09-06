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
describe("outreach personalization and learning", () => {
  it("has controlled variants and an exposure-mature advisory guard", () => {
    const s = r("base44/shared/outreachExperiment.ts");
    expect(s).toContain("merchant_acquisition");
    expect(s).toContain("partner_acquisition");
    expect(s).toMatch(/roll\s*<\s*20/);
    expect(s).toMatch(/eligible_sample_size\s*\|\|\s*0\)\s*>=\s*20/);
    expect(s).toContain("OUTREACH_EXPERIMENT_ADVISORY_LABEL_CONTRACT");
  });
  it("merchant sends use validated campaign content and store versioned provenance", () => {
    const s = r("base44/functions/outboundVolumeWorker/entry.ts");
    expect(s).toContain("personalizationFacts");
    expect(s).toContain("renderCampaignContent(content, x)");
    expect(s).toContain("evaluateClaimsGate");
    expect(s).toContain("experiment_key: `campaign:${campaign.id}`");
    expect(s).toContain("campaign_content_version_id: content.id");
    expect(s).toContain("campaign_sequence_version_id: sequence.id");
  });
  it("partner drafts do the same", () => {
    const s = r("base44/functions/autonomousPartnerWorker/entry.ts");
    expect(s).toContain("personalizationFacts");
    expect(s).toContain("experiment_key:'partner-outreach-v1'");
    expect(s).toContain("chooseVariant");
  });
  it("learning is outcome based and daily registered", () => {
    const s = r("base44/functions/outreachExperimentLearningWorker/entry.ts");
    const c = r(
      "base44/functions/outreachExperimentLearningWorker/function.jsonc",
    );
    expect(s).toContain("performance_score");
    expect(s).toContain("positive_reply_count");
    expect(s).toContain("meeting_count");
    expect(s).toContain("evaluateOutreachExperimentEligibility");
    expect(s).toContain("eligibility_status_counts");
    expect(c).toContain('"is_active":true');
  });
});
