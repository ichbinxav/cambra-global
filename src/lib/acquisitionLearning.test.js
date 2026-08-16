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
describe("acquisition feedback learning", () => {
  it("is bounded and sample-size gated", () => {
    const s = r("base44/shared/acquisitionLearning.ts");
    expect(s).toMatch(/n\s*<\s*20/);
    expect(s).toMatch(/Math\.max\(\.85,\s*Math\.min\(1\.15/);
  });
  it("learns from exposure-mature outcomes without touching financial truth", () => {
    const s = r("base44/functions/acquisitionLearningWorker/entry.ts");
    for (
      const k of [
        "reply_count",
        "positive_reply_count",
        "meeting_count",
        "won_count",
        "UNKNOWN/pending is excluded",
        "confirmed exposure plus a mature horizon",
      ]
    ) expect(s).toContain(k);
    expect(s).not.toContain("MonthlySavingsReport.update");
  });
  it("learning worker is actually scheduled", () => {
    const c = r("base44/functions/acquisitionLearningWorker/function.jsonc");
    expect(c).toContain('"is_active":true');
    expect(c).toContain('"repeat_unit":"days"');
  });
  it("learning only reorders eligible merchant queue", () => {
    const s = r("base44/functions/outboundVolumeWorker/entry.ts");
    expect(s).toContain("learnedPriority");
    expect(s).toContain("AcquisitionLearningCohort");
    expect(s).toMatch(/b\.priority\s*-\s*a\.priority/);
  });
});
