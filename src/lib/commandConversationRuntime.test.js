import { describe, expect, it, vi } from "vitest";
import {
  commandActorKey,
  resolveCommandConversationAccess,
  syncCommandConversationMetadata,
} from "../../base44/shared/commandConversationRuntime.ts";

const OWNER = "founder@cambra.global";

describe("Command conversation runtime ownership", () => {
  it("normalizes the authenticated email and ignores reserved created_by", () => {
    const row = {
      id: "row-1", conversation_id: "conv-1", owner_actor: OWNER,
      created_by: "service@no-reply.base44.com", status: "ACTIVE",
    };
    expect(commandActorKey({ email: "Founder@Cambra.Global" })).toBe(OWNER);
    expect(resolveCommandConversationAccess([row], OWNER)).toMatchObject({ ok: true, conversation: row });
  });

  it("does not reveal another actor's conversation", () => {
    const result = resolveCommandConversationAccess([
      { id: "row-1", conversation_id: "conv-1", owner_actor: "other@cambra.global", status: "ACTIVE" },
    ], OWNER);
    expect(result).toEqual({ ok: false, status: 404, error: "conversation_not_found" });
  });

  it("blocks archived and duplicate conversation identifiers", () => {
    expect(resolveCommandConversationAccess([
      { id: "row-1", owner_actor: OWNER, status: "ARCHIVED" },
    ], OWNER)).toEqual({ ok: false, status: 409, error: "conversation_archived" });
    expect(resolveCommandConversationAccess([
      { id: "row-1", owner_actor: OWNER }, { id: "row-2", owner_actor: OWNER },
    ], OWNER)).toEqual({ ok: false, status: 409, error: "conversation_id_not_unique" });
  });
});

describe("Command conversation runtime metadata", () => {
  it("updates title, turn count and last-message time from durable messages", async () => {
    const update = vi.fn().mockResolvedValue({});
    const svc = { entities: {
      ChatMessage: { filter: vi.fn().mockResolvedValue([
        { role: "user", content: "Check the real system blockers", created_date: "2026-08-24T00:00:00.000Z" },
        { role: "assistant", content: "Here they are", created_date: "2026-08-24T00:00:01.000Z" },
      ]) },
      CommandConversation: { update },
    } };
    const patch = await syncCommandConversationMetadata(svc, {
      id: "row-1", conversation_id: "conv-1", title: "New conversation", message_count: 0,
    }, "2026-08-24T00:00:02.000Z");

    expect(patch).toMatchObject({
      title: "Check the real system blockers",
      message_count: 2,
      last_message_at: "2026-08-24T00:00:01.000Z",
    });
    expect(update).toHaveBeenCalledWith("row-1", patch);
  });
});
