// TEMPORARY — Chunk 3 verification harness. Deletes after final report.
// Cierres 2026-07-09:
//   - Purge rate-limit bucket between test 1 and test 3 so the burst starts
//     from a clean slate (test 1 consumed 1 slot from the same IP bucket,
//     which was the source of the "429 at i=10 instead of i=11" report).
//   - Removed test 4 (engine no-header): the calculatePaymentsGap HTTP
//     endpoint was deleted; the assertion is now "route is gone" which the
//     sync-check + absence of the file already enforce.
Deno.serve(async (_req) => {
  let appDomain = (Deno.env.get('APP_DOMAIN') || '').trim().replace(/\/$/, '');
  if (appDomain && !/^https?:\/\//i.test(appDomain)) appDomain = `https://${appDomain}`;
  const submitUrl = `${appDomain}/functions/submitPaymentsAnalysis`;

  // Bring in the SDK inline (service role) so we can purge the rate-limit
  // bucket between test 1 and the burst — otherwise test 1's single call
  // pre-fills the same-IP hourly bucket and the burst rejects one call early.
  const { createClientFromRequest } = await import('npm:@base44/sdk@0.8.31');
  const base44 = createClientFromRequest(_req);

  async function purgeSubmitCounters() {
    const rows = await base44.asServiceRole.entities.RateLimitCounter.list('-created_date', 500);
    const ours = (rows || []).filter((r: any) => (r.principal_id || '').startsWith('submitPaymentsAnalysis:'));
    for (const r of ours) await base44.asServiceRole.entities.RateLimitCounter.delete(r.id);
    return ours.length;
  }

  async function callSubmit(body: any) {
    const r = await fetch(submitUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let parsed: any = null; try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { status: r.status, body: parsed };
  }

  const validPayload = {
    monthly_gmv_eur: 100000,
    avg_ticket_eur: 80,
    intl_pct: 10,
    provider_slug: 'stripe',
    country: 'ES',
    card_mix_debit_pct: 40,
  };

  // ── Test 1: valid payload → 200 ─────────────────────────────────────────
  await purgeSubmitCounters();
  const test1 = await callSubmit(validPayload);

  // ── Test 2: invalid GMV=100 → 400 with field named (no counter consumed
  //             because validation runs BEFORE the rate limiter) ───────────
  const test2 = await callSubmit({ ...validPayload, monthly_gmv_eur: 100 });

  // ── Test 3: burst of 11 from a clean bucket — 10 pass, 11th rejects ────
  await purgeSubmitCounters();
  const burstPayload = { ...validPayload, provider_slug: 'paypal' };
  const burstResults: any[] = [];
  for (let i = 0; i < 11; i++) {
    const r = await callSubmit(burstPayload);
    burstResults.push({ i: i + 1, status: r.status, body_error: r.body?.error, retry_after: r.body?.retry_after_seconds });
  }
  const first429Index = burstResults.findIndex(x => x.status === 429);

  return Response.json({
    test_1_valid: test1,
    test_2_invalid_gmv_100: test2,
    test_3_burst_11: {
      total_calls: burstResults.length,
      first_429_at: first429Index === -1 ? null : first429Index + 1,
      per_call: burstResults,
    },
  });
});