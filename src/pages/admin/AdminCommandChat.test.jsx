// @vitest-environment jsdom
// COMMAND-C2 (2026-08-17) — what the founder is actually shown in the durable
// Ask CAMBRA workspace.
//
// The fixtures here are produced by the REAL handler in commandConversationCore,
// not hand-written to match the component. If the handler's shape changes, these
// tests break, which is the point.
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleCommandConversationAction } from "../../../base44/shared/commandConversationCore.ts";

globalThis.React = React;

const FOUNDER = { id: "founder-1", email: "founder@cambra.global", role: "admin" };

function makeSvc(rows = {}) {
  const store = {};
  const entity = (name) => {
    if (!store[name]) {
      store[name] = {
        rows: (rows[name] || []).map((row) => ({ ...row })),
        async filter(query, _sort, limit) {
          const found = this.rows.filter((row) =>
            Object.entries(query).every(([key, value]) => String(row[key]) === String(value)));
          return (typeof limit === "number" ? found.slice(0, limit) : found).map((row) => ({ ...row }));
        },
        async create(value) { const row = { id: `r${this.rows.length + 1}`, ...value }; this.rows.push(row); return { ...row }; },
        async update(id, patch) {
          const row = this.rows.find((candidate) => candidate.id === id);
          Object.assign(row, patch); return { ...row };
        },
      };
    }
    return store[name];
  };
  return { entities: new Proxy({}, { get: (_t, name) => entity(String(name)) }) };
}

/** Runs the real handler and returns its parsed body — the component's fixture. */
const real = async (body, svc) =>
  (await handleCommandConversationAction(FOUNDER, body, svc, { now: () => "2026-08-17T12:00:00.000Z" })).json();

const CONVERSATIONS = [
  { id: "id-c1", conversation_id: "c1", title: "ES pipeline", created_by: FOUNDER.email,
    attribution_state: "OBSERVED", status: "ACTIVE", message_count: 2,
    created_at: "2026-08-01T00:00:00.000Z", last_message_at: "2026-08-02T00:00:00.000Z" },
  { id: "id-c1b", conversation_id: "c1b", title: "ES pipeline (branch)", created_by: FOUNDER.email,
    attribution_state: "OBSERVED", status: "PINNED", message_count: 1,
    branched_from_conversation_id: "c1", branched_from_message_id: "m1",
    created_at: "2026-08-03T00:00:00.000Z", last_message_at: "2026-08-03T00:00:00.000Z" },
];

const MESSAGES = [
  { id: "m1", conversation_id: "c1", role: "user", content: "what is the ES pipeline", created_date: "2026-08-01T00:01:00.000Z" },
  { id: "m2", conversation_id: "c1", role: "assistant", content: "original answer", created_date: "2026-08-01T00:02:00.000Z" },
  { id: "m3", conversation_id: "c1b", role: "user", content: "different follow-up", created_date: "2026-08-03T00:01:00.000Z" },
];

let PageModule;

beforeEach(async () => {
  vi.resetModules();
  vi.doMock("@/api/base44Client", () => ({ base44: { functions: { invoke: vi.fn() } } }));
  vi.doMock("react-router-dom", () => ({ useSearchParams: () => [new URLSearchParams()] }));
  vi.doMock("@/components/admin/chat/ChatMessageBubble", () => ({
    default: ({ message }) => React.createElement("div", { "data-testid": "bubble" }, message.content),
  }));
  PageModule = await import("./AdminCommandChat.jsx");
});

afterEach(() => { vi.resetModules(); vi.restoreAllMocks(); });

describe("C2 — the sidebar lists real durable conversations", () => {
  it("groups by status and shows the real turn count", async () => {
    const { ConversationSidebar } = PageModule;
    const listed = await real({ action: "list" }, makeSvc({ CommandConversation: CONVERSATIONS }));

    render(React.createElement(ConversationSidebar, {
      conversations: listed.conversations, activeId: "c1",
      onSelect: () => {}, onCreate: () => {}, busy: false,
    }));

    const sidebar = screen.getByTestId("conversation-sidebar");
    expect(sidebar.textContent).toContain("ES pipeline");
    expect(sidebar.textContent).toContain("PINNED");
    expect(sidebar.textContent).toContain("2 turns");
    // The branch is visibly marked as one.
    expect(sidebar.textContent).toContain("branch");
  });

  it("says there are no conversations rather than rendering an empty box", () => {
    const { ConversationSidebar } = PageModule;
    render(React.createElement(ConversationSidebar, {
      conversations: [], activeId: null, onSelect: () => {}, onCreate: () => {}, busy: false,
    }));
    expect(screen.getByTestId("conversation-sidebar").textContent).toContain("No conversations yet");
  });
});

