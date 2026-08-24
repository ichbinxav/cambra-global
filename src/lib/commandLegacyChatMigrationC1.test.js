// COMMAND-C1 (2026-08-17) — the legacy admin chat migration must not orphan
// founder history, must not invent authorship it cannot support, and must be
// safe to re-run after a partial failure. Each of those is tested against the
// real planner.
import { describe, expect, it } from "vitest";
import {
  deriveLegacyTitle,
  planLegacyChatMigration,
  reconcileLegacyChatMigration,
  resolveLegacyOwner,
} from "../../base44/shared/commandLegacyChatMigration.ts";

const NOW = "2026-08-17T12:00:00.000Z";

const msg = (overrides) => ({
  id: "m1", conversation_id: "conv_1", role: "user", content: "hello",
  created_date: "2026-01-01T00:00:00.000Z", ...overrides,
});

const planOf = (messages, existing = []) =>
  planLegacyChatMigration({ messages, existing, now: NOW });

describe("C1 — legacy history is carried over, not orphaned", () => {
  it("creates one conversation per legacy grouping key and counts its messages", () => {
    const plan = planOf([
      msg({ id: "m1", conversation_id: "conv_a", content: "check ES campaign" }),
      msg({ id: "m2", conversation_id: "conv_a", role: "assistant", content: "here it is" }),
      msg({ id: "m3", conversation_id: "conv_b", content: "merchant status" }),
    ]);
    expect(plan.summary.conversations_found).toBe(2);
    expect(plan.summary.to_create).toBe(2);

    const first = plan.entries.find((entry) => entry.legacy_session_key === "conv_a");
    expect(first.action).toBe("CREATE");
    expect(first.conversation.message_count).toBe(2);
    expect(first.message_ids).toEqual(["m1", "m2"]);
    expect(first.conversation.legacy_session_key).toBe("conv_a");
    expect(first.conversation.migrated_from).toBe("legacy_admin_chat");
  });

  it("titles the conversation from the founder's own words, never the assistant's", () => {
    const plan = planOf([
      msg({ id: "m1", role: "assistant", content: "I have prepared a summary for you" }),
      msg({ id: "m2", role: "user", content: "what is the ES pipeline" }),
    ]);
    expect(plan.entries[0].conversation.title).toBe("what is the ES pipeline");
  });

  it("truncates a long title instead of dropping it", () => {
    const long = "a".repeat(200);
    const title = deriveLegacyTitle([msg({ content: long })]);
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith("…")).toBe(true);
  });

  it("falls back to a neutral label when there is no user turn to title from", () => {
    expect(deriveLegacyTitle([msg({ role: "assistant", content: "hi" })]))
      .toBe("Untitled legacy conversation");
  });

  it("uses the real first and last legacy timestamps rather than the migration clock", () => {
    const plan = planOf([
      msg({ id: "m1", created_date: "2026-03-05T09:00:00.000Z" }),
      msg({ id: "m2", created_date: "2026-01-02T09:00:00.000Z" }),
    ]);
    expect(plan.entries[0].conversation.created_at).toBe("2026-01-02T09:00:00.000Z");
    expect(plan.entries[0].conversation.last_message_at).toBe("2026-03-05T09:00:00.000Z");
  });
});

describe("C1 — authorship is never invented", () => {
  it("marks a conversation UNKNOWN when the legacy rows name no author", () => {
    const plan = planOf([msg({ created_by: undefined })]);
    expect(plan.entries[0].conversation.attribution_state).toBe("UNKNOWN");
    expect(plan.entries[0].conversation.owner_actor).toBe("");
    expect(plan.entries[0].conversation.attributed_actor).toBe("");
    expect(plan.entries[0].conversation.created_by).toBeUndefined();
    expect(plan.summary.unattributed).toBe(1);
  });

  it("carries a real author through when the rows do name one", () => {
    const plan = planOf([msg({ created_by: "founder@cambra.global" })]);
    expect(plan.entries[0].conversation.attribution_state).toBe("OBSERVED");
    expect(plan.entries[0].conversation.owner_actor).toBe("founder@cambra.global");
    expect(plan.entries[0].conversation.attributed_actor).toBe("founder@cambra.global");
    expect(plan.summary.unattributed).toBe(0);
  });

  it("refuses to pick a winner when the legacy rows disagree about the author", () => {
    const plan = planOf([
      msg({ id: "m1", created_by: "founder@cambra.global" }),
      msg({ id: "m2", created_by: "someone.else@cambra.global" }),
    ]);
    expect(plan.entries[0].conversation.attribution_state).toBe("CONFLICTED");
    expect(plan.entries[0].conversation.owner_actor).toBe("");
    expect(plan.entries[0].conversation.attributed_actor).toBe("");
    expect(plan.summary.conflicted_attribution).toBe(1);
  });

  it("resolveLegacyOwner reports the conflict explicitly", () => {
    expect(resolveLegacyOwner([msg({ created_by: "a" }), msg({ created_by: "b" })]))
      .toEqual({ owner: null, conflicted: true });
    expect(resolveLegacyOwner([msg({ created_by: "a" }), msg({ created_by: "a" })]))
      .toEqual({ owner: "a", conflicted: false });
  });
});

