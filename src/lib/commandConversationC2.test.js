// COMMAND-C2 (2026-08-17) — behaviour tests for the durable conversation layer.
// Every test invokes the real handler against an in-memory store and asserts
// what was written, what was refused, and what the founder is actually shown.
import { describe, expect, it } from "vitest";
import {
  assembleTimeline,
  deriveConversationTitle,
  handleCommandConversationAction,
  resolveAncestry,
} from "../../base44/shared/commandConversationCore.ts";

const FOUNDER = { id: "founder-1", email: "founder@cambra.global", role: "admin" };
const NOW = "2026-08-17T12:00:00.000Z";
const DEPS = { now: () => NOW, newId: (seed) => `conv_${seed}` };

function matches(row, query) {
  return Object.entries(query).every(([key, expected]) => String(row[key]) === String(expected));
}

function makeEntity(rows = [], behavior = {}) {
  const store = rows.map((row) => ({ ...row }));
  return {
    store,
    async filter(query, _sort, limit) {
      if (behavior.throws) throw new Error(behavior.throws);
      const found = store.filter((row) => matches(row, query));
      return (typeof limit === "number" ? found.slice(0, limit) : found).map((row) => ({ ...row }));
    },
    async get(id) {
      if (behavior.throws) throw new Error(behavior.throws);
      const row = store.find((candidate) => String(candidate.id) === String(id));
      return row ? { ...row } : null;
    },
    async create(value) {
      const row = { id: `row-${store.length + 1}`, ...value };
      store.push(row);
      return { ...row };
    },
    async update(id, patch) {
      const row = store.find((candidate) => String(candidate.id) === String(id));
      if (!row) throw new Error("row_not_found");
      Object.assign(row, patch);
      return { ...row };
    },
  };
}

function makeSvc(rows = {}, behavior = {}) {
  const entities = {};
  return {
    entities: new Proxy(entities, {
      get(target, name) {
        const key = String(name);
        if (!target[key]) target[key] = makeEntity(rows[key] || [], behavior[key] || {});
        return target[key];
      },
    }),
  };
}

const jsonOf = async (response) => ({ status: response.status, body: await response.json() });
const call = (body, svc, user = FOUNDER) =>
  handleCommandConversationAction(user, body, svc, DEPS).then(jsonOf);

const conv = (overrides = {}) => ({
  id: `id-${overrides.conversation_id || "c1"}`,
  conversation_id: "c1", title: "ES pipeline",
  owner_actor: FOUNDER.email, attributed_actor: FOUNDER.email,
  attribution_state: "OBSERVED", status: "ACTIVE", message_count: 2,
  created_at: "2026-08-01T00:00:00.000Z", last_message_at: "2026-08-02T00:00:00.000Z",
  ...overrides,
});

const chat = (id, conversationId, content, role = "user") =>
  ({ id, conversation_id: conversationId, role, content, created_date: `2026-08-01T00:0${id.slice(-1)}:00.000Z` });

describe("C2 — conversations are durable and listable", () => {
  it("lists the founder's own conversations with real counts", async () => {
    const svc = makeSvc({ CommandConversation: [conv(), conv({ conversation_id: "c2", title: "FR merchants", message_count: 5 })] });
    const { status, body } = await call({ action: "list" }, svc);
    expect(status).toBe(200);
    expect(body.conversations).toHaveLength(2);
    expect(body.conversations.map((row) => row.conversation_id)).toEqual(["c1", "c2"]);
    expect(body.conversations[1].message_count).toBe(5);
    expect(body.external_send_performed).toBe(false);
  });

  it("does not list another founder's conversations", async () => {
    const svc = makeSvc({
      CommandConversation: [conv(), conv({
        conversation_id: "c9",
        owner_actor: "someone.else@cambra.global",
        attributed_actor: "someone.else@cambra.global",
      })],
    });
    const { body } = await call({ action: "list" }, svc);
    expect(body.conversations.map((row) => row.conversation_id)).toEqual(["c1"]);
  });

  it("reports an unreadable list as unavailable, never as an empty history", async () => {
    const svc = makeSvc({}, { CommandConversation: { throws: "store_down" } });
    const { status, body } = await call({ action: "list" }, svc);
    expect(status).toBe(503);
    expect(body.error).toBe("conversations_unavailable");
    expect(body.conversations).toBeUndefined();
  });

  it("creates a durable conversation instead of a sessionStorage id", async () => {
    const svc = makeSvc({});
    const { status, body } = await call({ action: "create", title: "New plan" }, svc);
    expect(status).toBe(201);
    expect(body.conversation.conversation_id).toBeTruthy();
    expect(body.conversation.owner_actor).toBe(FOUNDER.email);
    expect(body.conversation.attributed_actor).toBe(FOUNDER.email);
    expect(body.conversation.attribution_state).toBe("OBSERVED");
    expect(svc.entities.CommandConversation.store).toHaveLength(1);
  });

  it("refuses to act for an unidentified caller", async () => {
    const { status, body } = await call({ action: "list" }, makeSvc({}), { role: "admin" });
    expect(status).toBe(401);
    expect(body.error).toBe("unidentified_actor");
  });
});

