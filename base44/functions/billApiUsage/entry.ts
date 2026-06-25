// Scheduled job — invoices each organization's API overage for the previous month.
// Runs on the 1st of every month at 02:00. Admin-only.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    // Previous month bucket
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const periodMonth = prev.toISOString().slice(0, 7);

    const records = await base44.asServiceRole.entities.ApiUsageRecord.filter({ period_month: periodMonth, billed: false });
    const billable = records.filter((r) => (r.overage_amount_eur || 0) > 0);

    const results = [];
    for (const rec of billable) {
      const org = await base44.asServiceRole.entities.Organization.get(rec.organization_id).catch(() => null);
      if (!org) {
        results.push({ id: rec.id, status: "skipped_no_org" });
        continue;
      }

      // Create an invoice record (Stripe invoicing handled separately by reconcileInvoice / payments flow)
      const invoice = await base44.asServiceRole.entities.Invoice.create({
        status: "issued",
        currency: "EUR",
        issued_at: new Date().toISOString(),
        due_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        subtotal_amount: rec.overage_amount_eur,
        total_amount: rec.overage_amount_eur,
        balance_due: rec.overage_amount_eur,
        notes: `API overage · ${periodMonth} · ${rec.overage_count} requests above quota`,
        billing_snapshot_json: {
          organization_id: org.id,
          organization_name: org.name,
          period_month: periodMonth,
          included_quota: rec.included_quota,
          total_requests: rec.request_count,
          overage_count: rec.overage_count,
          overage_amount_eur: rec.overage_amount_eur,
        },
      }).catch(() => null);

      await base44.asServiceRole.entities.ApiUsageRecord.update(rec.id, {
        billed: true,
        billed_at: new Date().toISOString(),
      });

      results.push({ id: rec.id, organization: org.name, amount_eur: rec.overage_amount_eur, invoice_id: invoice?.id });
    }

    return Response.json({ period_month: periodMonth, invoiced: results.length, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});