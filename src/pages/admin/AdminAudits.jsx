// DASHBOARD-C13 (2026-08-17) — Audits & Opportunities workspace.
//
// The last unbuilt workspace, carried since C5. The backend has existed since C4
// (auditsCore) and its logical route since then; only the page was missing, so entry 8 of
// the twelve-entry sidebar pointed at nothing.
//
// Two display rules do the work here, and both come from real defects auditsCore was written
// to prevent:
//
//   1. An ANONYMOUS_ESTIMATE or MANUAL_REVIEW audit can NEVER be shown as verified savings.
//      The projection labels those types and the page renders the label, not the number, as
//      the headline.
//   2. The six opportunity figures stay six figures. Current cost, target cost, gross
//      theoretical, actionable, expected recoverable and annualized are different claims
//      about different things; collapsing any two is the defect, so they are rendered as
//      separate labelled rows and never added.
import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ClipboardCheck, Loader2, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { FinanceKpiGrid, money, SourceHealthStrip } from "@/components/admin/finance/FinanceKpiGrid";

const payload = (response) => response?.data || response || {};
async function callAudits(action, body = {}) {
  const data = payload(await base44.functions.invoke("adminSummaries", { action: `audits_${action}`, ...body }));
  if (data?.ok === false || data?.error) {
    throw Object.assign(new Error(data?.error || "audits_operation_failed"), { data });
  }
  return data;
}

const TRUTH_TONE = {
  VERIFIED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  OBSERVED: "border-border/60 bg-secondary/40 text-foreground",
  DERIVED: "border-amber-200 bg-amber-50 text-amber-900",
  MODELED: "border-amber-200 bg-amber-50 text-amber-900",
  INFERRED: "border-amber-200 bg-amber-50 text-amber-900",
  UNVERIFIED: "border-amber-200 bg-amber-50 text-amber-900",
  CONFLICTED: "border-rose-200 bg-rose-50 text-rose-800",
  UNKNOWN: "border-border/60 bg-secondary/40 text-muted-foreground",
};

const humanize = (value) => String(value || "").replaceAll("_", " ").toLowerCase();

