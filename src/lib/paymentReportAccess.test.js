import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  COLLECTIVE_TERMS_VERSION,
  PRIVACY_VERSION,
  PUBLIC_TERMS_VERSION,
  buildPaymentReportCollectiveMember,
  paymentReportAccessView,
  sanitizeUnlockedPaymentReport,
  validatePaymentReportAcceptance,
} from "../../base44/shared/paymentReportAccess.ts";
import { PAYMENT_REPORT_VERSIONS } from "./paymentReportAccess.js";

const versions = {
  collective: COLLECTIVE_TERMS_VERSION,
  public_terms: PUBLIC_TERMS_VERSION,
  privacy: PRIVACY_VERSION,
};

describe("payment report access", () => {
  it("accepts only the exact document versions shown by the UI", () => {
    expect(PAYMENT_REPORT_VERSIONS).toEqual(versions);
    expect(validatePaymentReportAcceptance({ accepted: true, versions })).toMatchObject({ ok: true });
    expect(validatePaymentReportAcceptance({ accepted: false, versions })).toMatchObject({
      ok: false,
      error: "acceptance_required",
    });
    expect(validatePaymentReportAcceptance({
      accepted: true,
      versions: { ...versions, privacy: "stale" },
    })).toMatchObject({ ok: false, error: "acceptance_version_stale" });
  });

  it("keeps report access unlocked after collective withdrawal", () => {
    expect(paymentReportAccessView({
      report_access_state: "UNLOCKED",
      pool_membership_status: "REVOKED",
    })).toMatchObject({ unlocked: true, membership_status: "REVOKED" });
  });

  it("removes legacy email fields from the authenticated report payload", () => {
    const report = sanitizeUnlockedPaymentReport({
      input_snapshot: { email: "hidden@example.com", country: "ES" },
      engine_result: { ok: true },
      engine_version: "test",
      report_access_state: "UNLOCKED",
    });
    expect(report.input_snapshot).toEqual({ country: "ES" });
    expect(JSON.stringify(report)).not.toContain("hidden@example.com");
  });

  it("builds a combined membership from real channel totals only", () => {
    const member = buildPaymentReportCollectiveMember({
      session: {
        anon_session_id: "1b69edfd-18b4-4d34-91af-916e793a526c",
        locale: "es",
        input_snapshot: {
          country: "ES",
          channels: [{ monthly_gmv_eur: 1200 }, { monthly_gmv_eur: 800 }],
        },
        engine_result: { total_annual_savings_eur: { point: 450 } },
      },
      user_email: "Owner@Example.com",
      accepted_at: "2026-09-06T20:00:00.000Z",
      acceptance_snapshot_hash: "abc",
    });
    expect(member).toMatchObject({
      email: "owner@example.com",
      gmv_eur_monthly: 2000,
      annual_savings_eur: 450,
      source_session: "1b69edfd-18b4-4d34-91af-916e793a526c",
    });
  });

  it("hosts the logical action without any email-sending path", () => {
    const source = fs.readFileSync("base44/functions/claimAnonPaymentsResult/entry.ts", "utf8");
    const action = source.slice(source.indexOf("async function handlePaymentReportAction"), source.indexOf("Deno.serve"));
    expect(action).toContain("payment_report_accept");
    expect(action).toContain("payment_report_leave");
    expect(action).not.toMatch(/SendEmail|sendCostGovernedEmail|functions\.invoke/);
  });
});
