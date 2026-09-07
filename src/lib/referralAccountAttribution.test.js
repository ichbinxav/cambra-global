import { describe, expect, it } from "vitest";
import {
  claimReferralAccountAttribution,
  getReferralAccountAttribution,
  validateReferralLink,
} from "../../base44/shared/referralAccountAttribution.ts";

function makeSvc(seed = {}) {
  const store = {
    ReferralLink: [],
    ReferralAccountAttribution: [],
    ...seed,
  };
  let sequence = 0;
  const matches = (row, query) => Object.entries(query)
    .every(([key, value]) => String(row[key] ?? "") === String(value ?? ""));
  const entity = (name) => ({
    filter: async (query) => store[name].filter((row) => matches(row, query)),
    create: async (data) => {
      const row = {
        id: `created_${++sequence}`,
        created_date: new Date(Date.UTC(2026, 8, sequence)).toISOString(),
        ...data,
      };
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

function activeSvc() {
  return makeSvc({
    ReferralLink: [{
      id: "link_1",
      code: "invite_123",
      owner_email: "referrer@example.test",
      status: "active",
      created_date: "2026-08-01T00:00:00.000Z",
    }],
  });
}

describe("durable referral account attribution", () => {
  it("validates only an active, unexpired, non-self code", async () => {
    const svc = activeSvc();
    await expect(validateReferralLink(svc, { code: "bad" })).resolves.toMatchObject({ eligible: false, reason: "invalid_code" });
    await expect(validateReferralLink(svc, { code: "missing_123" })).resolves.toMatchObject({ eligible: false, reason: "unknown_code" });
    await expect(validateReferralLink(svc, { code: "invite_123", recipientEmail: "referrer@example.test" })).resolves.toMatchObject({ eligible: false, reason: "self_referral" });
    await expect(validateReferralLink(svc, { code: "invite_123", recipientEmail: "buyer@example.test" })).resolves.toMatchObject({ eligible: true, entry_discount_points: 5, entry_fee_pct: 20 });
  });

  it("rejects disabled and expired links", async () => {
    const svc = activeSvc();
    svc.store.ReferralLink[0].status = "disabled";
    await expect(validateReferralLink(svc, { code: "invite_123" })).resolves.toMatchObject({ eligible: false, reason: "inactive_code" });
    svc.store.ReferralLink[0].status = "active";
    svc.store.ReferralLink[0].expires_at = "2026-08-31T23:59:59.000Z";
    await expect(validateReferralLink(svc, { code: "invite_123", now: new Date("2026-09-01T00:00:00.000Z") })).resolves.toMatchObject({ eligible: false, reason: "expired_code" });
  });

  it("links one account once and reuses the same claim idempotently", async () => {
    const svc = activeSvc();
    const input = { recipientEmail: "buyer@example.test", code: "invite_123", source: "registration" };
    const first = await claimReferralAccountAttribution(svc, input);
    const replay = await claimReferralAccountAttribution(svc, input);
    expect(first).toMatchObject({ ok: true, claimed: true, entry_fee_pct: 20 });
    expect(replay).toMatchObject({ ok: true, claimed: false, reused: true, reason: "already_linked" });
    expect(svc.store.ReferralAccountAttribution).toHaveLength(1);
  });

  it("does not allow a later code to replace the first attribution", async () => {
    const svc = activeSvc();
    svc.store.ReferralLink.push({
      id: "link_2",
      code: "second_456",
      owner_email: "another@example.test",
      status: "active",
      created_date: "2026-08-02T00:00:00.000Z",
    });
    await claimReferralAccountAttribution(svc, { recipientEmail: "buyer@example.test", code: "invite_123" });
    const second = await claimReferralAccountAttribution(svc, { recipientEmail: "buyer@example.test", code: "second_456" });
    expect(second).toMatchObject({ ok: false, claimed: false, reason: "different_referral_already_linked" });
    expect((await getReferralAccountAttribution(svc, "buyer@example.test")).referral_code).toBe("invite_123");
  });

  it("consolidates concurrent duplicates with the oldest claim winning", async () => {
    const svc = activeSvc();
    svc.store.ReferralAccountAttribution.push(
      { id: "old", recipient_email: "buyer@example.test", referral_code: "invite_123", status: "active", created_date: "2026-08-01T00:00:00.000Z" },
      { id: "new", recipient_email: "buyer@example.test", referral_code: "second_456", status: "active", created_date: "2026-08-02T00:00:00.000Z" },
    );
    const winner = await getReferralAccountAttribution(svc, "buyer@example.test");
    expect(winner.id).toBe("old");
    expect(svc.store.ReferralAccountAttribution.find((row) => row.id === "new").status).toBe("revoked");
  });
});
