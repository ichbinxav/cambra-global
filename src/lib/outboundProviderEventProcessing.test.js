import { describe, expect, it, vi } from "vitest";
import { processInstantlyProviderEvent } from "../../base44/shared/outboundProviderEventProcessing.ts";

const receivedRow = (overrides = {}) => ({
  id: "event_1",
  event_key: "instantly:test-event",
  provider: "instantly",
  event_type: "test",
  status: "RECEIVED",
  attempts: 0,
  first_received_at: "2026-08-13T10:00:00.000Z",
  ...overrides,
});

function eventLedger(initial, options = {}) {
  let row = structuredClone(initial);
  let mutations = 0;
  const matches = (filter) =>
    Object.entries(filter).every(([key, expected]) => {
      const actual = row[key];
      return expected === null ? actual == null : actual === expected;
    });
  return {
    row: () => structuredClone(row),
    entity: {
      async get(id) {
        return id === row.id ? structuredClone(row) : null;
      },
      async filter(filter) {
        return filter.event_key === row.event_key ? [structuredClone(row)] : [];
      },
      async create(value) {
        row = { id: "event_created", ...value };
        return structuredClone(row);
      },
      async updateMany(filter, update) {
        mutations += 1;
        if (options.throwOnMutation === mutations) {
          throw new Error("event ledger unavailable");
        }
        if (!matches(filter)) return { updated: 0 };
        row = { ...row, ...(update.$set || {}) };
        const configuredResult = options.resultForMutation?.(mutations);
        if (configuredResult !== undefined) {
          return structuredClone(configuredResult);
        }
        return { updated: 1 };
      },
    },
  };
}

function service(ledger, entities = {}) {
  return {
    entities: {
      OutboundProviderEvent: ledger.entity,
      ...entities,
    },
    functions: { invoke: vi.fn() },
  };
}

