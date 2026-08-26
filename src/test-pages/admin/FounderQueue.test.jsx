// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

globalThis.React = React;

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/api/base44Client", () => ({ base44: { functions: { invoke } } }));

import FounderQueue from "../../components/admin/FounderQueue.jsx";

const action = (type, label, href) => ({ type, label, href, enabled: true, disabled_reason: null });
const QUEUE = {
  ok: true,
  complete: true,
  total: 3,
  counts: { expired: 0, approvals: 1, questions: 1, tasks_in_review: 1 },
  oldest_waiting_days: 2,
  ordering_rule: [{ key: "APPROVAL", why: "blocks work" }],
  ordering_note: "Declared ordering.",
  items: [
    {
      id: "approval-1", kind: "APPROVAL", source_entity: "Approval", band_key: "APPROVAL",
      summary: "Send outreach email", agent_name: "outreach", blocks_running_work: true, waiting_days: 1,
      action: action("APPROVAL_DECISION", "Review & decide", "/admin/approvals"),
      record: {
        id: "approval-1", action_type: "send_outreach_email", risk_level: 3,
        draft_content: "Hello Ada", related_entity_type: "OutboundLead", related_entity_id: "lead-1",
      },
    },
    {
      id: "question-1", kind: "QUESTION", source_entity: "AgentQuestion", band_key: "QUESTION",
      summary: "Which market first?", agent_name: "strategy", blocks_running_work: false, waiting_days: 2,
      action: action("ANSWER_QUESTION", "Answer now", "/admin/inbox"),
      record: {
        id: "question-1", question_type: "text", question_text: "Which market first?",
        agent_name: "strategy", created_date: "2026-08-24T00:00:00.000Z",
      },
    },
    {
      id: "task-1", kind: "TASK_REVIEW", source_entity: "AgentTask", band_key: "REVIEW_REQUIRED",
      summary: "verification billing orchestration", agent_name: "recover_autopilot", blocks_running_work: true, waiting_days: 0,
      action: action("OPEN_WORKSPACE", "Resolve billing review", "/admin/finance?tab=merchant-billing"),
      record: { output_summary: "Billing needs input", review_blocks: ["invoice_issuance"] },
    },
  ],
};

beforeEach(() => {
  invoke.mockReset();
  invoke.mockImplementation(async (name, body) => {
    if (name === "adminSummaries") return { data: QUEUE };
    if (name === "founderOSCommand" && body.confirmed === false) {
      return {
        data: {
          ok: true,
          requires_confirmation: true,
          command_key: "command-1",
          confirmation_nonce: "nonce-1",
          preview: { risk_level: 3, resolver: "outreachAgent", reversible: "generally_reversible", financial_impact: null },
        },
      };
    }
    if (name === "founderOSCommand" && body.confirmed === true) return { data: { ok: true } };
    if (name === "answerAgentQuestion") return { data: { ok: true } };
    return { data: { ok: false, error: "unsupported" } };
  });
});

afterEach(cleanup);

function renderQueue() {
  return render(<MemoryRouter><FounderQueue /></MemoryRouter>);
}

describe("FounderQueue actionability", () => {
  it("previews an approval before exposing the final confirmation", async () => {
    renderQueue();
    fireEvent.click(await screen.findByRole("button", { name: /Review & decide/i }));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(await screen.findByRole("dialog", { name: "Approval decision preview" })).toBeTruthy();
    expect(screen.getByText(/Nothing has changed yet/i)).toBeTruthy();
    expect(invoke).toHaveBeenCalledWith("founderOSCommand", expect.objectContaining({
      approval_id: "approval-1", decision: "approve", confirmed: false,
    }));
    expect(invoke).not.toHaveBeenCalledWith("founderOSCommand", expect.objectContaining({ confirmed: true }));

    fireEvent.click(screen.getByTestId("confirm-approve-approval-1"));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("founderOSCommand", expect.objectContaining({
      approval_id: "approval-1", decision: "approve", confirmed: true,
      command_key: "command-1", confirmation_nonce: "nonce-1",
    })));
  });

  it("answers a queued question through its canonical handler", async () => {
    renderQueue();
    fireEvent.click(await screen.findByRole("button", { name: /Answer now/i }));
    fireEvent.change(screen.getByPlaceholderText("Reply in 1–2 lines…"), { target: { value: "Spain" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("answerAgentQuestion", {
      question_id: "question-1", answer_text: "Spain",
    }));
  });

  it("routes a review-only task to the governed workspace instead of showing fake approve/reject buttons", async () => {
    renderQueue();
    const link = await screen.findByRole("link", { name: /Resolve billing review/i });
    expect(link.getAttribute("href")).toBe("/admin/finance?tab=merchant-billing");
    expect(screen.getByText(/This is a reconciliation hold, not an approval/i)).toBeTruthy();
  });
});
