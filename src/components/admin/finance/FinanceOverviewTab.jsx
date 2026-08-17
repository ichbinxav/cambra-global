// DASHBOARD-C9 (2026-08-17) — Finance overview: the five domains side by side.
//
// The five figures are rendered as five figures. There is no total, and no button
// that produces one, because four of the five pairs must never be added — see
// FORBIDDEN_SUMS in base44/shared/financeCore.ts.
import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { callFinance } from "@/pages/admin/AdminFinanceWorkspace";
import { FinanceKpiGrid, SourceHealthStrip } from "./FinanceKpiGrid";

export default function FinanceOverviewTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await callFinance("overview"));
    } catch (caught) {
      setData(null);
      setError(caught?.message || "finance_overview_unavailable");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) {
    return (
      <div data-testid="finance-overview-error" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 flex items-start gap-2">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <span>Finance overview unavailable ({error}). No figures are shown rather than stale ones.</span>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center gap-2 py-16 justify-center text-xs text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> Loading figures…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <SourceHealthStrip health={data.source_health} />
      <FinanceKpiGrid kpis={data.kpis} />
      <p className="text-[10px] text-muted-foreground/70 leading-relaxed rounded-lg bg-secondary/30 px-3 py-2">
        {data.context?.truth_boundary}
      </p>
    </div>
  );
}
