import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function pad(n, w=5) { return String(n).padStart(w, '0'); }

async function getReport(base44, report_id) {
  const rows = await base44.asServiceRole.entities.MonthlySavingsReport.filter({ id: report_id }, '-created_date', 1);
  return rows?.[0] || null;
}

async function getBillingRule(base44, report) {
  // Prefer deal_activation_id match, fallback to brand/provider active
  const q = report.deal_activation_id ? { deal_activation_id: report.deal_activation_id, status: 'active' } : { brand_id: report.brand_id, provider_id: report.provider_id, status: 'active' };
  const rules = await base44.asServiceRole.entities.BillingRule.filter(q, '-effective_start_date', 1);
  return rules?.[0] || null;
}

async function nextSequence(base44, series) {
  const prev = await base44.asServiceRole.entities.Invoice.filter({ series }, '-sequence', 1);
  const seq = (prev?.[0]?.sequence || 0) + 1;
  return seq;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { report_id, issue = true, due_in_days = 14, series } = body || {};
    if (!report_id) return Response.json({ error: 'report_id is required' }, { status: 400 });

    const report = await getReport(base44, report_id);
    if (!report) return Response.json({ error: 'Report not found' }, { status: 404 });

    // Determine fee (prefer report.node_fee). If missing, compute from rule or error.
    let currency = report.currency || 'EUR';
    let fee = Number(report.node_fee || 0);
    if (!fee || fee <= 0) {
      const rule = await getBillingRule(base44, report);
      if (!rule) return Response.json({ error: 'No BillingRule found and report.node_fee is 0' }, { status: 400 });
      const pct = Number(rule.node_share_percent || 25) / 100;
      const minFee = Number(rule.min_fee || 0);
      const capFee = Number(rule.cap_fee || Infinity);
      const computed = Number(report.savings || 0) * pct;
      fee = Math.max(minFee, Math.min(capFee, computed));
      currency = rule.currency || currency || 'EUR';
    }

    const now = new Date();
    const due = new Date(now.getTime() + due_in_days * 86400000);
    const year = now.getFullYear();
    const seriesCode = series || `INV-${year}`;
    const sequence = await nextSequence(base44, seriesCode);
    const invoice_number = `${seriesCode}-${pad(sequence)}`;

    const subtotal = Math.round(fee * 100) / 100;
    const tax = 0; // extend later
    const total = subtotal + tax;

    const inv = await base44.asServiceRole.entities.Invoice.create({
      monthly_savings_report_id: report.id,
      deal_activation_id: report.deal_activation_id || null,
      brand_id: report.brand_id || null,
      provider_id: report.provider_id || null,
      month: report.month || null,
      currency,
      subtotal_amount: subtotal,
      tax_amount: tax,
      total_amount: total,
      amount_paid: 0,
      balance_due: total,
      series: seriesCode,
      sequence,
      invoice_number,
      status: issue ? 'issued' : 'draft',
      issued_at: issue ? now.toISOString() : null,
      due_at: issue ? due.toISOString() : null,
      billing_snapshot_json: { source: 'report', report_id: report.id }
    });

    await base44.asServiceRole.entities.PaymentEvent.create({
      invoice_id: inv.id,
      brand_id: inv.brand_id || null,
      amount: total,
      currency,
      event_type: 'invoice_issued',
      occurred_at: new Date().toISOString(),
      metadata_json: { report_id: report.id, invoice_number }
    });

    return Response.json({ invoice: inv });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});