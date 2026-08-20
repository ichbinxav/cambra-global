import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  claimRecoverAcceptanceAuthority,
  commitRecoverMandateAcceptance,
  recoverCasUpdatedCount,
  recoverCasUpdatedExactlyOne,
} from "../../base44/shared/recoverAcceptance.ts";
import {
  claimRecoverInvoiceDraft,
  renewRecoverInvoiceClaim,
} from "../../base44/shared/economicExecution.ts";
import {
  persistRecoverReportApprovalDecision,
  readRecoverReportAuthority,
  requireCanonicalRecoverReport,
} from "../../base44/shared/recoverReportAuthority.ts";
import { resolveRecoverEconomicMandate } from "../../base44/shared/recoverEconomicMandate.ts";
import { RECOVERY_ECONOMICS_V2 } from "../../base44/shared/recoveryEconomicsV2.ts";

const read = (path) =>
  fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("Recover financial P0/P1 hardening", () => {
  it("fails closed on missing, invalid, or contradictory Base44 CAS counters", () => {
    expect(
      recoverCasUpdatedCount({
        updated: 1,
        modified_count: 1,
        matched_count: 1,
      }),
    ).toBe(1);
    expect(recoverCasUpdatedExactlyOne({ updated: 1 })).toBe(true);
    expect(recoverCasUpdatedCount({ updated: 0, matched_count: 0 })).toBe(0);
    expect(recoverCasUpdatedCount({ updated: 1, matched_count: 0 })).toBeNull();
    expect(recoverCasUpdatedCount({ updated: 1, matched_count: 2 })).toBeNull();
    expect(recoverCasUpdatedCount({ success: false, updated: 1 })).toBeNull();
    expect(recoverCasUpdatedExactlyOne({ success: false, updated: 1 })).toBe(
      false,
    );
    expect(recoverCasUpdatedCount({ ok: false, updated: 1 })).toBeNull();
    expect(recoverCasUpdatedExactlyOne({ ok: false, updated: 1 })).toBe(false);
    expect(recoverCasUpdatedCount({})).toBeNull();
  });

  it("does not authorize a recovered claim when CAS counters contradict its readback", async () => {
    const activation = { id: "a1", status: "activated" };
    const svc = {
      entities: {
        DealActivation: {
          filter: async () => [{ ...activation }],
          updateMany: async (_filter, update) => {
            Object.assign(activation, update.$set);
            return { updated: 1, matched_count: 0 };
          },
        },
      },
    };
    await expect(claimRecoverAcceptanceAuthority(svc, {
      activationId: "a1",
      mandateId: "m1",
      now: "2026-08-13T00:00:00.000Z",
    })).rejects.toThrow("activation_acceptance_claim_authority_ambiguous");
  });

  it("binds mandate acceptance and activation authorization through CAS", () => {
    const source = read("base44/functions/acceptRecoverMandate/entry.ts");
    const shared = read("base44/shared/recoverAcceptance.ts");
    expect(shared).toContain("status: 'acceptance_started'");
    expect(shared).toContain("acceptance_commit_token: input.commitToken");
    expect(source).toContain("authorization_mandate_id: mandate_id");
    expect(source).toContain("active_mandate_id: mandate_id");
    expect(source).toContain("active_mandate_invariant_failed");
    expect(source).toContain("claimRecoverAcceptanceAuthority");
    expect(source).toContain("commitRecoverMandateAcceptance");
  });

  it("allows only one of two different mandate claims for one activation", async () => {
    const activation = { id: "a1", status: "activated" };
    const svc = {
      entities: {
        DealActivation: {
          filter: async ({ id }) =>
            id === activation.id ? [{ ...activation }] : [],
          updateMany: async (filter, update) => {
            if (
              filter.id !== activation.id || filter.status !== activation.status
            ) return { updated: 0 };
            Object.assign(activation, update.$set);
            return { updated: 1 };
          },
        },
      },
    };
    const attempts = await Promise.allSettled([
      claimRecoverAcceptanceAuthority(svc, {
        activationId: "a1",
        mandateId: "m1",
        now: "2026-08-13T00:00:00.000Z",
      }),
      claimRecoverAcceptanceAuthority(svc, {
        activationId: "a1",
        mandateId: "m2",
        now: "2026-08-13T00:00:00.000Z",
      }),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled"))
      .toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected"))
      .toHaveLength(1);
    expect(["m1", "m2"]).toContain(activation.authorization_mandate_id);
  });

  it("allows only one acceptance_started to active commit token", async () => {
    const mandate = {
      id: "m1",
      status: "acceptance_started",
      acceptance_snapshot_hash: "hash",
    };
    const svc = {
      entities: {
        Mandate: {
          filter: async ({ id }) => id === mandate.id ? [{ ...mandate }] : [],
          updateMany: async (filter, update) => {
            if (
              filter.id !== mandate.id ||
              filter.status !== mandate.status ||
              filter.acceptance_snapshot_hash !==
                mandate.acceptance_snapshot_hash
            ) return { updated: 0 };
            Object.assign(mandate, update.$set);
            return { updated: 1 };
          },
        },
      },
    };
    const commit = (token) =>
      commitRecoverMandateAcceptance(svc, {
        mandateId: "m1",
        snapshotHash: "hash",
        commitToken: token,
        signedByEmail: "owner@example.com",
        patch: { signed_by_email: "owner@example.com" },
      });
    const attempts = await Promise.allSettled([
      commit("token-1"),
      commit("token-2"),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled"))
      .toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected"))
      .toHaveLength(1);
    expect(["token-1", "token-2"]).toContain(mandate.acceptance_commit_token);
  });

  it("approval revalidates authority and CAS-writes instead of overwriting a changed report", () => {
    const source = read(
      "base44/functions/approveRecoverReportForInvoicing/entry.ts",
    );
    const authority = read("base44/shared/recoverReportAuthority.ts");
    expect(source).toContain("approvalAuthorityHash");
    expect(source).toContain("authorityStillStable");
    expect(source).toContain("persistRecoverReportApprovalDecision");
    expect(source).toContain("requireCanonicalRecoverReport");
    expect(authority).toContain("updated_date: original.updated_date");
    expect(authority).toContain("report_changed_retry");
    expect(authority).toContain("recoverCasUpdatedExactlyOne(changed)");
    expect(authority).toContain("report_cas_result_ambiguous");
    expect(authority).toContain("report_approval_readback_mismatch");
    expect(source).not.toContain(
      "await svc.entities.MonthlySavingsReport.update(report.id",
    );
    expect(source).not.toContain("STANDARD_FEE_PCT");
    expect(source).not.toContain("node_share_percent ||");
  });

  it("does not authorize approval from contradictory CAS counters", async () => {
    const report = {
      id: "report-a",
      updated_date: "v1",
      billing_eligibility_status: "not_ready",
      invoice_id: null,
      verification_status: "verified",
      calculation_hash: null,
    };
    const svc = {
      entities: {
        MonthlySavingsReport: {
          filter: async () => [{ ...report }],
          updateMany: async (_filter, update) => {
            Object.assign(report, update.$set);
            return { updated: 1, matched_count: 0 };
          },
        },
      },
    };
    await expect(persistRecoverReportApprovalDecision(svc, report, {
      billing_eligibility_status: "eligible",
    })).resolves.toEqual({
      ok: false,
      reason: "report_cas_result_ambiguous",
    });
  });

  it("requires exact approval readback after an acknowledged CAS", async () => {
    const original = {
      id: "report-a",
      updated_date: "v1",
      billing_eligibility_status: "not_ready",
      invoice_id: null,
      verification_status: "verified",
      calculation_hash: null,
    };
    let reads = 0;
    const svc = {
      entities: {
        MonthlySavingsReport: {
          filter: async () => {
            reads += 1;
            return reads === 1
              ? [{ ...original }]
              : [{ ...original, billing_eligibility_status: "blocked_tax" }];
          },
          updateMany: async () => ({ updated: 1 }),
        },
      },
    };
    const result = await persistRecoverReportApprovalDecision(svc, original, {
      billing_eligibility_status: "eligible",
    });
    expect(result).toEqual({
      ok: false,
      reason:
        "report_approval_readback_mismatch:billing_eligibility_status",
    });
  });

  it.each([
    {
      name: "active",
      activation: { id: "activation-1" },
      rows: [
        { id: "mandate-a", status: "active" },
        { id: "mandate-b", status: "active" },
      ],
      operation: "recover_active_economic_mandate_read_ambiguous",
    },
    {
      name: "pinned",
      activation: {
        id: "activation-1",
        recovery_economics_version: RECOVERY_ECONOMICS_V2,
        economic_right_status: "active",
        recovery_mandate_id: "mandate-a",
      },
      rows: [
        { id: "mandate-a", signed_at: "2026-01-01T00:00:00.000Z" },
        { id: "mandate-a", signed_at: "2026-01-01T00:00:00.000Z" },
      ],
      operation: "recover_pinned_economic_mandate_read_ambiguous",
    },
  ])("blocks duplicate $name mandate authority before any provider or CAS effect", async ({ activation, rows, operation }) => {
    let providerEffects = 0;
    let casWrites = 0;
    const svc = {
      entities: {
        Mandate: {
          filter: async (_query, _sort, limit) => rows.slice(0, limit),
          updateMany: async () => {
            casWrites += 1;
            return { updated: 1 };
          },
        },
      },
      providerEffect: async () => {
        providerEffects += 1;
      },
    };
    await expect(resolveRecoverEconomicMandate(svc, activation)).rejects
      .toThrow(operation);
    expect(casWrites).toBe(0);
    expect(providerEffects).toBe(0);
  });

  it("does not turn an unavailable mandate authority into a missing contract fallback", async () => {
    const svc = {
      entities: {
        Mandate: {
          filter: async () => {
            throw new Error("store_down");
          },
        },
      },
    };
    await expect(resolveRecoverEconomicMandate(svc, { id: "activation-1" }))
      .rejects.toMatchObject({
        code: "CRITICAL_EXECUTION_DEPENDENCY_UNAVAILABLE",
        operation: "recover_active_economic_mandate_read",
      });
  });

  it("quarantines both report creators when activation-month creation races", async () => {
    const rows = [];
    const svc = {
      entities: {
        MonthlySavingsReport: {
          filter: async (_query, _sort, limit) => rows.slice(0, limit),
        },
      },
    };
    const scope = { dealActivationId: "activation-1", month: "2026-07" };

    // Both creators can observe a genuinely empty scope. Neither empty read is
    // treated as a durable claim; the mandatory post-create proof decides.
    const initial = await Promise.all([
      readRecoverReportAuthority(svc, scope),
      readRecoverReportAuthority(svc, scope),
    ]);
    expect(initial.map((readback) => readback.status)).toEqual([
      "MISSING",
      "MISSING",
    ]);

    rows.push(
      { id: "report-a", status: "calculated" },
      { id: "report-b", status: "calculated" },
    );
    const postCreate = await Promise.all([
      readRecoverReportAuthority(svc, {
        ...scope,
        expectedReportId: "report-a",
      }),
      readRecoverReportAuthority(svc, {
        ...scope,
        expectedReportId: "report-b",
      }),
    ]);
    expect(postCreate.every((readback) => readback.ok === false)).toBe(true);
    expect(postCreate.map((readback) => readback.status)).toEqual([
      "DUPLICATE",
      "DUPLICATE",
    ]);
    expect(postCreate.every((readback) =>
      readback.blocker === "recover_report_authority_duplicate"
    )).toBe(true);
  });

  it("detects a report inserted between approval checks before the CAS", async () => {
    const rows = [{ id: "report-a", status: "calculated" }];
    const svc = {
      entities: {
        MonthlySavingsReport: {
          filter: async (_query, _sort, limit) => rows.slice(0, limit),
        },
      },
    };
    const scope = {
      dealActivationId: "activation-1",
      month: "2026-07",
      reportId: "report-a",
    };
    await expect(requireCanonicalRecoverReport(svc, scope)).resolves.toMatchObject(
      { id: "report-a" },
    );
    rows.push({ id: "report-b", status: "calculated" });
    await expect(requireCanonicalRecoverReport(svc, scope)).rejects.toThrow(
      "recover_report_authority_duplicate",
    );
  });

  it("does not advertise a report when a contender appears after its first post-create proof", async () => {
    const rows = [{ id: "report-a", status: "calculated" }];
    const advertised = [];
    const svc = {
      entities: {
        MonthlySavingsReport: {
          filter: async (_query, _sort, limit) => rows.slice(0, limit),
        },
      },
    };
    const scope = {
      dealActivationId: "activation-1",
      month: "2026-07",
      reportId: "report-a",
    };

    await requireCanonicalRecoverReport(svc, scope);
    // Interleaving: creator B commits while A materializes optional evidence.
    rows.push({ id: "report-b", status: "calculated" });
    try {
      await requireCanonicalRecoverReport(svc, scope);
      advertised.push("report-a");
    } catch (_) {
      // The handler records a visible error and withholds reports.push.
    }
    expect(advertised).toEqual([]);
  });

  it("revalidates the report singleton after creation, before approval CAS, and before every Stripe POST", () => {
    const generator = read(
      "base44/functions/generateMonthlySavingsReport/entry.ts",
    );
    const reportCreate = generator.indexOf(
      "svc.entities.MonthlySavingsReport.create",
    );
    const generationProof = generator.indexOf(
      "await requireCanonicalRecoverReport",
      reportCreate,
    );
    const advertised = generator.indexOf("reports.push", reportCreate);
    const generationReturnProof = generator.lastIndexOf(
      "await requireCanonicalRecoverReport",
      advertised,
    );
    expect(reportCreate).toBeGreaterThan(-1);
    expect(generationProof).toBeGreaterThan(reportCreate);
    expect(generationReturnProof).toBeGreaterThan(generationProof);
    expect(advertised).toBeGreaterThan(generationProof);
    expect(advertised).toBeGreaterThan(generationReturnProof);

    const approval = read(
      "base44/functions/approveRecoverReportForInvoicing/entry.ts",
    );
    const stable = approval.indexOf("const authorityStillStable");
    const stableSingleton = approval.indexOf(
      "await requireCanonicalRecoverReport",
      stable,
    );
    const approvalCas = approval.indexOf(
      "persistRecoverReportApprovalDecision",
      stable,
    );
    expect(stableSingleton).toBeGreaterThan(stable);
    expect(approvalCas).toBeGreaterThan(stableSingleton);

    const issuer = read(
      "base44/functions/createEligibleRecoverInvoices/entry.ts",
    );
    const providerWrapper = issuer.indexOf("const claimedStripeRequest");
    const providerSingleton = issuer.indexOf(
      "await requireCanonicalRecoverReport",
      providerWrapper,
    );
    const providerEffect = issuer.indexOf(
      "executeRecoverBillingProviderRequest",
      providerWrapper,
    );
    expect(providerSingleton).toBeGreaterThan(providerWrapper);
    expect(providerEffect).toBeGreaterThan(providerSingleton);
  });

  it.each([
    "recordPayment",
    "reconcileInvoice",
    "generateInvoicePdf",
    "createPaymentLink",
  ])("blocks every Recover or Stripe authority in %s before mutation/effect", (route) => {
    const source = read(`base44/functions/${route}/entry.ts`);
    const guard = source.indexOf(
      route === "generateInvoicePdf"
        ? "canonical_provider_invoice_artifact_only"
        : route === "createPaymentLink"
        ? "recover_invoice_already_has_stripe_payment_surface"
        : "recover_stripe_invoice_is_processor_authoritative",
    );
    expect(guard).toBeGreaterThan(-1);
    const beforeGuard = source.slice(0, guard);
    expect(beforeGuard).toContain("inv.monthly_savings_report_id");
    expect(beforeGuard).toMatch(
      /String\(inv\.payment_provider\s*\|\|\s*["']["']\)\.toLowerCase\(\)\s*===\s*["']stripe["']/,
    );
    expect(beforeGuard).toContain("inv.stripe_invoice_id");
    expect(beforeGuard).toMatch(
      /entities\.Invoice\.filter\([\s\S]*?["']-created_date["'],\s*2\s*,?\s*\)/,
    );
    expect(beforeGuard).toContain("invoice_authority_ambiguous");
  });

  it("does not create an invoice when the report authority read fails", async () => {
    let creates = 0;
    const svc = {
      entities: {
        MonthlySavingsReport: {
          filter: async () => {
            throw new Error("store_unavailable");
          },
        },
        Invoice: {
          create: async () => {
            creates += 1;
            return { id: "unexpected" };
          },
        },
      },
    };
    await expect(claimRecoverInvoiceDraft(
      svc,
      "recover-invoice:r1",
      { monthly_savings_report_id: "r1", status: "draft" },
    )).rejects.toThrow("store_unavailable");
    expect(creates).toBe(0);
  });

  it("verifies the pinned Stripe account before candidate reads, claims, or POST effects", () => {
    const source = read(
      "base44/functions/createEligibleRecoverInvoices/entry.ts",
    );
    const account = source.indexOf("await assertBillingAccount(mode)");
    const candidates = source.indexOf("let candidates: any[]");
    const claim = source.indexOf("await claimRecoverInvoiceDraft", candidates);
    const effect = source.indexOf(
      "executeRecoverBillingProviderRequest(svc, claim",
      candidates,
    );
    expect(account).toBeGreaterThan(-1);
    expect(candidates).toBeGreaterThan(account);
    expect(claim).toBeGreaterThan(candidates);
    expect(effect).toBeGreaterThan(claim);
    expect(source).toContain("stripe_billing_account_authority_unavailable");
    expect(source).toMatch(/material_effects_fail_closed:\s*true/);
    expect(source).not.toMatch(
      /stripe_billing_account_authority_unavailable[\s\S]{0,220}reason:\s*String\(/,
    );
  });

  it("refuses a provider effect when the invoice lease token was fenced out", async () => {
    const report = {
      id: "r1",
      billing_eligibility_status: "invoice_claimed",
      invoice_id: "i1",
      invoice_claim_token: "winner",
      invoice_claim_expires_at: "2026-08-14T00:00:00.000Z",
    };
    const svc = {
      entities: {
        MonthlySavingsReport: {
          updateMany: async () => ({ updated: 0 }),
          filter: async () => [{ ...report }],
        },
      },
    };
    await expect(renewRecoverInvoiceClaim(svc, {
      acquired: true,
      claim_token: "loser",
      invoice: { id: "i1", monthly_savings_report_id: "r1" },
    }, Date.parse("2026-08-13T00:00:00.000Z"))).rejects.toThrow(
      "recover_invoice_claim_lost_before_provider_effect",
    );
  });

  it("issuer exposes partial failure and never calls Stripe without its report lease", () => {
    const source = read(
      "base44/functions/createEligibleRecoverInvoices/entry.ts",
    );
    const claim = source.indexOf(
      "const claim = await claimRecoverInvoiceDraft",
    );
    const acquired = source.indexOf("if (!claim.acquired)", claim);
    const stripe = source.indexOf(
      "executeRecoverBillingProviderRequest",
      acquired,
    );
    expect(claim).toBeGreaterThan(-1);
    expect(acquired).toBeGreaterThan(claim);
    expect(stripe).toBeGreaterThan(acquired);
    expect(source).toContain("const failures = results.filter");
    expect(source).toContain("status: ok ? 200 : 409");
  });

  it("autopilot records and returns child failures instead of a false completed run", () => {
    const source = read("base44/functions/recoverAutopilotWorker/entry.ts");
    expect(source).toContain("status: ok ? 'completed' : 'failed'");
    expect(source).toContain("status: ok ? 200 : 503");
    expect(source).toContain("!successful(invoices)");
    expect(source).toContain("!successful(reconciliation)");
  });

  it("revocation re-reads activation authority and clears mandate bindings", () => {
    const source = read("base44/functions/revokeMandate/entry.ts");
    const mandateCas = source.indexOf("const mandateClaim = await");
    const freshActivation = source.indexOf(
      ".filter({ id: activation.id }",
      mandateCas,
    );
    expect(mandateCas).toBeGreaterThan(-1);
    expect(freshActivation).toBeGreaterThan(mandateCas);
    expect(source).toContain("authorization_mandate_id: ''");
    expect(source).toContain("active_mandate_id: ''");
  });

  it("duplicate cost reservations return before either extraction provider fetch", () => {
    const source = read("base44/functions/processUploadedFile/entry.ts");
    const anthropicReservation = source.indexOf(
      "const reservation = await reservePaidOperation",
      source.indexOf("async function callAnthropic"),
    );
    const anthropicDuplicate = source.indexOf(
      "if (reservation?.duplicate)",
      anthropicReservation,
    );
    const anthropicFetch = source.indexOf(
      "fetch('https://api.anthropic.com",
      anthropicReservation,
    );
    const openAiReservation = source.indexOf(
      "const reservation = await reservePaidOperation",
      source.indexOf("async function callOpenAI"),
    );
    const openAiDuplicate = source.indexOf(
      "if (reservation?.duplicate)",
      openAiReservation,
    );
    const openAiFetch = source.indexOf(
      "fetch('https://api.openai.com",
      openAiReservation,
    );
    expect(anthropicReservation).toBeGreaterThan(-1);
    expect(anthropicDuplicate).toBeGreaterThan(anthropicReservation);
    expect(anthropicDuplicate).toBeLessThan(anthropicFetch);
    expect(openAiReservation).toBeGreaterThan(-1);
    expect(openAiDuplicate).toBeGreaterThan(openAiReservation);
    expect(openAiDuplicate).toBeLessThan(openAiFetch);
  });
});
