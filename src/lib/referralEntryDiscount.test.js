import { describe, expect, it } from "vitest";
import {
  ensureReferralEntryDiscount,
  resolveReferralEntryAttribution,
} from "../../base44/shared/referralEntryDiscount.ts";

function makeSvc(seed = {}) {
  const store = {
    PaymentsAnalysisSession: [],
    ReferralLink: [],
    Mandate: [],
    BillingRule: [],
    ...seed,
  };
  let sequence = 0;
  const matches = (row, query) => Object.entries(query)
    .every(([key, value]) => String(row[key] ?? "") === String(value ?? ""));
  const entity = (name) => ({
    filter: async (query) => store[name].filter((row) => matches(row, query)),
    create: async (data) => {
      const row = { id: `created_${++sequence}`, ...data };
      store[name].push(row);
      return row;
    },
    update: async (id, patch) => {
      const row = store[name].find((item) => item.id === id);
      Object.assign(row, patch);
      return row;
    },
  });
  return { store, entities: new Proxy({}, { get: (_target, name) => entity(name) }) };
}

function referredSvc() {
  return makeSvc({
    PaymentsAnalysisSession: [{
      id: "session_1",
      anon_session_id: "anon-1",
      contact_email: "recipient@example.test",
      referred_by_code: "invite_123",
    }],
    ReferralLink: [{
      id: "link_1",
      code: "invite_123",
      owner_email: "referrer@example.test",
    }],
  });
}

describe("referral entry discount", () => {
  it("resolves only a valid, non-self referral", async () => {
    const svc = referredSvc();
    const result = await resolveReferralEntryAttribution(svc, "recipient@example.test");
    expect(result).toMatchObject({ eligible: true, entry_discount_points: 5, entry_fee_pct: 20 });
  });

  it("binds 20% to the recipient brand before Recover acceptance", async () => {
    const svc = referredSvc();
    const result = await ensureReferralEntryDiscount(svc, {
      brand: { id: "brand_recipient" },
      recipientEmail: "recipient@example.test",
      session: svc.store.PaymentsAnalysisSession[0],
      now: new Date("2026-09-18T12:00:00.000Z"),
    });
    expect(result.applied).toBe(true);
    expect(svc.store.BillingRule).toHaveLength(1);
    expect(svc.store.BillingRule[0]).toMatchObject({
      brand_id: "brand_recipient",
      node_share_percent: 20,
      effective_start_date: "2026-09-01",
      status: "active",
    });
  });

  it("is idempotent and never duplicates the entry rule", async () => {
    const svc = referredSvc();
    const input = {
      brand: { id: "brand_recipient" },
      recipientEmail: "recipient@example.test",
      session: svc.store.PaymentsAnalysisSession[0],
      now: new Date("2026-09-18T12:00:00.000Z"),
    };
    await ensureReferralEntryDiscount(svc, input);
    const replay = await ensureReferralEntryDiscount(svc, input);
    expect(replay.reused).toBe(true);
    expect(svc.store.BillingRule).toHaveLength(1);
  });

  it("retires a provisional same-month 25% rule without inverting its dates", async () => {
    const svc = referredSvc();
    svc.store.BillingRule.push({
      id: "rule_provisional",
      brand_id: "brand_recipient",
      node_share_percent: 25,
      effective_start_date: "2026-09-01",
      status: "active",
    });

    await ensureReferralEntryDiscount(svc, {
      brand: { id: "brand_recipient" },
      recipientEmail: "recipient@example.test",
      session: svc.store.PaymentsAnalysisSession[0],
      now: new Date("2026-09-18T12:00:00.000Z"),
    });

    expect(svc.store.BillingRule.find((rule) => rule.id === "rule_provisional")).toMatchObject({
      status: "inactive",
    });
    expect(svc.store.BillingRule.find((rule) => rule.id === "rule_provisional").effective_end_date).toBeUndefined();
    expect(svc.store.BillingRule.find((rule) => rule.id !== "rule_provisional")).toMatchObject({
      node_share_percent: 20,
      effective_start_date: "2026-09-01",
      status: "active",
    });
  });

  it("does not grant a self-referral entry discount", async () => {
    const svc = referredSvc();
    svc.store.ReferralLink[0].owner_email = "recipient@example.test";
    const result = await ensureReferralEntryDiscount(svc, {
      brand: { id: "brand_recipient" },
      recipientEmail: "recipient@example.test",
      session: svc.store.PaymentsAnalysisSession[0],
    });
    expect(result).toMatchObject({ applied: false, reason: "self_referral" });
    expect(svc.store.BillingRule).toHaveLength(0);
  });

  it("does not rewrite economics after a Recover commitment has started", async () => {
    const svc = referredSvc();
    svc.store.Mandate.push({ id: "mandate_1", brand_id: "brand_recipient", status: "active" });
    const result = await ensureReferralEntryDiscount(svc, {
      brand: { id: "brand_recipient" },
      recipientEmail: "recipient@example.test",
      session: svc.store.PaymentsAnalysisSession[0],
    });
    expect(result).toMatchObject({ applied: false, reason: "existing_recovery_commitment" });
    expect(svc.store.BillingRule).toHaveLength(0);
  });
});
