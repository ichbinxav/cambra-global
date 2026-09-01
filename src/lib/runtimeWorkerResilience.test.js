import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file) => fs.readFileSync(file, "utf8");

describe("runtime worker resilience", () => {
  it("completes a persisted degraded health diagnostic without granting authority", () => {
    const source = read("base44/functions/operatingHealthWorker/entry.ts");
    expect(source).toContain('execution_status: "COMPLETED_WITH_DEGRADED_INPUTS"');
    expect(source).toContain("diagnostic_only: true");
    expect(source).toContain("automated_action_allowed: false");
    expect(source).not.toMatch(
      /if \(!dependencySummary\.automated_action_allowed\) \{\s*schedulerOk = false;/,
    );
  });

  it("bounds operating-health task coverage to the seven-day metric window", () => {
    const source = read("base44/functions/operatingHealthWorker/entry.ts");
    expect(source).toContain("const recentTaskCutoff");
    expect(source).toContain("{ created_date: { $gte: recentTaskCutoff } }");
    expect(source).not.toContain('AgentTask.list("-created_date", 1000)');
    expect(source).toContain("Date.parse(nowIso) - Date.parse");
  });

  it("processes the sales pipeline in an oldest-first bounded batch", () => {
    const source = read("base44/functions/salesPipelineWorker/entry.ts");
    expect(source).toContain("SALES_PIPELINE_BATCH_SIZE = 50");
    expect(source).toContain('.list("updated_date", SALES_PIPELINE_BATCH_SIZE)');
    expect(source).toContain('{ lead_id: { $in: leadIds } }');
    expect(source).toContain('attribution?.attribution_state !== "EXACT"');
    expect(source).toContain('attribution?.confidence !== "deterministic"');
    expect(source).not.toContain("3000");
  });
});
