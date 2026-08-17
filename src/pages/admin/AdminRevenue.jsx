// DASHBOARD-C9 (2026-08-17) — Revenue, now the `revenue` tab of the Finance workspace.
//
// This page used to read five entity lists directly and do the arithmetic in the
// component. Four defects went with that, and all four are fixed on the server in
// base44/shared/financeWorkspaceCore.ts rather than moved around here:
//
//   - `(i.total_amount || 0)` and `(r.savings || 0)`: an absent amount became a
//     confident zero, so an invoice with no total quietly counted as free.
//   - amounts were added across currencies with no check at all.
//   - `.list()` with no limit and `.list('-month', 500)` produced lower bounds
//     displayed under the word "Cumulative".
//   - one KPI labelled "Cumulative monetized" summed issued/sent/due/overdue/paid.
//     That is billed, not received. The two are now separate figures, because the
//     difference between them is CAMBRA's collection risk and it deserves a number.
//
// Savings and revenue remain in separate columns, and the page states why they are
// never added: the saving is the merchant's, the fee is CAMBRA's share of it.
import React, { useCallback, useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { AlertTriangle, Loader2 } from "lucide-react";
import MonthlyReportsTable from "@/components/admin/MonthlyReportsTable";
import { callFinance } from "./AdminFinanceWorkspace";
import { FinanceKpiGrid, money, SourceHealthStrip } from "@/components/admin/finance/FinanceKpiGrid";

export default function AdminRevenue() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await callFinance("revenue"));
    } catch (caught) {
      // A failed read shows as a failed read. It never falls back to empty arrays,
      // which is how the old page would have rendered zeros for everything.
      setData(null);
      setError(caught?.message || "revenue_projection_unavailable");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) {
    return (
      <div data-testid="revenue-error" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 flex items-start gap-2">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <span>Revenue projection unavailable ({error}). No figures are shown.</span>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center gap-2 py-16 justify-center text-xs text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> Loading revenue…
      </div>
    );
  }

  const providerRows = data.items?.rows || [];
  const monthly = (data.monthly_collected || []).map((row) => ({
    month: row.month,
    // recharts cannot draw an unknown, so a null month is left out of the bar rather
    // than plotted as zero. The caption below reports how many were left out.
    collected: row.amount_minor === null ? null : Number(row.amount_minor) / 100,
    mixed: row.mixed_currency,
  }));
  const unplottable = monthly.filter((row) => row.collected === null).length;

  return (
    <div className="space-y-5">
      <SourceHealthStrip health={data.source_health} />

      <FinanceKpiGrid kpis={data.kpis} />

      <p data-testid="revenue-combination-rule" className="text-[11px] text-muted-foreground rounded-lg bg-secondary/40 px-3 py-2 leading-snug">
        {data.combination_rule}
      </p>

      <div className="p-5 rounded-xl border border-border/50 bg-card">
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-4">
          Collected by month (UTC)
        </p>
        <ResponsiveContainer width="100%" height={170}>
          <BarChart data={monthly}>
            <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: 8, fontSize: 11 }} />
            <Bar dataKey="collected" fill="#F5A623" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        {unplottable > 0 && (
          <p data-testid="revenue-unplottable" className="text-[10px] text-amber-700 mt-2">
            {unplottable} month(s) are not plotted: their invoices span more than one currency, so there is
            no single bar to draw. A zero bar would have read as "no revenue".
          </p>
        )}
      </div>

      <div className="rounded-xl border border-border/50 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border/40 bg-secondary/30 flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">By provider</p>
          <p className="text-[10px] text-muted-foreground/50">
            {data.items?.total === null ? "count unavailable" : `${data.items.total} provider(s)`}
          </p>
        </div>
        {providerRows.length > 0 ? (
          <div className="divide-y divide-border/20">
            {providerRows.map((row) => (
              <div key={row.provider_id} data-testid={`revenue-provider-${row.provider_id}`} className="px-5 py-3.5 flex items-center gap-4 flex-wrap">
                <p className="text-sm font-semibold flex-1 min-w-0">
                  {row.provider_name || <span className="text-muted-foreground italic">unnamed provider ({row.provider_id})</span>}
                </p>
                <p className="text-[10px] text-muted-foreground/60 w-20 text-right">{row.reports} report(s)</p>
                <div className="w-32 text-right">
                  <p className="text-[9px] uppercase text-muted-foreground/60">Merchant saved</p>
                  <p className="text-sm font-bold text-emerald-700 tabular-nums">
                    {money(row.realized_savings_minor, row.realized_savings_currency)}
                  </p>
                </div>
                <div className="w-32 text-right">
                  <p className="text-[9px] uppercase text-muted-foreground/60">CAMBRA billed</p>
                  <p className="text-sm font-black text-amber-700 tabular-nums">
                    {money(row.revenue_invoiced_minor, row.revenue_invoiced_currency)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {data.items?.total === null ? "Provider breakdown unavailable." : "No provider activity yet."}
          </div>
        )}
      </div>

      <MonthlyReportsTable />
    </div>
  );
}
