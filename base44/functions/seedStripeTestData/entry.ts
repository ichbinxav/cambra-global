// THROWAWAY — M3-1b seed harness. DELETE after empirical verification closes.
// Seeds deterministic Stripe test-mode charges + 2 refunds so the sync engine
// can be validated against KNOWN ground truth (not just an opaque aggregate).
//
// Seed plan (all EUR):
//   10 domestic FR charges — 3×€25, 4×€80, 3×€250
//    1 intl US charge      — €100
//    1 intl GB charge      — €50
//    1 FULL refund on one €80 charge      → tests net-volume denominator
//    1 PARTIAL €50 refund on one €250     → tests partial-refund netting
//
// Expected gross: 10×domestic + 100 + 50 = 3×25 + 4×80 + 3×250 + 100 + 50
//               = 75 + 320 + 750 + 150 = 1295 EUR
// Expected refunds: 80 (full) + 50 (partial) = 130 EUR
// Expected NET volume (denominator): 1295 - 130 = 1165 EUR

Deno.serve(async (req) => {
  try {
    const testKey = Deno.env.get("STRIPE_TEST_SECRET_KEY");
    if (!testKey) return Response.json({ error: "STRIPE_TEST_SECRET_KEY missing" }, { status: 500 });

    async function stripePost(path: string, params: Record<string, string>) {
      const body = new URLSearchParams(params).toString();
      const res = await fetch(`https://api.stripe.com/v1/${path}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${testKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(`${path} failed: ${JSON.stringify(json).slice(0, 300)}`);
      return json;
    }

    // Confirm we're on a TEST account before mutating anything.
    const acctRes = await fetch("https://api.stripe.com/v1/account", {
      headers: { "Authorization": `Bearer ${testKey}` },
    });
    const acct = await acctRes.json();
    if (!acctRes.ok || acct.livemode !== false) {
      return Response.json({ error: "test key does not resolve to a test account", acct }, { status: 500 });
    }

    const seedPlan = [
      { pm: "pm_card_visa", amount: 2500,  label: "dom-25a" },
      { pm: "pm_card_visa", amount: 2500,  label: "dom-25b" },
      { pm: "pm_card_visa", amount: 2500,  label: "dom-25c" },
      { pm: "pm_card_visa", amount: 8000,  label: "dom-80a" },
      { pm: "pm_card_visa", amount: 8000,  label: "dom-80b-FULLREFUND" },
      { pm: "pm_card_visa", amount: 8000,  label: "dom-80c" },
      { pm: "pm_card_visa", amount: 8000,  label: "dom-80d" },
      { pm: "pm_card_visa", amount: 25000, label: "dom-250a-PARTREFUND50" },
      { pm: "pm_card_visa", amount: 25000, label: "dom-250b" },
      { pm: "pm_card_visa", amount: 25000, label: "dom-250c" },
      { pm: "pm_card_us",   amount: 10000, label: "intl-us-100" },
      { pm: "pm_card_gb",   amount: 5000,  label: "intl-gb-50"  },
    ];

    const created: any[] = [];
    for (const item of seedPlan) {
      const pi = await stripePost("payment_intents", {
        amount: String(item.amount),
        currency: "eur",
        payment_method: item.pm,
        confirm: "true",
        "automatic_payment_methods[enabled]": "true",
        "automatic_payment_methods[allow_redirects]": "never",
        description: `M3-1b seed ${item.label}`,
      });
      created.push({
        label: item.label,
        amount: item.amount,
        pi_id: pi.id,
        charge_id: pi.latest_charge,
        status: pi.status,
      });
    }

    const toRefundFull = created.find((c) => c.label === "dom-80b-FULLREFUND")!;
    const toRefundPartial = created.find((c) => c.label === "dom-250a-PARTREFUND50")!;
    const refundFull = await stripePost("refunds", { charge: toRefundFull.charge_id });
    const refundPartial = await stripePost("refunds", { charge: toRefundPartial.charge_id, amount: "5000" });

    return Response.json({
      ok: true,
      acct: { id: acct.id, livemode: acct.livemode, country: acct.country },
      seeded_count: created.length,
      charges: created,
      refunds: [
        { label: "dom-80b full refund", refund_id: refundFull.id, amount: refundFull.amount, status: refundFull.status },
        { label: "dom-250a partial refund €50", refund_id: refundPartial.id, amount: refundPartial.amount, status: refundPartial.status },
      ],
      expected: {
        gross_eur: 1295,
        refunds_eur: 130,
        net_eur: 1165,
        charge_count: 12,
        refund_count: 2,
        intl_gross_eur: 150,   // 100 US + 50 GB
        intl_share_of_net_pct: (150 / 1165) * 100, // ~12.88% (no intl was refunded)
      },
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});