describe("C2 — conversation writes require the durable response contract", () => {
  it("accepts a conversation carrying its canonical identifier", () => {
    const { requireConversationResult } = PageModule;
    expect(requireConversationResult({ conversation: { conversation_id: "c1" } }, "create"))
      .toEqual({ conversation_id: "c1" });
  });

  it.each([undefined, {}, { conversation: {} }])("rejects an incomplete successful response", (data) => {
    const { requireConversationResult } = PageModule;
    expect(() => requireConversationResult(data, "create"))
      .toThrow("Command create returned no durable conversation.");
  });

  it("distinguishes an unreadable conversation list from a real empty list", () => {
    const { requireConversationList } = PageModule;
    expect(requireConversationList({ conversations: [] })).toEqual([]);
    expect(() => requireConversationList({ ok: true }))
      .toThrow("Command list returned no durable conversation collection.");
  });
});

describe("C2 — the context inspector tells the founder what they are not seeing", () => {
  it("counts inherited turns separately from the branch's own", async () => {
    const { ContextInspector } = PageModule;
    const detail = await real({ action: "get", conversation_id: "c1b" },
      makeSvc({ CommandConversation: CONVERSATIONS, ChatMessage: MESSAGES }));

    render(React.createElement(ContextInspector, { detail }));
    const inspector = screen.getByTestId("context-inspector");
    // m1 inherited from the parent, m3 the branch's own — m2 came after the fork.
    expect(inspector.textContent).toContain("Turns in view");
    expect(detail.timeline.map((row) => row.id)).toEqual(["m1", "m3"]);
    expect(screen.queryByTestId("history-incomplete")).toBeNull();
  });

  it("warns loudly when a parent could not be read", async () => {
    const { ContextInspector } = PageModule;
    const svc = makeSvc({
      CommandConversation: [{ id: "id-x", conversation_id: "x", created_by: FOUNDER.email, status: "ACTIVE",
        attribution_state: "OBSERVED", branched_from_conversation_id: "gone", branched_from_message_id: "m1" }],
      ChatMessage: [{ id: "m9", conversation_id: "x", role: "user", content: "orphan" }],
    });
    const detail = await real({ action: "get", conversation_id: "x" }, svc);
    expect(detail.history_complete).toBe(false);

    render(React.createElement(ContextInspector, { detail }));
    const warning = screen.getByTestId("history-incomplete");
    expect(warning.textContent).toContain("Incomplete history");
    expect(warning.textContent).toContain("less than what was said");
  });

  it("flags a migrated conversation and its missing authorship", async () => {
    const { ContextInspector } = PageModule;
    const svc = makeSvc({
      CommandConversation: [{ id: "id-l", conversation_id: "legacy-1", created_by: FOUNDER.email,
        status: "ARCHIVED", attribution_state: "UNKNOWN", migrated_from: "legacy_admin_chat" }],
      ChatMessage: [],
    });
    const detail = await real({ action: "get", conversation_id: "legacy-1" }, svc);

    render(React.createElement(ContextInspector, { detail }));
    const notice = screen.getByTestId("legacy-notice");
    expect(notice.textContent).toContain("predate the receipt ledger");
    expect(notice.textContent).toContain("not attributed to anyone");
  });

  it("does not claim missing authorship on a conversation that has it", async () => {
    const { ContextInspector } = PageModule;
    const svc = makeSvc({
      CommandConversation: [{ id: "id-l", conversation_id: "legacy-2", created_by: FOUNDER.email,
        status: "ARCHIVED", attribution_state: "OBSERVED", migrated_from: "legacy_admin_chat" }],
      ChatMessage: [],
    });
    const detail = await real({ action: "get", conversation_id: "legacy-2" }, svc);
    render(React.createElement(ContextInspector, { detail }));
    expect(screen.getByTestId("legacy-notice").textContent).not.toContain("not attributed to anyone");
  });
});

