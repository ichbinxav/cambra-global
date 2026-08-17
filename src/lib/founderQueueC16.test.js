// DASHBOARD-C16 (2026-08-17) — the single founder queue.
//
// The remaining half of founder decision 3. C14 put Inbox and Approvals in one place and said
// plainly it had NOT merged them into one ranked list, because ranking across three
// differently-shaped sources needs an ordering and inventing one silently would be a guess.
// C16 declares the ordering instead, so it can be argued with rather than trusted.
import { describe, expect, it } from "vitest";
import { buildFounderQueue, founderQueueBadge, QUEUE_ORDERING_RULE } from "../../base44/shared/founderQueueCore.ts";

const NOW = "2026-08-17T12:00:00.000Z";

function makeSvc(rows = {}, broken = []) {
  const stores = {}; const built = {};
  const entity = (name) => {
    if (!stores[name]) stores[name] = (rows[name] || []).map((r) => ({ ...r }));
    if (built[name]) return built[name];
    built[name] = {
      async list() { if (broken.includes(name)) throw new Error("down"); return stores[name].map((r) => ({ ...r })); },
    };
    return built[name];
  };
  return { entities: new Proxy({}, { get: (_t, n) => entity(String(n)) }) };
}

const approval = (extra = {}) => ({
  id: "ap1", status: "pending", title: "Send outbound batch", agent_task_id: "t1",
  created_date: "2026-08-10T00:00:00.000Z", ...extra,
});
const question = (extra = {}) => ({
  id: "q1", status: "pending", question_text: "Which market first?",
  created_date: "2026-08-05T00:00:00.000Z", ...extra,
});
const task = (extra = {}) => ({
  id: "t9", terminal_state: "REVIEW_REQUIRED", description: "Reconcile costs",
  created_date: "2026-07-01T00:00:00.000Z", ...extra,
});

describe("C16 — the ordering is declared, and the queue follows it", () => {
  it("puts expired first, then approvals, then questions, then tasks in review", async () => {
    const out = await buildFounderQueue({
      svc: makeSvc({
        Approval: [approval()],
        AgentQuestion: [question(), question({ id: "q-old", expires_at: "2026-08-01T00:00:00.000Z" })],
        AgentTask: [task()],
      }),
      now: NOW,
    });
    expect(out.items.map((row) => row.band_key)).toEqual(["EXPIRED", "APPROVAL", "QUESTION", "REVIEW_REQUIRED"]);
  });

  it("orders oldest first inside a band", async () => {
    const out = await buildFounderQueue({
      svc: makeSvc({
        Approval: [
          approval({ id: "new", created_date: "2026-08-16T00:00:00.000Z" }),
          approval({ id: "old", created_date: "2026-07-20T00:00:00.000Z" }),
        ],
      }),
      now: NOW,
    });
    // The oldest unanswered item is the one most likely to have been forgotten.
    expect(out.items.map((row) => row.id)).toEqual(["old", "new"]);
  });

  it("sorts an undated item LAST in its band, not first", async () => {
    const out = await buildFounderQueue({
      svc: makeSvc({
        Approval: [approval({ id: "undated", created_date: undefined }), approval({ id: "dated" })],
      }),
      now: NOW,
    });
    // Treating undated as newest would hide it forever.
    expect(out.items.map((row) => row.id)).toEqual(["dated", "undated"]);
    expect(out.items.find((row) => row.id === "undated").waiting_days).toBeNull();
  });

  it("carries the rule and its reasons on the response", async () => {
    const out = await buildFounderQueue({ svc: makeSvc({}), now: NOW });
    expect(out.ordering_rule).toHaveLength(QUEUE_ORDERING_RULE.length);
    expect(out.ordering_rule[1].why).toContain("work started and stopped");
    expect(out.ordering_note).toContain("does NOT rank by business value");
  });

  it("marks an approval as blocking running work and a question as not", async () => {
    const out = await buildFounderQueue({
      svc: makeSvc({ Approval: [approval()], AgentQuestion: [question()] }),
      now: NOW,
    });
    expect(out.items.find((row) => row.kind === "APPROVAL").blocks_running_work).toBe(true);
    expect(out.items.find((row) => row.kind === "QUESTION").blocks_running_work).toBe(false);
  });
});

describe("C16 — only what actually needs a person", () => {
  it("ignores resolved approvals and answered questions", async () => {
    const out = await buildFounderQueue({
      svc: makeSvc({
        Approval: [approval({ status: "approved" }), approval({ id: "ap2", status: "rejected" })],
        AgentQuestion: [question({ status: "answered" })],
      }),
      now: NOW,
    });
    expect(out.items).toEqual([]);
    expect(out.total).toBe(0);
  });

  it("includes a task in review from any of the three review states", async () => {
    for (const extra of [
      { terminal_state: "REVIEW_REQUIRED" },
      { terminal_state: "OPEN", execution_status: "REVIEW_REQUIRED" },
      { terminal_state: "OPEN", ambiguity_state: "REVIEW_REQUIRED" },
    ]) {
      const out = await buildFounderQueue({ svc: makeSvc({ AgentTask: [task(extra)] }), now: NOW });
      expect(out.items, JSON.stringify(extra)).toHaveLength(1);
    }
  });

  it("ignores a failed task, which retries on its own", async () => {
    const out = await buildFounderQueue({
      svc: makeSvc({ AgentTask: [task({ terminal_state: "FAILED", status: "failed" })] }),
      now: NOW,
    });
    expect(out.items).toEqual([]);
  });
});

describe("C16 — an incomplete queue is never presented as an empty one", () => {
  it("withholds the total and the counts when a source could not be read", async () => {
    const out = await buildFounderQueue({
      svc: makeSvc({ Approval: [approval()], AgentQuestion: [question()] }, ["Approval"]),
      now: NOW,
    });
    // A partial queue that reports a total reads as complete.
    expect(out.total).toBeNull();
    expect(out.counts).toBeNull();
    expect(out.complete).toBe(false);
    expect(out.unavailable_sources).toEqual(["Approval"]);
    expect(out.coverage_note).toContain("missing, not absent");
  });

  it("reports a real zero when all three read completely", async () => {
    const out = await buildFounderQueue({ svc: makeSvc({}), now: NOW });
    expect(out.total).toBe(0);
    expect(out.complete).toBe(true);
    expect(out.coverage_note).toContain("read completely");
  });

  it("reports the oldest wait in days", async () => {
    const out = await buildFounderQueue({ svc: makeSvc({ AgentTask: [task()] }), now: NOW });
    expect(out.oldest_waiting_days).toBe(47);
  });

  it("gives a badge that is null rather than understated when incomplete", async () => {
    const badge = await founderQueueBadge({
      svc: makeSvc({ Approval: [approval()] }, ["AgentQuestion"]), now: NOW,
    });
    expect(badge.count).toBeNull();
    expect(badge.complete).toBe(false);
  });
});
