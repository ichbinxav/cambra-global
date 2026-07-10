// THROWAWAY — one-shot diagnostic. Confirms whether STRIPE_TEST_SECRET_KEY is
// a genuine sk_test_ (livemode:false) and lists any charges whose description
// matches the M3-1b seed pattern. DELETE after 1b closes.
Deno.serve(async () => {
  try {
    const key = Deno.env.get("STRIPE_TEST_SECRET_KEY");
    if (!key) return Response.json({ error: "no key" }, { status: 500 });

    const acctRes = await fetch("https://api.stripe.com/v1/account", { headers: { Authorization: `Bearer ${key}` } });
    const acct = await acctRes.json();

    // List last 30 charges — enough to see any recent siembra.
    const chargesRes = await fetch("https://api.stripe.com/v1/charges?limit=30", { headers: { Authorization: `Bearer ${key}` } });
    const charges = await chargesRes.json();

    const seedRe = /M3-1b seed/;
    const mySeeds = (charges.data || []).filter((c: any) => seedRe.test(c.description || ""));

    return Response.json({
      key_prefix: key.slice(0, 8),
      account: {
        id: acct.id,
        livemode_field: acct.livemode === undefined ? "ABSENT" : acct.livemode,
        country: acct.country,
        business_name: acct.settings?.dashboard?.display_name || null,
      },
      charges_endpoint_livemode_sample: (charges.data || []).slice(0, 3).map((c: any) => ({
        id: c.id,
        livemode: c.livemode,
        amount: c.amount,
        currency: c.currency,
        description: c.description,
        created_iso: new Date(c.created * 1000).toISOString(),
      })),
      m3_1b_seed_count: mySeeds.length,
      m3_1b_seed_ids: mySeeds.map((c: any) => c.id),
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});