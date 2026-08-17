// DASHBOARD-C9 (2026-08-17) — the consolidated Finance workspace.
//
// This is a SHELL. C0 verified that four finance pages were already reading through
// governed aggregators and were already correct, so they are mounted here unchanged
// rather than reimplemented — rewriting a correct page is how a correct page stops
// being correct. What the shell adds is the two things none of them had: a single
// entry point, and a statement of which figures must never be added together.
//
// The tab list comes from the server (`finance_tabs`), so the page cannot offer a tab
// the handler does not serve.
import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Landmark, Loader2, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";

// The four pages C0 found already correct. Mounted, not rewritten.
import AdminFinanceControlTower from "./AdminFinance";
import AdminRevenue from "./AdminRevenue";
import AdminRecoverBilling from "./AdminRecoverBilling";
import AdminProviderEconomics from "./AdminProviderEconomics";
import FinanceOverviewTab from "@/components/admin/finance/FinanceOverviewTab";
import FinanceUnitEconomicsTab from "@/components/admin/finance/FinanceUnitEconomicsTab";

const payload = (response) => response?.data || response || {};
export async function callFinance(action, body = {}) {
  const data = payload(await base44.functions.invoke("adminSummaries", { action: `finance_${action}`, ...body }));
  if (data?.ok === false || data?.error) {
    throw Object.assign(new Error(data?.error || "finance_operation_failed"), { data });
  }
  return data;
}

const TAB_BODIES = {
  overview: FinanceOverviewTab,
  revenue: AdminRevenue,
  "control-tower": AdminFinanceControlTower,
  "merchant-billing": AdminRecoverBilling,
  "provider-economics": AdminProviderEconomics,
  "unit-economics": FinanceUnitEconomicsTab,
};

export default function AdminFinanceWorkspace() {
  const [params, setParams] = useSearchParams();
  const [tabs, setTabs] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await callFinance("tabs");
      setTabs(data.tabs || []);
    } catch (caught) {
      // A tab list we could not load is not an empty tab list.
      setTabs(null);
      setError(caught?.message || "finance_tabs_unavailable");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const requested = params.get("tab") || "overview";
  const active = tabs?.some((tab) => tab.key === requested) ? requested : (tabs?.[0]?.key || null);
  const activeTab = tabs?.find((tab) => tab.key === active) || null;
  const Body = active ? TAB_BODIES[active] : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black tracking-[-0.03em] flex items-center gap-2">
            <Landmark size={20} /> Finance
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Savings, CAMBRA revenue, provider revenue and costs — kept as separate figures.
          </p>
        </div>
        <button type="button" onClick={load} className="h-8 px-3 rounded-lg border border-border text-xs font-bold inline-flex items-center gap-1.5">
          <RefreshCw size={12} /> Reload
        </button>
      </div>

      {error && (
        <div data-testid="finance-tabs-error" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>Finance tabs could not be loaded ({error}). Nothing below is shown, because a workspace that hides its own failure is worse than one that reports it.</span>
        </div>
      )}

      {!tabs && !error && (
        <div className="flex items-center gap-2 py-16 justify-center text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> Loading Finance…
        </div>
      )}

      {tabs && (
        <>
          <div role="tablist" className="flex gap-1 flex-wrap border-b border-border/50">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={tab.key === active}
                data-testid={`finance-tab-${tab.key}`}
                onClick={() => setParams((next) => {
                  const updated = new URLSearchParams(next);
                  updated.set("tab", tab.key);
                  return updated;
                })}
                className={`px-3 py-2 text-xs font-bold border-b-2 -mb-px ${
                  tab.key === active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab?.combination_note && (
            <p data-testid="finance-combination-note" className="text-[11px] text-muted-foreground rounded-lg bg-secondary/40 px-3 py-2">
              {activeTab.combination_note}
            </p>
          )}

          {Body ? <Body /> : (
            <p data-testid="finance-tab-unbuilt" className="text-xs text-muted-foreground py-12 text-center">
              This tab is declared by the server but has no body in the page yet.
            </p>
          )}
        </>
      )}
    </div>
  );
}
