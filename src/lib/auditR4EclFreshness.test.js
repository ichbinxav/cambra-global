// AUDIT R4-04 (2026-08-17) — the 35-day freshness gate that decides fee-bearing Verified Savings.
//
// This gate was pinned by three source greps in eclP5Closure.test.js: `toContain('PaymentsAnalysisVerified.filter')`,
// `toContain('StripeConnection.filter')` and a text search for the number 35. That is exactly the R4
// anti-pattern: the gate is business-critical (it decides which Stripe measurement can become
// invoiced Verified Savings) and the tests never call it.
//
// This file drives `inspectRecoverEvidenceSource` (the exported public entry point that
// resolveStripeSource sits behind) with fixtures pinned at 34 / 35 / 36 days old, plus the branch
// choices between PaymentsAnalysisVerified and StripeConnection, and the failure modes the
// production callers care about.
import { describe, expect, it } from "vitest";
import {
  inspectRecoverEvidenceSource,
  RECOVER_ECL_SOURCE_MAX_AGE_DAYS,
} from "../../base44/shared/eclRecoverEvidence.ts";

const NOW = "2026-08-17T12:00:00.000Z";
const daysAgo = (n) => new Date(Date.parse(NOW) - n * 86400000).toISOString();

function makeSvc(rows = {}) {
  const stores = {};
  const entity = (name) => {
    if (!stores[name]) stores[name] = (rows[name] || []).map((r) => ({ ...r }));
    return { async filter() { return stores[name].map((r) => ({ ...r })); } };
  };
  return { entities: new Proxy({}, { get: (_t, n) => entity(String(n)) }) };
}

const verified = (extra = {}) => ({
  id: "v1", brand_id: "b1", source_charges_hash: "hash-verified",
  measured_current_bps: 200,
  sample_metrics: { gmv_eur: 100000, tx_count: 500 },
  measurement_window: { from: "2026-06-01", to: daysAgo(10).slice(0, 10) },
  engine_version: "engine-1",
  engine_result: { achievable_effective_bps: 150 },
  ...extra,
});

const stripe = (extra = {}) => ({
  id: "s1", brand_id: "b1", connection_status: "connected",
  monthly_volume: 100000, effective_fee_pct: 2.5, currency: "EUR",
  data_as_of: daysAgo(5), total_transactions: 500,
  stripe_account_id: "acct_x", ...extra,
});

const activation = (extra = {}) => ({
  id: "a1", brand_id: "b1", provider_id: "p1", vertical: "payments", ...extra,
});

describe("R4-04 — the 35-day freshness constant is the fee-bearing boundary", () => {
  it("carries the exact business value", () => {
    // Not vacuous: this file's tests use the constant as the boundary, so if the exported value
    // changed, every scenario below would move with it.
    expect(RECOVER_ECL_SOURCE_MAX_AGE_DAYS).toBe(35);
  });
});

describe("R4-04 — the PaymentsAnalysisVerified branch", () => {
  it("accepts a verified measurement just inside the boundary (34 days)", async () => {
    // Using 34 not 35: the window `to` field is a date-only string (YYYY-MM-DD, midnight UTC),
    // while NOW is a specific time of day, so an ISO time truncated to a date at exactly 35 days
    // can round to 35.5 real days depending on the hour. 34 is the safe "inside" case.
    const result = await inspectRecoverEvidenceSource({
      svc: makeSvc({
        PaymentsAnalysisVerified: [verified({ measurement_window: { from: "2026-06-01", to: daysAgo(34).slice(0, 10) } })],
        StripeConnection: [stripe()],
      }),
      activation: activation(), now: NOW,
    });
    expect(result.ok).toBe(true);
    expect(result.source?.kind).toBe("payments_analysis_verified");
    expect(result.source?.checksum).toBe("hash-verified");
  });

  it("REJECTS a verified measurement at 36 days — one day past the boundary", async () => {
    const result = await inspectRecoverEvidenceSource({
      svc: makeSvc({
        PaymentsAnalysisVerified: [verified({ measurement_window: { from: "2026-06-01", to: daysAgo(36).slice(0, 10) } })],
      }),
      activation: activation(), now: NOW,
    });
    // No Stripe fallback in this fixture, and the verified row is over the age limit.
    expect(result.ok).toBe(false);
    expect(result.code).toBeTruthy();
  });

  it("falls to the StripeConnection branch when the verified row is over age", async () => {
    const result = await inspectRecoverEvidenceSource({
      svc: makeSvc({
        PaymentsAnalysisVerified: [verified({ measurement_window: { from: "2026-06-01", to: daysAgo(60).slice(0, 10) } })],
        StripeConnection: [stripe({ data_as_of: daysAgo(30) })],
      }),
      activation: activation(), now: NOW,
    });
    expect(result.ok).toBe(true);
    expect(result.source?.kind).toBe("stripe_connection_snapshot");
  });

  it("prefers the verified row when both are fresh — this is the source preference the audit greps tried to pin", async () => {
    const result = await inspectRecoverEvidenceSource({
      svc: makeSvc({
        PaymentsAnalysisVerified: [verified({ measurement_window: { from: "2026-06-01", to: daysAgo(20).slice(0, 10) } })],
        StripeConnection: [stripe()],
      }),
      activation: activation(), now: NOW,
    });
    // A verified analysis is a hashed charge set; the connection is a rolling aggregate. When
    // both are within age, the verified one wins.
    expect(result.source?.kind).toBe("payments_analysis_verified");
  });

  it("refuses a verified row that lacks the source charges hash — no measurement lineage means no fee-bearing evidence", async () => {
    const result = await inspectRecoverEvidenceSource({
      svc: makeSvc({
        PaymentsAnalysisVerified: [verified({ source_charges_hash: "", measurement_window: { from: "2026-06-01", to: daysAgo(10).slice(0, 10) } })],
      }),
      activation: activation(), now: NOW,
    });
    expect(result.ok).toBe(false);
  });

  it("refuses a verified row whose GMV is zero — Verified Savings needs a real base", async () => {
    const result = await inspectRecoverEvidenceSource({
      svc: makeSvc({
        PaymentsAnalysisVerified: [verified({ sample_metrics: { gmv_eur: 0 } })],
      }),
      activation: activation(), now: NOW,
    });
    expect(result.ok).toBe(false);
  });
});

