import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { CLUSTERS, ORCHESTRATORS } from "./agentRegistry.js";

const read = (path) => fs.readFileSync(path, "utf8");

describe("canonical AgentTask work lifecycle", () => {
  it("keeps the legacy AgentRun approval endpoint physically present but write-free", () => {
    const source = read("base44/functions/approveAgentRun/entry.ts");
    expect(source).toContain("DEPRECATED_READ_ONLY_NO_WRITES");
    expect(source).toContain("agent_run_approval_surface_deprecated");
    expect(source).toContain("status: 410");
    expect(source).not.toMatch(/entities\.AgentRun\.(?:create|update|delete|bulkCreate|updateMany)/);
    expect(source).not.toMatch(/entities\.Recommendation\.(?:create|update|delete|bulkCreate|updateMany)/);
  });

  it("has no production AgentRun writer outside tests or documentation", () => {
    const functionDirs = fs.readdirSync("base44/functions");
    const writers = [];
    for (const name of functionDirs) {
      const path = `base44/functions/${name}/entry.ts`;
      if (!fs.existsSync(path)) continue;
      if (/entities\.AgentRun\.(?:create|update|delete|bulkCreate|updateMany)/.test(read(path))) {
        writers.push(path);
      }
    }
    expect(writers).toEqual([]);
  });

  it("declares AgentTask as the sole canonical work primitive", () => {
    const task = JSON.parse(read("base44/entities/AgentTask.jsonc"));
    const legacy = JSON.parse(read("base44/entities/AgentRun.jsonc"));
    expect(task.name).toBe("AgentTask");
    expect(legacy.description).toContain("DEPRECATED read-only compatibility");
    expect(legacy.rls.write.user_condition.role).toBe("__service_role_only__");
  });

  it("keeps the source-derived workforce catalog at 34 agents and 5 orchestrators", () => {
    expect(CLUSTERS.flatMap((cluster) => cluster.agents)).toHaveLength(34);
    expect(ORCHESTRATORS).toHaveLength(5);
    const source = read("src/lib/agentRegistry.js");
    const documentation = read("src/docs/CAMBRA_AGENT_OPERATING_CATALOG.md");
    expect(source).toContain("34 declared agents + 5 orchestrators");
    const catalog = JSON.parse(read("config/agent-workforce-catalog.v1.json"));
    const pkg = JSON.parse(read("package.json"));
    expect(catalog.release_identity).toEqual({
      package_version: pkg.version,
      release_name: pkg.releaseName,
    });
    expect(documentation).toContain(`v${pkg.version}`);
  });
});
