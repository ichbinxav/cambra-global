// DASHBOARD-C9 (2026-08-17) — unit economics: the revenue-to-cost join.
//
// This tab exists because of a gap C0 verified: no financial aggregator read the cost
// plane, so margin was not computable server-side. It is the one place merchant and
// provider revenue are combined, and only against cost. The combined number is never
// labelled "total revenue" here or anywhere else.
import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { callFinance } from "@/pages/admin/AdminFinanceWorkspace";
import { FinanceKpiCard, money, SourceHealthStrip } from "./FinanceKpiGrid";

const MARGIN_KEY = "margin_after_governed_costs";

export default function FinanceUnitEconomicsTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await callFinance("overview"));
    } catch (caught) {
      setData(null);
      setError(caught?.message || "finance_unit_economics_unavailable");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) {
    return (
      <div data-testid="finance-unit-error" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 flex items-start gap-2">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <span>Unit economics unavailable ({error}).</span>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center gap-2 py-16 justify-center text-xs text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> Loading unit economics…
      </div>
    );
  }

  const kpis = data.kpis || [];
  const margin = kpis.find((row) => row.metric_key === MARGIN_KEY) || null;
  const sides = kpis.filter((row) => ["merchant_revenue_collected", "provider_revenue_collected", "governed_costs"].includes(row.metric_key));

  return (
    <div className="space-y-3">
      <SourceHealthStrip health={data.source_health} />

      {margin && (
        <div data-testid="finance-margin" className="rounded-xl border border-border/60 bg-card p-4">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 mb-2">{margin.label}</p>
          <p className={`text-3xl font-black tabular-nums ${margin.value === null ? "text-muted-foreground" : "text-foreground"}`}>
            {money(margin.value, margin.currency)}
          </p>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70 mt-1">{margin.truth_class}</p>
          {/* The boundary is not decoration: when the margin is MODELED it says which
              side is a lower bound and in which direction the figure is wrong. */}
          {margin.claim_boundary && (
            <p data-testid="finance-margin-boundary" className="text-[11px] text-muted-foreground mt-2 leading-snug">
              {margin.claim_boundary}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {sides.map((kpi) => <FinanceKpiCard key={kpi.metric_key} kpi={kpi} />)}
      </div>

      <p className="text-[10px] text-muted-foreground/70 rounded-lg bg-secondary/30 px-3 py-2 leading-relaxed">
        Merchant and provider revenue are combined here only to compute margin against cost. Neither is
        presented as a total anywhere in this workspace, and provider revenue never influences a merchant
        recommendation, benchmark or Recover target.
      </p>
    </div>
  );
}
