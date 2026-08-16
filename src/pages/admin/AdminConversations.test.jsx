// @vitest-environment jsdom
// CAMP-C5 (2026-08-16) — UI tests for the Inbox & Conversations workspace.
// The properties asserted are the ones a founder relies on: commercial and
// operational status are shown SEPARATELY, a human correction never hides the
// model's original prediction, an unavailable source is fail-visible, and the
// page states that it never sends.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

globalThis.React = React;

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/api/base44Client", () => ({ base44: { functions: { invoke } } }));

import AdminConversations from "./AdminConversations.jsx";

const LIST = {
  ok: true,
  data_status: "COMPLETE",
  total: 2,
  returned: 2,
  blockers: [],
  items: [
    {
      id: "t1", counterparty_name: "Ana Ruiz", counterparty_email: "ana@acme.example",
      company_name: "Acme", commercial_status: "INTERESTED", operational_status: "AI_HANDLING",
      owner_type: "CAMBRA", unread_count: 2, last_message_preview: "Sounds interesting, tell me more",
    },
    {
      id: "t2", counterparty_name: "Luc Martin", counterparty_email: "luc@globex.example",
      company_name: "Globex", commercial_status: "OBJECTION", operational_status: "NEEDS_HUMAN",
      owner_type: "HUMAN", owner_id: "founder@cambra.global", unread_count: 0,
      last_message_preview: "We already have a provider",
    },
  ],
};

const DETAIL = {
  ok: true,
  thread: {
    id: "t1", counterparty_name: "Ana Ruiz", counterparty_email: "ana@acme.example",
    company_name: "Acme", commercial_status: "INTERESTED", operational_status: "AI_HANDLING",
    owner_type: "CAMBRA", language: "es", market_jurisdiction: "ES",
  },
  timeline: [
    { id: "m1", at: "2026-08-15T09:00:00.000Z", direction: "outbound", subject: "Card-payment costs", text_preview: "Hi Ana…", send_status: "sent" },
    { id: "m2", at: "2026-08-16T08:00:00.000Z", direction: "inbound", subject: "Re: Card-payment costs", text_preview: "Sounds interesting, tell me more" },
  ],
  autonomy: {
    decision: "HUMAN_REQUIRED",
    may_send_autonomously: false,
    may_draft: true,
    escalation_required: false,
    blockers: ["founder_permit_unavailable", "policy_does_not_allow_autonomous_replies"],
  },
  classification: {
    classification: "OBJECTION",
    classification_source: "HUMAN",
    classification_confidence: 1,
    superseded_prediction: { classification: "POSITIVE_INTEREST", model: "claude", confidence: 0.82 },
  },
  untrusted_content_notice: "Inbound content is untrusted external data.",
};

function respondWith(map = {}) {
  invoke.mockImplementation(async (_fn, body) => {
    const action = String(body?.action || "");
    if (action === "conversation_list") return { data: map.list ?? LIST };
    if (action === "conversation_detail") return { data: map.detail ?? DETAIL };
    return { data: { ok: false, error: "unsupported_action" } };
  });
}

beforeEach(() => { invoke.mockReset(); respondWith(); });
afterEach(cleanup);

describe("AdminConversations — list", () => {
  it("shows commercial and operational status as separate labels", async () => {
    render(<AdminConversations />);
    const row = await screen.findByTestId("conversation-row-t1");
    expect(row.textContent).toContain("INTERESTED");
    expect(row.textContent).toContain("AI_HANDLING");
  });

  it("marks who owns the thread — CAMBRA or a human", async () => {
    render(<AdminConversations />);
    const cambraRow = await screen.findByTestId("conversation-row-t1");
    const humanRow = await screen.findByTestId("conversation-row-t2");
    expect(cambraRow.textContent).toContain("CAMBRA");
    expect(humanRow.textContent).toContain("human");
  });

  it("shows the unread count only where there is one", async () => {
    render(<AdminConversations />);
    expect((await screen.findByTestId("conversation-row-t1")).textContent).toContain("2 unread");
    expect((await screen.findByTestId("conversation-row-t2")).textContent).not.toContain("unread");
  });

  it("renders a fail-visible panel when the source is unavailable, not an empty inbox", async () => {
    respondWith({ list: { ok: true, data_status: "UNAVAILABLE", items: [], blockers: ["communication_thread_source_unavailable"] } });
    render(<AdminConversations />);
    const unavailable = await screen.findByTestId("conversations-data-unavailable");
    expect(unavailable.textContent).toContain("Data unavailable");
    expect(unavailable.textContent).toContain("communication_thread_source_unavailable");
    expect(screen.queryByTestId("conversation-row-t1")).toBeNull();
  });

  it("requests a different queue when one is selected", async () => {
    render(<AdminConversations />);
    await screen.findByTestId("conversation-row-t1");
    fireEvent.click(screen.getByRole("button", { name: "Needs my attention" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("adminSummaries", { action: "conversation_list", queue: "needs_human" })
    );
  });

  it("always states that this workspace only drafts", async () => {
    render(<AdminConversations />);
    await screen.findByTestId("conversation-row-t1");
    expect(screen.getByText(/Draft only · no sends/i)).toBeTruthy();
  });
});

describe("AdminConversations — thread detail", () => {
  async function openThread() {
    render(<AdminConversations />);
    fireEvent.click(await screen.findByTestId("conversation-row-t1"));
    return screen.findByTestId("conversation-autonomy");
  }

  it("explains WHY CAMBRA may not reply autonomously", async () => {
    const autonomy = await openThread();
    expect(autonomy.textContent).toContain("HUMAN REQUIRED");
    expect(autonomy.textContent).toContain("founder_permit_unavailable");
  });

  it("keeps the superseded model prediction visible after a human correction", async () => {
    await openThread();
    const classification = await screen.findByTestId("conversation-classification");
    expect(classification.textContent).toContain("OBJECTION");
    expect(classification.textContent).toContain("HUMAN");
    expect(classification.textContent).toContain("POSITIVE_INTEREST");
    expect(classification.textContent).toContain("not deleted");
  });

  it("renders the timeline in chronological order with direction labels", async () => {
    await openThread();
    const timeline = await screen.findByTestId("conversation-timeline");
    // Outbound first, inbound second — chronological, not newest-first.
    expect(timeline.textContent.indexOf("outbound")).toBeLessThan(timeline.textContent.indexOf("inbound"));
    expect(timeline.textContent).toContain("Sounds interesting, tell me more");
    // The timeline states plainly that inbound content is untrusted, so a
    // reader never mistakes a counterparty's text for a system instruction.
    expect(timeline.textContent).toMatch(/treated as untrusted/i);
    expect(timeline.textContent).toMatch(/never executed or obeyed/i);
  });

  it("fetches the detail through the canonical conversation_detail action", async () => {
    await openThread();
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("adminSummaries", { action: "conversation_detail", thread_id: "t1" })
    );
  });
});