export function AuditCard({ row }) {
  return (
    <div data-testid={`audit-${row.canonical_id}`} className="rounded-xl border border-border/60 bg-card p-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-bold truncate">{row.brand_id || row.canonical_id}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold ${TRUTH_TONE[row.truth_class] || TRUTH_TONE.UNKNOWN}`}>
              {row.truth_class}
            </span>
            <span className="text-[10px] text-muted-foreground">{humanize(row.audit_type)}</span>
            <span className="text-[10px] text-muted-foreground/60">{humanize(row.status)}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[9px] uppercase text-muted-foreground">
            {/* The label says what kind of figure this is, so a modelled number is never read
                as a verified one just because it is the biggest thing on the card. */}
            {row.truth_class === "VERIFIED" ? "Verified savings" : "Estimated savings"}
          </p>
          <p className="text-lg font-black tabular-nums">{money(row.total_savings_minor, row.currency)}</p>
        </div>
      </div>

      {row.attention_reasons?.length > 0 && (
        <div className="flex gap-1 flex-wrap mt-2">
          {row.attention_reasons.map((reason) => (
            <span key={reason} className="text-[9px] font-mono rounded bg-amber-500/10 text-amber-800 px-1.5 py-0.5">{reason}</span>
          ))}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/70 mt-2 leading-snug">{row.claim_boundary}</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 mt-2 text-[10px] text-muted-foreground">
        <span>engine {row.engine_version || "—"}</span>
        <span>benchmark {row.benchmark_version || "—"}</span>
        <span>completeness {row.data_completeness === null ? "—" : `${row.data_completeness}%`}</span>
        {/* ABSENT is not "zero window"; it means the measurement window was never recorded. */}
        <span>window {row.window_provenance === "PRESENT" ? "recorded" : "not recorded"}</span>
      </div>
    </div>
  );
}

const FIGURES = [
  ["current_annual_cost_minor", "Current annual cost"],
  ["target_annual_cost_minor", "Target annual cost"],
  ["gross_theoretical_savings_minor", "Gross theoretical"],
  ["actionable_savings_minor", "Actionable"],
  ["expected_recoverable_savings_minor", "Expected recoverable"],
  ["annualized_savings_minor", "Annualized"],
];

export function OpportunityCard({ row }) {
  return (
    <div data-testid={`opportunity-${row.canonical_id}`} className="rounded-xl border border-border/60 bg-card p-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-bold truncate">{row.opportunity_key || row.canonical_id}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-[10px] text-muted-foreground">{humanize(row.status)}</span>
            {row.market && <span className="text-[10px] text-muted-foreground/60">{row.market}</span>}
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold ${
              row.recover_eligible ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-border/60 bg-secondary/40 text-muted-foreground"
            }`}>
              {row.recover_eligible ? "ready for Recover" : "not eligible"}
            </span>
          </div>
        </div>
      </div>

      {/* Six figures, six rows. Adding any two of these is the defect auditsCore exists to
          prevent, so there is no total here and no control that would produce one. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
        {FIGURES.map(([key, label]) => (
          <div key={key} className="rounded-lg bg-secondary/30 px-2 py-1.5">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60">{label}</p>
            <p className="text-xs font-bold tabular-nums">{money(row[key], row.currency)}</p>
          </div>
        ))}
      </div>

      {row.recover_blockers?.length > 0 && (
        <div className="mt-2">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60 mb-1">Recover blockers</p>
          <div className="flex gap-1 flex-wrap">
            {row.recover_blockers.map((blocker) => (
              <span key={blocker} className="text-[9px] font-mono rounded bg-rose-500/10 text-rose-800 px-1.5 py-0.5">{blocker}</span>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/70 mt-2 leading-snug">{row.claim_boundary}</p>
      {row.recommended_next_action && (
        <p className="text-[11px] font-semibold mt-1">Next: {humanize(row.recommended_next_action)}</p>
      )}
    </div>
  );
}

export default function AdminAudits() {
  const [tab, setTab] = useState("audits");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async (which) => {
    setError(null);
    setData(null);
    try {
      setData(await callAudits("portfolio", { tab: which }));
    } catch (caught) {
      setError(caught?.message || "audits_portfolio_unavailable");
    }
  }, []);

  useEffect(() => { load(tab); }, [load, tab]);

  const rows = data?.items?.rows || [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black tracking-[-0.03em] flex items-center gap-2">
            <ClipboardCheck size={20} /> Audits & Opportunities
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            What was measured, and what could be recovered. An estimate is never shown as verified savings.
          </p>
        </div>
        <button type="button" onClick={() => load(tab)} className="h-8 px-3 rounded-lg border border-border text-xs font-bold inline-flex items-center gap-1.5">
          <RefreshCw size={12} /> Reload
        </button>
      </div>

      <div role="tablist" className="flex gap-1 border-b border-border/50">
        {[["audits", "Audits"], ["opportunities", "Opportunities"]].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            data-testid={`audits-tab-${key}`}
            onClick={() => setTab(key)}
            className={`px-3 py-2 text-xs font-bold border-b-2 -mb-px ${
              tab === key ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div data-testid="audits-error" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>Audits unavailable ({error}). No figures are shown rather than stale ones.</span>
        </div>
      )}

      {!data && !error && (
        <div className="flex items-center gap-2 py-16 justify-center text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> Loading {tab}…
        </div>
      )}

      {data && (
        <>
          <SourceHealthStrip health={data.source_health} />
          <FinanceKpiGrid kpis={data.kpis} />

          <p className="text-[10px] text-muted-foreground/70 rounded-lg bg-secondary/30 px-3 py-2 leading-relaxed">
            {data.context?.truth_boundary}
          </p>

          <div className="flex items-center justify-between text-[10px] text-muted-foreground/60">
            <span>
              {/* null total means uncomputable, which is different from none found. */}
              {data.items?.total === null ? "count unavailable" : `${data.items.total} record(s)`}
            </span>
            {data.items?.next_cursor && <span>more available</span>}
          </div>

          {rows.length === 0 ? (
            <p className="text-xs text-muted-foreground py-12 text-center">
              {data.items?.total === null ? "Records unavailable." : `No ${tab} yet.`}
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => (tab === "audits"
                ? <AuditCard key={row.canonical_id} row={row} />
                : <OpportunityCard key={row.canonical_id} row={row} />))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
