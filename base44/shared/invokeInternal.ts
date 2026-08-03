// invokeInternal — RECOVER-3 (2026-08-03).
//
// There is NO queue, NO job runner and NO entity automation on this platform
// (verified 2026-08-03). "Schedule the generation" therefore means exactly one
// honest thing: POST to a sibling function without awaiting it, authenticated with
// INTERNAL_CALL_SECRET.
//
// THE LIMITATION, STATED: a serverless invocation may end before an un-awaited
// fetch completes, so this call can be LOST. That is precisely why
// contract_pdf_pending is persisted BEFORE the call and why
// retryPendingRecoverContracts exists — the fire-and-forget is an optimisation for
// the common case, never the guarantee.
//
// The target URL is derived from the CALLER's own request URL (same app, same
// deployment), so nothing here hardcodes a domain or an app id.

export function siblingFunctionUrl(req: Request, fnName: string): string {
  const url = new URL(req.url);
  const parts = url.pathname.split('/');
  parts[parts.length - 1] = fnName;
  url.pathname = parts.join('/');
  url.search = '';
  return url.toString();
}

/** Posts to a sibling function and does NOT wait for it. Never throws. */
export function fireAndForget(req: Request, fnName: string, payload: Record<string, unknown>): void {
  const secret = Deno.env.get('INTERNAL_CALL_SECRET') || '';
  if (!secret) return;
  try {
    void fetch(siblingFunctionUrl(req, fnName), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
      body: JSON.stringify({ ...payload, internal_secret: secret }),
    }).catch(() => null);
  } catch {
    /* the reconciler picks the work up */
  }
}

/** Awaited variant, for the reconciler which has time to do the work properly. */
export async function invokeInternal(
  req: Request,
  fnName: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: any }> {
  const secret = Deno.env.get('INTERNAL_CALL_SECRET') || '';
  const res = await fetch(siblingFunctionUrl(req, fnName), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
    body: JSON.stringify({ ...payload, internal_secret: secret }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}