describe("Instantly provider event fail-closed processing", () => {
  it("queues a retry when canonical thread lookup is unavailable", async () => {
    const ledger = eventLedger(receivedRow());
    const svc = service(ledger, {
      CommunicationMessage: {
        filter: vi.fn().mockRejectedValue(new Error("messages offline")),
      },
    });
    const result = await processInstantlyProviderEvent(
      svc,
      {
        event_type: "email_sent",
        timestamp: "2026-08-13T10:00:00.000Z",
        email_id: "provider-message-1",
      },
      receivedRow(),
    );
    expect(result).toMatchObject({
      ok: false,
      queued_retry: true,
      dead_letter: false,
      error: "THREAD_MESSAGE_LOOKUP_AUTHORITY_UNAVAILABLE",
    });
    expect(ledger.row()).toMatchObject({
      status: "PENDING_RETRY",
      attempts: 1,
      last_error_code: "THREAD_MESSAGE_LOOKUP_AUTHORITY_UNAVAILABLE",
    });
  });

  it("never treats an unavailable suppression authority as an empty list", async () => {
    const ledger = eventLedger(receivedRow());
    const svc = service(ledger, {
      CommunicationThread: { filter: vi.fn().mockResolvedValue([]) },
      ContactSuppression: {
        filter: vi.fn().mockRejectedValue(new Error("suppression offline")),
      },
    });
    const result = await processInstantlyProviderEvent(
      svc,
      {
        event_type: "lead_unsubscribed",
        timestamp: "2026-08-13T10:00:00.000Z",
        lead_email: "person@example.com",
      },
      receivedRow(),
    );
    expect(result).toMatchObject({
      ok: false,
      queued_retry: true,
      error: "SUPPRESSION_LOOKUP_AUTHORITY_UNAVAILABLE",
    });
    expect(ledger.row().status).toBe("PENDING_RETRY");
  });

  it("fails closed when exact policy authority cannot be read", async () => {
    const ledger = eventLedger(receivedRow());
    const thread = {
      id: "thread_1",
      tenant_scope: "tenant",
      brand_id: "brand_1",
      tenant_resolution_status: "RESOLVED",
      external_provider: "instantly",
      external_workspace_id: "workspace_1",
      external_campaign_id: "campaign_1",
      counterparty_email: "person@example.com",
      policy_key: "merchant-canary",
      policy_version: "v1",
    };
    const svc = service(ledger, {
      CommunicationMessage: { filter: vi.fn().mockResolvedValue([]) },
      CommunicationThread: {
        filter: vi.fn().mockResolvedValue([thread]),
      },
      CommercialPolicy: {
        filter: vi.fn().mockRejectedValue(new Error("policy offline")),
      },
    });
    const result = await processInstantlyProviderEvent(
      svc,
      {
        event_type: "reply_received",
        timestamp: "2026-08-13T10:00:00.000Z",
        workspace_id: "workspace_1",
        campaign_id: "campaign_1",
        lead_email: "person@example.com",
        email_id: "reply_1",
      },
      receivedRow(),
    );
    expect(result).toMatchObject({
      ok: false,
      queued_retry: true,
      error: "INBOUND_POLICY_LOOKUP_AUTHORITY_UNAVAILABLE",
    });
    expect(ledger.row().status).toBe("PENDING_RETRY");
  });

  it("resolves duplicate provider message ids only through exact workspace, campaign and tenant binding", async () => {
    const ledger = eventLedger(receivedRow());
    const threadA = {
      id: "thread_a",
      tenant_scope: "tenant",
      brand_id: "brand_a",
      tenant_resolution_status: "RESOLVED",
      external_provider: "instantly",
      external_workspace_id: "workspace_a",
      external_campaign_id: "campaign_a",
      counterparty_email: "shared@example.com",
    };
    const threadB = {
      ...threadA,
      id: "thread_b",
      brand_id: "brand_b",
      external_workspace_id: "workspace_b",
      external_campaign_id: "campaign_b",
    };
    const messageUpdate = vi.fn().mockResolvedValue({ id: "message_a" });
    const threadUpdate = vi.fn().mockResolvedValue({ id: "thread_a" });
    const svc = service(ledger, {
      CommunicationMessage: {
        filter: vi.fn().mockImplementation((filter) => {
          if (filter.provider_message_id) {
            return Promise.resolve([
              { id: "provider_a", thread_id: "thread_a" },
              { id: "provider_b", thread_id: "thread_b" },
            ]);
          }
          if (filter.thread_id === "thread_a") {
            return Promise.resolve([
              {
                id: "message_a",
                thread_id: "thread_a",
                send_status: "scheduled",
                from_email: "sender@example.com",
              },
            ]);
          }
          return Promise.resolve([]);
        }),
        update: messageUpdate,
      },
      CommunicationThread: {
        get: vi.fn().mockImplementation((id) =>
          Promise.resolve(id === "thread_a" ? threadA : threadB)
        ),
        update: threadUpdate,
      },
    });
    const result = await processInstantlyProviderEvent(
      svc,
      {
        event_type: "email_sent",
        timestamp: "2026-08-13T10:00:00.000Z",
        workspace_id: "workspace_a",
        campaign_id: "campaign_a",
        lead_email: "shared@example.com",
        email_id: "provider_message_shared",
        email_account: "sender@example.com",
      },
      receivedRow(),
    );
    expect(result).toMatchObject({ ok: true, status: "PROCESSED" });
    expect(messageUpdate).toHaveBeenCalledTimes(1);
    expect(threadUpdate).toHaveBeenCalledTimes(1);
    expect(threadUpdate).toHaveBeenCalledWith(
      "thread_a",
      expect.objectContaining({ external_workspace_id: "workspace_a" }),
    );
  });

  it("sends ambiguous cross-tenant message resolution to retry instead of choosing by email", async () => {
    const ledger = eventLedger(receivedRow());
    const baseThread = {
      tenant_scope: "tenant",
      tenant_resolution_status: "RESOLVED",
      external_provider: "instantly",
      counterparty_email: "shared@example.com",
    };
    const svc = service(ledger, {
      CommunicationMessage: {
        filter: vi.fn().mockResolvedValue([
          { id: "provider_a", thread_id: "thread_a" },
          { id: "provider_b", thread_id: "thread_b" },
        ]),
      },
      CommunicationThread: {
        get: vi.fn().mockImplementation((id) =>
          Promise.resolve({
            ...baseThread,
            id,
            brand_id: id === "thread_a" ? "brand_a" : "brand_b",
          })
        ),
        update: vi.fn(),
      },
    });
    const result = await processInstantlyProviderEvent(
      svc,
      {
        event_type: "email_sent",
        timestamp: "2026-08-13T10:00:00.000Z",
        lead_email: "shared@example.com",
        email_id: "provider_message_shared",
      },
      receivedRow(),
    );
    expect(result).toMatchObject({
      ok: false,
      queued_retry: true,
      error: "THREAD_RESOLUTION_AMBIGUOUS",
    });
    expect(svc.entities.CommunicationThread.update).not.toHaveBeenCalled();
  });

  it("suppresses only the exactly bound thread and never performs an email-only bulk mutation", async () => {
    const ledger = eventLedger(receivedRow());
    const thread = {
      id: "thread_a",
      tenant_scope: "tenant",
      brand_id: "brand_a",
      tenant_resolution_status: "RESOLVED",
      external_provider: "instantly",
      external_workspace_id: "workspace_a",
      external_campaign_id: "campaign_a",
      counterparty_email: "shared@example.com",
    };
    const threadFilter = vi.fn().mockResolvedValue([thread]);
    const threadUpdate = vi.fn().mockResolvedValue({ id: "thread_a" });
    const svc = service(ledger, {
      CommunicationThread: { filter: threadFilter, update: threadUpdate },
      ContactSuppression: {
        filter: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: "suppression_1" }),
      },
      OperationalLog: {
        create: vi.fn().mockResolvedValue({ id: "log_1" }),
      },
    });
    const result = await processInstantlyProviderEvent(
      svc,
      {
        event_type: "lead_unsubscribed",
        timestamp: "2026-08-13T10:00:00.000Z",
        workspace_id: "workspace_a",
        campaign_id: "campaign_a",
        lead_email: "shared@example.com",
      },
      receivedRow(),
    );
    expect(result).toMatchObject({ ok: true, status: "PROCESSED", suppressed: true });
    expect(threadFilter).toHaveBeenCalledTimes(1);
    expect(threadFilter).toHaveBeenCalledWith(
      {
        external_provider: "instantly",
        external_campaign_id: "campaign_a",
        counterparty_email: "shared@example.com",
      },
      "-last_message_at",
      10,
    );
    expect(threadUpdate).toHaveBeenCalledTimes(1);
    expect(threadUpdate).toHaveBeenCalledWith(
      "thread_a",
      expect.objectContaining({ status: "suppressed" }),
    );
  });

  it("records a global suppression without mutating any thread when tenant binding is absent", async () => {
    const ledger = eventLedger(receivedRow());
    const threadUpdate = vi.fn();
    const svc = service(ledger, {
      CommunicationThread: { filter: vi.fn(), update: threadUpdate },
      ContactSuppression: {
        filter: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: "suppression_1" }),
      },
      OperationalLog: {
        create: vi.fn().mockResolvedValue({ id: "log_1" }),
      },
    });
    const result = await processInstantlyProviderEvent(
      svc,
      {
        event_type: "lead_unsubscribed",
        timestamp: "2026-08-13T10:00:00.000Z",
        lead_email: "shared@example.com",
      },
      receivedRow(),
    );
    expect(result).toMatchObject({ ok: true, status: "PROCESSED", suppressed: true });
    expect(svc.entities.CommunicationThread.filter).not.toHaveBeenCalled();
    expect(threadUpdate).not.toHaveBeenCalled();
  });

  it("does not acknowledge account_error when the global outbound control is unreadable", async () => {
    const ledger = eventLedger(receivedRow());
    const svc = service(ledger, {
      OutboundSendingProfile: { filter: vi.fn().mockResolvedValue([]) },
      OutboundControl: {
        filter: vi.fn().mockRejectedValue(new Error("control offline")),
      },
    });
    const result = await processInstantlyProviderEvent(
      svc,
      {
        event_type: "account_error",
        timestamp: "2026-08-13T10:00:00.000Z",
      },
      receivedRow(),
    );
    expect(result).toMatchObject({
      ok: false,
      queued_retry: true,
      error: "INSTANTLY_CONTROL_LOOKUP_AUTHORITY_UNAVAILABLE",
    });
    expect(ledger.row().status).toBe("PENDING_RETRY");
  });

  it("surfaces ledger finalization failure as ambiguous REVIEW_REQUIRED", async () => {
    const ledger = eventLedger(receivedRow(), { throwOnMutation: 2 });
    const result = await processInstantlyProviderEvent(
      service(ledger),
      {
        event_type: "provider_observation_only",
        timestamp: "2026-08-13T10:00:00.000Z",
      },
      receivedRow(),
    );
    expect(result).toMatchObject({
      ok: false,
      queued_retry: false,
      review_required: true,
      ambiguous_effect: true,
      error: "EVENT_SUCCESS_FINALIZATION_AUTHORITY_UNAVAILABLE",
      status: "REVIEW_REQUIRED",
    });
    expect(ledger.row().status).toBe("PROCESSING");
  });

  it("rejects explicit provider-event CAS failure flags despite an updated counter", async () => {
    for (const failureStatus of [{ success: false }, { ok: false }]) {
      const ledger = eventLedger(receivedRow(), {
        resultForMutation: (mutation) => mutation === 1
          ? { ...failureStatus, updated: 1 }
          : undefined,
      });
      await expect(
        processInstantlyProviderEvent(
          service(ledger),
          {
            event_type: "provider_observation_only",
            timestamp: "2026-08-13T10:00:00.000Z",
          },
          receivedRow(),
        ),
      ).rejects.toMatchObject({
        code: "EVENT_PROCESSING_CLAIM_AUTHORITY_AMBIGUOUS",
        status: 503,
        review_required: true,
      });
      expect(ledger.row().status).toBe("PROCESSING");
    }
  });

  it("uses a CAS processing claim so concurrent delivery cannot apply twice", async () => {
    const ledger = eventLedger(receivedRow());
    const snapshot = receivedRow();
    const svc = service(ledger);
    const raw = {
      event_type: "provider_observation_only",
      timestamp: "2026-08-13T10:00:00.000Z",
    };
    const [first, second] = await Promise.all([
      processInstantlyProviderEvent(svc, raw, snapshot),
      processInstantlyProviderEvent(svc, raw, snapshot),
    ]);
    expect([first, second].filter((result) => result.ok && !result.duplicate)).toHaveLength(1);
    expect([first, second].filter((result) => result.duplicate)).toHaveLength(1);
    expect(ledger.row()).toMatchObject({ status: "IGNORED", attempts: 1 });
  });
});
