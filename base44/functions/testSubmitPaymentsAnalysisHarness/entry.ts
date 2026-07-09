// TEMPORARY — Chunk 3 verification harness. Deletes after 4-test report.
Deno.serve(async (_req) => {
  let appDomain = (Deno.env.get('APP_DOMAIN') || '').trim().replace(/\/$/, '');
  if (appDomain && !/^https?:\/\//i.test(appDomain)) appDomain = `https://${appDomain}`;
  const submitUrl = `${appDomain}/functions/submitPaymentsAnalysis`;
  const engineUrl = `${appDomain}/functions/calculatePaymentsGap`;

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

  // ── Test 1: valid payload → 200 ─────────────────────────────────────────
  const validPayload = {
    monthly_gmv_eur: 100000,
    avg_ticket_eur: 80,
    intl_pct: 10,
    provider_slug: 'stripe',
    country: 'ES',
    card_mix_debit_pct: 40,
  };
  const test1 = await callSubmit(validPayload);

  // ── Test 2: invalid GMV=100 → 400 with field named ──────────────────────
  const test2 = await callSubmit({ ...validPayload, monthly_gmv_eur: 100 });

  // ── Test 3: burst of 11 — count how many 200s vs 429s ──────────────────
  // Use a distinct provider payload to avoid contaminating persisted sessions
  // from test 1's slot. Same IP → same rate-limit bucket.
  const burstPayload = { ...validPayload, provider_slug: 'paypal' };
  const burstResults: any[] = [];
  for (let i = 0; i < 11; i++) {
    const r = await callSubmit(burstPayload);
    burstResults.push({ i: i + 1, status: r.status, body_error: r.body?.error, retry_after: r.body?.retry_after_seconds });
  }
  const first429Index = burstResults.findIndex(x => x.status === 429);

  // ── Test 4: engine still 403 without header ─────────────────────────────
  const test4 = await (async () => {
    const r = await fetch(engineUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });
    const text = await r.text();
    let parsed: any = null; try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { status: r.status, body: parsed };
  })();

  return Response.json({
    test_1_valid: test1,
    test_2_invalid_gmv_100: test2,
    test_3_burst_11: {
      total_calls: burstResults.length,
      first_429_at: first429Index === -1 ? null : first429Index + 1,
      per_call: burstResults,
    },
    test_4_engine_no_header: test4,
  });
});