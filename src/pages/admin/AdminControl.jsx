import React, { useEffect, useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useI18n } from "@/lib/i18n.jsx";

export default function AdminControl() { const { t } = useI18n();
  const [deals, setDeals] = useState([]);
  const [brands, setBrands] = useState([]);
  const [reports, setReports] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [summary, setSummary] = useState(null);
  const [anomalies, setAnomalies] = useState([]);

  useEffect(() => {
    (async () => {
      const [sum, integ] = await Promise.all([
        base44.functions.invoke('adminSummaries', {}),
        base44.functions.invoke('integritySummary', {})
      ]);
      const sm = sum.data?.summary || {};
      setSummary(sm);
      setDeals(sm.samples?.recent_deals || []);
      setReports(sm.samples?.recent_reports || []);
      setInvoices(sm.samples?.recent_invoices || []);
      setAnomalies(integ.data?.anomalies || []);
      const b = await base44.entities.Brand.list();
      setBrands(b);
    })();
  }, []);

  const totals = useMemo(() => {
    if (!summary) return { projected:0, realSavings:0, nodeMRR:0, activeDeals: deals.length };
    return {
      projected: Number(summary.totals?.activated_yearly||0),
      realSavings: Number(summary.totals?.realized_total||0),
      nodeMRR: Number(summary.totals?.node_mrr||0),
      activeDeals: deals.length,
    };
  }, [summary, deals]);

  const invoiceTotals = useMemo(() => {
    const sum = (arr) => arr.reduce((s, x) => s + Number(x.amount || 0), 0);
    const draft = invoices.filter(i => i.status === 'draft');
    const sent = invoices.filter(i => i.status === 'sent');
    const paid = invoices.filter(i => i.status === 'paid');
    return {
      draftTotal: sum(draft), sentTotal: sum(sent), paidTotal: sum(paid),
      draftCount: draft.length, sentCount: sent.length, paidCount: paid.length,
    };
  }, [invoices]);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-black">{t('admin.control.title', { default: 'Admin Control' })}</h1>
      <div className="grid sm:grid-cols-4 gap-3">
        {[
          {label:'Brands', val: summary?.totals?.brands ?? 0},
          {label:'Providers', val: summary?.totals?.providers ?? 0},
          {label:'Analyzer results', val: summary?.totals?.analyzer_results ?? 0},
          {label:'Identified /yr', val: `€${Number(summary?.totals?.identified_yearly||0).toLocaleString()}`},
          {label:'Activated /yr', val: `€${totals.projected.toLocaleString()}`},
          {label:'Realized total', val:`€${totals.realSavings.toLocaleString()}`},
          {label:'THE NoDE revenue', val:`€${Number(summary?.totals?.node_revenue_total||0).toLocaleString()}`},
          {label:'MRR (last month)', val:`€${totals.nodeMRR.toLocaleString()}`},
          {label:'Invoices issued', val:`€${Number(summary?.totals?.invoices_issued_total||0).toLocaleString()}`},
          {label:'Invoices paid', val:`€${Number(summary?.totals?.invoices_paid_total||0).toLocaleString()}`},
          {label:'Invoices overdue', val:`€${Number(summary?.totals?.invoices_overdue_total||0).toLocaleString()}`},
        ].map((c,i)=>(
          <div key={i} className="rounded-xl border p-4 bg-card">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60">{c.label}</p>
            <p className="text-xl font-black">{c.val}</p>
          </div>
        ))}
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        {[{label:'Invoices (paid)', val:`€${invoiceTotals.paidTotal.toLocaleString()} · ${invoiceTotals.paidCount}`}, {label:'Invoices (sent)', val:`€${invoiceTotals.sentTotal.toLocaleString()} · ${invoiceTotals.sentCount}`}, {label:'Invoices (draft)', val:`€${invoiceTotals.draftTotal.toLocaleString()} · ${invoiceTotals.draftCount}`}].map((c,i)=>(
          <div key={i} className="rounded-xl border p-4 bg-card">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60">{c.label}</p>
            <p className="text-xl font-black">{c.val}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border p-4 bg-card mt-3">
        <p className="text-sm font-semibold mb-2">Deal pipeline</p>
        <div className="flex flex-wrap gap-2 mb-3 text-xs">
          {Object.entries(summary?.pipeline || {}).map(([st, c]) => (
            <span key={st} className="px-2 py-1 rounded-md border bg-secondary/40 capitalize">{st.replaceAll('_',' ')} · {c}</span>
          ))}
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground/60">
                <th>Company</th><th>Vertical</th><th>Status</th><th>Projected/yr</th><th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {deals.map(d => (
                <tr key={d.id} className="border-t">
                  <td className="py-2">{brands.find(b=>b.id===d.brand_id)?.name || d.brand_id}</td>
                  <td className="py-2 capitalize">{d.vertical}</td>
                  <td className="py-2">{d.status}</td>
                  <td className="py-2">€{(d.projected_savings_annual||0).toLocaleString()}</td>
                  <td className="py-2"><a className="text-xs underline" href={`/admin/activation?id=${d.id}`}>Open</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border p-4 bg-card">
        <p className="text-sm font-semibold mb-2">Latest invoices</p>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground/60">
                <th>Deal</th><th>Month</th><th>Amount</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.slice(0, 10).map(inv => (
                <tr key={inv.id} className="border-t">
                  <td className="py-2">{inv.deal_id}</td>
                  <td className="py-2">{inv.month}</td>
                  <td className="py-2">€{Number(inv.amount||0).toLocaleString()}</td>
                  <td className="py-2">{inv.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border p-4 bg-card">
        <p className="text-sm font-semibold mb-2">Integrity warnings</p>
        {anomalies.length === 0 ? (
          <p className="text-xs text-muted-foreground">No anomalies detected.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {anomalies.slice(0,30).map((a, i) => (
              <li key={i} className="border rounded-md px-2 py-1 flex items-center justify-between">
                <span>{a.type.replaceAll('_',' ')} {a.activation_id ? `· ${a.activation_id}` : ''}</span>
                {a.activation_id && <a className="underline" href={`/admin/activation?id=${a.activation_id}`}>Open</a>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}