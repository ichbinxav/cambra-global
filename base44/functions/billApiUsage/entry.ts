// billApiUsage — invoices each organization's API overage for the previous
// month. Runs on the 1st of every month at 02:00 via scheduled automation.
//
// SECURITY-2 (2026-07-24):
//   · Canonical trust gate (admin OR INTERNAL_CALL_SECRET) replacing the
//     inverted pattern that let anonymous callers trigger billing runs.
//   · Double-run protection: each record is CLAIMED with a billing_run_id
//     BEFORE invoicing; records already claimed by another run are skipped.
//   · `billed: true` is set ONLY after the Invoice creation is confirmed —
//     the old `.catch(() => null)` silently swallowed invoice failures while
//     still marking the record billed (revenue silently lost).
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { requireAdminOrInternal } from "../../shared/internalGate.ts";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;

    // Previous month bucket
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const periodMonth = prev.toISOString().slice(0, 7);
    const runId = `run_${periodMonth}_${crypto.randomUUID().slice(0, 8)}`;

    const records = await base44.asServiceRole.entities.ApiUsageRecord.filter({ period_month: periodMonth, billed: false });
    const billable = records.filter((r) => (r.overage_amount_eur || 0) > 0);

    const results = [];
    const errors = [];
    for (const rec of billable) {
      // ── Claim before billing (double-execution protection) ──
      // Re-read the record: another concurrent run may have claimed it
      // between our initial filter and now.
      const fresh = await base44.asServiceRole.entities.ApiUsageRecord.get(rec.id).catch(() => null);
      if (!fresh || fresh.billed || (fresh.billing_run_id && fresh.billing_run_id !== runId)) {
        results.push({ id: rec.id, status: "skipped_claimed_elsewhere" });
        continue;
      }
      await base44.asServiceRole.entities.ApiUsageRecord.update(rec.id, { billing_run_id: runId });

      const org = await base44.asServiceRole.entities.Organization.get(rec.organization_id).catch(() => null);
      if (!org) {
        results.push({ id: rec.id, status: "skipped_no_org" });
        continue;
      }

      // Create the invoice — NO silent catch. If this fails, the record
      // stays billed:false (with the claim released) and the error is reported.
      let invoice = null;
      try {
        invoice = await base44.asServiceRole.entities.Invoice.create({
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
        });
      } catch (invErr) {
        // Release the claim so the next run retries this record.
        await base44.asServiceRole.entities.ApiUsageRecord.update(rec.id, { billing_run_id: null }).catch(() => null);
        errors.push({ id: rec.id, organization: org.name, error: invErr.message });
        results.push({ id: rec.id, status: "invoice_creation_failed", error: invErr.message });
        continue;
      }

      // billed:true ONLY after the invoice exists.
      await base44.asServiceRole.entities.ApiUsageRecord.update(rec.id, {
        billed: true,
        billed_at: new Date().toISOString(),
      });

      results.push({ id: rec.id, organization: org.name, amount_eur: rec.overage_amount_eur, invoice_id: invoice.id, status: "invoiced" });
    }

    if (errors.length) console.error("billApiUsage — invoice creation failures:", JSON.stringify(errors));

    return Response.json({ period_month: periodMonth, run_id: runId, invoiced: results.filter(r => r.status === "invoiced").length, failed: errors.length, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});