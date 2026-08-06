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
]);

export const REDACTED = "[redacted]";

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
 * Deep copy with every internal-secret-ish key replaced by "[redacted]".
 * Use before logging ANY request payload.
 */
export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEYS.has(k.toLowerCase()) ? REDACTED : redactSecrets(v, depth + 1);
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