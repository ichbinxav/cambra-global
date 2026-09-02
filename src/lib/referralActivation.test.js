// referralActivation.test.js — REFERRAL-2 T6 (2026-08-03).
//
// Covers the part of the programme that moves real money: crediting an
// activated referral. The shared module is deliberately Deno-free (it receives
// a service-role-like object), so it can be exercised here against an in-memory
// fake of the entities API.
//
// What is pinned:
//   1. IDEMPOTENCY — firing the activation twice credits exactly once.
//   2. Non-retroactivity — the new BillingRule starts on the 1st of the FOLLOWING
//      month and the previous rule is closed at the end of the current one.
//   3. The floor — a referrer already at 5 activations stays at 5%.
//   4. The ratchet — nothing ever raises the fee back up.
//   5. Attribution guards — no code, unknown code and self-referral credit nobody.

import { describe, it, expect, beforeEach } from "vitest";
import { applyReferralActivation } from "../../base44/shared/referralActivation.ts";

// ── Minimal in-memory stand-in for base44.asServiceRole.entities ──────────
function makeSvc(seed = {}) {
  const store = {
    Brand: [], PaymentsAnalysisSession: [], ReferralLink: [],
    ReferralActivation: [], DealActivation: [], BillingRule: [],
    ...seed,
  };
  let n = 0;
  const nextId = () => `id_${++n}`;

  const matches = (row, query) =>
    Object.entries(query).every(([k, v]) => String(row[k] ?? "") === String(v ?? ""));

  const entity = (name) => ({
    filter: async (query) => store[name].filter((r) => matches(r, query)),
    create: async (data) => {
      const row = { id: nextId(), created_date: new Date().toISOString(), ...data };
      store[name].push(row);
      return row;
    },
    update: async (id, patch) => {
      const row = store[name].find((r) => r.id === id);
      Object.assign(row, patch);
      return row;
    },
    delete: async (id) => {
      store[name] = store[name].filter((r) => r.id !== id);
      return true;
    },
  });

  return {
    store,
    entities: new Proxy({}, { get: (_t, name) => entity(name) }),
  };
}

const REFERRER = "referrer@shop.test";
const REFERRED = "referred@shop.test";

function seedChain({ activated_count = 0, withRule = true, withActivation = true } = {}) {
  const svc = makeSvc();
  svc.store.ReferralLink.push({
    id: "link_1", code: "abc123code", owner_email: REFERRER,
    times_used: 7, activated_count, created_date: "2026-07-01T00:00:00.000Z",
  });
  svc.store.Brand.push({ id: "brand_referred", contact_email: REFERRED, name: "Referred Shop" });
  svc.store.Brand.push({ id: "brand_referrer", contact_email: REFERRER, name: "Referrer Shop" });
  svc.store.PaymentsAnalysisSession.push({
    id: "sess_1", anon_session_id: "uuid-1", contact_email: REFERRED, referred_by_code: "abc123code",
  });
  if (withActivation) {
    svc.store.DealActivation.push({
      id: "act_1", brand_id: "brand_referrer", provider_id: "prov_1",
      status: "live", node_share_percent: 25,
    });
  }
  if (withRule) {
    svc.store.BillingRule.push({
      id: "rule_old", brand_id: "brand_referrer", deal_activation_id: "act_1",
      provider_id: "prov_1", node_share_percent: 25, status: "active",
      currency: "EUR", effective_start_date: "2026-01-01",
    });
  }
  return svc;
}

// Mid-month reference date so "next month" and "end of month" are unambiguous.
const NOW = new Date("2026-08-03T10:00:00.000Z");

