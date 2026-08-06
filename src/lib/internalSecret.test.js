import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  safeEqual, redactSecrets, REDACTED,
} from "../../base44/shared/internalSecret.ts";

describe("safeEqual", () => {
  it("matches identical strings and rejects everything else", () => {
    expect(safeEqual("s3cret-value", "s3cret-value")).toBe(true);
    expect(safeEqual("s3cret-value", "s3cret-valuf")).toBe(false);
    expect(safeEqual("s3cret", "s3cret-value")).toBe(false);
  });

  it("never lets an empty/missing secret authenticate", () => {
    expect(safeEqual("", "")).toBe(false);
    expect(safeEqual("", "anything")).toBe(false);
    expect(safeEqual("configured", "")).toBe(false);
    expect(safeEqual(null, null)).toBe(false);
    expect(safeEqual(undefined, "x")).toBe(false);
  });
});

describe("redactSecrets", () => {
  it("redacts the secret at the top level", () => {
    const out = redactSecrets({ internal_secret: "abc", month: "2026-08" });
    expect(out.internal_secret).toBe(REDACTED);
    expect(out.month).toBe("2026-08");
  });

  it("redacts recursively, including inside arrays and header-style keys", () => {
    const out = redactSecrets({
      payload: { nested: { internal_secret: "abc" } },
      batch: [{ internal_secret: "abc" }],
      headers: { "x-internal-secret": "abc" },
    });
    expect(out.payload.nested.internal_secret).toBe(REDACTED);
    expect(out.batch[0].internal_secret).toBe(REDACTED);
    expect(out.headers["x-internal-secret"]).toBe(REDACTED);
    expect(JSON.stringify(out)).not.toContain("abc");
  });

  it("does not mutate the caller's object", () => {
    const input = { internal_secret: "abc" };
    redactSecrets(input);
    expect(input.internal_secret).toBe("abc");
  });

  it("passes primitives through untouched", () => {
    expect(redactSecrets("plain")).toBe("plain");
    expect(redactSecrets(null)).toBe(null);
    expect(redactSecrets(7)).toBe(7);
  });
});

describe("internalGate wiring", () => {
  const gate = fs.readFileSync(
    fileURLToPath(new URL("../../base44/shared/internalGate.ts", import.meta.url)),
    "utf8",
  );

  it("delegates the comparison to the shared constant-time helper", () => {
    expect(gate).toContain("isInternalCaller");
  });

  it("no longer compares the secret with ===", () => {
    expect(gate).not.toMatch(/presented\s*===\s*secret/);
  });
});