describe("C2 — an unreadable list is not an empty history", () => {
  it("says the read failed instead of showing a blank workspace", async () => {
    vi.resetModules();
    vi.doMock("@/api/base44Client", () => ({
      base44: { functions: { invoke: vi.fn().mockResolvedValue({ data: { error: "conversations_unavailable" } }) } },
    }));
    vi.doMock("react-router-dom", () => ({ useSearchParams: () => [new URLSearchParams()] }));
    vi.doMock("@/components/admin/chat/ChatMessageBubble", () => ({ default: () => null }));
    const { default: AdminCommandChat } = await import("./AdminCommandChat.jsx");

    render(React.createElement(AdminCommandChat));
    await waitFor(() => expect(screen.getByTestId("list-unavailable")).toBeTruthy());
    expect(screen.getByTestId("list-unavailable").textContent).toContain("not an empty history");
  });
});

describe("C7 — the runs panel tells the founder what a run is waiting for", () => {
  const RUN = {
    run_id: "run-1", objective: "Work the ES pipeline", status: "RUNNING",
    steps_completed: 3, tool_calls_used: 2, permit_id: "p1", blockers: [],
    cancellation_requested: false,
  };

  it("shows real counters and a bound permit", () => {
    const { RunPanel } = PageModule;
    render(React.createElement(RunPanel, {
      run: RUN, receiptCount: 3, receiptsReadable: true,
      onCancel: () => {}, onRefresh: () => {}, busy: false,
    }));
    const panel = screen.getByTestId("run-panel");
    expect(panel.textContent).toContain("RUNNING");
    expect(panel.textContent).toContain("Work the ES pipeline");
    expect(panel.textContent).toContain("bound");
  });

  it("says a held run is waiting on the founder, not hanging", () => {
    const { RunPanel } = PageModule;
    render(React.createElement(RunPanel, {
      run: { ...RUN, status: "REVIEW_REQUIRED", blockers: ["effect_outcome_unconfirmed_no_retry"] },
      receiptCount: 1, receiptsReadable: true, onCancel: () => {}, onRefresh: () => {}, busy: false,
    }));
    expect(screen.getByTestId("run-held").textContent).toContain("waiting on you, not on a worker");
    // And why it stopped, so REVIEW_REQUIRED does not read as a hang.
    expect(screen.getByTestId("run-blockers").textContent).toContain("effect_outcome_unconfirmed_no_retry");
  });

  it("is honest that cancelling does not kill work already in flight", () => {
    const { RunPanel } = PageModule;
    render(React.createElement(RunPanel, {
      run: { ...RUN, cancellation_requested: true },
      receiptCount: 2, receiptsReadable: true, onCancel: () => {}, onRefresh: () => {}, busy: false,
    }));
    expect(screen.getByTestId("run-cancelling").textContent).toContain("cannot be un-made");
  });

  it("says receipts are unreadable rather than showing zero", () => {
    const { RunPanel } = PageModule;
    render(React.createElement(RunPanel, {
      run: RUN, receiptCount: 0, receiptsReadable: false,
      onCancel: () => {}, onRefresh: () => {}, busy: false,
    }));
    // An unreadable chain is not an empty chain.
    expect(screen.getByTestId("run-panel").textContent).toContain("unreadable");
  });

  it("marks a permit-less run as reads only", () => {
    const { RunPanel } = PageModule;
    render(React.createElement(RunPanel, {
      run: { ...RUN, permit_id: "" }, receiptCount: 0, receiptsReadable: true,
      onCancel: () => {}, onRefresh: () => {}, busy: false,
    }));
    expect(screen.getByTestId("run-panel").textContent).toContain("reads only");
  });

  it("renders nothing when there is no run", () => {
    const { RunPanel } = PageModule;
    render(React.createElement(RunPanel, { run: null }));
    expect(screen.queryByTestId("run-panel")).toBeNull();
  });
});
