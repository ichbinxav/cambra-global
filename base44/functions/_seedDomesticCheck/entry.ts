// THROWAWAY — Chunk 4 domestic-branch verification.
// Seeds 2 charges with pm_card_fr + marker "M3-4-domestic-check" so we can
// verify empirically whether pm_card_fr emits card.country === "FR" in
// Stripe test-mode (open question left by the fabricated 1b report).
// Uses the same livemode guard pattern as seedStripeTestData. DELETE after
// Chunk 4 sealed.
Deno.serve(async () => {
  try {
    const testKey = Deno.env.get("STRIPE_TEST_SECRET_KEY");
    if (!testKey) return Response.json({ error: "STRIPE_TEST_SECRET_KEY missing" }, { status: 500 });

    // Livemode guard (identical rule to seedStripeTestData).
    const probeRes = await fetch("https://api.stripe.com/v1/payment_methods", {
      method: "POST",
      headers: { Authorization: `Bearer ${testKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ type: "card", "card[token]": "tok_visa" }).toString(),
    });
    const probe = await probeRes.json();
    if (!probeRes.ok || probe.livemode !== false) {
      return Response.json({ error: "REFUSING — key not TEST-mode", probe_livemode: probe.livemode ?? "ABSENT" }, { status: 403 });
    }

    async function stripePost(path: string, params: Record<string, string>) {
      const res = await fetch(`https://api.stripe.com/v1/${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${testKey}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params).toString(),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(`${path} failed: ${JSON.stringify(json).slice(0, 300)}`);
      return json;
    }

    const seedPlan = [
      { pm: "pm_card_fr", amount: 8000, label: "M3-4-domestic-check-a" },
      { pm: "pm_card_fr", amount: 12000, label: "M3-4-domestic-check-b" },
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
        description: item.label,
      });
      // Fetch the charge to see what country Stripe assigned.
      const chargeRes = await fetch(`https://api.stripe.com/v1/charges/${pi.latest_charge}`, {
        headers: { Authorization: `Bearer ${testKey}` },
      });
      const charge = await chargeRes.json();
      created.push({
        label: item.label,
        amount: item.amount,
        pi_id: pi.id,
        pi_status: pi.status,
        charge_id: pi.latest_charge,
        charge_livemode: charge.livemode,
        card_country: charge.payment_method_details?.card?.country ?? null,
        card_brand: charge.payment_method_details?.card?.brand ?? null,
        card_last4: charge.payment_method_details?.card?.last4 ?? null,
      });
    }

    return Response.json({ ok: true, seeded: created });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});