describe("C2 — archiving is not deleting", () => {
  it("changes status and keeps the row", async () => {
    const svc = makeSvc({ CommandConversation: [conv()] });
    const { status, body } = await call({ action: "set_status", conversation_id: "c1", status: "ARCHIVED" }, svc);
    expect(status).toBe(200);
    expect(body.conversation.status).toBe("ARCHIVED");
    expect(svc.entities.CommandConversation.store).toHaveLength(1);
    expect(svc.entities.CommandConversation.store[0].title).toBe("ES pipeline");
  });

  it("refuses a status outside the vocabulary", async () => {
    const svc = makeSvc({ CommandConversation: [conv()] });
    const { status, body } = await call({ action: "set_status", conversation_id: "c1", status: "DELETED" }, svc);
    expect(status).toBe(400);
    expect(body.error).toBe("unsupported_status");
    expect(svc.entities.CommandConversation.store[0].status).toBe("ACTIVE");
  });

  it("renames without touching anything else", async () => {
    const svc = makeSvc({ CommandConversation: [conv()] });
    const { body } = await call({ action: "rename", conversation_id: "c1", title: "ES pipeline Q3" }, svc);
    expect(body.conversation.title).toBe("ES pipeline Q3");
    expect(body.conversation.message_count).toBe(2);
  });

  it("refuses an empty rename rather than blanking the title", async () => {
    const svc = makeSvc({ CommandConversation: [conv()] });
    const { status, body } = await call({ action: "rename", conversation_id: "c1", title: "   " }, svc);
    expect(status).toBe(400);
    expect(body.error).toBe("title_required");
    expect(svc.entities.CommandConversation.store[0].title).toBe("ES pipeline");
  });
});

describe("C2 — branching references history rather than copying it", () => {
  const parentSvc = () => makeSvc({
    CommandConversation: [conv()],
    ChatMessage: [chat("m1", "c1", "what is the ES pipeline"), chat("m2", "c1", "here it is", "assistant")],
  });

  it("creates a branch that points at its parent and fork point", async () => {
    const svc = parentSvc();
    const { status, body } = await call(
      { action: "branch", conversation_id: "c1", branch_from_message_id: "m1" }, svc);
    expect(status).toBe(201);
    expect(body.conversation.branched_from_conversation_id).toBe("c1");
    expect(body.conversation.branched_from_message_id).toBe("m1");
    // No turns were duplicated.
    expect(svc.entities.ChatMessage.store).toHaveLength(2);
    expect(body.conversation.message_count).toBe(0);
  });

  it("refuses to branch from a message that is not in the conversation", async () => {
    const svc = parentSvc();
    const { status, body } = await call(
      { action: "branch", conversation_id: "c1", branch_from_message_id: "m-not-here" }, svc);
    expect(status).toBe(409);
    expect(body.error).toBe("branch_point_not_found_in_conversation");
    expect(svc.entities.CommandConversation.store).toHaveLength(1);
  });

  it("requires a fork point at all", async () => {
    const { status, body } = await call({ action: "branch", conversation_id: "c1" }, parentSvc());
    expect(status).toBe(400);
    expect(body.error).toBe("branch_from_message_id_required");
  });
});

