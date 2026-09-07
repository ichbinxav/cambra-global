import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

describe("CONTRACT - Analyzer entry routing", () => {
  const analyzer = read("src/pages/PaymentsAnalyzer.jsx");
  const connectTools = read("src/pages/ConnectTools.jsx");

  it("routes statement upload to the real upload surface", () => {
    expect(analyzer).toMatch(/mode === "upload"[\s\S]{0,120}navigate\("\/ConnectTools\?mode=upload"\)/);
    expect(connectTools).toContain('id="statement-upload"');
    expect(connectTools).toMatch(/requestedMode === "upload"\s*\?\s*uploadRef\.current/);
  });

  it("keeps the manual questionnaire and provider connection as distinct paths", () => {
    expect(analyzer).toMatch(/mode === "connect"[\s\S]{0,120}navigate\("\/ConnectTools\?mode=connect"\)/);
    expect(analyzer).toMatch(/if \(mode === "upload"\)[\s\S]{0,180}changeStep\(2\)/);
  });
});