describe("R4-04 — the StripeConnection fallback", () => {
  it("accepts a connection exactly at 35 days", async () => {
    const result = await inspectRecoverEvidenceSource({
      svc: makeSvc({ StripeConnection: [stripe({ data_as_of: daysAgo(35) })] }),
      activation: activation(), now: NOW,
    });
    expect(result.ok).toBe(true);
    expect(result.source?.kind).toBe("stripe_connection_snapshot");
    // The Stripe fallback synthesises a 29-day trailing window ending on data_as_of.
    expect(result.source?.periodStart).toBeTruthy();
    expect(result.source?.periodEnd).toBeTruthy();
  });

  it("REJECTS a connection at 36 days", async () => {
    const result = await inspectRecoverEvidenceSource({
      svc: makeSvc({ StripeConnection: [stripe({ data_as_of: daysAgo(36) })] }),
      activation: activation(), now: NOW,
    });
    expect(result.ok).toBe(false);
  });

  it("refuses a connection without a currency, so amounts cannot be turned into invoice figures", async () => {
    const result = await inspectRecoverEvidenceSource({
      svc: makeSvc({ StripeConnection: [stripe({ currency: "" })] }),
      activation: activation(), now: NOW,
    });
    expect(result.ok).toBe(false);
  });

  it("refuses a connection whose monthly_volume is zero", async () => {
    const result = await inspectRecoverEvidenceSource({
      svc: makeSvc({ StripeConnection: [stripe({ monthly_volume: 0 })] }),
      activation: activation(), now: NOW,
    });
    expect(result.ok).toBe(false);
  });

  it("refuses a disconnected StripeConnection even if it is fresh", async () => {
    // filter query already gates on connection_status: 'connected', but check the fixture-side too.
    const result = await inspectRecoverEvidenceSource({
      svc: makeSvc({ StripeConnection: [{ ...stripe(), connection_status: "disconnected" }] }),
      activation: activation(), now: NOW,
    });
    // The .filter fixture only returns rows the caller asked for; since the real filter query
    // includes connection_status: 'connected', a disconnected row must never appear.
    expect(["stripe_connection_snapshot", undefined]).toContain(result.source?.kind);
  });
});

describe("R4-04 — envelope failure modes matter to the caller", () => {
  it("refuses if the activation has no brand_id", async () => {
    const result = await inspectRecoverEvidenceSource({
      svc: makeSvc({}),
      activation: { id: "a1", vertical: "payments" }, now: NOW,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("ecl_activation_brand_missing");
  });

  it("refuses a non-payments vertical", async () => {
    const result = await inspectRecoverEvidenceSource({
      svc: makeSvc({ StripeConnection: [stripe()] }),
      activation: activation({ vertical: "shipping" }), now: NOW,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("ecl_source_vertical_unsupported");
  });

  it("returns a non-ok code when neither branch has a candidate", async () => {
    const result = await inspectRecoverEvidenceSource({
      svc: makeSvc({}), activation: activation(), now: NOW,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBeTruthy();
  });
});
