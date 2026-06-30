// ─── Refresh-on-401 wrapper — FUENTE DE VERDAD LÓGICA ──────────────────────
//
// Sits BETWEEN the paginator loop and `fetchWithBackoff`. Its only job is:
//
//   "If a fetch comes back 401, try ONE refresh of the OAuth token and
//    retry that exact same fetch ONE more time. Beyond that, give up."
//
// Decisions baked in (per the spec):
//   1. Only OAuth providers (auth_method === "oauth") with a stored
//      refresh_token are eligible. api_key / basic_auth providers fall
//      through unchanged — a 401 on those means "key revoked", refresh
//      cannot fix it.
//   2. ONE refresh per sync run, total. The caller owns a small state
//      object { refreshed } that survives across pages.
//   3. The refresh+retry is transparent to the caller's success path. If
//      the refresh succeeds, the second fetch's Response is returned just
//      like a normal first-try success. If anything fails (refresh fails,
//      retry still 401, ineligible provider) we return the ORIGINAL 401
//      Response — same shape callers already handle today.
//   4. The retry MUST use freshly-rebuilt auth headers (the access token
//      changed). The caller supplies a `rebuildHeaders()` thunk so this
//      module stays provider-agnostic — it never knows what header name
//      or format the provider uses, only that "headers must be rebuilt
//      after refresh".
//   5. The refresh itself is delegated to a `refreshFn()` thunk supplied
//      by the caller. Inside the Deno engine that thunk is a call to
//      `oauthConnector(mode:"refresh", integration_id)` — but this module
//      is environment-agnostic and unit-testable in plain Node.
//
// IMPORTANTE: módulo duplicado verbatim en
// base44/functions/dataSyncAgent/entry.ts (Deno no puede importar de src/).
// Mismo patrón que el resto del sync engine.

// SYNC-START: refreshOn401
/**
 * State container shared across a single sync run. Tracks whether we've
 * already burned our one refresh attempt this run.
 */
export function createRefreshState() {
  return { refreshed: false };
}

/**
 * Eligibility check, kept tiny and explicit. Both inputs are deliberately
 * cheap to provide so the caller can compute them once per sync.
 *
 * @param {string} authMethod - cfg.auth_method ("oauth" | "api_key" | "basic_auth")
 * @param {boolean} hasRefreshToken - whether Integration.refresh_token is non-null
 */
export function isEligibleForRefresh(authMethod, hasRefreshToken) {
  return authMethod === "oauth" && hasRefreshToken === true;
}

/**
 * Fetch one page, transparently handling 401 → refresh → retry once.
 *
 * @param {object} opts
 * @param {Function} opts.doFetch    Thunk that performs the fetch and returns a Response.
 *                                   Called twice at most: original + (post-refresh retry).
 * @param {Function} opts.refreshFn  Thunk that triggers the token refresh. Must return
 *                                   a truthy value on success, falsy on failure. The
 *                                   wrapper does not care about its shape — it only
 *                                   checks truthiness.
 * @param {Function} opts.rebuildHeaders  Thunk that re-reads the (now-refreshed)
 *                                        integration and returns the new auth headers.
 *                                        Called between refreshFn() and the retry fetch.
 *                                        The caller MUST mutate its own fetch closure
 *                                        from within rebuildHeaders so the retry uses
 *                                        the new headers — this module doesn't pass
 *                                        headers around to stay provider-agnostic.
 * @param {boolean} opts.eligible    Pre-computed isEligibleForRefresh() result.
 * @param {object} opts.state        createRefreshState() object, shared across pages.
 * @returns {Promise<Response>}      The original Response if no refresh was needed,
 *                                   or the retry Response if a refresh happened.
 */
export async function fetchPageWithMaybeRefresh({
  doFetch,
  refreshFn,
  rebuildHeaders,
  eligible,
  state,
}) {
  const firstRes = await doFetch();

  // Not a 401 → pass through unchanged. This includes success and all
  // non-auth errors (400, 403, 404, 500…).
  if (firstRes.status !== 401) return firstRes;

  // Ineligible provider (api_key / basic_auth / no refresh_token) → caller
  // handles the 401 as a hard failure, same as before this wrapper existed.
  if (!eligible) return firstRes;

  // Already burned our one refresh this run → fail clean, never loop.
  if (state.refreshed) return firstRes;

  // Mark BEFORE the refresh call so any throw still flips the flag and
  // prevents accidental re-entry from a concurrent path.
  state.refreshed = true;

  let refreshOk;
  try {
    refreshOk = await refreshFn();
  } catch {
    // Refresh threw (network error, encryption error, …). Treat as failure
    // and return the original 401. Caller's existing error path takes over.
    return firstRes;
  }
  if (!refreshOk) return firstRes;

  // Rebuild headers from the (now-refreshed) integration. If this throws
  // we also bail out with the original 401 — same defensive stance.
  try {
    await rebuildHeaders();
  } catch {
    return firstRes;
  }

  // Single retry with the new auth headers. Whatever this returns is final.
  return await doFetch();
}
// SYNC-END: refreshOn401