// invokeInternal — RECOVER-3, corrected in RECOVER-3-FIX (2026-08-03).
//
// WHAT WAS WRONG, AND HOW IT SHOWED UP: the first version derived a sibling
// function URL from the caller's own request URL and POSTed to it. That URL shape
// is not the one the platform routes on, so EVERY internal call returned 404 —
// silently. The scheduled reconciler ran on time, correctly identified the due
// rows, and then failed to start any of them (`status: 404` per job, no
// generation logs at all). Nothing surfaced because the fire-and-forget path
// deliberately swallows errors.
//
// THE FIX: use the SDK's own function invocation (base44.functions.invoke),
// which is the platform's supported function-to-function path, instead of
// reconstructing a URL. INTERNAL_CALL_SECRET is still passed in the body, because
// the callee's gate (requireAdminOrInternal) authenticates on that secret and
// must keep working when there is no user context at all.
//
// STILL TRUE: an un-awaited call can be lost when a serverless invocation ends.
// contract_pdf_pending is persisted BEFORE the call, and
// retryPendingRecoverContracts is the durable guarantee — the fire-and-forget is
// an optimisation for the common case, never the guarantee.

/** Posts to a sibling function without blocking the caller. Never throws. */
export function fireAndForget(base44: any, fnName: string, payload: Record<string, unknown>): void {
  const secret = Deno.env.get('INTERNAL_CALL_SECRET') || '';
  try {
    void Promise.resolve(
      base44.asServiceRole.functions.invoke(fnName, { ...payload, internal_secret: secret }),
    ).catch((error: unknown) => {
      console.warn(JSON.stringify({
        event: 'internal_fire_and_forget_failed_reconciler_required',
        function_name: fnName,
        error_name: error instanceof Error ? error.name : typeof error,
        observed_at: new Date().toISOString(),
      }));
    });
  } catch (error) {
    console.warn(JSON.stringify({
      event: 'internal_fire_and_forget_start_failed_reconciler_required',
      function_name: fnName,
      error_name: error instanceof Error ? error.name : typeof error,
      observed_at: new Date().toISOString(),
    }));
  }
}

/** Awaited variant, for the reconciler which has time to do the work properly. */
export async function invokeInternal(
  base44: any,
  fnName: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: any }> {
  const secret = Deno.env.get('INTERNAL_CALL_SECRET') || '';
  try {
    const res = await base44.asServiceRole.functions.invoke(fnName, { ...payload, internal_secret: secret });
    const status = Number(res?.status ?? 200);
    return { ok: status >= 200 && status < 300, status, data: res?.data ?? null };
  } catch (error: any) {
    return {
      ok: false,
      status: Number(error?.response?.status || 0),
      data: error?.response?.data ?? { error: error?.message || 'invoke_failed' },
    };
  }
}
