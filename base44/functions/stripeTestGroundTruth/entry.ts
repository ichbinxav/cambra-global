// stripeTestGroundTruth — admin-only, read-only diagnostic.
// Fetches raw balance_transactions from Stripe TEST mode using STRIPE_TEST_SECRET_KEY,
// paginates until exhaustion, and returns aggregate ground-truth totals so we can
// compare against what dataSyncAgent's normalizer produces for the same window.
// NEVER touches live money. NEVER writes to DB.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const key = Deno.env.get("STRIPE_TEST_SECRET_KEY");
    if (!key) return Response.json({ error: "STRIPE_TEST_SECRET_KEY not set" }, { status: 500 });

    const body = await req.json().catch(() => ({}));
    // Default window: 12 months back (same default as dataSyncAgent).
    const untilTs = body?.until_ts || Math.floor(Date.now() / 1000);
    const sinceTs = body?.since_ts || (untilTs - 365 * 24 * 60 * 60);

    // Also sanity-check the key mode and the account.
    const accountRes = await fetch("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const account = await accountRes.json();
    if (!accountRes.ok) {
      return Response.json({ error: "Stripe auth failed", detail: account }, { status: 502 });
    }

    // Paginate balance_transactions with cursor_stripe style.
    const rows = [];
    let startingAfter = null;
    let pages = 0;
    let hasMore = true;
    const MAX_PAGES = 50; // hard cap safety

    while (hasMore && pages < MAX_PAGES) {
      const params = new URLSearchParams({
        limit: "100",
        "created[gte]": String(sinceTs),
        "created[lte]": String(untilTs),
      });
      if (startingAfter) params.set("starting_after", startingAfter);
      const res = await fetch(`https://api.stripe.com/v1/balance_transactions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      const page = await res.json();
      if (!res.ok) {
        return Response.json({ error: "Stripe list failed", detail: page, page_number: pages }, { status: 502 });
      }
      const data = Array.isArray(page.data) ? page.data : [];
      rows.push(...data);
      pages++;
      hasMore = Boolean(page.has_more);
      if (hasMore && data.length) startingAfter = data[data.length - 1].id;
      else hasMore = false;
    }

    // Aggregates in cents (integer math — no float drift).
    let sumAmountCents = 0;
    let sumFeeCents = 0;
    let sumNetCents = 0;
    const byCategory = {};
    const byType = {};
    const byCurrency = {};
    const nullCategory = [];

    for (const r of rows) {
      sumAmountCents += Number(r.amount || 0);
      sumFeeCents += Number(r.fee || 0);
      sumNetCents += Number(r.net || 0);
      const cat = r.reporting_category || "__null__";
      byCategory[cat] = (byCategory[cat] || 0) + 1;
      if (!r.reporting_category) nullCategory.push({ id: r.id, type: r.type });
      byType[r.type] = (byType[r.type] || 0) + 1;
      const cur = r.currency || "__null__";
      byCurrency[cur] = (byCurrency[cur] || 0) + 1;
    }

    return Response.json({
      ok: true,
      account: {
        id: account.id,
        livemode: account.livemode,
        country: account.country,
        default_currency: account.default_currency,
      },
      window: {
        since_ts: sinceTs,
        until_ts: untilTs,
        since_iso: new Date(sinceTs * 1000).toISOString(),
        until_iso: new Date(untilTs * 1000).toISOString(),
      },
      pagination: { pages_fetched: pages, capped: pages >= MAX_PAGES },
      count: rows.length,
      totals_cents: {
        amount: sumAmountCents,
        fee: sumFeeCents,
        net: sumNetCents,
      },
      totals_major: {
        amount: sumAmountCents / 100,
        fee: sumFeeCents / 100,
        net: sumNetCents / 100,
      },
      breakdown: {
        by_reporting_category: byCategory,
        by_type: byType,
        by_currency: byCurrency,
      },
      null_reporting_category_sample: nullCategory.slice(0, 5),
      // FULL row dump — every txn with provenance fields so we can trace
      // where each amount came from (manual dashboard payment, CLI trigger,
      // fixture, webhook replay, etc). `source` is the id of the object that
      // produced this balance_transaction (ch_..., pi_..., py_..., etc).
      all_rows: rows.map(r => ({
        id: r.id,
        type: r.type,
        reporting_category: r.reporting_category,
        amount: r.amount,
        amount_major: r.amount / 100,
        fee: r.fee,
        net: r.net,
        currency: r.currency,
        created: new Date(r.created * 1000).toISOString(),
        description: r.description,
        source: r.source,             // e.g. "ch_3TqtLr..." — the object producing this txn
        status: r.status,
        available_on: r.available_on ? new Date(r.available_on * 1000).toISOString() : null,
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});