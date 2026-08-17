// @vitest-environment jsdom
// DASHBOARD-C11 (2026-08-17) — the pricing queue's display rules.
//
// The rule that carries the weight: a candidate that cannot be promoted has NO promote
// control. Not a disabled one, not one that fails on click — absent. Most candidates are
// "the page changed and we extracted no numbers", and an operator who can click promote on
// one of those will eventually click it.
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

globalThis.React = React;

const invoke = vi.fn();
vi.mock("@/api/base44Client", () => ({ base44: { functions: { invoke: (...args) => invoke(...args) } } }));

const { default: PricingQueueTab } = await import("../components/admin/intelligence/PricingQueueTab.jsx");

const unstructured = {
  candidate_id: "cand-1", state: "REVIEW_REQUIRED", promotable: false, copy_only: false,
  reason_codes: ["SOURCE_CONTENT_CHANGED", "no_deterministic_extraction"],
  decision_note: "The source page changed but no pricing was extracted from it.",
  current_is_verified: false,
};

const promotable = {
  candidate_id: "cand-2", state: "AUTO_PROMOTABLE", promotable: true, copy_only: false,
  reason_codes: ["signals_unambiguous"], decision_note: "Primary source, unambiguous scope.",
  current_is_verified: false,
};

const queue = (rows, extra = {}) => ({
  ok: true, rows, open_count: rows.length, promotable_count: rows.filter((r) => r.promotable).length,
  truncated: false, unpromotable_reason_summary: {}, ...extra,
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => { invoke.mockReset(); });

describe("C11 — a candidate that cannot be promoted has no promote control", () => {
  it("renders no review or promote button for an unstructured candidate", async () => {
    invoke.mockResolvedValue({ data: queue([unstructured]) });
    render(<PricingQueueTab />);
    await flush();

    expect(screen.getByTestId("candidate-cand-1")).toBeTruthy();
    // Absent, not disabled.
    expect(screen.queryByTestId("review-cand-1")).toBeNull();
    expect(screen.queryByTestId("promote-cand-1")).toBeNull();
    // Dismissing must still be possible, or the queue can never be cleared.
    expect(screen.getByTestId("reject-cand-1")).toBeTruthy();
  });

  it("renders the review control for a promotable candidate", async () => {
    invoke.mockResolvedValue({ data: queue([promotable]) });
    render(<PricingQueueTab />);
    await flush();
    expect(screen.getByTestId("review-cand-2")).toBeTruthy();
  });

  it("shows the reason codes so the refusal is legible", async () => {
    invoke.mockResolvedValue({ data: queue([unstructured]) });
    render(<PricingQueueTab />);
    await flush();
    const card = screen.getByTestId("candidate-cand-1");
    expect(card.textContent).toContain("no_deterministic_extraction");
    expect(card.textContent).toContain("no pricing was extracted");
  });

  it("warns when a promotion would supersede VERIFIED pricing", async () => {
    invoke.mockResolvedValue({ data: queue([{ ...promotable, current_is_verified: true, state: "CONFLICT" }]) });
    render(<PricingQueueTab />);
    await flush();
    expect(screen.getByTestId("verified-warning-cand-2").textContent).toContain("supersedes VERIFIED");
  });

  it("labels a copy-only change as wording rather than price", async () => {
    invoke.mockResolvedValue({ data: queue([{ ...unstructured, copy_only: true, state: "REJECTED" }]) });
    render(<PricingQueueTab />);
    await flush();
    expect(screen.getByTestId("copy-only-cand-1").textContent).toContain("prices did not");
  });
});

describe("C11 — an unreadable queue is not an empty queue", () => {
  it("renders an em dash and says the source is unreadable", async () => {
    invoke.mockResolvedValue({ data: queue([], { open_count: null }) });
    render(<PricingQueueTab />);
    await flush();
    expect(screen.getByTestId("queue-open-count").textContent).toBe("—");
    expect(screen.getByText(/this is not zero/i)).toBeTruthy();
  });

  it("says nothing is unresolved when the queue is genuinely empty", async () => {
    invoke.mockResolvedValue({ data: queue([]) });
    render(<PricingQueueTab />);
    await flush();
    expect(screen.getByTestId("queue-open-count").textContent).toBe("0");
    expect(screen.getByText(/No unresolved pricing changes/i)).toBeTruthy();
  });

  it("reports a failed read as a failed read rather than rendering nothing", async () => {
    invoke.mockResolvedValue({ data: { ok: false, error: "queue_down" } });
    render(<PricingQueueTab />);
    await flush();
    expect(screen.getByTestId("queue-error").textContent).toContain("not an empty queue");
  });

  it("summarises why the rest cannot be promoted", async () => {
    invoke.mockResolvedValue({
      data: queue([unstructured], { unpromotable_reason_summary: { no_deterministic_extraction: 7 } }),
    });
    render(<PricingQueueTab />);
    await flush();
    const summary = screen.getByTestId("queue-reason-summary");
    expect(summary.textContent).toContain("no_deterministic_extraction: 7");
  });
});