describe("applyReferralActivation — crediting an activated referral", () => {
  let svc;
  beforeEach(() => { svc = seedChain(); });

  it("credits the referrer once and drops the fee to 20%", async () => {
    const res = await applyReferralActivation(svc, { brand_id: "brand_referred", now: NOW });
    expect(res.applied).toBe(true);
    expect(res.activated_count).toBe(1);
    expect(res.fee_pct).toBe(20);
    expect(svc.store.ReferralLink[0].activated_count).toBe(1);
  });

  it("stacks one earned referral on an invited referrer's 20% entry fee", async () => {
    svc.store.ReferralLink.push({
      id: "link_upstream", code: "upstream_code", owner_email: "upstream@shop.test",
      times_used: 1, activated_count: 0, created_date: "2026-06-01T00:00:00.000Z",
    });
    svc.store.PaymentsAnalysisSession.push({
      id: "sess_referrer", anon_session_id: "uuid-referrer", contact_email: REFERRER,
      referred_by_code: "upstream_code",
    });

    const res = await applyReferralActivation(svc, { brand_id: "brand_referred", now: NOW });

    expect(res).toMatchObject({ applied: true, entry_discount_points: 5, fee_pct: 15 });
    expect(svc.store.BillingRule.find((rule) => rule.id !== "rule_old")).toMatchObject({
      node_share_percent: 15,
      effective_start_date: "2026-09-01",
    });
  });

  it("is IDEMPOTENT — replaying the event does not inflate the counter", async () => {
    const first = await applyReferralActivation(svc, { brand_id: "brand_referred", now: NOW });
    const second = await applyReferralActivation(svc, { brand_id: "brand_referred", now: NOW });
    const third = await applyReferralActivation(svc, { brand_id: "brand_referred", now: NOW });

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    expect(second.reason).toBe("already_counted");
    expect(third.applied).toBe(false);
    expect(svc.store.ReferralLink[0].activated_count).toBe(1);
    expect(svc.store.ReferralActivation).toHaveLength(1);
  });

  it("never lets link usage (times_used) move the fee", async () => {
    svc.store.ReferralLink[0].times_used = 99;
    const res = await applyReferralActivation(svc, { brand_id: "brand_referred", now: NOW });
    expect(res.fee_pct).toBe(20);          // driven by activated_count, not times_used
    expect(svc.store.ReferralLink[0].times_used).toBe(99); // untouched
  });

  it("schedules the discount from the 1st of the FOLLOWING month (Terms §8)", async () => {
    await applyReferralActivation(svc, { brand_id: "brand_referred", now: NOW });
    const created = svc.store.BillingRule.find((r) => r.id !== "rule_old");
    const closed = svc.store.BillingRule.find((r) => r.id === "rule_old");

    expect(created.node_share_percent).toBe(20);
    expect(created.effective_start_date).toBe("2026-09-01");
    expect(created.status).toBe("active");
    expect(created.notes).toBe("referral discount, activated_count=1");
    expect(closed.effective_end_date).toBe("2026-08-31");
    expect(closed.node_share_percent).toBe(25); // the old rule is never rewritten
  });

  it("creates a first rule when the referrer has no BillingRule yet (Task 7)", async () => {
    svc = seedChain({ withRule: false });
    await applyReferralActivation(svc, { brand_id: "brand_referred", now: NOW });
    expect(svc.store.BillingRule).toHaveLength(1);
    expect(svc.store.BillingRule[0].node_share_percent).toBe(20);
    expect(svc.store.BillingRule[0].effective_start_date).toBe("2026-09-01");
  });

  it("records the counter even with no deal activation at all", async () => {
    svc = seedChain({ withRule: false, withActivation: false });
    const res = await applyReferralActivation(svc, { brand_id: "brand_referred", now: NOW });
    expect(res.applied).toBe(true);
    expect(svc.store.ReferralLink[0].activated_count).toBe(1);
  });

  it("holds the 5% floor and never schedules a lower rule", async () => {
    svc = seedChain({ activated_count: 5 });
    const res = await applyReferralActivation(svc, { brand_id: "brand_referred", now: NOW });
    expect(res.activated_count).toBe(6);
    expect(res.fee_pct).toBe(5);
    const created = svc.store.BillingRule.find((r) => r.id !== "rule_old");
    expect(created.node_share_percent).toBe(5);
  });

  it("never raises the fee back up when a cheaper rule already exists", async () => {
    svc = seedChain();
    svc.store.BillingRule[0].node_share_percent = 10; // merchant already at 10%
    const res = await applyReferralActivation(svc, { brand_id: "brand_referred", now: NOW });
    expect(res.applied).toBe(true);                    // counter still moves
    expect(svc.store.BillingRule).toHaveLength(1);     // no 20% rule created
    expect(svc.store.BillingRule[0].node_share_percent).toBe(10);
    expect(svc.store.BillingRule[0].effective_end_date).toBeUndefined();
  });

  it("credits nobody when the business arrived without a referral", async () => {
    svc = seedChain();
    svc.store.PaymentsAnalysisSession[0].referred_by_code = "";
    const res = await applyReferralActivation(svc, { brand_id: "brand_referred", now: NOW });
    expect(res.applied).toBe(false);
    expect(res.reason).toBe("no_referral");
    expect(svc.store.ReferralLink[0].activated_count).toBe(0);
  });

  it("credits nobody for an unknown code", async () => {
    svc = seedChain();
    svc.store.PaymentsAnalysisSession[0].referred_by_code = "notarealcode";
    const res = await applyReferralActivation(svc, { brand_id: "brand_referred", now: NOW });
    expect(res.applied).toBe(false);
    expect(res.reason).toBe("unknown_code");
  });

  it("rejects self-referral", async () => {
    svc = seedChain();
    // Keep the referred business's email intact (otherwise its session is no
    // longer found and we'd exit at 'no_referral', never reaching the guard).
    // Instead make the LINK belong to that same merchant: the code they used
    // is their own.
    svc.store.ReferralLink[0].owner_email = REFERRED;
    const res = await applyReferralActivation(svc, { brand_id: "brand_referred", now: NOW });
    expect(res.applied).toBe(false);
    expect(res.reason).toBe("self_referral");
    expect(svc.store.ReferralLink[0].activated_count).toBe(0);
  });

  it("requires an identity for the referred business", async () => {
    svc = makeSvc();
    const res = await applyReferralActivation(svc, {});
    expect(res.applied).toBe(false);
    expect(res.reason).toBe("no_referred_identity");
  });
});
