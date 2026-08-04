import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// P0.1 — Static test: the merchant-facing Copilot system prompt must be
// payments-only. Reads the actual production file and checks for forbidden
// multi-vertical terms and required payments-only terms.

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "..", "..");
const COPILOT_FILE = path.join(REPO_ROOT, "base44/functions/copilotChat/entry.ts");

function readCopilot() {
  return fs.readFileSync(COPILOT_FILE, "utf-8");
}

describe("Copilot payments-only coherence (P0.1)", () => {
  const src = readCopilot();

  // Forbidden: must not describe future verticals as CURRENT services
  const FORBIDDEN_AS_CURRENT = [
    "Scores payments, shipping, SaaS",
    "Payments & Shipping recovery",
    "SaaS optimization: FREE",
    "SaaS savings 0% fee",
    "recover margin brands lose on payments, shipping, SaaS and banking",
    "we identify overpayment across payments, shipping, SaaS",
    "shipping providers, etc.",
  ];

  FORBIDDEN_AS_CURRENT.forEach((term) => {
    it(`does not describe "${term}" as a current service`, () => {
      expect(src).not.toContain(term);
    });
  });

  // Required: must accurately describe the current payments-only product
  it("mentions card payment cost audit", () => {
    expect(src).toMatch(/card.?payment/i);
  });

  it("states the Analyzer is free", () => {
    expect(src).toMatch(/Analyzer:\s*FREE/i);
  });

  it("states Recovery is optional", () => {
    expect(src).toMatch(/Recovery:\s*optional/i);
  });

  it("states 25% fee on verified positive savings", () => {
    expect(src).toMatch(/25%.*verified positive/i);
  });

  it("states 24 months duration", () => {
    expect(src).toMatch(/24 months/i);
  });

  it("states no positive verified saving = no fee", () => {
    expect(src).toMatch(/no.*positive verified saving.*no fee/i);
  });

  it("states referral floor of 5%", () => {
    expect(src).toMatch(/5%.*floor|floor.*5%/i);
  });

  it("describes future verticals as planned, not current", () => {
    expect(src).toMatch(/PLANNED FUTURE EXPANSION|not currently available/i);
  });

  it("instructs the LLM to never offer shipping/SaaS/etc as current", () => {
    expect(src).toMatch(/NEVER offer shipping.*as currently available/i);
  });
});