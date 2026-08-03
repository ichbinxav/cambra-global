import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveFeePctForMonth } from '../../shared/billingFee.ts';

function pad(n, w=5) { return String(n).padStart(w, '0'); }

async function getReport(base44, report_id) {
  const rows = await base44.asServiceRole.entities.MonthlySavingsReport.filter({ id: report_id }, '-created_date', 1);
  return rows?.[0] || null;
}

async function getBillingRule(base44, report) {
  // Prefer deal_activation_id match; fallback to brand+provider_id only if ambos existen
  const q = report.deal_activation_id
    ? { deal_activation_id: report.deal_activation_id, status: 'active' }
    : (report.brand_id && report.provider_id
      ? { brand_id: report.brand_id, provider_id: report.provider_id, status: 'active' }
      : { deal_activation_id: '__no_match__' });
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
    if (!report.provider_id) console.warn('generateInvoiceFromReport: report missing provider_id', { report_id });
    if (!report.deal_activation_id) console.warn('generateInvoiceFromReport: report missing deal_activation_id', { report_id });

    // Determine fee (prefer report.node_fee). If missing, compute from rule or error.
    //
    // REFERRAL-2 T4 (2026-08-03) — the APPLIED PERCENTAGE and its origin are now
    // recorded, not just the amount. report.node_fee is computed by
    // generateMonthlySavingsReport from the BillingRule effective for the
    // report's month (shared/billingFee.ts), so a referral discount already
    // reaches the invoice through it; we surface which percentage that was so a
    // merchant asking "why 15%?" can be answered from the invoice itself.
    let currency = report.currency || 'EUR';
    let fee = Number(report.node_fee || 0);
    const savings = Number(report.savings || 0);
    let feePct = Number(report.supporting_snapshot_json?.fee_pct ?? NaN);
    let feeSource = report.supporting_snapshot_json?.fee_pct != null ? 'report_snapshot' : null;
    let billingRuleId = report.supporting_snapshot_json?.billing_rule_id || null;

    if (!fee || fee <= 0) {
      // REFERRAL-2 — this fallback used to pick the newest active rule with no
      // regard for dates, so a discount scheduled for September would have been
      // applied retroactively to an August invoice. It now resolves the rule
      // EFFECTIVE FOR THE REPORT'S MONTH, exactly like the report itself.
      const resolved = report.month
        ? await resolveFeePctForMonth(base44.asServiceRole, {
            deal_activation_id: report.deal_activation_id || null,
            brand_id: report.brand_id || null,
            provider_id: report.provider_id || null,
            fallbackPct: null,
          }, report.month)
        : { pct: null, rule_id: null, source: null };

      const rule = resolved.rule_id
        ? (await base44.asServiceRole.entities.BillingRule.filter({ id: resolved.rule_id }, '-created_date', 1))?.[0]
        : await getBillingRule(base44, report);
      if (!rule) return Response.json({ error: 'No BillingRule found and report.node_fee is 0' }, { status: 400 });
      const pctNum = Number(resolved.pct ?? rule.node_share_percent ?? 25);
      const minFee = Number(rule.min_fee || 0);
      const capFee = Number(rule.cap_fee || Infinity);
      const computed = savings * (pctNum / 100);
      fee = Math.max(minFee, Math.min(capFee, computed));
      currency = rule.currency || currency || 'EUR';
      feePct = pctNum;
      feeSource = 'billing_rule';
      billingRuleId = rule.id || null;
    } else if (!Number.isFinite(feePct)) {
      // Legacy reports carry no fee_pct in their snapshot — derive it.
      feePct = savings > 0 ? Number(((fee / savings) * 100).toFixed(2)) : 25;
      feeSource = 'derived_from_report';
    }

    // activated_count AT ISSUE TIME — the audit trail for the discount.
    let referral = null;
    try {
      const brand = report.brand_id
        ? (await base44.asServiceRole.entities.Brand.filter({ id: report.brand_id }, '-created_date', 1))?.[0]
        : null;
      const ownerEmail = brand?.contact_email || brand?.created_by || null;
      const link = ownerEmail
        ? (await base44.asServiceRole.entities.ReferralLink.filter({ owner_email: ownerEmail }, 'created_date', 1))?.[0]
        : null;
      if (link) referral = { code: link.code, activated_count: Number(link.activated_count) || 0 };
    } catch (_e) { /* audit metadata only — never blocks invoicing */ }

    const now = new Date();
    const due = new Date(now.getTime() + due_in_days * 86400000);
    const year = now.getFullYear();
    const seriesCode = series || `INV-${year}`;
    const sequence = await nextSequence(base44, seriesCode);
    const invoice_number = `${seriesCode}-${pad(sequence)}`;

    const subtotal = Math.round(fee * 100) / 100;
    const tax = 0; // extend later
    const total = subtotal + tax;

    // canonical-only amounts (no legacy 'amount')
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
      billing_snapshot_json: {
        source: 'report',
        report_id: report.id,
        month: report.month || null,
        savings,
        fee_amount: subtotal,
        fee_pct: Number.isFinite(feePct) ? feePct : null,
        fee_source: feeSource,
        billing_rule_id: billingRuleId,
        referral,
        issued_at: now.toISOString(),
      }
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

    if (issue && report?.id) {
      await base44.asServiceRole.entities.MonthlySavingsReport.update(report.id, { status: 'invoiced' });
    }

    return Response.json({ invoice: inv });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});