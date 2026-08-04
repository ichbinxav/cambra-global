// safeRedirect — open-redirect protection for post-login return URLs.
//
// Extracted from LoginGate.jsx (safeAbsoluteUrl) and AuthRedirect.jsx
// (sameOriginUrl) so the same-origin rule is enforced in ONE place and
// can be unit-tested. Both components previously had their own copy of
// this logic; they now import from here.
//
// RULE: only same-origin absolute URLs or absolute paths are allowed.
// A crafted ?next=https://evil.com is rejected and falls back to the
// default (always same-origin). This prevents open-redirect attacks
// via the login flow.

/**
 * Normalize a candidate return URL to a same-origin absolute URL.
 *
 * @param {string} value  The raw ?next= or sessionStorage value.
 * @param {string} origin  window.location.origin (or a test stub).
 * @param {string} [fallback="/Dashboard"]  Path used when the candidate
 *   is rejected. Always same-origin (prefixed with origin).
 * @returns {string} A same-origin absolute URL.
 */
export function safeReturnUrl(value, origin, fallback = "/Dashboard") {
  if (!value || typeof value !== "string") return origin + fallback;
  // Absolute path → same-origin, safe.
  if (value.startsWith("/")) return origin + value;
  try {
    const u = new URL(value);
    if (u.origin === origin) return u.toString();
  } catch {
    // Not a valid URL → reject.
  }
  return origin + fallback;
}

/**
 * Boolean variant — is the candidate a safe same-origin URL?
 * Returns null for unsafe/invalid (AuthRedirect's original contract).
 */
export function isSameOriginUrl(value, origin) {
  if (!value || typeof value !== "string") return null;
  if (value.startsWith("/")) return origin + value;
  try {
    const u = new URL(value);
    return u.origin === origin ? u.toString() : null;
  } catch {
    return null;
  }
}