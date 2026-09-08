import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import HeadlineText from "@/components/shared/HeadlineText";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

describe("Public journey experience", () => {
  it("puts the three How it works steps before the secondary data-source explanation", () => {
    const source = read("src/pages/HowItWorks.jsx");
    expect(source.indexOf("steps.map")).toBeGreaterThan(-1);
    expect(source.indexOf("steps.map")).toBeLessThan(source.indexOf("entryPaths.map"));
    expect(source).toContain("cambra-dark-panel");
  });

  it("keeps the full public navigation and back navigation on the Analyzer", () => {
    const shell = read("src/components/paymentsAnalyzer/AnalyzerJourneyShell.jsx");
    expect(shell).toContain("<Navbar />");
    expect(shell).toContain("payment-journey__backbar");
    expect(shell).toContain("activeStep - 1");
  });

  it("collects registration identity and an optional referral before hosted sign-in", () => {
    const gate = read("src/pages/LoginGate.jsx");
    expect(gate).toContain('autoComplete="name"');
    expect(gate).toContain('autoComplete="organization"');
    expect(gate).toContain('autoComplete="email"');
    expect(gate).toContain("registration-referral-code");
    expect(gate).toContain("writeRegistrationProfile");
  });

  it("keeps Stripe, statement upload and manual questions as separate destinations", () => {
    const analyzer = read("src/pages/PaymentsAnalyzer.jsx");
    expect(analyzer).toContain('navigate("/ConnectStripe")');
    expect(analyzer).toContain('navigate("/UploadStatement")');
    expect(analyzer).toContain("changeStep(3)");
    expect(analyzer).not.toContain('t("coll_sub")');
  });

  it("renders each sentence of a plain headline on its own line", () => {
    const html = renderToStaticMarkup(<h1><HeadlineText>First sentence. Second sentence.</HeadlineText></h1>);
    expect(html).toBe("<h1>First sentence.<br/>Second sentence.</h1>");
  });

  it("contains no gradient-clipped typography", () => {
    const pending = ["src/pages", "src/components", "src/lib"].map((root) => path.join(ROOT, root));
    const sourceFiles = [];
    while (pending.length) {
      const current = pending.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) pending.push(fullPath);
        else if (/\.(?:js|jsx|ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) sourceFiles.push(fullPath);
      }
    }
    const allSource = sourceFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
    expect(allSource).not.toContain('WebkitTextFillColor: "transparent"');
    expect(allSource).not.toContain("bg-clip-text");
  });
});
