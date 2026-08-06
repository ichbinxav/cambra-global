import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildPublicWebhookPayload, WEBHOOK_EVENT_PAYLOAD_ALLOWLIST } from "../../base44/shared/webhookPublicPayload.ts";

describe("buildPublicWebhookPayload (v62.2 CP6.3 — allowlist boundary)", () => {
  it("keeps documented public fields", () => {
    const out = buildPublicWebhookPayload("new_brand_created", {
      brand_id: "b1", name: "Acme", country: "FR",
    });
    expect(out).toEqual({ brand_id: "b1", name: "Acme", country: "FR" });
  });

  it("drops top-level secrets in any casing", () => {
    const out = buildPublicWebhookPayload("new_brand_created", {
      brand_id: "b1", internal_secret: "s", internalSecret: "s", Authorization: "Bearer x",
    });
    expect(JSON.stringify(out)).not.toContain("s\"");
    expect(out).toEqual({ brand_id: "b1" });
  });

  it("omits undocumented fields instead of forwarding them", () => {
    const out = buildPublicWebhookPayload("report_created", {
      report_id: "r1", month: "2026-08", billing_snapshot_json: { fee: 25 }, notes: "internal",
    });
    expect(out).toEqual({ report_id: "r1", month: "2026-08" });
  });

  it("never forwards nested objects (only scalars cross the boundary)", () => {
    const out = buildPublicWebhookPayload("new_document_uploaded", {
      document_id: "d1", title: { nested: { internal_secret: "x" } },
    });
    expect(out).toEqual({ document_id: "d1" });
  });

  it("fails closed for unknown event types and non-object payloads", () => {
    expect(buildPublicWebhookPayload("made_up_event", { a: 1 })).toEqual({});
    expect(buildPublicWebhookPayload("new_brand_created", null)).toEqual({});
    expect(buildPublicWebhookPayload("new_brand_created", [1, 2])).toEqual({});
  });

  it("covers every supported dispatchWebhook event type", () => {
    const src = fs.readFileSync(
      fileURLToPath(new URL("../../base44/functions/dispatchWebhook/entry.ts", import.meta.url)), "utf8");
    const m = src.match(/SUPPORTED_EVENTS = \[([\s\S]*?)\]/);
    const supported = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    for (const ev of supported) expect(WEBHOOK_EVENT_PAYLOAD_ALLOWLIST[ev]).toBeDefined();
  });

  it("is wired into dispatchWebhook for outbound, persistence and retries", () => {
    const src = fs.readFileSync(
      fileURLToPath(new URL("../../base44/functions/dispatchWebhook/entry.ts", import.meta.url)), "utf8");
    expect(src).toContain("buildPublicWebhookPayload(event_type, payload)");
    // Outbound HTTP body uses the public payload…
    expect(src).toContain("data: publicPayload");
    // …and both persistence rows store the same public payload.
    expect((src.match(/payload: publicPayload/g) || []).length).toBe(2);
    // No raw payload reaches persistence or the wire.
    expect(src).not.toContain("data: payload,");
  });
});