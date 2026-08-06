import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  safeEqual, redactSecrets, REDACTED, REDACTED_MAX_DEPTH,
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

  // v62.1 CP4 — expanded sensitive keys
  it("redacts the full v62.1 sensitive-key set, case-insensitively", () => {
    const out = redactSecrets({
      Authorization: "Bearer tok",
      api_key: "k",
      access_token: "a",
      refresh_token: "r",
      client_secret: "c",
      stripe_secret: "s",
      webhook_secret: "w",
      password: "p",
    });
    for (const k of Object.keys(out)) expect(out[k]).toBe(REDACTED);
  });

  it("does not over-redact innocent keys by partial match", () => {
    const out = redactSecrets({ password_hint_shown: true, authorization_log_id: "al_1" });
    expect(out.password_hint_shown).toBe(true);
    expect(out.authorization_log_id).toBe("al_1");
  });

  // v62.1 CP4 — depth limit never returns unsanitized data
  it("replaces subtrees past depth 8 with [REDACTED_MAX_DEPTH]", () => {
    let deep = { internal_secret: "leak-me" };
    for (let i = 0; i < 12; i++) deep = { level: deep };
    const out = redactSecrets(deep);
    const json = JSON.stringify(out);
    expect(json).not.toContain("leak-me");
    expect(json).toContain(REDACTED_MAX_DEPTH);
  });

  it("handles cyclic objects without infinite loops and without leaking", () => {
    const a = { internal_secret: "abc" };
    a.self = a;
    const out = redactSecrets(a);
    expect(out.internal_secret).toBe(REDACTED);
    expect(out.self).toBe("[circular]");
    expect(JSON.stringify(out)).not.toContain("abc");
  });

  it("reduces Error instances to name + message (no stack, no custom props)", () => {
    const err = new Error("boom");
    err.internal_secret = "abc";
    const out = redactSecrets({ error: err });
    expect(out.error).toEqual({ name: "Error", message: "boom" });
    expect(JSON.stringify(out)).not.toContain("abc");
  });

  it("handles arrays of secrets at depth", () => {
    const out = redactSecrets({ batch: [[{ client_secret: "x" }]] });
    expect(out.batch[0][0].client_secret).toBe(REDACTED);
  });
});

describe("dispatchWebhook persistence sanitization (v62.1 CP4)", () => {
  const src = fs.readFileSync(
    fileURLToPath(new URL("../../base44/functions/dispatchWebhook/entry.ts", import.meta.url)),
    "utf8",
  );

  it("persists only the redacted payload in delivery and DLQ rows", () => {
    expect(src).toContain("redactSecrets(payload)");
    expect(src).toContain("payload: persistedPayload");
    expect(src).not.toMatch(/^\s*payload,\s*$/m);
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