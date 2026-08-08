import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  evaluateRecoverEconomicGate,
} from "../../base44/shared/eclEconomicGate.ts";
import {
  P4_PROOF_ALLOWLIST,
  P5_ALLOWLIST,
  STAGE_ECL_P4_PROOF,
  STAGE_ECL_P5,
  STAGE_TRANSITIONS,
  allowlistForStage,
} from "../../scripts/lib/preEclFreeze.mjs";

// Use the canonical domain hash helpers through the backend-generated artifact.
import {
  sha256Hex as domainSha256Hex,
  stableSerialize as domainStableSerialize,
} from "../../base44/shared/generated/eclDomain.ts";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const codeOnly = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((l) => !/^\s*\/\//.test(l))
  .join("\n");

const START = read("base44/functions/startRecoverAcceptance/entry.ts");
const ACCEPT = read("base44/functions/acceptRecoverMandate/entry.ts");
const APPROVE = read("base44/functions/approveRecoverReportForInvoicing/entry.ts");
const INVOICE = read("base44/functions/createEligibleRecoverInvoices/entry.ts");
const GATE = read("base44/shared/eclEconomicGate.ts");

function confidenceResult(overrides = {}) {
  return {
    confidenceLevel: "high",
    evidenceStatus: "verified",
    verificationMethod: "independent_api",
    conflicts: [],
    expiresAt: null,
    ...overrides,
  };
}

function evidence(overrides = {}) {
  const result = overrides.result || confidenceResult();
  const snapshot = {
    version: "ecl-persisted-evidence-1",
    confidenceResult: result,
    normalizedEvidence: { source: "test" },
    evaluationContext: { version: "ecl-evaluation-context-1", referenceFeeRateBps: null },
    lifecycle: { status: result.evidenceStatus, provisionalStartedAt: null, expiresAt: result.expiresAt || null, supersededById: null },
  };
  const row = {
    id: overrides.id || "se-1",
    brand_id: "brand-1",
    deal_activation_id: "act-1",
    evidence_status: result.evidenceStatus,
    confidence_level_ecl: result.confidenceLevel,
    confidence_result: snapshot,
    confidence_result_hash: domainSha256Hex(domainStableSerialize(snapshot)),
    created_date: overrides.created_date || "2026-08-09T00:00:00.000Z",
  };
  if (overrides.hash) row.confidence_result_hash = overrides.hash;
  return row;
}

function strike(scope = "payments", id = "s1") {
  return { id, scope, expires_at: "2026-09-01T00:00:00.000Z", withdrawn_at: null };
}

function svcFixture({ evidenceRows = [evidence()], attestations = [{}], reviews = [], strikes = [], failEvidenceRead = null } = {}) {
  const calls = [];
  const filter = (name, value) => async (...args) => {
    calls.push({ name, args });
    if (name === "SavingsEvidence" && failEvidenceRead) throw failEvidenceRead;
    return value;
  };
  return {
    calls,
    svc: {
      entities: {
        SavingsEvidence: { filter: filter("SavingsEvidence", evidenceRows) },
        EvidenceAttestation: { filter: filter("EvidenceAttestation", attestations) },
        ReviewCase: { filter: filter("ReviewCase", reviews) },
        EvidenceStrike: { filter: filter("EvidenceStrike", strikes) },
      },
    },
  };
}

const input = (svc, gateName, baseline = { id: "b1", locked: true }) => ({
  svc,
  gateName,
  brandId: "brand-1",
  dealActivationId: "act-1",
  baseline,
  now: "2026-08-09T00:10:00.000Z",
});

describe("ECL P5 — Economic Enforcement", () => {
  it("is reachable only from Production Proof and rolls back only there", () => {
    expect(STAGE_TRANSITIONS[STAGE_ECL_P4_PROOF]).toEqual(expect.arrayContaining([STAGE_ECL_P5]));
    expect(STAGE_TRANSITIONS[STAGE_ECL_P5]).toEqual([STAGE_ECL_P4_PROOF]);
    expect(allowlistForStage(STAGE_ECL_P5)).toEqual(P5_ALLOWLIST);
  });

  it("widens Production Proof by exactly six paths and no economic schema", () => {
    expect(P5_ALLOWLIST.slice(0, P4_PROOF_ALLOWLIST.length)).toEqual(P4_PROOF_ALLOWLIST);
    expect(P5_ALLOWLIST.slice(P4_PROOF_ALLOWLIST.length)).toEqual([
      "base44/shared/eclEconomicGate.ts",
      "base44/functions/startRecoverAcceptance/entry.ts",
      "base44/functions/acceptRecoverMandate/entry.ts",
      "base44/functions/approveRecoverReportForInvoicing/entry.ts",
      "base44/functions/createEligibleRecoverInvoices/entry.ts",
      "src/lib/eclP5Closure.test.js",
    ]);
    expect(P5_ALLOWLIST).toHaveLength(45);
    expect(P5_ALLOWLIST.filter((p) => p.startsWith("base44/entities/"))).toEqual(P4_PROOF_ALLOWLIST.filter((p) => p.startsWith("base44/entities/")));
    for (const p of P5_ALLOWLIST) expect(p).not.toMatch(/[*?]/);
  });

  it("verified/high/independent + attestation passes all four economic gates", async () => {
    for (const gateName of ["freeze_baseline", "recover_proposal", "approve_report", "create_invoice"]) {
      const { svc } = svcFixture();
      const out = await evaluateRecoverEconomicGate(input(svc, gateName));
      expect(out.allowed, `${gateName}: ${out.reasons.join(",")}`).toBe(true);
      expect(out.evidenceId).toBe("se-1");
    }
  });

  it("uses the newest row only — a newer rejected result cannot fall back to old verified evidence", async () => {
    const newest = evidence({ id: "new-rejected", result: confidenceResult({ evidenceStatus: "rejected" }), created_date: "2026-08-09T00:02:00.000Z" });
    const older = evidence({ id: "old-verified", created_date: "2026-08-08T00:02:00.000Z" });
    const { svc } = svcFixture({ evidenceRows: [newest, older] });
    const out = await evaluateRecoverEconomicGate(input(svc, "create_invoice"));
    expect(out.allowed).toBe(false);
    expect(out.evidenceId).toBe("new-rejected");
    expect(out.reasons).toContain("status_not_allowed:rejected");
  });

  it("fails closed on a missing or tampered canonical snapshot", async () => {
    const missing = svcFixture({ evidenceRows: [] });
    expect((await evaluateRecoverEconomicGate(input(missing.svc, "create_invoice"))).reasons).toContain("no_ecl_savings_evidence");

    const tampered = svcFixture({ evidenceRows: [evidence({ hash: "bad-hash" })] });
    const out = await evaluateRecoverEconomicGate(input(tampered.svc, "create_invoice"));
    expect(out.allowed).toBe(false);
    expect(out.reasons).toContain("canonical_ecl_snapshot_hash_mismatch");
    expect(tampered.calls.map((c) => c.name)).toEqual(["SavingsEvidence"]);
  });

  it("propagates persistence outages instead of treating them as empty evidence", async () => {
    const { svc } = svcFixture({ failEvidenceRead: new Error("db unavailable") });
    await expect(evaluateRecoverEconomicGate(input(svc, "create_invoice"))).rejects.toThrow("db unavailable");
  });

  it("obeys P4 blocking_actions even when the base gate has no generic review requirement", async () => {
    const reviews = [{
      id: "rc1", status: "open", evidence_id: "se-1",
      blocking_actions: { actions: ["recover_proposal"], descriptive_only: false },
    }];
    const { svc } = svcFixture({ reviews });
    const out = await evaluateRecoverEconomicGate(input(svc, "recover_proposal"));
    expect(out.allowed).toBe(false);
    expect(out.reasons).toContain("blocking_review_case_action:recover_proposal");
  });

  it("requires the exact baseline lock and honors the payments strike threshold before invoice creation", async () => {
    const unlocked = svcFixture();
    expect((await evaluateRecoverEconomicGate(input(unlocked.svc, "create_invoice", { id: "b1", locked: false }))).reasons).toContain("baseline_not_locked");

    const struck = svcFixture({ strikes: [strike("payments", "s1"), strike("payments", "s2")] });
    expect((await evaluateRecoverEconomicGate(input(struck.svc, "create_invoice"))).reasons).toContain("blocking_strikes:payments:2");
  });

  it("contract proposal is gated both when opened and immediately before acceptance", () => {
    for (const src of [START, ACCEPT]) {
      const freeze = src.indexOf("gateName: 'freeze_baseline'");
      const proposal = src.indexOf("gateName: 'recover_proposal'");
      expect(freeze).toBeGreaterThan(-1);
      expect(proposal).toBeGreaterThan(freeze);
    }
    expect(START.indexOf("gateName: 'recover_proposal'")).toBeLessThan(START.indexOf("entities.Mandate.create"));
    expect(ACCEPT.indexOf("gateName: 'recover_proposal'")).toBeLessThan(ACCEPT.indexOf("entities.Mandate.update(mandate_id"));
  });

  it("approve_report executes before any eligibility write", () => {
    const gate = APPROVE.indexOf("gateName: 'approve_report'");
    const firstUpdate = APPROVE.indexOf("entities.MonthlySavingsReport.update");
    expect(gate).toBeGreaterThan(-1);
    expect(firstUpdate).toBeGreaterThan(gate);
  });

  it("create_invoice executes after pure prep but before Invoice.create and every Stripe POST", () => {
    const prep = INVOICE.indexOf("prepareEligibleRecoverInvoice({");
    const gate = INVOICE.indexOf("gateName: 'create_invoice'");
    const invoiceCreate = INVOICE.indexOf("entities.Invoice.create({");
    const stripePost = INVOICE.indexOf("stripeRequest(mode, 'POST'");
    expect(gate).toBeGreaterThan(prep);
    expect(invoiceCreate).toBeGreaterThan(gate);
    expect(stripePost).toBeGreaterThan(gate);
  });

  it("the P5 adapter is read-only and economic handlers never upgrade ECL", () => {
    const helperCode = codeOnly(GATE);
    expect(helperCode).not.toMatch(/entities\.[A-Za-z]+\.(create|update|updateMany|delete|bulkCreate)\s*\(/);
    for (const src of [START, ACCEPT, APPROVE, INVOICE]) {
      const code = codeOnly(src);
      expect(code).not.toMatch(/confidence_result\s*:/);
      expect(code).not.toMatch(/confidence_level_ecl\s*:/);
      expect(code).not.toMatch(/evidence_status\s*:/);
      expect(code).not.toMatch(/freeze_eligibility\s*:/);
    }
  });

  it("client payload cannot supply confidence/status/attestation/baseline lock to the P5 adapter", () => {
    for (const src of [START, ACCEPT, APPROVE, INVOICE]) {
      expect(src).not.toMatch(/evaluateRecoverEconomicGate\(\{[\s\S]*?(confidence|evidenceStatus|hasAttestation|baselineLocked)\s*:/);
    }
    expect(GATE).toContain("svc.entities.SavingsEvidence.filter");
    expect(GATE).toContain("confidence_result_hash");
    expect(GATE).toContain("svc.entities.EvidenceAttestation.filter");
    expect(GATE).toContain("svc.entities.ReviewCase.filter");
    expect(GATE).toContain("svc.entities.EvidenceStrike.filter");
  });
});
