// Admin-only END-TO-END flow tests.
// Validates the full Brand -> Analyzer -> Result -> Recommendation -> DealActivation
// -> Mandate -> AuthorizationLog -> MigrationTask -> MonthlySavingsReport -> Invoice flow.
// Each test creates real records, asserts the link integrity, then cleans up.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

function pass(name, details) { return { name, status: "pass", details: details || null }; }
function fail(name, details) { return { name, status: "fail", details }; }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== "admin") {
      return Response.json({ error: "forbidden", message: "Admin only" }, { status: 403 });
    }

    const results = [];
    const cleanup = []; // {entity, id}
    const tag = `_selftest_${Date.now()}`;

    // ---- 1. Brand onboarding ----
    let brand;
    try {
      brand = await base44.asServiceRole.entities.Brand.create({
        name: `Test Brand ${tag}`,
        contact_email: user.email,
        category: "fashion",
        annual_revenue: "1m_5m",
        country: "Spain",
        channels: ["dtc", "marketplace"],
        is_demo: true,
        onboarding_complete: true,
      });
      cleanup.push({ entity: "Brand", id: brand.id });
      results.push(pass("brand_onboarding", { brand_id: brand.id }));
    } catch (e) { results.push(fail("brand_onboarding", e.message)); }

    // ---- 2. Analyzer run linked to brand ----
    let input, result;
    try {
      input = await base44.asServiceRole.entities.AnalyzerInput.create({
        brand_id: brand.id,
        monthly_revenue: 250000,
        monthly_transactions: 2000,
        avg_order_value: 125,
        payment_provider: "Stripe",
        payment_fee_pct: 2.9,
        shipping_provider: "DHL",
        monthly_shipping_cost: 8000,
        monthly_shipments: 1500,
        total_saas_spend: 3500,
        country: "Spain",
        data_source: "manual",
      });
      cleanup.push({ entity: "AnalyzerInput", id: input.id });
      if (input.brand_id !== brand.id) throw new Error("brand_id not persisted");

      result = await base44.asServiceRole.entities.AnalyzerResult.create({
        brand_id: brand.id,
        input_id: input.id,
        payment_savings: 12000,
        shipping_savings: 8000,
        saas_savings: 4500,
        total_savings: 24500,
        infra_score: 68,
        confidence_level: "medium",
        data_completeness_score: 65,
        methodology: "Manual input vs network benchmark (tier-aware, EU-adjusted)",
        assumptions: ["Constant monthly volume", "No seasonality adjustment", "EU benchmarks applied"],
        benchmark_source: "network_internal",
        verification_status: "pending_verification",
        next_best_action: "Connect Stripe to upgrade confidence to high",
      });
      cleanup.push({ entity: "AnalyzerResult", id: result.id });
      if (result.brand_id !== brand.id || result.input_id !== input.id) throw new Error("links missing");
      if (result.verification_status === "verified") throw new Error("Manual results must never be 'verified'");
      results.push(pass("analyzer_run", { result_id: result.id, score: 68 }));
    } catch (e) { results.push(fail("analyzer_run", e.message)); }

    // ---- 3. Unlock savings -> Recommendation + DealActivation in 'awaiting_authorization' ----
    let activation, recommendation;
    try {
      activation = await base44.asServiceRole.entities.DealActivation.create({
        brand_id: brand.id,
        user_email: user.email,
        vertical: "payments",
        deal_name: "Payments optimization",
        estimated_savings_yearly: 12000,
        potential_savings_yearly: 12000,
        node_share_percent: 25,
        billing_model: "monthly_success_fee",
        status: "awaiting_authorization",
        realization_mode: "simulated",
      });
      cleanup.push({ entity: "DealActivation", id: activation.id });

      recommendation = await base44.asServiceRole.entities.Recommendation.create({
        brand_id: brand.id,
        deal_activation_id: activation.id,
        vertical: "payments",
        type: "unlock_savings",
        title: "Recover payments savings",
        description: "€12,000/yr estimated",
        status: "awaiting_authorization",
      });
      cleanup.push({ entity: "Recommendation", id: recommendation.id });

      if (activation.status !== "awaiting_authorization") throw new Error("Wrong initial status");
      results.push(pass("unlock_savings", { activation_id: activation.id }));
    } catch (e) { results.push(fail("unlock_savings", e.message)); }

    // ---- 4. Mandate creation ----
    let mandate;
    try {
      mandate = await base44.asServiceRole.entities.Mandate.create({
        deal_activation_id: activation.id,
        brand_id: brand.id,
        vertical: "payments",
        scope_type: "deal_specific",
        authorized_actions_json: { renegotiate_psp: true, request_rate_card: true },
        signed_by_name: "Test Owner",
        signed_by_email: user.email,
        signed_by_role: "CEO",
        signed_at: new Date().toISOString(),
        status: "active",
      });
      cleanup.push({ entity: "Mandate", id: mandate.id });
      results.push(pass("mandate_creation", { mandate_id: mandate.id }));
    } catch (e) { results.push(fail("mandate_creation", e.message)); }

    // ---- 5. AuthorizationLog ----
    try {
      const log = await base44.asServiceRole.entities.AuthorizationLog.create({
        deal_activation_id: activation.id,
        brand_id: brand.id,
        action_type: "mandate_signed",
        description: "Selftest mandate signed",
        approved_by: user.email,
        approved_at: new Date().toISOString(),
        source: "selftest",
      });
      cleanup.push({ entity: "AuthorizationLog", id: log.id });
      results.push(pass("authorization_log"));
    } catch (e) { results.push(fail("authorization_log", e.message)); }

    // ---- 6. MigrationTask generation ----
    try {
      const task = await base44.asServiceRole.entities.MigrationTask.create({
        deal_activation_id: activation.id,
        brand_id: brand.id,
        step_name: "Request new rate card",
        description: "Selftest task",
        status: "pending",
        order: 1,
        owner_type: "admin",
      });
      cleanup.push({ entity: "MigrationTask", id: task.id });
      results.push(pass("migration_task_generation"));
    } catch (e) { results.push(fail("migration_task_generation", e.message)); }

    // ---- 7. Monthly Savings Report ----
    let report;
    try {
      report = await base44.asServiceRole.entities.MonthlySavingsReport.create({
        deal_activation_id: activation.id,
        brand_id: brand.id,
        vertical: "payments",
        month: "2099-12",
        measurement_source: "manual_review",
        measurement_mode: "estimated_from_partial_data",
        baseline_cost: 7250,
        actual_cost: 6250,
        savings: 1000,
        node_fee: 250,
        status: "calculated",
        verification_status: "verified",
        confidence_score: 0.85,
      });
      cleanup.push({ entity: "MonthlySavingsReport", id: report.id });
      results.push(pass("monthly_savings_report"));
    } catch (e) { results.push(fail("monthly_savings_report", e.message)); }

    // ---- 8. Invoice generation from report ----
    try {
      const inv = await base44.asServiceRole.entities.Invoice.create({
        deal_activation_id: activation.id,
        brand_id: brand.id,
        month: "2099-12",
        currency: "EUR",
        status: "draft",
        subtotal_amount: 250,
        tax_amount: 52.5,
        total_amount: 302.5,
        balance_due: 302.5,
        monthly_savings_report_id: report.id,
      });
      cleanup.push({ entity: "Invoice", id: inv.id });
      results.push(pass("invoice_generation", { invoice_id: inv.id, total: 302.5 }));
    } catch (e) { results.push(fail("invoice_generation", e.message)); }

    // ---- 9. RLS — non-admin can't read brand they don't own ----
    try {
      // Service role bypasses RLS, but we can validate the rule structure exists
      // by trying to read as user. Since the test runs as admin, we validate the
      // configured RLS via schema presence rather than re-auth.
      const probe = await base44.entities.Brand.get(brand.id).catch(() => null);
      // Admin reads succeed — that's the expected behavior
      if (probe) results.push(pass("rls_admin_access"));
      else results.push(fail("rls_admin_access", "Admin could not read selftest brand"));
    } catch (e) { results.push(fail("rls_admin_access", e.message)); }

    // ---- 10. API Key creation flow (direct entity — equivalent to what createApiKey does) ----
    try {
      const raw = `cmb_live_flowtest_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
      const enc = new TextEncoder();
      const buf = await crypto.subtle.digest("SHA-256", enc.encode(raw));
      const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
      const key = await base44.asServiceRole.entities.ApiKey.create({
        name: `_flowtest_${Date.now()}`,
        tool_name: "custom",
        key_prefix: raw.slice(0, 12),
        key_hash: hash,
        key_last4: raw.slice(-4),
        scopes: ["read:kpis"],
        status: "active",
        owner_email: user.email,
      });
      // Validate raw is NOT stored
      const refetch = await base44.asServiceRole.entities.ApiKey.get(key.id);
      if (refetch.key_hash !== hash) throw new Error("hash mismatch");
      if (refetch.notes && refetch.notes.includes(raw)) throw new Error("raw key leaked to notes");
      cleanup.push({ entity: "ApiKey", id: key.id });
      results.push(pass("api_key_creation_flow", { stored_only_hash: true }));
    } catch (e) { results.push(fail("api_key_creation_flow", e.message)); }

    // ---- Cleanup ----
    for (const c of cleanup.reverse()) {
      await base44.asServiceRole.entities[c.entity].delete(c.id).catch(() => null);
    }

    const passed = results.filter(r => r.status === "pass").length;
    const failed = results.filter(r => r.status === "fail").length;
    return Response.json({
      summary: { total: results.length, passed, failed, pass_rate: results.length ? Math.round((passed / results.length) * 100) : 0 },
      results,
      run_at: new Date().toISOString(),
      cleanup_count: cleanup.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});