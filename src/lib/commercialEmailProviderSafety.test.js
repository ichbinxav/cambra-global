import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import {
  InstantlyOutboundProvider,
  instantlyRequest,
} from "../../base44/shared/outboundProvider.ts";
import {
  claimCommercialSendSlot,
  executeOutlookAcceptedTransport,
  markCommercialSendReviewRequired,
  markCommercialSendTransportStarted,
} from "../../base44/shared/commercialSendSafety.ts";

const read = (path) => fs.readFileSync(path, "utf8");

function outlookClaimService(options = {}) {
  let row = {
    id: "budget-outlook",
    control_key: "global",
    status: "active",
    reservation_revision: 0,
    send_reservation_state_json: {},
  };
  let failNextUpdate = false;
  let failAllUpdates = false;
  const matches = (query) =>
    Object.entries(query).every(([key, value]) => row[key] === value);
  return {
    row: () => structuredClone(row),
    failNextUpdate: () => {
      failNextUpdate = true;
    },
    failAllUpdates: () => {
      failAllUpdates = true;
    },
    entities: {
      CostBudgetControl: {
        filter: async () => [structuredClone(row)],
        get: async () => structuredClone(row),
        updateMany: async (query, operation) => {
          if (failNextUpdate) {
            failNextUpdate = false;
            return { updated: 0 };
          }
          if (failAllUpdates || options.alwaysFailUpdates || !matches(query)) {
            return { updated: 0 };
          }
          row = { ...row, ...structuredClone(operation.$set) };
          return { updated: 1 };
        },
      },
    },
  };
}

const outlookSlotInput = (idempotencyKey) => ({
  idempotency_key: idempotencyKey,
  thread_id: "thread-outlook",
  profile_key: "outlook:founder",
  policy_key: "merchant-canary",
  policy_version: "v7",
  provider: "outlook",
  profile_daily_limit: 5,
  policy_daily_limit: 5,
  profile_burst_limit: 5,
  baseline: {
    profile_sent_today: 0,
    policy_sent_today: 0,
    profile_sent_minute: 0,
  },
  at: new Date("2026-08-14T08:00:00.000Z"),
});

