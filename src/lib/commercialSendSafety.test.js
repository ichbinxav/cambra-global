import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  claimCommercialSendSlot,
  commercialEmailProviderCapability,
  commitCommercialSendSlot,
  exactCommercialPolicyDecision,
  markCommercialSendReviewRequired,
  markCommercialSendTransportStarted,
  paidReservationTransportDecision,
  readCommercialSendIdempotency,
  readCommercialSuppression,
  readExactCommercialPolicy,
  readPaidSendReservation,
  recordCommercialSendProviderReference,
  requireResendIdempotencyKey,
  rollbackCommercialSendSlot,
} from "../../base44/shared/commercialSendSafety.ts";
import {
  ensureCommunicationThreadTenantBinding,
  verifyCommunicationThreadTenantBinding,
} from "../../base44/shared/communicationTenant.ts";

const approvedPolicy = {
  id: "policy-1",
  policy_key: "merchant-canary",
  version: "v7",
  status: "active",
  approved_at: "2026-08-12T10:00:00.000Z",
  approved_by: "founder@cambra.global",
  effective_at: "2026-08-12T10:00:00.000Z",
};

function budgetService() {
  let row = {
    id: "budget-1",
    control_key: "global",
    status: "active",
    reservation_revision: 0,
    send_reservation_state_json: {},
  };
  const matches = (query) =>
    Object.entries(query).every(([key, value]) => row[key] === value);
  return {
    row: () => structuredClone(row),
    entities: {
      CostBudgetControl: {
        filter: async () => [structuredClone(row)],
        get: async () => structuredClone(row),
        updateMany: async (query, operation) => {
          // Let parallel promises reach this point before testing revision.
          await Promise.resolve();
          if (!matches(query)) return { updated: 0 };
          row = { ...row, ...structuredClone(operation.$set) };
          return { updated: 1 };
        },
      },
    },
  };
}

const slotInput = (key) => ({
  idempotency_key: key,
  thread_id: `thread-${key}`,
  profile_key: "resend:one",
  policy_key: "merchant-canary",
  policy_version: "v7",
  profile_daily_limit: 1,
  policy_daily_limit: 1,
  profile_burst_limit: 1,
  baseline: {
    profile_sent_today: 0,
    policy_sent_today: 0,
    profile_sent_minute: 0,
  },
  at: new Date("2026-08-13T09:30:15.000Z"),
});

