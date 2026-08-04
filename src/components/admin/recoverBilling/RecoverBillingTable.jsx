import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { ShieldCheck, FileText, RefreshCw, ExternalLink } from "lucide-react";
import EligibilityBadge from "./EligibilityBadge";

const eur = (n) => `€${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function RecoverBillingTable() {
  const [reports, setReports] = useState([]);
  const [brands, setBrands] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(null);
  const [feedback, setFeedback] = useState(null);

  async function load() {
    setLoading(true);
    const [r, b, i] = await Promise.all([
      base44.entities.MonthlySavingsReport.filter({ vertical: "payments" }, "-month", 300),
      base44.entities.Brand.list("-created_date", 300),
      base44.entities.Invoice.list("-created_date", 300),
    ]);
    setReports(r || []);
    setBrands(b || []);
    setInvoices(i || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const brandName = (id) => brands.find((x) => x.id === id)?.name || "—";
  const invoiceFor = (id) => invoices.find((x) => x.id === id) || null;

  async function approve(report) {
    setWorking(report.id);
    setFeedback(null);
    const res = await base44.functions.invoke("approveRecoverReportForInvoicing", { report_id: report.id });
    const data = res?.data || res;
    setFeedback(
      data?.billing_eligibility_status === "eligible"
        ? { kind: "ok", text: `${brandName(report.brand_id)} ${report.month}: eligible — fee ${eur(data.fee_net_eur)} (${data.effective_fee_pct}%), tax ${data.tax_treatment_preview}.` }
        : { kind: "warn", text: `${brandName(report.brand_id)} ${report.month}: ${data?.billing_eligibility_status || data?.error || "refused"}${data?.blockers ? ` — ${data.blockers.map((x) => x.reason).join(" | ")}` : ""}` }
    );
    await load();
    setWorking(null);
  }

  async function issueInvoice(report) {
    if (!confirm(`Issue the invoice for ${brandName(report.brand_id)} — ${report.month}? Stripe assigns the legal invoice number and this cannot be edited afterwards.`)) return;
    setWorking(report.id);
    setFeedback(null);
    const res = await base44.functions.invoke("createEligibleRecoverInvoices", { report_id: report.id });
    const data = res?.data || res;
    const outcome = data?.results?.[0];
    setFeedback(
      outcome?.ok
        ? { kind: "ok", text: `Invoice ${outcome.invoice_number} issued — ${eur(outcome.total_eur)} (${outcome.tax_treatment}).` }
        : { kind: "warn", text: `Not issued: ${outcome?.error || data?.error || "unknown"}${data?.missing ? ` — missing ${data.missing.join(", ")}` : ""}` }
    );
    await load();
    setWorking(null);
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading measured months…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-black tracking-[-0.02em]">Recover billing</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Approve a measured month, then issue its success-fee invoice. Both steps are deliberate and logged.
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold hover:bg-secondary"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {feedback && (
        <div className={`p-3 rounded-xl border text-xs ${feedback.kind === "ok" ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-800" : "border-amber-500/25 bg-amber-500/10 text-amber-900"}`}>
          {feedback.text}
        </div>
      )}

      <div className="rounded-xl border border-border/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-secondary/40 border-b border-border/40">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold">Business</th>
                <th className="px-3 py-2 font-semibold">Month</th>
                <th className="px-3 py-2 font-semibold text-right">Verified savings</th>
                <th className="px-3 py-2 font-semibold text-right">Fee (net)</th>
                <th className="px-3 py-2 font-semibold">Eligibility</th>
                <th className="px-3 py-2 font-semibold">Blocked because</th>
                <th className="px-3 py-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {reports.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">No measured months yet.</td></tr>
              )}
              {reports.map((r) => {
                const inv = invoiceFor(r.invoice_id);
                const busy = working === r.id;
                return (
                  <tr key={r.id} className={`hover:bg-secondary/20 ${r.status === "void" ? "opacity-40" : ""}`}>
                    <td className="px-3 py-2 font-semibold">{brandName(r.brand_id)}</td>
                    <td className="px-3 py-2 tabular-nums">{r.month}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{eur(r.billable_savings_amount ?? r.savings)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold">
                      {r.fee_net_amount != null ? eur(r.fee_net_amount) : "—"}
                      {r.effective_fee_pct != null && <span className="ml-1 text-[10px] font-normal text-muted-foreground">{r.effective_fee_pct}%</span>}
                    </td>
                    <td className="px-3 py-2"><EligibilityBadge status={r.billing_eligibility_status} /></td>
                    <td className="px-3 py-2 max-w-[280px]">
                      <span className="text-[10px] text-muted-foreground break-words">{r.billing_block_reason || "—"}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 justify-end">
                        {r.billing_eligibility_status !== "invoiced" && r.status !== "void" && (
                          <button
                            disabled={busy}
                            onClick={() => approve(r)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-card text-[10px] font-bold hover:bg-secondary disabled:opacity-50"
                          >
                            <ShieldCheck size={10} /> {r.billing_eligibility_status === "eligible" ? "Re-check" : "Approve"}
                          </button>
                        )}
                        {r.billing_eligibility_status === "eligible" && (
                          <button
                            disabled={busy}
                            onClick={() => issueInvoice(r)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 text-[10px] font-bold hover:bg-emerald-500/20 disabled:opacity-50"
                          >
                            <FileText size={10} /> Issue invoice
                          </button>
                        )}
                        {inv?.hosted_invoice_url && (
                          <a
                            href={inv.hosted_invoice_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-card text-[10px] font-bold hover:bg-secondary"
                          >
                            <ExternalLink size={10} /> {inv.invoice_number || "Invoice"}
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}