describe("ROOT-OTR-007 provider capability boundaries", () => {
  it("wires the Outlook immutable adapter and treats 202 as accepted", () => {
    const source = read("base44/functions/commercialSendMessage/entry.ts");
    const adapter = read("base44/shared/commercialSendSafety.ts");
    const draftStart = adapter.indexOf("before_outlook_draft");
    const reference = adapter.indexOf(
      "await recordCommercialSendProviderReference",
      draftStart,
    );
    const send = adapter.indexOf("}/send`", reference);
    const accepted = adapter.indexOf("sendResponse.status !== 202", send);
    const projection = source.indexOf(
      "provider_acceptance_state: outlook.provider_acceptance_state",
    );
    expect(draftStart).toBeGreaterThan(0);
    expect(reference).toBeGreaterThan(draftStart);
    expect(send).toBeGreaterThan(reference);
    expect(accepted).toBeGreaterThan(send);
    expect(projection).toBeGreaterThan(0);
    const immutableIdHeader = adapter.indexOf(
      '"Prefer": \'IdType="ImmutableId"\'',
    );
    expect(immutableIdHeader).toBeGreaterThan(0);
    expect(immutableIdHeader).toBeLessThan(draftStart);
    expect(adapter.slice(draftStart, accepted + 300)).toContain("headers");
    expect(source.slice(projection - 300, projection + 300)).toContain(
      'sendStatus = "scheduled"',
    );
    expect(source).toContain(
      "executeOutlookAcceptedTransport",
    );
  });

  it("does not call Outlook /send when immutable draft CAS persistence fails", async () => {
    const svc = outlookClaimService();
    const slot = await claimCommercialSendSlot(
      svc,
      outlookSlotInput("outlook-cas-failure"),
    );
    await markCommercialSendTransportStarted(svc, slot);
    svc.failAllUpdates();
    const fetcher = vi.fn(async (url) => {
      if (String(url).endsWith("/messages")) {
        return new Response(JSON.stringify({ id: "immutable-draft-1" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected_provider_call:${url}`);
    });
    await expect(executeOutlookAcceptedTransport(
      svc,
      slot,
      {
        access_token: "token",
        subject: "Subject",
        html: "<p>Body</p>",
        to: "merchant@example.com",
        thread_id: "thread-outlook",
      },
      { fetcher },
    )).rejects.toThrow("send_claim_transition_concurrency_exhausted");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/send")))
      .toBe(false);
  });

  it("quarantines 202 plus local receipt loss and blocks replay before /send", async () => {
    const svc = outlookClaimService();
    const slotInput = outlookSlotInput("outlook-receipt-loss");
    const slot = await claimCommercialSendSlot(svc, slotInput);
    await markCommercialSendTransportStarted(svc, slot);
    const fetcher = vi.fn(async (url, init = {}) => {
      const value = String(url);
      if (value.endsWith("/messages")) {
        return new Response(
          JSON.stringify({
            id: "immutable-draft-2",
            conversationId: "conversation-2",
          }),
          {
            status: 201,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (value.endsWith("/send") && init.method === "POST") {
        return new Response(null, { status: 202 });
      }
      if (value.includes("?$select=")) {
        return new Response(
          JSON.stringify({
            id: "immutable-draft-2",
            isDraft: false,
            sentDateTime: "2026-08-14T08:01:00.000Z",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      throw new Error(`unexpected_provider_call:${url}`);
    });
    const accepted = await executeOutlookAcceptedTransport(
      svc,
      slot,
      {
        access_token: "token",
        subject: "Subject",
        html: "<p>Body</p>",
        to: "merchant@example.com",
        thread_id: "thread-outlook",
      },
      { fetcher },
    );
    expect(accepted).toMatchObject({
      provider_acceptance_state: "ACCEPTED",
      delivery_observed: false,
      reconciliation: { status: "OBSERVED_SENT_ITEM" },
    });
    // Equivalent to CommunicationMessage.create failing after Graph 202.
    await markCommercialSendReviewRequired(svc, slot, {
      blocker: "send_receipt_persistence_failed",
    });
    const replay = await claimCommercialSendSlot(svc, slotInput);
    expect(replay).toMatchObject({
      acquired: false,
      duplicate: true,
      review_required: true,
      blocker: "send_effect_ambiguous_review_required",
    });
    const providerCallsBeforeReplay = fetcher.mock.calls.length;
    expect(providerCallsBeforeReplay).toBe(3);
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/send")))
      .toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(providerCallsBeforeReplay);
  });

  it("uses the stable Resend idempotency key and requires a provider receipt", () => {
    const source = read("base44/functions/commercialSendMessage/entry.ts");
    expect(source).toContain(
      '"Idempotency-Key": resendProviderIdempotencyKey',
    );
    expect(source).toContain("requireResendIdempotencyKey");
    expect(source).toContain("resend_provider_receipt_required");
    expect(source).toContain('provider_acceptance_state: "ACCEPTED"');
  });

  it("never retries an ambiguous Instantly mutation automatically", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "rate" }), {
          status: 429,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "would-duplicate" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    await expect(instantlyRequest(
      "secret",
      "/emails/reply",
      { method: "POST", body: { reply_to_uuid: "inbound-1" } },
      fetcher,
    )).rejects.toMatchObject({
      code: "INSTANTLY_RATE_LIMITED",
      automatic_retry_blocked: true,
      provider_effect_ambiguous: true,
      retryable: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("retains bounded retry only for read-only Instantly operations", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "rate" }), {
          status: 429,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    await expect(instantlyRequest(
      "secret",
      "/emails?limit=1",
      {},
      fetcher,
    )).resolves.toEqual({ items: [] });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("quarantines an Instantly 2xx response without its provider receipt", async () => {
    const provider = new InstantlyOutboundProvider(
      "secret",
      vi.fn(async () =>
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      ),
    );
    await expect(provider.sendReply({
      eaccount: "sender@example.com",
      reply_to_uuid: "inbound-1",
      subject: "Re",
      text: "body",
    })).rejects.toMatchObject({
      code: "INSTANTLY_PROVIDER_RECEIPT_REQUIRED",
      automatic_retry_blocked: true,
      provider_effect_ambiguous: true,
      retryable: false,
    });
  });

  it("preserves the Instantly queue lead id as a typed durable receipt", () => {
    const source = read("base44/functions/commercialSendMessage/entry.ts");
    const queueStart = source.indexOf(
      "const queued = await transport.queueInitial",
    );
    const queueEnd = source.indexOf('"after_instantly_queue"', queueStart);
    const queueProjection = source.slice(queueStart, queueEnd);
    expect(queueStart).toBeGreaterThan(0);
    expect(queueEnd).toBeGreaterThan(queueStart);
    expect(queueProjection).toContain(
      "providerMessageId = queued.provider_lead_id",
    );
    expect(queueProjection).toContain(
      'providerReferenceKind = "INSTANTLY_LEAD_ID"',
    );
    expect(source).toContain("provider_receipt: {");
    expect(source).toContain("provider_reference_kind: providerReferenceKind");
    expect(source).toContain(
      'provider_message_id: String(providerMessageId || "")',
    );
  });

  it("keeps Core.SendEmail and public Resend routes at-most-once", () => {
    const cost = read("base44/shared/costGovernance.ts");
    expect(cost).toContain('code: "EMAIL_EFFECT_REVIEW_REQUIRED"');
    expect(cost).toContain('code: "EMAIL_PROVIDER_RESPONSE_UNVERIFIED"');
    expect(cost).toContain("automatic_retry_blocked: true");
    expect(cost).toContain('provider_acceptance_state: "ACCEPTED"');
    expect(cost).toContain("delivery_observed: false");
    expect(cost).toContain("svc.integrations.Core.SendEmail(payload)");

    for (
      const path of [
        "base44/functions/onBrandCreated/entry.ts",
        "base44/functions/newsletterAgent/entry.ts",
        "base44/functions/joinCollective/entry.ts",
        "base44/functions/sendRecoverContractEmail/entry.ts",
        "base44/functions/submitCallRequest/entry.ts",
        "base44/functions/recoverBillingDigest/entry.ts",
        "base44/functions/sendMonthlySavingsSummary/entry.ts",
      ]
    ) {
      const source = read(path);
      const calls = source.split("await sendCostGovernedEmail").slice(1);
      expect(calls.length, path).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call.slice(0, 500), path).toMatch(/stable_event_key:\s*true/);
      }
    }

    for (
      const path of [
        "base44/functions/submitContactMessage/entry.ts",
        "base44/functions/submitWaitlistSignup/entry.ts",
      ]
    ) {
      const source = read(path);
      expect(source, path).toMatch(/stable_event_key:\s*true/);
      expect(source, path).toContain("Idempotency-Key");
    }
  });
});
