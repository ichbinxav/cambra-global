// v62 C4 — internal-secret handling primitives.
//
// Extracted so every trust boundary compares and redacts the shared secret the
// SAME way. Two properties matter:
//   1. Comparison is CONSTANT-TIME — a byte-by-byte early return leaks the
//      secret's prefix through timing.
//   2. The secret never reaches a log. redactSecrets() walks a payload
//      RECURSIVELY, so a nested `{ payload: { internal_secret } }` is scrubbed
//      too, and returns a copy (the caller's object is never mutated).
//
// Rotation: INTERNAL_CALL_SECRET is a plain app secret. To rotate, set the new
// value, redeploy the functions, then retire the old one — callers present the
// secret per request, so there is no stored state to migrate. `x-internal-secret`
// is the PREFERRED channel; the `internal_secret` body field remains only for
// function→function invocations that cannot set headers.

const SECRET_KEYS = new Set([
  "internal_secret",
  "internalsecret",
  "x-internal-secret",
  // v62.1 CP4 — expanded sensitive-key list. EXACT (lowercased) key matches
  // only, never substring matching, so innocent fields ("password_hint_shown",
  // "authorization_log_id") are not over-redacted.
  "authorization",
  "api_key",
  "apikey",
  "access_token",
  "refresh_token",
  "client_secret",
  "stripe_secret",
  "webhook_secret",
  "password",
]);

export const REDACTED = "[redacted]";
// v62.1 CP4 — a subtree past the depth limit is NEVER returned as-is: it is
// replaced by this marker. Returning the original object at depth>8 (the v62
// behavior) would leak any secret nested deeper than the limit.
export const REDACTED_MAX_DEPTH = "[REDACTED_MAX_DEPTH]";
const CIRCULAR = "[circular]";

/** Constant-time string comparison. Returns false for empty/unequal lengths. */
export function safeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length === 0 || b.length === 0) return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Deep copy with every sensitive key replaced by "[redacted]".
 * Use before logging or persisting ANY request payload.
 * v62.1 CP4 guarantees:
 *   - depth > 8 → "[REDACTED_MAX_DEPTH]" (never the unsanitized original);
 *   - cyclic references → "[circular]" (never an infinite loop);
 *   - Error instances → { name, message } only (no stack, no custom props);
 *   - key matching is case-insensitive but exact (no substring matching);
 *   - the caller's object is never mutated.
 */
export function redactSecrets(value: unknown, depth = 0, seen?: WeakSet<object>): unknown {
  if (value === null || typeof value !== "object") return value;
  if (depth > 8) return REDACTED_MAX_DEPTH;
  const tracked = seen ?? new WeakSet<object>();
  if (tracked.has(value as object)) return CIRCULAR;
  tracked.add(value as object);
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, depth + 1, tracked));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEYS.has(k.toLowerCase()) ? REDACTED : redactSecrets(v, depth + 1, tracked);
  }
  return out;
}

/**
 * Reads the presented secret. Header wins; the body field is the documented
 * fallback for header-less internal invocations.
 */
export function readPresentedSecret(req: Request, body: unknown): string {
  const header = req.headers.get("x-internal-secret");
  if (typeof header === "string" && header.length > 0) return header;
  const fromBody = (body as Record<string, unknown> | null)?.internal_secret;
  return typeof fromBody === "string" ? fromBody : "";
}

/** True only when a configured secret matches the presented one. */
export function isInternalCaller(req: Request, body: unknown): boolean {
  const configured = Deno.env.get("INTERNAL_CALL_SECRET") ?? "";
  return safeEqual(configured, readPresentedSecret(req, body));
}