describe("commercial send P0 safety", () => {
  it("crosses the provider boundary only after durable claims and never rolls back after it", () => {
    const source = fs.readFileSync(
      "base44/functions/commercialSendMessage/entry.ts",
      "utf8",
    );
    const outlookAdapter = fs.readFileSync(
      "base44/shared/commercialSendSafety.ts",
      "utf8",
    );
    const start = source.indexOf("await markCommercialSendTransportStarted");
    const transports = [
      source.indexOf("await transport.queueInitial"),
      source.indexOf("await transport.sendReply"),
      source.indexOf("await executeOutlookAcceptedTransport"),
      source.indexOf('fetch("https://api.resend.com/emails"'),
    ];
    expect(start).toBeGreaterThan(source.indexOf("claimCommercialSendSlot"));
    expect(start).toBeGreaterThan(source.indexOf("readPaidSendReservation"));
    for (const transport of transports) {
      expect(transport).toBeGreaterThan(start);
    }
    const firstTransport = Math.min(...transports);
    // Failure to persist the START transition itself is still pre-provider and
    // rollback-safe; from the first provider call onward there is no rollback.
    expect(source.slice(firstTransport)).not.toContain(
      "rollbackCommercialSendSlot",
    );
    expect(source.slice(firstTransport)).toContain(
      "markCommercialSendReviewRequired",
    );

    const outlookEffectStart = outlookAdapter.indexOf(
      "dependencies.on_effect_start?.()",
    );
    const outlookDraft = outlookAdapter.indexOf(
      '"https://graph.microsoft.com/v1.0/me/messages"',
      outlookEffectStart,
    );
    const outlookReference = outlookAdapter.indexOf(
      "await recordCommercialSendProviderReference",
      outlookDraft,
    );
    const outlookSend = outlookAdapter.indexOf("}/send`", outlookReference);
    expect(outlookEffectStart).toBeGreaterThan(0);
    expect(outlookDraft).toBeGreaterThan(outlookEffectStart);
    expect(outlookReference).toBeGreaterThan(outlookDraft);
    expect(outlookSend).toBeGreaterThan(outlookReference);
    expect(outlookAdapter.slice(outlookEffectStart, outlookSend)).not.toContain(
      "rollbackCommercialSendSlot",
    );
  });

  it("requires exactly one exact active policy version", () => {
    const now = Date.parse("2026-08-13T09:00:00.000Z");
    expect(exactCommercialPolicyDecision(undefined, "x", "v1", now))
      .toMatchObject({
        ok: false,
        blocker: "commercial_policy_lookup_unavailable",
      });
    expect(exactCommercialPolicyDecision([], "x", "v1", now)).toMatchObject({
      ok: false,
      blocker: "exactly_one_active_commercial_policy_required",
    });
    expect(
      exactCommercialPolicyDecision(
        [approvedPolicy, { ...approvedPolicy, id: "policy-2" }],
        approvedPolicy.policy_key,
        approvedPolicy.version,
        now,
      ),
    ).toMatchObject({
      ok: false,
      blocker: "ambiguous_active_commercial_policies",
    });
    expect(
      exactCommercialPolicyDecision(
        [approvedPolicy],
        approvedPolicy.policy_key,
        "stale",
        now,
      ),
    ).toMatchObject({
      ok: false,
      blocker: "exact_commercial_policy_version_required",
    });
  });

  it("fails suppression and idempotency reads closed", async () => {
    const svc = {
      entities: {
        ContactSuppression: {
          filter: async () => {
            throw new Error("down");
          },
        },
        CommunicationMessage: {
          filter: async () => {
            throw new Error("down");
          },
        },
        CostUsageEvent: {
          filter: async () => {
            throw new Error("down");
          },
        },
      },
    };
    await expect(readCommercialSuppression(svc, "a@example.com")).resolves
      .toMatchObject({
        allowed: false,
        blocker: "suppression_lookup_unavailable",
      });
    await expect(
      readCommercialSendIdempotency(svc, "thread-1", "key-1"),
    ).resolves.toMatchObject({
      ok: false,
      blocker: "send_idempotency_lookup_unavailable",
    });
    await expect(readPaidSendReservation(svc, "email:key-1")).resolves
      .toMatchObject({
        ok: false,
        blocker: "paid_send_reservation_lookup_unavailable",
      });
  });

  it("fails an unavailable exact-policy read closed", async () => {
    const svc = {
      entities: {
        CommercialPolicy: {
          filter: async () => {
            throw new Error("down");
          },
        },
      },
    };
    await expect(readExactCommercialPolicy(svc, {
      policy_key: "merchant-canary",
      policy_version: "v7",
    })).resolves.toMatchObject({
      ok: false,
      blocker: "commercial_policy_lookup_unavailable",
    });
  });

  it("rejects ambiguous suppression and idempotency authority", async () => {
    const svc = {
      entities: {
        ContactSuppression: {
          filter: async () => [
            { id: "s1", email: "a@example.com", active: true },
            { id: "s2", email: "a@example.com", active: true },
          ],
        },
        CommunicationMessage: {
          filter: async () => [{ id: "m1" }, { id: "m2" }],
        },
        CostUsageEvent: {
          filter: async () => [
            { id: "c1", event_key: "email:key-1" },
            { id: "c2", event_key: "email:key-1" },
          ],
        },
      },
    };
    await expect(readCommercialSuppression(svc, "a@example.com")).resolves
      .toMatchObject({
        allowed: false,
        blocker: "suppression_lookup_ambiguous",
      });
    await expect(readCommercialSendIdempotency(svc, "thread-1", "key-1"))
      .resolves.toMatchObject({
        ok: false,
        blocker: "send_idempotency_lookup_ambiguous",
      });
    await expect(readPaidSendReservation(svc, "email:key-1")).resolves
      .toMatchObject({
        ok: false,
        duplicate: true,
        blocker: "paid_send_reservation_lookup_ambiguous",
      });
  });

  it("allows exactly one concurrent claimant for the last slot", async () => {
    const svc = budgetService();
    const outcomes = await Promise.allSettled([
      claimCommercialSendSlot(svc, slotInput("a")),
      claimCommercialSendSlot(svc, slotInput("b")),
    ]);
    expect(outcomes.filter((row) => row.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(outcomes.filter((row) => row.status === "rejected")).toHaveLength(1);
    expect(outcomes.find((row) => row.status === "rejected").reason.message)
      .toMatch(
        /daily_cap_reached|burst_limit/,
      );
    expect(svc.row().send_reservation_state_json.claims).toHaveLength(1);
  });

  it("rejects contradictory CAS counters without authorizing a claim", async () => {
    const svc = budgetService();
    svc.entities.CostBudgetControl.updateMany = async () => ({
      updated: 1,
      matched_count: 2,
    });
    await expect(
      claimCommercialSendSlot(svc, slotInput("ambiguous-cas")),
    ).rejects.toMatchObject({
      code: "SEND_SLOT_AUTHORITY_AMBIGUOUS",
      status: 409,
    });
    expect(svc.row().reservation_revision).toBe(0);
    expect(svc.row().send_reservation_state_json).toEqual({});
  });

  it("rejects explicit send-slot CAS failure flags despite an updated counter", async () => {
    for (const failureStatus of [{ success: false }, { ok: false }]) {
      const svc = budgetService();
      svc.entities.CostBudgetControl.updateMany = async () => ({
        ...failureStatus,
        updated: 1,
      });
      await expect(
        claimCommercialSendSlot(
          svc,
          slotInput(`negative-${Object.keys(failureStatus)[0]}`),
        ),
      ).rejects.toMatchObject({
        code: "SEND_SLOT_AUTHORITY_AMBIGUOUS",
        status: 409,
      });
      expect(svc.row().reservation_revision).toBe(0);
      expect(svc.row().send_reservation_state_json).toEqual({});
    }
  });

  it("does not authorize transport for a duplicate paid reservation", () => {
    expect(
      paidReservationTransportDecision({
        duplicate: true,
        event: { id: "cost-1" },
      }),
    )
      .toMatchObject({
        allowed: false,
        blocker: "duplicate_paid_send_effect_requires_reconciliation",
      });
  });

  it("surfaces an exact existing paid reservation as a blocked duplicate", async () => {
    const svc = {
      entities: {
        CostUsageEvent: {
          filter: async () => [{
            id: "cost-1",
            event_key: "email:key-1",
            status: "RESERVED",
          }],
        },
      },
    };
    await expect(readPaidSendReservation(svc, "email:key-1")).resolves
      .toMatchObject({
        ok: true,
        duplicate: true,
        blocker: "duplicate_paid_send_effect_requires_reconciliation",
      });
  });

  it("rolls back only before provider start and retains ambiguity after start", async () => {
    const pre = budgetService();
    const preSlot = await claimCommercialSendSlot(pre, slotInput("pre"));
    await rollbackCommercialSendSlot(pre, preSlot, { blocker: "preflight" });
    expect(pre.row().send_reservation_state_json).toMatchObject({
      profile_daily_counts: { "resend:one": 0 },
      claims: [expect.objectContaining({ state: "ROLLED_BACK" })],
    });

    const post = budgetService();
    const postSlot = await claimCommercialSendSlot(post, slotInput("post"));
    await markCommercialSendTransportStarted(post, postSlot);
    await expect(
      rollbackCommercialSendSlot(post, postSlot, { blocker: "timeout" }),
    ).rejects.toThrow("send_slot_rollback_forbidden_after_provider_boundary");
    await markCommercialSendReviewRequired(post, postSlot, {
      blocker: "timeout",
    });
    expect(post.row().send_reservation_state_json.claims[0]).toMatchObject({
      state: "REVIEW_REQUIRED",
      provider_effect_started: true,
    });
    const duplicate = await claimCommercialSendSlot(post, slotInput("post"));
    expect(duplicate).toMatchObject({
      acquired: false,
      duplicate: true,
      review_required: true,
      blocker: "send_effect_ambiguous_review_required",
    });
  });

  it("commits a provider effect and blocks replay", async () => {
    const svc = budgetService();
    const slot = await claimCommercialSendSlot(svc, slotInput("commit"));
    await markCommercialSendTransportStarted(svc, slot);
    await commitCommercialSendSlot(svc, slot, {
      provider_message_id: "provider-1",
      provider_reference_kind: "RESEND_EMAIL_ID",
      message_id: "message-1",
    });
    await expect(claimCommercialSendSlot(svc, slotInput("commit"))).resolves
      .toMatchObject({
        acquired: false,
        blocker: "send_already_committed",
      });
  });

  it("refuses to commit without a typed provider reference and local receipt", async () => {
    const svc = budgetService();
    const slot = await claimCommercialSendSlot(svc, slotInput("empty-receipt"));
    await markCommercialSendTransportStarted(svc, slot);
    await expect(commitCommercialSendSlot(svc, slot, {
      provider_message_id: "",
      provider_reference_kind: "RESEND_EMAIL_ID",
      message_id: "message-1",
    })).rejects.toThrow("complete_send_commit_receipt_required");
    await expect(commitCommercialSendSlot(svc, slot, {
      provider_message_id: "provider-1",
      provider_reference_kind: "RESEND_EMAIL_ID",
      message_id: "",
    })).rejects.toThrow("complete_send_commit_receipt_required");
    expect(svc.row().send_reservation_state_json.claims[0]).toMatchObject({
      state: "TRANSPORT_STARTED",
      provider_effect_started: true,
    });
  });

  it("records the Outlook immutable draft ID durably before send settlement", async () => {
    const svc = budgetService();
    const slot = await claimCommercialSendSlot(svc, {
      ...slotInput("outlook-draft"),
      provider: "outlook",
    });
    await markCommercialSendTransportStarted(svc, slot);
    await recordCommercialSendProviderReference(svc, slot, {
      provider: "outlook",
      provider_reference_id: "immutable-draft-1",
      reference_kind: "OUTLOOK_IMMUTABLE_DRAFT_ID",
      reference_state: "DRAFT_PERSISTED_PRE_SEND",
    });
    expect(svc.row().send_reservation_state_json.claims[0]).toMatchObject({
      state: "TRANSPORT_STARTED",
      provider: "outlook",
      provider_reference_id: "immutable-draft-1",
      provider_reference_kind: "OUTLOOK_IMMUTABLE_DRAFT_ID",
      provider_reference_state: "DRAFT_PERSISTED_PRE_SEND",
    });
    await expect(recordCommercialSendProviderReference(svc, slot, {
      provider: "outlook",
      provider_reference_id: "different-draft",
      reference_kind: "OUTLOOK_IMMUTABLE_DRAFT_ID",
    })).rejects.toThrow("send_provider_reference_conflict");
  });

  it("publishes a conservative capability matrix and validates Resend keys", () => {
    expect(commercialEmailProviderCapability("resend")).toMatchObject({
      provider_idempotency: "IDEMPOTENCY_KEY_SAME_PAYLOAD_24H",
      provider_retry_contract: "SAME_KEY_SAME_PAYLOAD_WITHIN_24H_ONLY",
      cambra_automatic_retry: "BLOCKED_AFTER_TRANSPORT_STARTED",
      acceptance_is_delivery: false,
      evidence_as_of: "2026-08-13",
    });
    expect(commercialEmailProviderCapability("outlook")).toMatchObject({
      reconciliation: "IMMUTABLE_DRAFT_ID_SENT_ITEMS_LOOKUP",
      cambra_automatic_retry: "NEVER_AFTER_SEND_STARTED",
    });
    expect(commercialEmailProviderCapability("instantly")).toMatchObject({
      provider_idempotency: "NOT_DOCUMENTED",
      cambra_automatic_retry: "AT_MOST_ONCE_REVIEW_REQUIRED",
    });
    expect(commercialEmailProviderCapability("outlook").documentation_refs)
      .toContain(
        "https://learn.microsoft.com/en-us/graph/api/message-send?view=graph-rest-1.0",
      );
    expect(requireResendIdempotencyKey("send/thread-1")).toBe("send/thread-1");
    expect(() => requireResendIdempotencyKey("")).toThrow(
      "valid_resend_idempotency_key_required",
    );
    expect(() => requireResendIdempotencyKey("x".repeat(257))).toThrow(
      "valid_resend_idempotency_key_required",
    );
  });

  it("retains the slot when receipt creation crashes after provider send", async () => {
    const svc = budgetService();
    const slot = await claimCommercialSendSlot(svc, slotInput("create-crash"));
    await markCommercialSendTransportStarted(svc, slot);
    // Equivalent to a provider success followed by CommunicationMessage.create
    // throwing: the effect is unknown, so it is never rolled back or retried.
    await markCommercialSendReviewRequired(svc, slot, {
      blocker: "send_receipt_persistence_failed",
    });
    expect(svc.row().send_reservation_state_json).toMatchObject({
      profile_daily_counts: { "resend:one": 1 },
      claims: [expect.objectContaining({
        state: "REVIEW_REQUIRED",
        provider_effect_started: true,
        blocker: "send_receipt_persistence_failed",
      })],
    });
    await expect(
      claimCommercialSendSlot(svc, slotInput("create-crash")),
    ).resolves.toMatchObject({
      acquired: false,
      duplicate: true,
      review_required: true,
    });
  });
});

describe("communication thread tenant persistence", () => {
  it("stamps and verifies platform acquisition before send", async () => {
    let thread = {
      id: "thread-1",
      engine: "merchant_acquisition",
      related_entity_type: "OutboundLead",
      related_entity_id: "lead-1",
    };
    const svc = {
      entities: {
        OutboundLead: { get: async () => ({ id: "lead-1" }) },
        CommunicationThread: {
          update: async (_id, patch) => (thread = { ...thread, ...patch }),
          get: async () => structuredClone(thread),
        },
      },
    };
    const result = await ensureCommunicationThreadTenantBinding(svc, thread);
    expect(result).toMatchObject({
      ok: true,
      binding: { tenant_scope: "platform", brand_id: "_platform" },
    });
    expect(
      verifyCommunicationThreadTenantBinding(result.thread, result.binding).ok,
    )
      .toBe(true);
  });

  it("fails closed and marks review when tenant resolution is unavailable", async () => {
    let thread = {
      id: "thread-2",
      engine: "merchant_operations",
      related_entity_type: "Unknown",
    };
    const svc = {
      entities: {
        CommunicationThread: {
          update: async (_id, patch) => (thread = { ...thread, ...patch }),
        },
      },
    };
    const result = await ensureCommunicationThreadTenantBinding(svc, thread);
    expect(result.ok).toBe(false);
    expect(thread).toMatchObject({
      automation_paused: true,
      tenant_resolution_status: "REVIEW_REQUIRED",
    });
  });

  it("fails closed when legacy tenant persistence cannot be read back", async () => {
    const thread = {
      id: "thread-3",
      engine: "merchant_acquisition",
      related_entity_type: "OutboundLead",
      related_entity_id: "lead-3",
    };
    const svc = {
      entities: {
        OutboundLead: { get: async () => ({ id: "lead-3" }) },
        CommunicationThread: {
          update: async () => ({}),
          get: async () => {
            throw new Error("down");
          },
        },
      },
    };
    await expect(ensureCommunicationThreadTenantBinding(svc, thread)).resolves
      .toMatchObject({
        ok: false,
        blocker: "communication_thread_tenant_readback_unavailable",
      });
  });

  it("rejects conflicting legacy tenant evidence before send", async () => {
    let thread = {
      id: "thread-4",
      engine: "merchant_operations",
      related_entity_type: "Brand",
      related_entity_id: "brand-a",
      recover_id: "recover-4",
    };
    const svc = {
      entities: {
        Brand: { get: async () => ({ id: "brand-a" }) },
        DealActivation: { get: async () => ({ brand_id: "brand-b" }) },
        CommunicationThread: {
          update: async (_id, patch) => (thread = { ...thread, ...patch }),
        },
      },
    };
    await expect(ensureCommunicationThreadTenantBinding(svc, thread)).resolves
      .toMatchObject({
        ok: false,
        blocker: "communication_thread_tenant_ambiguous",
      });
    expect(thread).toMatchObject({
      automation_paused: true,
      tenant_resolution_status: "REVIEW_REQUIRED",
    });
  });

  it("never overwrites an already conflicting durable tenant binding", async () => {
    let thread = {
      id: "thread-5",
      engine: "merchant_operations",
      related_entity_type: "Brand",
      related_entity_id: "brand-a",
      tenant_scope: "tenant",
      brand_id: "brand-b",
      tenant_resolution_status: "RESOLVED",
    };
    const svc = {
      entities: {
        Brand: { get: async () => ({ id: "brand-a" }) },
        CommunicationThread: {
          update: async (_id, patch) => (thread = { ...thread, ...patch }),
        },
      },
    };
    await expect(ensureCommunicationThreadTenantBinding(svc, thread)).resolves
      .toMatchObject({
        ok: false,
        blocker: "communication_thread_tenant_binding_conflict",
      });
    expect(thread.brand_id).toBe("brand-b");
    expect(thread).toMatchObject({
      automation_paused: true,
      tenant_resolution_status: "REVIEW_REQUIRED",
    });
  });

  it("keeps aggregate procurement platform-owned", async () => {
    let thread = {
      id: "thread-6",
      engine: "aggregate_procurement",
      related_entity_type: "NegotiationCase",
      related_entity_id: "case-6",
    };
    const svc = {
      entities: {
        NegotiationCase: {
          get: async () => ({
            id: "case-6",
            brand_id: "_platform",
            negotiation_scope: "aggregate",
          }),
        },
        CommunicationThread: {
          update: async (_id, patch) => (thread = { ...thread, ...patch }),
          get: async () => structuredClone(thread),
        },
      },
    };
    await expect(ensureCommunicationThreadTenantBinding(svc, thread)).resolves
      .toMatchObject({
        ok: true,
        binding: { tenant_scope: "platform", brand_id: "_platform" },
      });
  });

  it("resolves merchant-operation threads from their durable owner", async () => {
    for (
      const [related_entity_type, entity, id] of [
        ["MerchantInformationRequest", "MerchantInformationRequest", "info-1"],
        ["Invoice", "Invoice", "invoice-1"],
      ]
    ) {
      let thread = {
        id: `thread-${id}`,
        engine: "merchant_operations",
        related_entity_type,
        related_entity_id: id,
      };
      const svc = {
        entities: {
          [entity]: { get: async () => ({ id, brand_id: "brand-one" }) },
          CommunicationThread: {
            update: async (
              _threadId,
              patch,
            ) => (thread = { ...thread, ...patch }),
            get: async () => structuredClone(thread),
          },
        },
      };
      await expect(ensureCommunicationThreadTenantBinding(svc, thread))
        .resolves.toMatchObject({
          ok: true,
          binding: { tenant_scope: "tenant", brand_id: "brand-one" },
        });
    }
  });
});