describe("C2 — a branch shows inherited history, marked as inherited", () => {
  const branchedSvc = () => makeSvc({
    CommandConversation: [
      conv(),
      conv({ id: "id-c1b", conversation_id: "c1b", title: "ES pipeline (branch)", message_count: 1,
        branched_from_conversation_id: "c1", branched_from_message_id: "m1" }),
    ],
    ChatMessage: [
      chat("m1", "c1", "what is the ES pipeline"),
      chat("m2", "c1", "original answer", "assistant"),
      chat("m3", "c1b", "different follow-up"),
    ],
  });

  it("inherits only up to the fork point and labels what it inherited", async () => {
    const { status, body } = await call({ action: "get", conversation_id: "c1b" }, branchedSvc());
    expect(status).toBe(200);
    expect(body.timeline.map((row) => row.id)).toEqual(["m1", "m3"]);
    // m2 came after the fork and belongs only to the parent.
    expect(body.timeline.find((row) => row.id === "m2")).toBeUndefined();
    expect(body.timeline.find((row) => row.id === "m1").inherited_from).toBe("c1");
    expect(body.timeline.find((row) => row.id === "m3").inherited_from).toBe(null);
    expect(body.history_complete).toBe(true);
    expect(body.ancestry).toEqual(["c1", "c1b"]);
  });

  it("leaves the parent's own timeline untouched by the branch", async () => {
    const { body } = await call({ action: "get", conversation_id: "c1" }, branchedSvc());
    expect(body.timeline.map((row) => row.id)).toEqual(["m1", "m2"]);
    expect(body.timeline.every((row) => row.inherited_from === null)).toBe(true);
  });

  it("states that history is incomplete when the parent is gone, rather than showing a partial one as whole", async () => {
    const svc = makeSvc({
      CommandConversation: [conv({ id: "id-c1b", conversation_id: "c1b", branched_from_conversation_id: "c-missing", branched_from_message_id: "m1" })],
      ChatMessage: [chat("m3", "c1b", "orphan follow-up")],
    });
    const { body } = await call({ action: "get", conversation_id: "c1b" }, svc);
    expect(body.history_complete).toBe(false);
    expect(body.history_truncated_reason).toBe("ancestor_unavailable");
    expect(body.timeline.map((row) => row.id)).toEqual(["m3"]);
  });

  it("404s a conversation the founder does not own", async () => {
    const svc = makeSvc({ CommandConversation: [conv({
      owner_actor: "other@cambra.global",
      attributed_actor: "other@cambra.global",
      // Reserved Base44 metadata must never grant application-level access.
      created_by: FOUNDER.email,
    })] });
    const { status, body } = await call({ action: "get", conversation_id: "c1" }, svc);
    expect(status).toBe(404);
    expect(body.error).toBe("conversation_not_found");
  });

  it("reports unreadable messages as unavailable rather than an empty conversation", async () => {
    const svc = makeSvc({ CommandConversation: [conv()] }, { ChatMessage: { throws: "message_store_down" } });
    const { status, body } = await call({ action: "get", conversation_id: "c1" }, svc);
    expect(status).toBe(503);
    expect(body.error).toBe("conversation_messages_unavailable");
  });
});

describe("C2 — ancestry resolution is defensive", () => {
  it("detects a cycle instead of looping forever", () => {
    const a = { conversation_id: "a", branched_from_conversation_id: "b" };
    const b = { conversation_id: "b", branched_from_conversation_id: "a" };
    const result = resolveAncestry(a, new Map([["a", a], ["b", b]]));
    expect(result.cycle).toBe(true);
    expect(result.truncated).toBe(true);
  });

  it("stops at a bounded depth", () => {
    const byId = new Map();
    for (let index = 0; index < 60; index += 1) {
      byId.set(`c${index}`, { conversation_id: `c${index}`, branched_from_conversation_id: `c${index + 1}` });
    }
    const result = resolveAncestry(byId.get("c0"), byId);
    expect(result.truncated).toBe(true);
    expect(result.chain.length).toBeLessThan(60);
  });

  it("returns a single node for an unbranched conversation", () => {
    const only = { conversation_id: "solo" };
    expect(resolveAncestry(only, new Map([["solo", only]])))
      .toEqual({ chain: [only], truncated: false, cycle: false });
  });
});

describe("C2 — titles come from the founder's words", () => {
  it("uses the first user turn, not the assistant's reply", () => {
    expect(deriveConversationTitle([
      { role: "assistant", content: "I prepared a summary" },
      { role: "user", content: "show me FR merchants" },
    ])).toBe("show me FR merchants");
  });

  it("falls back to a neutral label on an empty conversation", () => {
    expect(deriveConversationTitle([])).toBe("New conversation");
  });

  it("assembleTimeline inherits everything when the child names no fork point", () => {
    const timeline = assembleTimeline({
      chain: [{ conversation_id: "child", branched_from_conversation_id: "parent" }, { conversation_id: "parent" }],
      messagesByConversation: new Map([["parent", [{ id: "p1" }, { id: "p2" }]], ["child", [{ id: "c1" }]]]),
    });
    expect(timeline.map((row) => row.id)).toEqual(["p1", "p2", "c1"]);
  });
});
