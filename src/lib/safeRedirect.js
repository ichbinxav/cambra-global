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

// Protocol-relative / backslash-relative vectors: "//evil.com",
// "///evil.com", "/\\evil.com" and their percent-encoded forms
// ("/%2Fevil.com", "/%5Cevil.com"). All begin with "/" so they would
// slip past a naive startsWith("/") path guard, yet browsers resolve
// them to a FOREIGN origin (protocol-relative URL → inherits the page
// scheme, host = the part after //). Decode once to catch encoded
// leading slashes/backslashes, then reject before the path shortcut.
function isProtocolRelative(value) {
  let decoded;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }
  // Two+ leading slashes → protocol-relative ("//host").
  if (decoded.startsWith("//")) return true;
  // Leading slash + backslash → browsers normalize "\/" to "//".
  if (decoded.startsWith("/\\")) return true;
  return false;
}

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
  // Protocol-relative / backslash-relative → open-redirect vector.
  if (isProtocolRelative(value)) return origin + fallback;
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
  if (isProtocolRelative(value)) return null;
  if (value.startsWith("/")) return origin + value;
  try {
    const u = new URL(value);
    return u.origin === origin ? u.toString() : null;
  } catch {
    return null;
  }
}