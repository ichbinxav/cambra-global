// v62.4 — ECL P2: the canonical policy and its invariants.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import {
  validateEclPolicy,
  eclPolicySchema,
  buildEclPolicyArtifact,
  buildEclDomainArtifact,
  DOMAIN_SOURCE_ORDER,
} from "@/lib/eclPolicySchema";

const root = process.cwd();
const read = (rel) => readFileSync(join(root, rel), "utf-8");
const RAW = JSON.parse(read("config/ecl-policy.json"));
const clone = () => JSON.parse(JSON.stringify(RAW));
const errorsOf = (json) => {
  const r = eclPolicySchema.safeParse(json);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

describe("ecl-policy — the live policy is valid", () => {
  it("parses and keeps its identity", () => {
    const p = validateEclPolicy(RAW);
    expect(p.policyVersion).toBe("ecl-2026.08");
    expect(p.effectiveDate).toBe("2026-08-06");
    expect(p.confidenceOrder).toEqual(["unknown", "low", "medium", "high"]);
    expect(Object.keys(p.gates)).toHaveLength(9);
  });

  it("uses allowedStatuses (a set), never minStatus (a scale)", () => {
    // No minStatus KEY anywhere (the notes mention the word to explain why).
    expect(read("config/ecl-policy.json")).not.toMatch(/"minStatus"\s*:/);
    for (const gate of Object.values(RAW.gates)) {
      expect(Object.prototype.hasOwnProperty.call(gate, "minStatus")).toBe(false);
    }
  });

  it("documents the retention assumption as provisional and lawyer-pending", () => {
    expect(RAW.notes.attestationRetentionYears).toMatch(/PROVISIONAL/);
    expect(RAW.notes.attestationRetentionYears).toMatch(/French lawyer|FR counsel/);
  });
});

describe("ecl-policy — invariants reject unsafe policies", () => {
  it("rejects an impossible calendar date", () => {
    const p = clone();
    p.effectiveDate = "2026-02-30";
    expect(errorsOf(p).join(" ")).toMatch(/effectiveDate/);
  });

  it("rejects out-of-order reminders", () => {
    const p = clone();
    p.windows.remindAtHours = [144, 72];
    expect(errorsOf(p).join(" ")).toMatch(/strictly increasing/);
  });

  it("rejects a reminder outside the provisional window", () => {
    const p = clone();
    p.windows.remindAtHours = [72, 200]; // 7 days = 168h
    expect(errorsOf(p).join(" ")).toMatch(/provisionalDays × 24/);
  });

  it("rejects a confidenceOrder that is not the four levels once each", () => {
    const p = clone();
    p.confidenceOrder = ["unknown", "low", "low", "high"];
    expect(errorsOf(p).join(" ")).toMatch(/exactly once/);
  });

  it("rejects a strike threshold below 1", () => {
    const p = clone();
    p.strikes.threshold = 0;
    expect(errorsOf(p).length).toBeGreaterThan(0);
  });

  it("rejects a forbidden-automation gate without human review", () => {
    const p = clone();
    delete p.gates.recalc_billed_period.requiresHumanReview;
    expect(errorsOf(p).join(" ")).toMatch(/requiresHumanReview/);
  });

  it("rejects create_invoice accepting a non-verified status", () => {
    const p = clone();
    p.gates.create_invoice.allowedStatuses = ["verified", "accepted_provisionally"];
    expect(errorsOf(p).join(" ")).toMatch(/only allow the "verified" status/);
  });

  it("rejects create_invoice accepting attested-only evidence", () => {
    const p = clone();
    p.gates.create_invoice.allowedVerificationMethods = ["independent_api", "attested_only"];
    expect(errorsOf(p).join(" ")).toMatch(/must not accept attested_only/);
  });

  it("rejects create_invoice dropping the independent-method restriction entirely", () => {
    const p = clone();
    delete p.gates.create_invoice.allowedVerificationMethods;
    expect(errorsOf(p).join(" ")).toMatch(/independent evidence/);
  });

  it("rejects freeze_baseline accepting attested-only evidence", () => {
    const p = clone();
    p.gates.freeze_baseline.allowedVerificationMethods = ["attested_only"];
    expect(errorsOf(p).join(" ")).toMatch(/independent verification/);
  });

  it("rejects an unknown status or confidence level in a gate", () => {
    const p = clone();
    p.gates.show_estimate.allowedStatuses = ["not_a_status"];
    expect(errorsOf(p).length).toBeGreaterThan(0);
  });
});

describe("ecl:check — no drift between config and generated artifacts", () => {
  const EXPECTED = buildEclPolicyArtifact(validateEclPolicy(RAW));

  it("frontend policy artifact matches the canonical generation", () => {
    expect(read("src/lib/generated/eclPolicy.js")).toBe(EXPECTED);
  });

  it("backend policy artifact is byte-identical to the frontend one", () => {
    expect(read("base44/shared/generated/eclPolicy.ts")).toBe(EXPECTED);
  });

  it("backend domain artifact matches the canonical concatenation", () => {
    const sources = {};
    for (const rel of DOMAIN_SOURCE_ORDER) sources[rel] = read(rel);
    expect(read("base44/shared/generated/eclDomain.ts")).toBe(buildEclDomainArtifact(sources));
  });

  it("drift is detectable (a tampered artifact would not match)", () => {
    expect(EXPECTED.replace("ECL_POLICY", "ECL_POLICY /*x*/")).not.toBe(EXPECTED);
  });

  it("generated artifacts carry the DO-NOT-EDIT header", () => {
    for (const rel of ["src/lib/generated/eclPolicy.js", "base44/shared/generated/eclPolicy.ts", "base44/shared/generated/eclDomain.ts"]) {
      expect(read(rel)).toContain("GENERATED FILE — DO NOT EDIT DIRECTLY");
    }
  });

  it("the backend domain artifact is self-contained (no imports survive)", () => {
    expect(read("base44/shared/generated/eclDomain.ts")).not.toMatch(/^import\s/m);
  });
});