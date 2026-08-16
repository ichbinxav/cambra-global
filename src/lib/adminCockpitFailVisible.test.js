import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import process from "node:process";
const read = (p) => readFileSync(join(process.cwd(), p), "utf8");
describe("Admin cockpit read-failure visibility", () => {
  it("records degraded sources instead of converting read outages to healthy zeroes", () => {
    const src = read("base44/functions/getAdminOperationsCockpit/entry.ts");
    expect(src).toContain("pushUnique(degradedSources, name)");
    expect(src).toContain("degraded_sources: degradedSources");
    expect(src).toContain("data_complete: degradedSources.length === 0");
    expect(src).toMatch(
      /degradedSources\.length\s*\|\|\s*truncatedSources\.length\s*\|\|\s*attention/,
    );
  });
  it("surfaces degraded data coverage in the founder command center", () => {
    expect(read("src/pages/admin/AdminCommand.jsx")).toContain("Data coverage degraded:");
  });
});
