// AUDIT F1 (2026-08-17): the nine reads used to swallow into `[]` via safeBestEffort with
// `severity:'secondary'`. That turned a failed Invoice or ProviderRevenueLedger read into
// merchantCollected=0 / providerPaid=0 and the response still declared `ok:true` with a
// `truth_boundary` claiming figures were "evidenced and reconciled payment only". Rewritten
// to route every read through readRuntimeRows and demote every metric whose source is not
// COMPLETE to null — the founder sees "—" instead of a currency-formatted zero.
import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { readRuntimeRows, runtimeSourceCoverage } from '../../shared/runtimeSourceRead.ts';

const sum = (a: any[], f: string) => a.reduce((x: number, y: any) => x + Number(y[f] || 0), 0);

Deno.serve(async (req) => {
  try {
    const b = createClientFromRequest(req);
    const u = await b.auth.me().catch((error: any) =>
      safeBestEffort(error, { operation: 'getFinancialControlTower', fallback: null, severity: 'secondary' }));
    if (!u || u.role !== 'admin') return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    const s = b.asServiceRole;

    const [life, reports, invoices, events, incidents, approvals, pilots, providerLedger, providerInvoices] = await Promise.all([
      readRuntimeRows({ source: 'revenue_lifecycle', read: () => s.entities.RevenueLifecycle.list('-updated_at', 3000), limit: 3000 }),
      readRuntimeRows({ source: 'monthly_savings_report', read: () => s.entities.MonthlySavingsReport.list('-month', 3000), limit: 3000 }),
      readRuntimeRows({ source: 'invoice', read: () => s.entities.Invoice.list('-issued_at', 3000), limit: 3000 }),
      readRuntimeRows({ source: 'payment_event', read: () => s.entities.PaymentEvent.list('-occurred_at', 5000), limit: 5000 }),
      readRuntimeRows({ source: 'autonomy_incident', read: () => s.entities.AutonomyIncident.filter({ status: 'open' }, '-last_seen_at', 500), limit: 500 }),
      readRuntimeRows({ source: 'approval', read: () => s.entities.Approval.filter({ status: 'pending' }, '-created_date', 500), limit: 500 }),
      readRuntimeRows({ source: 'pilot_merchant_validation', read: () => s.entities.PilotMerchantValidation.list('-started_at', 100), limit: 100 }),
      readRuntimeRows({ source: 'provider_revenue_ledger', read: () => s.entities.ProviderRevenueLedger.list('-updated_at', 5000), limit: 5000 }),
      readRuntimeRows({ source: 'provider_revenue_invoice', read: () => s.entities.ProviderRevenueInvoice.list('-updated_at', 2000), limit: 2000 }),
    ]);

    const coverage = runtimeSourceCoverage({
      RevenueLifecycle: life, MonthlySavingsReport: reports, Invoice: invoices,
      PaymentEvent: events, AutonomyIncident: incidents, Approval: approvals,
      PilotMerchantValidation: pilots, ProviderRevenueLedger: providerLedger,
      ProviderRevenueInvoice: providerInvoices,
    });

    // A metric is only reportable when every source it depends on is COMPLETE.
    // A degraded source demotes each dependent figure to null — the caller (AdminFinance.jsx)
    // renders "—", never a zero denominated in currency.
    const isComplete = (r: any) => r.status === 'COMPLETE';
    const requires = (deps: any[]) => deps.every(isComplete);
    const nn = (deps: any[], compute: () => number) => (requires(deps) ? compute() : null);

    const invRows = invoices.value, ledgerRows = providerLedger.value, provInvRows = providerInvoices.value;
    const reportRows = reports.value, lifeRows = life.value;
    // Pinned identifiers (do not reformat — finalRevenueEngineSeal.test.js pins these substrings):
    // measurement_mode==='fully_verified' and verification_status==='realized'.
    const verified = reportRows.filter((r: any) => r.measurement_mode==='fully_verified' && r.verification_status==='realized');
    const billable = reportRows.filter((r: any) => ['eligible', 'invoiced'].includes(r.billing_eligibility_status));
    const paid = invRows.filter((i: any) => i.status === 'paid');
    const open = invRows.filter((i: any) => ['issued', 'sent', 'due', 'overdue', 'partially_paid'].includes(i.status));

    const merchantCollected = nn([invoices], () => sum(invRows, 'amount_paid'));
    const providerExpected = nn([providerLedger], () => sum(ledgerRows, 'expected_amount_minor') / 100);
    const providerAccrued = nn([providerLedger], () => sum(ledgerRows, 'accrued_amount_minor') / 100);
    const providerPaid = nn([providerLedger], () => sum(ledgerRows.filter((x: any) => x.state === 'paid'), 'paid_amount_minor') / 100);
    const outstandingCash = nn([invoices], () =>
      open.reduce((a: number, i: any) => a + Math.max(0, Number(i.total_amount || 0) - Number(i.amount_paid || 0)), 0));
    const providerOutstanding = nn([providerInvoices], () =>
      provInvRows.filter((x: any) => ['issued', 'payment_pending', 'partially_paid', 'disputed'].includes(x.status))
        .reduce((a: number, x: any) => a + Math.max(0, Number(x.amount_minor || 0) - Number(x.paid_amount_minor || 0)), 0) / 100);

    return Response.json({
      ok: true,
      generated_at: new Date().toISOString(),
      data_complete: coverage.complete,
      degraded_sources: coverage.blockers,
      sources: coverage.sources,
      metrics: {
        estimated_savings: nn([life], () => sum(lifeRows, 'estimated_savings')),
        verified_savings: nn([reports], () => sum(verified, 'savings')),
        billable_savings: nn([reports], () => sum(billable, 'billable_savings_amount')),
        merchant_side_invoiced_revenue: nn([invoices], () => sum(invRows, 'total_amount')),
        merchant_side_collected_revenue: merchantCollected,
        provider_side_expected_revenue: providerExpected,
        provider_side_accrued_revenue: providerAccrued,
        provider_side_collected_revenue: providerPaid,
        total_cambra_collected_revenue: (merchantCollected == null || providerPaid == null) ? null : merchantCollected + providerPaid,
        invoiced_revenue: nn([invoices], () => sum(invRows, 'total_amount')),
        collected_cash: merchantCollected,
        outstanding_cash: outstandingCash,
        provider_outstanding_revenue: providerOutstanding,
        paid_invoices: isComplete(invoices) ? paid.length : null,
        open_invoices: isComplete(invoices) ? open.length : null,
        disputed_cash: nn([invoices], () => sum(invRows.filter((i: any) => i.status === 'disputed'), 'balance_due')),
        failed_cash: nn([invoices], () => sum(invRows.filter((i: any) => i.status === 'failed'), 'balance_due')),
        pending_approvals: isComplete(approvals) ? approvals.value.length : null,
        open_incidents: isComplete(incidents) ? incidents.value.length : null,
        pilot_merchants: isComplete(pilots) ? pilots.value.filter((p: any) => p.mode === 'pilot' && p.status !== 'excluded').length : null,
      },
      forecast: {
        methodology: 'evidence_bounded_dual_sided',
        days_30: {
          merchant_expected_cash: outstandingCash,
          provider_expected_cash: providerOutstanding,
          confidence: (isComplete(invoices) && isComplete(providerInvoices) && (open.length || provInvRows.length)) ? 0.8 : 0,
        },
        days_90: {
          merchant_expected_cash: (outstandingCash == null || !isComplete(reports)) ? null :
            outstandingCash + billable.filter((r: any) => !r.invoice_id).reduce((a: number, r: any) => a + Number(r.fee_net_amount || 0), 0),
          provider_expected_cash: providerOutstanding,
          confidence: 0.65,
        },
        months_12: { expected_cash:null, merchant_side: null, provider_side: null, confidence: 0, reason: 'insufficient_real_merchant_and_provider_settlement_history_for_defensible_12m_forecast' },
        months_36: { expected_cash:null, confidence: 0, reason: 'requires_real_retention_tier_and_provider_payment_history' },
      },
      accounting_revenue: { value: null, reason: 'requires_formal_accounting_recognition_policy; merchant invoices and provider settlements remain separate' },
      revenue_states: isComplete(life) ? Object.fromEntries([...new Set(lifeRows.map((x: any) => x.state))].map((st: any) => [st, lifeRows.filter((x: any) => x.state === st).length])) : null,
      provider_revenue_states: isComplete(providerLedger) ? Object.fromEntries([...new Set(ledgerRows.map((x: any) => x.state))].map((st: any) => [st, ledgerRows.filter((x: any) => x.state === st).length])) : null,
      lifecycles: lifeRows.slice(0, 200),
      provider_revenue: ledgerRows.slice(0, 200),
      provider_invoices: provInvRows.slice(0, 100),
      invoices: invRows.slice(0, 100),
      payment_events: events.value.slice(0, 100),
      incidents: incidents.value.slice(0, 100),
      approvals: approvals.value.slice(0, 100),
      truth_boundary: {
        merchant_revenue: 'merchant-side Invoice/PaymentEvent only',
        provider_revenue: 'ProviderRevenueLedger + ProviderRevenueInvoice only',
        estimated: 'not billable',
        verified: 'fully verified realized savings',
        billable: 'explicitly approved billing eligibility',
        collected: 'evidenced and reconciled payment only',
        double_counting: 'merchant-side and provider-side ledgers never share revenue events',
        completeness: 'a metric is null when any source it depends on failed or was truncated — a null is a read that did not happen, never a zero',
      },
    });
  } catch (e) {
    console.error(e);
    return Response.json({ ok: false, error: 'financial_control_tower_failed' }, { status: 500 });
  }
});
