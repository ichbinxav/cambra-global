// Behaviour tests for inbound thread routing.
//
// These execute the real module. They are not source greps: every case below
// builds inputs and asserts the returned decision.
//
// The case that matters most is "two merchants, one provider contact". That is
// the shape of the bug this module replaces, and the shape production will
// actually have — CAMBRA negotiates with Stripe, SumUp and PayPal on behalf of
// many merchants at the same time.
import { describe, expect, it } from "vitest";
import {
  normalizeAddress,
  resolveInboundThread,
  threadIdFromAlias,
} from "../../base44/shared/inboundThreadRouting.ts";

const threadA = {
  id: "thr_merchant_a",
  external_thread_id: "conv-aaa",
  counterparty_email: "am@stripe.com",
  status: "open",
  sent_message_ids: ["<msg-a-1@cambra.global>"],
};
const threadB = {
  id: "thr_merchant_b",
  external_thread_id: "conv-bbb",
  counterparty_email: "am@stripe.com", // same human at the same PSP
  status: "open",
  sent_message_ids: ["<msg-b-1@cambra.global>"],
};

describe("resolveInboundThread — cross-merchant safety", () => {
  it("refuses to route when one provider contact has two open threads", () => {
    const result = resolveInboundThread(
      { from: "am@stripe.com" }, // no conversation id, no alias, no references
      [threadA, threadB],
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("ambiguous_sender");
    // Both are surfaced so a human can triage, but neither is chosen.
    expect(result.candidate_thread_ids.sort()).toEqual([
      "thr_merchant_a",
      "thr_merchant_b",
    ]);
  });

  it("never picks by list order — swapping the input order changes nothing", () => {
    const forward = resolveInboundThread({ from: "am@stripe.com" }, [threadA, threadB]);
    const reversed = resolveInboundThread({ from: "am@stripe.com" }, [threadB, threadA]);
    expect(forward.ok).toBe(false);
    expect(reversed.ok).toBe(false);
  });

  it("routes the ambiguous sender correctly once the alias disambiguates it", () => {
    const result = resolveInboundThread(
      { from: "am@stripe.com", recipients: ["reply+thr_merchant_b@cambra.global"] },
      [threadA, threadB],
    );
    expect(result).toEqual({ ok: true, thread_id: "thr_merchant_b", strategy: "reply_alias" });
  });

  it("routes the ambiguous sender correctly via In-Reply-To", () => {
    const result = resolveInboundThread(
      { from: "am@stripe.com", in_reply_to: "<msg-a-1@cambra.global>" },
      [threadA, threadB],
    );
    expect(result).toEqual({ ok: true, thread_id: "thr_merchant_a", strategy: "in_reply_to" });
  });
});

describe("resolveInboundThread — strategy precedence", () => {
  it("prefers the alias over the conversation id when they disagree", () => {
    // A forwarded reply can carry the wrong conversation id. The alias is ours.
    const result = resolveInboundThread(
      {
        recipients: ["reply+thr_merchant_b@cambra.global"],
        conversation_id: "conv-aaa",
        from: "colleague@stripe.com",
      },
      [threadA, threadB],
    );
    expect(result).toEqual({ ok: true, thread_id: "thr_merchant_b", strategy: "reply_alias" });
  });

  it("routes a forward from an unknown colleague using only the alias", () => {
    const result = resolveInboundThread(
      {
        recipients: ["reply+thr_merchant_a@cambra.global"],
        from: "someone.else@stripe.com",
      },
      [threadA, threadB],
    );
    expect(result).toEqual({ ok: true, thread_id: "thr_merchant_a", strategy: "reply_alias" });
  });

  it("uses the conversation id when there is no alias", () => {
    const result = resolveInboundThread(
      { conversation_id: "conv-bbb", from: "am@stripe.com" },
      [threadA, threadB],
    );
    expect(result).toEqual({ ok: true, thread_id: "thr_merchant_b", strategy: "conversation" });
  });

  it("falls back to the sender only when it identifies exactly one thread", () => {
    const soleThread = { ...threadA, counterparty_email: "solo@sumup.com" };
    const result = resolveInboundThread({ from: "solo@sumup.com" }, [soleThread, threadB]);
    expect(result).toEqual({ ok: true, thread_id: "thr_merchant_a", strategy: "sole_candidate" });
  });
});

describe("resolveInboundThread — closed threads and no match", () => {
  it("ignores closed and suppressed threads so a stale one cannot win", () => {
    const closed = { ...threadA, status: "closed" };
    const result = resolveInboundThread({ from: "am@stripe.com" }, [closed, threadB]);
    // Only threadB remains open, so the sender now identifies exactly one.
    expect(result).toEqual({ ok: true, thread_id: "thr_merchant_b", strategy: "sole_candidate" });
  });

  it("does not resurrect a closed thread even with a matching alias", () => {
    const closed = { ...threadA, status: "closed" };
    const result = resolveInboundThread(
      { recipients: ["reply+thr_merchant_a@cambra.global"] },
      [closed],
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no_match");
  });

  it("returns no_match for a stranger rather than guessing", () => {
    const result = resolveInboundThread({ from: "nobody@example.com" }, [threadA, threadB]);
    expect(result).toEqual({ ok: false, reason: "no_match", candidate_thread_ids: [] });
  });

  it("returns no_match on an empty candidate set", () => {
    expect(resolveInboundThread({ from: "am@stripe.com" }, []).ok).toBe(false);
    expect(resolveInboundThread({}, []).ok).toBe(false);
  });

  it("never throws on malformed input", () => {
    expect(() => resolveInboundThread({}, null)).not.toThrow();
    expect(() => resolveInboundThread(null, [threadA])).not.toThrow();
    expect(resolveInboundThread(null, [threadA]).ok).toBe(false);
  });
});

describe("address and alias parsing", () => {
  it("normalizes display-name addresses and casing", () => {
    expect(normalizeAddress("Account Manager <AM@Stripe.com>")).toBe("am@stripe.com");
    expect(normalizeAddress("  AM@STRIPE.COM ")).toBe("am@stripe.com");
    expect(normalizeAddress(null)).toBe("");
  });

  it("matches a display-name sender against a bare stored address", () => {
    const result = resolveInboundThread(
      { from: "Account Manager <AM@Stripe.com>" },
      [{ ...threadA, counterparty_email: "am@stripe.com" }],
    );
    expect(result.ok).toBe(true);
  });

  it("extracts the thread id from a reply alias among several recipients", () => {
    expect(threadIdFromAlias(["ops@cambra.global", "reply+thr_x@cambra.global"])).toBe("thr_x");
    expect(threadIdFromAlias(["ops@cambra.global"])).toBeNull();
    expect(threadIdFromAlias(null)).toBeNull();
  });

  it("tolerates In-Reply-To with and without angle brackets", () => {
    const bare = resolveInboundThread(
      { from: "am@stripe.com", in_reply_to: "msg-b-1@cambra.global" },
      [threadA, threadB],
    );
    expect(bare).toEqual({ ok: true, thread_id: "thr_merchant_b", strategy: "in_reply_to" });
  });
});
