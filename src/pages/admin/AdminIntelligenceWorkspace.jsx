// DASHBOARD-C11 (2026-08-17) — the consolidated Intelligence workspace.
//
// A shell, like Finance. The six legacy pages C0 found already reading through governed
// aggregators are mounted unchanged; what the shell adds is one entry point and the
// `pricing-queue` tab, which is where C10's promotion queue becomes reachable by a human.
//
// Until C11 the queue existed only as an API. Before C10 it did not exist at all: the
// watcher had been detecting provider pricing changes every six hours into a table that
// no code read.
import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Brain, Loader2, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";

// The six pages C0 found already correct. Mounted, not rewritten.
import AdminIntelligence from "./AdminIntelligence";
import AdminMarkets from "./AdminMarkets";
import AdminRoutingIntelligence from "./AdminRoutingIntelligence";
import AdminBenchmarks from "./AdminBenchmarks";
import AdminRecommendations from "./AdminRecommendations";
import AdminProviders from "./AdminProviders";
import PricingQueueTab from "@/components/admin/intelligence/PricingQueueTab";

const payload = (response) => response?.data || response || {};
export async function callIntelligence(action, body = {}) {
  const data = payload(await base44.functions.invoke("adminSummaries", { action: `intelligence_${action}`, ...body }));
  if (data?.ok === false || data?.error) {
    throw Object.assign(new Error(data?.error || "intelligence_operation_failed"), { data });
  }
  return data;
}

const TAB_BODIES = {
  overview: AdminIntelligence,
  "pricing-queue": PricingQueueTab,
  markets: AdminMarkets,
  routing: AdminRoutingIntelligence,
  benchmarks: AdminBenchmarks,
  recommendations: AdminRecommendations,
  providers: AdminProviders,
};

export default function AdminIntelligenceWorkspace() {
  const [params, setParams] = useSearchParams();
  const [tabs, setTabs] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await callIntelligence("tabs");
      setTabs(data.tabs || []);
    } catch (caught) {
      setTabs(null);
      setError(caught?.message || "intelligence_tabs_unavailable");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const requested = params.get("tab") || "overview";
  const active = tabs?.some((tab) => tab.key === requested) ? requested : (tabs?.[0]?.key || null);
  const Body = active ? TAB_BODIES[active] : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black tracking-[-0.03em] flex items-center gap-2">
            <Brain size={20} /> Intelligence
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pricing truth, markets, routing and benchmarks. Provider compensation never reaches a merchant recommendation.
          </p>
        </div>
        <button type="button" onClick={load} className="h-8 px-3 rounded-lg border border-border text-xs font-bold inline-flex items-center gap-1.5">
          <RefreshCw size={12} /> Reload
        </button>
      </div>

      {error && (
        <div data-testid="intelligence-tabs-error" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>Intelligence tabs could not be loaded ({error}). Nothing below is shown.</span>
        </div>
      )}

      {!tabs && !error && (
        <div className="flex items-center gap-2 py-16 justify-center text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> Loading Intelligence…
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
                data-testid={`intelligence-tab-${tab.key}`}
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

          {Body ? <Body /> : (
            <p data-testid="intelligence-tab-unbuilt" className="text-xs text-muted-foreground py-12 text-center">
              This tab is declared by the server but has no body in the page yet.
            </p>
          )}
        </>
      )}
    </div>
  );
}
