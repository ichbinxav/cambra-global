// v62.2 CP6.3 — outbound webhook payload contract (ALLOWLIST, not denylist).
// dispatchWebhook must never forward an arbitrary internal object to an
// external URL: only the fields documented here per event type are sent (and
// persisted). Undocumented fields are OMITTED, never forwarded automatically.
// Pure module (no SDK, no I/O) — runs in Deno (backend) and vitest (node).

export const WEBHOOK_EVENT_PAYLOAD_ALLOWLIST: Record<string, readonly string[]> = Object.freeze({
  new_brand_created: ["brand_id", "name", "country", "category", "created_at"],
  new_document_uploaded: ["document_id", "brand_id", "title", "doc_type", "created_at"],
  analysis_completed: ["brand_id", "session_id", "vertical", "channel", "monthly_savings_eur", "annual_savings_eur", "currency", "completed_at"],
  savings_unlocked: ["brand_id", "deal_activation_id", "vertical", "amount_eur", "currency", "month"],
  report_created: ["report_id", "brand_id", "deal_activation_id", "month", "vertical", "currency", "status"],
  integration_connected: ["brand_id", "provider", "integration_id", "connected_at"],
});

/**
 * Builds the public payload for an outbound webhook: copies ONLY the
 * allowlisted fields for the event type. Unknown event types and non-object
 * payloads yield an empty object (fail closed).
 */
export function buildPublicWebhookPayload(eventType: string, payload: unknown): Record<string, unknown> {
  const allow = WEBHOOK_EVENT_PAYLOAD_ALLOWLIST[eventType];
  if (!allow || payload === null || typeof payload !== "object" || Array.isArray(payload)) return {};
  const src = payload as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of allow) {
    if (!(key in src)) continue;
    const v = src[key];
    // Only scalars cross the boundary — nested internal objects never leak.
    if (v === null || ["string", "number", "boolean"].includes(typeof v)) out[key] = v;
  }
  return out;
}