describe("C1 — a migrated conversation does not claim a receipt chain it never had", () => {
  it("opens with no chain, because legacy turns were never receipted", () => {
    const plan = planOf([msg()]);
    expect(plan.entries[0].conversation.receipt_chain_key).toBe("");
    expect(plan.entries[0].conversation.last_receipt_hash).toBe("");
  });

  it("archives migrated conversations rather than presenting them as active", () => {
    expect(planOf([msg()]).entries[0].conversation.status).toBe("ARCHIVED");
  });
});

describe("C1 — re-running is safe", () => {
  it("skips a legacy key that a CommandConversation already claims", () => {
    const messages = [msg({ conversation_id: "conv_a" }), msg({ id: "m2", conversation_id: "conv_b" })];
    const plan = planOf(messages, [{ legacy_session_key: "conv_a" }]);
    expect(plan.summary.to_create).toBe(1);
    expect(plan.summary.already_migrated).toBe(1);
    expect(plan.entries.find((e) => e.legacy_session_key === "conv_a").action)
      .toBe("SKIP_ALREADY_MIGRATED");
  });

  it("is a complete no-op on a second full run", () => {
    const messages = [msg({ conversation_id: "conv_a" }), msg({ id: "m2", conversation_id: "conv_b" })];
    const first = planOf(messages);
    const existing = first.entries
      .filter((entry) => entry.action === "CREATE")
      .map((entry) => ({ legacy_session_key: entry.legacy_session_key }));
    const second = planOf(messages, existing);
    expect(second.summary.to_create).toBe(0);
    expect(second.summary.already_migrated).toBe(2);
  });
});

describe("C1 — nothing is dropped silently", () => {
  it("counts messages with no grouping key instead of discarding them quietly", () => {
    const plan = planOf([msg({ id: "m1", conversation_id: "" }), msg({ id: "m2", conversation_id: "conv_a" })]);
    expect(plan.summary.unusable_messages).toBe(1);
    expect(plan.summary.conversations_found).toBe(1);
  });

  it("marks a body-less conversation unusable rather than creating an empty one", () => {
    const plan = planOf([msg({ content: "" }), msg({ id: "m2", content: "   " })]);
    expect(plan.entries[0].action).toBe("SKIP_UNUSABLE");
    expect(plan.entries[0].reason).toBe("no_message_body");
    expect(plan.summary.to_create).toBe(0);
  });

  it("reconciles: every legacy conversation is accounted for", () => {
    const plan = planOf([
      msg({ id: "m1", conversation_id: "conv_a" }),
      msg({ id: "m2", conversation_id: "conv_b" }),
      msg({ id: "m3", conversation_id: "conv_c", content: "" }),
    ], [{ legacy_session_key: "conv_b" }]);
    const reconciliation = reconcileLegacyChatMigration(plan.summary);
    expect(reconciliation.reconciles).toBe(true);
    expect(reconciliation.unaccounted).toBe(0);
    expect(reconciliation.found).toBe(3);
  });

  it("refuses to reconcile when a conversation went missing", () => {
    const reconciliation = reconcileLegacyChatMigration({
      conversations_found: 10, to_create: 4, already_migrated: 2, unusable_conversations: 1,
    });
    expect(reconciliation.reconciles).toBe(false);
    expect(reconciliation.unaccounted).toBe(3);
  });

  it("handles an empty legacy history without claiming anything", () => {
    const plan = planOf([]);
    expect(plan.summary.conversations_found).toBe(0);
    expect(reconcileLegacyChatMigration(plan.summary).reconciles).toBe(true);
  });
});
