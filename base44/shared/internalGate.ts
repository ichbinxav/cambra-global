// SECURITY-2 — canonical trust-boundary gate.
//
// RULE: absence of a user is treated as an ATTACKER. Internal legitimacy is
// proven with INTERNAL_CALL_SECRET (header `x-internal-secret` or, for
// function→function invocations where headers can't be set, payload
// `internal_secret`). This replaces the inverted anti-pattern
// `if (user && user.role !== "admin")` — which let ANONYMOUS calls through —
// found by the 2026-07-24 external audit.
//
// Usage (inside Deno.serve handler, after createClientFromRequest):
//   const gate = await requireAdminOrInternal(req, base44, body /* optional */);
//   if (!gate.ok) return gate.response;
//   // gate.user / gate.isAdmin / gate.isInternal available afterwards
//
// `body` is optional — pass the already-parsed JSON body when the caller may
// present the secret via `internal_secret` in the payload (the dispatchWebhook
// convention for server-to-server invocations).
// v62 C4 — secret comparison + redaction live in one shared module so no
// boundary can drift into a non-constant-time compare or an unredacted log.
export { redactSecrets, safeEqual, readPresentedSecret, isInternalCaller } from "./internalSecret.ts";
import { isInternalCaller } from "./internalSecret.ts";

async function authenticatedUser(base44: any) {
  try {
    return { available: true, user: await base44.auth.me() };
  } catch (error) {
    console.error(JSON.stringify({
      event: "internal_gate_auth_authority_unavailable",
      error_name: error instanceof Error ? error.name : typeof error,
      observed_at: new Date().toISOString(),
    }));
    return { available: false, user: null };
  }
}

export async function requireAdminOrInternal(req: Request, base44: any, body: any = null) {
  const auth = await authenticatedUser(base44);
  const user = auth.user;
  const isAdmin = user?.role === "admin";
  // v62 C4 — header-preferred, constant-time comparison (see internalSecret.ts).
  const isInternal = isInternalCaller(req, body);
  if (!auth.available && !isInternal) {
    return { ok: false, user: null, isAdmin: false, isInternal: false, response: Response.json({ error: "auth_authority_unavailable" }, { status: 503 }) };
  }
  if (!isAdmin && !isInternal) {
    return { ok: false, user, isAdmin: false, isInternal: false, response: Response.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ok: true, user, isAdmin, isInternal, response: null };
}

// Variant for user-facing functions: any AUTHENTICATED user passes; anonymous
// only with the internal secret. Ownership checks remain the caller's job.
export async function requireUserOrInternal(req: Request, base44: any, body: any = null) {
  const auth = await authenticatedUser(base44);
  const user = auth.user;
  const isInternal = isInternalCaller(req, body);
  if (!auth.available && !isInternal) {
    return { ok: false, user: null, isAdmin: false, isInternal: false, response: Response.json({ error: "auth_authority_unavailable" }, { status: 503 }) };
  }
  if (!user && !isInternal) {
    return { ok: false, user: null, isAdmin: false, isInternal: false, response: Response.json({ error: "unauthorized" }, { status: 401 }) };
  }
  return { ok: true, user, isAdmin: user?.role === "admin", isInternal, response: null };
}

// Quarantine probe with hourly dedup (SECURITY-2 Fase 4). Logs at most ONE
// OperationalLog row per function per hour — the liveness detector still
// works, anonymous spam can no longer flood the log. Records the actor class
// (anonymous / user / admin / internal) in data_json for the 2026-08-15 review.
// NEVER throws — the probe must not break or gate the function by itself.
export async function quarantineProbe(base44: any, fnName: string) {
  try {
    const message = `quarantined function '${fnName}' was invoked`;
    const last = await base44.asServiceRole.entities.OperationalLog.filter(
      { event_type: "quarantine_probe", message }, "-created_date", 1
    );
    const lastAt = last?.[0]?.created_at ? new Date(last[0].created_at).getTime() : 0;
    if (Date.now() - lastAt < 60 * 60 * 1000) return; // deduped — one per hour
    const auth = await authenticatedUser(base44);
    const user = auth.user;
    const actor = !auth.available ? "auth_unavailable" : user ? (user.role === "admin" ? "admin" : `user:${user.email}`) : "anonymous";
    await base44.asServiceRole.entities.OperationalLog.create({
      event_type: "quarantine_probe",
      message,
      data_json: { actor },
      created_at: new Date().toISOString(),
    });
  } catch (_e) { /* probe must never break the function */ }
}
