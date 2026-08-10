// Admin-only safe demo data seeder. Idempotent — checks for is_demo=true brands first.
// Creates 3 fake brands, analyzer results, recommendations, deal activations, mandate,
// monthly savings report, invoice, and 3 providers. All marked is_demo=true where possible.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== "admin") {
      return Response.json({ error: "forbidden", message: "Admin only" }, { status: 403 });
    }

    const url = new URL(req.url);
    const reset = url.searchParams.get("reset") === "true";

    // Reset path — delete previous demo records
    if (reset) {
      const existing = await base44.asServiceRole.entities.Brand.filter({ is_demo: true }).catch(() => []);
      for (const b of existing) {
        await base44.asServiceRole.entities.Brand.delete(b.id).catch(() => null);
      }
    }

    // Skip if already seeded
    const existing = await base44.asServiceRole.entities.Brand.filter({ is_demo: true }).catch(() => []);
    if (existing.length >= 3) {
      return Response.json({ status: "already_seeded", count: existing.length });
    }

    const created = { brands: [], results: [], recommendations: [], activations: [], mandate: null, report: null, invoice: null, providers: [] };

    // ---- 3 Providers ----
    const providerSeeds = [
      { name: "[DEMO] FastPay PSP", category: "payments", contact_email: "demo+fastpay@example.test", revenue_share_pct: 15 },
      { name: "[DEMO] SwiftShip Logistics", category: "shipping", contact_email: "demo+swiftship@example.test", revenue_share_pct: 12 },
      { name: "[DEMO] CommerceStack SaaS", category: "saas", contact_email: "demo+stack@example.test", revenue_share_pct: 20 },
    ];
    for (const p of providerSeeds) {
      const prov = await base44.asServiceRole.entities.Provider.create(p).catch(() => null);
      if (prov) created.providers.push(prov);
    }

    // ---- 3 Brands ----
    const brandSeeds = [
      { name: "[DEMO] Lumen Apparel", category: "fashion", country: "Spain", annual_revenue: "1m_5m", contact_email: "demo+lumen@example.test", contact_name: "Demo Owner 1", channels: ["dtc", "marketplace"], is_demo: true, onboarding_complete: true },
      { name: "[DEMO] Verde Wellness", category: "wellness", country: "France", annual_revenue: "500k_1m", contact_email: "demo+verde@example.test", contact_name: "Demo Owner 2", channels: ["dtc"], is_demo: true, onboarding_complete: true },
      { name: "[DEMO] Northpine Home", category: "home", country: "Germany", annual_revenue: "5m_20m", contact_email: "demo+northpine@example.test", contact_name: "Demo Owner 3", channels: ["dtc", "wholesale", "retail"], is_demo: true, onboarding_complete: true },
    ];
    for (const b of brandSeeds) {
      const brand = await base44.asServiceRole.entities.Brand.create(b);
      created.brands.push(brand);

      // ---- AnalyzerInput + Result for each brand ----
      const inp = await base44.asServiceRole.entities.AnalyzerInput.create({
        brand_id: brand.id,
        monthly_revenue: b.annual_revenue === "5m_20m" ? 750000 : b.annual_revenue === "1m_5m" ? 200000 : 60000,
        monthly_transactions: 1500,
        avg_order_value: 95,
        payment_provider: "Stripe",
        payment_fee_pct: 2.9,
        shipping_provider: "DHL",
        monthly_shipping_cost: 6500,
        monthly_shipments: 1200,
        total_saas_spend: 2200,
        country: b.country,
        data_source: "manual",
      });

      const res = await base44.asServiceRole.entities.AnalyzerResult.create({
        brand_id: brand.id,
        input_id: inp.id,
        payment_savings: 8500 + Math.floor(Math.random() * 5000),
        shipping_savings: 6200 + Math.floor(Math.random() * 4000),
        saas_savings: 3800 + Math.floor(Math.random() * 2500),
        total_savings: 0,
        infra_score: 55 + Math.floor(Math.random() * 30),
        confidence_level: "medium",
        data_completeness_score: 60,
        methodology: "Manual input vs CAMBRA network benchmark (tier + geo aware)",
        assumptions: ["Constant monthly volume", "No seasonality applied", "EU/UK benchmark band"],
        benchmark_source: "network_internal",
        verification_status: "pending_verification",
        next_best_action: "Connect Stripe to verify payments savings",
      });
      // Compute total
      await base44.asServiceRole.entities.AnalyzerResult.update(res.id, {
        total_savings: (res.payment_savings || 0) + (res.shipping_savings || 0) + (res.saas_savings || 0),
      });
      created.results.push(res);

      // ---- Recommendation (unlock_savings) ----
      const rec = await base44.asServiceRole.entities.Recommendation.create({
        brand_id: brand.id,
        vertical: "payments",
        type: "unlock_savings",
        title: "Recover payments savings",
        description: `€${(res.payment_savings || 0).toLocaleString()}/yr estimated`,
        expected_benefit: `€${(res.payment_savings || 0).toLocaleString()}/yr`,
        action_required: "Sign authorization mandate",
        status: "active",
        effort_level: "low",
        generated_at: new Date().toISOString(),
      });
      created.recommendations.push(rec);
    }

    // ---- 2 DealActivations on first brand ----
    const firstBrand = created.brands[0];
    const act1 = await base44.asServiceRole.entities.DealActivation.create({
      brand_id: firstBrand.id,
      vertical: "payments",
      deal_name: "[DEMO] Payments optimization",
      estimated_savings_yearly: 12000,
      potential_savings_yearly: 12000,
      node_share_percent: 25,
      billing_model: "monthly_success_fee",
      status: "live",
      realization_mode: "simulated",
    });
    const act2 = await base44.asServiceRole.entities.DealActivation.create({
      brand_id: firstBrand.id,
      vertical: "shipping",
      deal_name: "[DEMO] Shipping renegotiation",
      estimated_savings_yearly: 7500,
      potential_savings_yearly: 7500,
      node_share_percent: 25,
      billing_model: "monthly_success_fee",
      status: "authorized",
      realization_mode: "simulated",
    });
    created.activations.push(act1, act2);

    // ---- 1 Mandate ----
    created.mandate = await base44.asServiceRole.entities.Mandate.create({
      deal_activation_id: act1.id,
      brand_id: firstBrand.id,
      vertical: "payments",
      scope_type: "deal_specific",
      authorized_actions_json: { renegotiate_psp: true, request_rate_card: true, switch_provider: false },
      legal_entity_name: firstBrand.name,
      signed_by_name: "Demo Owner 1",
      signed_by_email: firstBrand.contact_email,
      signed_by_role: "CEO",
      signed_at: new Date().toISOString(),
      status: "active",
      document_version: "v1.0",
    });

    // ---- 1 MonthlySavingsReport ----
    const month = new Date().toISOString().slice(0, 7);
    created.report = await base44.asServiceRole.entities.MonthlySavingsReport.create({
      deal_activation_id: act1.id,
      brand_id: firstBrand.id,
      vertical: "payments",
      month,
      measurement_source: "manual_review",
      measurement_mode: "estimated_from_partial_data",
      baseline_cost: 1000,
      actual_cost: 850,
      savings: 150,
      node_fee: 37.5,
      status: "calculated",
      verification_status: "verified",
      confidence_score: 0.82,
    });

    // ---- 1 Invoice ----
    created.invoice = await base44.asServiceRole.entities.Invoice.create({
      deal_activation_id: act1.id,
      brand_id: firstBrand.id,
      month,
      currency: "EUR",
      status: "draft",
      invoice_number: `DEMO-${Date.now()}`,
      subtotal_amount: 37.5,
      tax_amount: 7.88,
      total_amount: 45.38,
      balance_due: 45.38,
      monthly_savings_report_id: created.report.id,
      notes: "[DEMO] Auto-generated by seedDemoData",
    });

    return Response.json({
      status: "seeded",
      summary: {
        brands: created.brands.length,
        providers: created.providers.length,
        results: created.results.length,
        recommendations: created.recommendations.length,
        activations: created.activations.length,
        mandate: created.mandate ? 1 : 0,
        report: created.report ? 1 : 0,
        invoice: created.invoice ? 1 : 0,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});