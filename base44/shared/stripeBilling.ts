// stripeBilling — RECOVER-2 (2026-08-03).
//
// SINGLE source of truth for reaching CAMBRA's OWN Stripe billing account
// (acct_1TqFifJw0ka9dDf4, "CAMBRA GLOBAL", FR/EUR). Every function that calls
// Stripe for Recover Margin resolves its key through here — never by reading
// Deno.env directly, so a mode can never be assumed by accident.
//
// ══════════════════════════════════════════════════════════════════════════
// THE TWO STRIPE RELATIONSHIPS — NEVER MIXED (RECOVER-2 §4)
//   A. MERCHANT's Stripe, read-only OAuth (stripeOAuthConnect /
//      StripeConnection / ConsentRecord): used to READ their fees and verify
//      the baseline. It can NEVER be used to charge CAMBRA's fees.
//   B. CAMBRA's own account (THIS module): Customers, SetupIntents, payment
//      methods, future invoices. Keys: STRIPE_SECRET_KEY (live) /
//      STRIPE_TEST_SECRET_KEY (test).
// No token, account id, customer id, webhook secret or key crosses between
// the two. Anything in this module belongs to B, by construction.
// ══════════════════════════════════════════════════════════════════════════
//
// Mode is EXPLICIT everywhere: 'test' | 'live'. There is no default — a caller
// that forgets to pass one gets an error instead of silently touching live.

export const CAMBRA_BILLING_ACCOUNT_ID = 'acct_1TqFifJw0ka9dDf4';

export type StripeMode = 'test' | 'live';

const SECRET_KEY_ENV: Record<StripeMode, string> = {
  test: 'STRIPE_TEST_SECRET_KEY',
  live: 'STRIPE_SECRET_KEY',
};

const PUBLISHABLE_KEY_ENV: Record<StripeMode, string> = {
  test: 'STRIPE_TEST_PUBLISHABLE_KEY',
  live: 'STRIPE_PUBLISHABLE_KEY',
};

// NOTE: webhook signing secrets are PER MODE and never shared, but they are
// deliberately NOT read in this module. They do not exist yet (the endpoint is
// registered in Stripe AFTER we expose its URL), and referencing them here
// would make every importer un-runnable until then. They live in
// shared/stripeWebhookSecret.ts, imported only by the webhook handler.

export function normalizeMode(mode: unknown): StripeMode {
  if (mode === 'test' || mode === 'live') return mode;
  throw new Error('stripe_mode_required: pass "test" or "live" explicitly');
}

/** Secret key for the given mode. Throws when unset or when the prefix
 *  contradicts the requested mode (a live key under the test name, etc.). */
export function getSecretKey(mode: StripeMode): string {
  const envName = SECRET_KEY_ENV[mode];
  const key = Deno.env.get(envName) || '';
  if (!key) throw new Error(`stripe_key_missing: ${envName} is not configured`);
  const expectedPrefix = mode === 'test' ? 'sk_test_' : 'sk_live_';
  if (!key.startsWith(expectedPrefix)) {
    throw new Error(`stripe_key_mode_mismatch: ${envName} does not start with ${expectedPrefix}`);
  }
  return key;
}

export function getPublishableKey(mode: StripeMode): string {
  const envName = PUBLISHABLE_KEY_ENV[mode];
  const key = Deno.env.get(envName) || '';
  if (!key) throw new Error(`stripe_key_missing: ${envName} is not configured`);
  const expectedPrefix = mode === 'test' ? 'pk_test_' : 'pk_live_';
  if (!key.startsWith(expectedPrefix)) {
    throw new Error(`stripe_key_mode_mismatch: ${envName} does not start with ${expectedPrefix}`);
  }
  return key;
}

/** Raw Stripe REST call against CAMBRA's billing account.
 *  form-encoded in, JSON out. `idempotencyKey` is passed through to Stripe. */
export async function stripeRequest(
  mode: StripeMode,
  method: 'GET' | 'POST',
  path: string,
  params: Record<string, string> | null = null,
  idempotencyKey: string | null = null,
): Promise<{ ok: boolean; status: number; data: any }> {
  const key = getSecretKey(mode);
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  let url = `https://api.stripe.com/v1/${path.replace(/^\//, '')}`;
  let body: string | undefined;

  if (params && method === 'POST') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(params).toString();
  } else if (params && method === 'GET') {
    url += `?${new URLSearchParams(params).toString()}`;
  }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const res = await fetch(url, { method, headers, body });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/** Confirms the key for `mode` really belongs to CAMBRA's billing account.
 *  The Stripe account id is identical in test and live, so this is the
 *  cheap, decisive check against "a key from some other account". */
export async function assertBillingAccount(mode: StripeMode): Promise<{ account_id: string }> {
  const { ok, status, data } = await stripeRequest(mode, 'GET', 'account');
  if (!ok) throw new Error(`stripe_account_unreachable: ${status} ${data?.error?.message || 'unknown'}`);
  if (data.id !== CAMBRA_BILLING_ACCOUNT_ID) {
    throw new Error(`stripe_wrong_account: key belongs to ${data.id} (${data.business_profile?.name || data.settings?.dashboard?.display_name || 'unnamed'}), not the CAMBRA billing account`);
  }
  return { account_id: data.id };
}