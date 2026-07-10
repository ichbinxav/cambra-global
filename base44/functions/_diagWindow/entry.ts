// THROWAWAY — inspects the exact 90d rolling window that computeStripeVerifiedGap uses.
// Reports: total charges in window, seed marker distribution, card.country distribution,
// and the presence of pm_card_fr-created charges. DELETE after Chunk 4 sealing.
Deno.serve(async () => {
  try {
    const key = Deno.env.get("STRIPE_TEST_SECRET_KEY");
    if (!key) return Response.json({ error: "no key" }, { status: 500 });

    const nowSec = Math.floor(Date.now() / 1000);
    const fromSec = nowSec - 90 * 24 * 3600;

    // Paginate charges within window
    const all: any[] = [];
    let starting_after: string | undefined;
    let pages = 0;
    while (pages < 10) {
      const url = new URL("https://api.stripe.com/v1/charges");
      url.searchParams.set("limit", "100");
      url.searchParams.set("created[gte]", String(fromSec));
      url.searchParams.set("created[lte]", String(nowSec));
      if (starting_after) url.searchParams.set("starting_after", starting_after);
      const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${key}` } });
      const j = await r.json();
      if (!j.data) break;
      all.push(...j.data);
      pages++;
      if (!j.has_more) break;
      starting_after = j.data[j.data.length - 1]?.id;
    }

    const seedRe = /M3-1b seed/;
    const seedCharges = all.filter((c) => seedRe.test(c.description || ""));

    const countryCounts: Record<string, number> = {};
    const succeededOnly = all.filter((c) => c.status === "succeeded");
    for (const c of succeededOnly) {
      const country = c.payment_method_details?.card?.country ?? "NULL";
      countryCounts[country] = (countryCounts[country] || 0) + 1;
    }

    // Look specifically at pm_card_fr seed markers to answer: does pm_card_fr emit country: FR?
    const frSeedCandidates = seedCharges
      .filter((c) => /pm_card_fr|dom-fr|FR-card/i.test(c.description || ""))
      .slice(0, 5)
      .map((c) => ({
        id: c.id,
        description: c.description,
        created_iso: new Date(c.created * 1000).toISOString(),
        card_country: c.payment_method_details?.card?.country ?? null,
        card_brand: c.payment_method_details?.card?.brand ?? null,
        status: c.status,
      }));

    return Response.json({
      window: {
        from_iso: new Date(fromSec * 1000).toISOString(),
        to_iso: new Date(nowSec * 1000).toISOString(),
      },
      pages_fetched: pages,
      total_charges_in_window: all.length,
      succeeded_charges_in_window: succeededOnly.length,
      seed_charges_count: seedCharges.length,
      seed_samples: seedCharges.slice(0, 6).map((c) => ({
        id: c.id,
        description: c.description,
        card_country: c.payment_method_details?.card?.country ?? null,
        status: c.status,
        created_iso: new Date(c.created * 1000).toISOString(),
      })),
      country_distribution_over_succeeded: countryCounts,
      fr_seed_candidates: frSeedCandidates,
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});