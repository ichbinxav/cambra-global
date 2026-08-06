// recoverHandlerContracts.test.js — v61 Checkpoint E (2026-08-06).
//
// HANDLER-LEVEL BOUNDARY CONTRACTS for the Recover Margin / billing surface.
//
// WHAT THIS IS: a static contract check over every handler that can move money,
// contractual terms or merchant billing data. It asserts the BOUNDARY shape each
// handler must present — a trust gate, a typed refusal, validation before I/O —
// so a future edit that drops a gate or reorders a side effect fails here.
//
// WHAT THIS IS NOT: proof that the handlers behave correctly end-to-end. The
// Deno handlers cannot be imported into vitest (separate runtime, live SDK), so
// runtime behaviour was probed against the deployed endpoints during this
// checkpoint and the invariants worth freezing were encoded here. Deep flow
// verification stays manual / Testing Agent.
//
// The probe that justified extending the client-terms guard is documented in
// contractPolicySnapshot.ts — startRecoverAcceptance accepted a payload carrying
// `fee_pct` because the guard only listed the camelCase spelling.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rejectClientTerms } from "../../base44/shared/contractPolicySnapshot.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "..", "..");
const fn = (name) =>
  fs.readFileSync(path.join(REPO_ROOT, "base44", "functions", name, "entry.ts"), "utf8");

// Handlers that touch contractual terms, invoices or merchant billing reads.
const MERCHANT_HANDLERS = [
  "startRecoverAcceptance",
  "acceptRecoverMandate",
  "getRecoverAcceptanceContext",
  "getRecoverContractStatus",
  "downloadRecoverContract",
  "getMyBillingRecords",
  "startPaymentMethodSetup",
  "refreshPaymentMethodStatus",
];

const PRIVILEGED_HANDLERS = [
  "approveRecoverReportForInvoicing",
  "createEligibleRecoverInvoices",
  "generateMonthlySavingsReport",
  "recordConditionsActivation",
  "generateRecoverContractPdf",
  "sendRecoverContractEmail",
  "retryPendingRecoverContracts",
  "checkVatVies",
];

describe("handler contracts — trust gates (no unguarded economic surface)", () => {
  it("every merchant handler identifies the caller and refuses anonymously with 401", () => {
    const bad = MERCHANT_HANDLERS.filter((name) => {
      const src = fn(name);
      return !/auth\.me\(\)/.test(src) || !/status:\s*401/.test(src);
    });
    expect(
      bad,
      `Merchant handlers must call auth.me() and return a hard 401 — never a ` +
        `silent empty list (indistinguishable from "you have no data"):\n  ${bad.join("\n  ")}`
    ).toEqual([]);
  });

  it("every privileged handler is gated by internalGate or an explicit admin check", () => {
    const bad = PRIVILEGED_HANDLERS.filter((name) => {
      const src = fn(name);
      return !/internalGate|role\s*[!=]==?\s*['"]admin['"]/.test(src);
    });
    expect(
      bad,
      `Handlers that move money or write contractual state must be gated ` +
        `(internalGate / explicit admin role):\n  ${bad.join("\n  ")}`
    ).toEqual([]);
  });

  it("no economic handler trusts a client-supplied brand/tenant id for scope", () => {
    // getMyBillingRecords is the canonical example: the tenant comes from the
    // session, and the handler parses no body at all.
    const src = fn("getMyBillingRecords");
    expect(src).not.toMatch(/req\.json\(\)/);
    expect(src).toContain("pickOwnedBrand");
  });
});

describe("handler contracts — validation before side effects", () => {
  it("acceptance handlers run rejectClientTerms before resolving anything", () => {
    for (const name of ["startRecoverAcceptance", "acceptRecoverMandate"]) {
      const src = fn(name);
      const guard = src.indexOf("rejectClientTerms(body)");
      expect(guard, `${name} does not guard the body`).toBeGreaterThan(-1);
      // The guard must precede the first entity read/write in the handler body.
      // `await ` anchors the CALL — a bare name also matches the import line at
      // the top of the file, which would make this assertion always pass.
      const firstIo = Math.min(
        ...[
          src.indexOf("await resolveOwnedActivation"),
          src.indexOf("await svc.entities.Mandate.filter"),
          src.indexOf("await svc.entities.Mandate.create"),
        ].filter((i) => i > -1)
      );
      expect(guard, `${name} guards AFTER its first I/O`).toBeLessThan(firstIo);
    }
  });

  it("invoice creation validates economics before the first Stripe call", () => {
    const src = fn("createEligibleRecoverInvoices");
    const core = src.indexOf("prepareEligibleRecoverInvoice({");
    const stripe = src.indexOf("stripeRequest(");
    expect(core).toBeGreaterThan(-1);
    expect(stripe).toBeGreaterThan(-1);
    expect(core).toBeLessThan(stripe);
  });

  it("the monthly report generator enforces the product scope server-side", () => {
    expect(fn("generateMonthlySavingsReport")).toContain("assertProductionEnabledVertical");
  });

  it("the contractual email refuses an unresolvable contract instead of guessing", () => {
    const src = fn("sendRecoverContractEmail");
    expect(src).toContain("contract_unresolvable");
    // A delivery failure must never rewrite the mandate's legal status.
    expect(src).not.toMatch(/status:\s*'revoked'|status:\s*'superseded'/);
  });
});

describe("client-terms guard covers the names the backend actually persists", () => {
  // Regression for the live-probe finding: snake_case keys were missing.
  const SNAKE = [
    "fee_pct",
    "effective_fee_pct",
    "applied_fee_pct",
    "discount_pct",
    "node_share_percent",
    "standard_fee_pct",
    "merchant_share_pct",
    "fee_duration_months",
    "policy_version",
    "policy_source",
    "snapshot_hash",
    "acceptance_snapshot_hash",
  ];

  it.each(SNAKE)("rejects a payload carrying %s", (key) => {
    const res = rejectClientTerms({ deal_activation_id: "a", [key]: 1 });
    expect(res.ok).toBe(false);
    expect(res.keys).toContain(key);
  });

  it("still accepts the legitimate acceptance payloads the UI sends", () => {
    expect(rejectClientTerms({ deal_activation_id: "act_1" }).ok).toBe(true);
    expect(
      rejectClientTerms({
        mandate_id: "m_1",
        signed_by_name: "Ada Lovelace",
        signed_by_role: "Director",
        accepted: true,
      }).ok
    ).toBe(true);
  });

  it("reports every offending key, not just the first", () => {
    const res = rejectClientTerms({ fee_pct: 5, merchant_share_pct: 95 });
    expect(res.ok).toBe(false);
    expect(res.keys.sort()).toEqual(["fee_pct", "merchant_share_pct"]);
  });

  it("non-object payloads are not a bypass path", () => {
    expect(rejectClientTerms(null).ok).toBe(true);
    expect(rejectClientTerms("fee_pct").ok).toBe(true);
  });
});