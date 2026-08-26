import { describe, expect, it } from "vitest";
import { readableMessageContent } from "./ChatMessageBubble";

describe("readableMessageContent", () => {
  it("replaces a legacy empty response with actionable copy", () => {
    expect(readableMessageContent({ role: "assistant", content: "(no response)" }))
      .toContain("could not produce a response");
  });

  it("preserves real assistant and user messages", () => {
    expect(readableMessageContent({ role: "assistant", content: "System healthy" }))
      .toBe("System healthy");
    expect(readableMessageContent({ role: "user", content: "(no response)" }))
      .toBe("(no response)");
  });
});
