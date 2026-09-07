import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

describe("CONTRACT - Analyzer entry routing", () => {
  const analyzer = read("src/pages/PaymentsAnalyzer.jsx");
  const app = read("src/App.jsx");
  const uploadPage = read("src/pages/UploadStatement.jsx");
  const stripePage = read("src/pages/ConnectStripe.jsx");

  it("routes statement upload to its independent upload surface", () => {
    expect(analyzer).toMatch(/mode === "upload"[\s\S]{0,120}navigate\("\/UploadStatement"\)/);
    expect(app).toContain('path="/UploadStatement"');
    expect(uploadPage).toContain('<ConnectTools mode="upload" />');
  });

  it("keeps the manual questionnaire and provider connection as distinct paths", () => {
    expect(analyzer).toMatch(/mode === "connect"[\s\S]{0,120}navigate\("\/ConnectStripe"\)/);
    expect(app).toContain('path="/ConnectStripe"');
    expect(stripePage).toContain('<ConnectTools mode="connect" />');
    expect(analyzer).toMatch(/if \(mode === "upload"\)[\s\S]{0,180}navigate\("\/UploadStatement"\)/);
    expect(analyzer).toMatch(/changeStep\(3\)/);
  });
});
