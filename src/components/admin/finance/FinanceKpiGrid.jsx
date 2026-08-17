// DASHBOARD-C9 (2026-08-17) — the shared KPI renderer for the Finance workspace.
//
// The rule this component exists to hold: a KPI whose value is null renders an em
// dash and its claim boundary, never a zero. The server already decided that; the
// display must not undo it by formatting null as 0, which is what
// `€${Math.round(value).toLocaleString()}` did in AdminRevenue.
import React from "react";

const known = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));

export const money = (minor, currency) => (known(minor)
  ? new Intl.NumberFormat("en-US", {
    style: "currency",
    // A figure with no currency is not silently priced in euros.
    currency: currency || "EUR",
    maximumFractionDigits: 0,
  }).format(Number(minor) / 100)
  : "—");

export const count = (v) => (known(v) ? new Intl.NumberFormat("en-US").format(Number(v)) : "—");

const TRUTH_TONE = {
  VERIFIED: "text-emerald-700",
  OBSERVED: "text-foreground",
  CONTRACTUAL: "text-sky-700",
  DERIVED: "text-amber-700",
  MODELED: "text-amber-700",
  INFERRED: "text-amber-700",
  UNVERIFIED: "text-amber-700",
  CONFLICTED: "text-rose-700",
  UNKNOWN: "text-muted-foreground",
};

export function FinanceKpiCard({ kpi }) {
  const isMoney = kpi.unit === "EUR_minor";
  const currency = kpi.currency || null;
  return (
    <div data-testid={`finance-kpi-${kpi.metric_key}`} className="p-4 rounded-xl border border-border/50 bg-card">
      <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 mb-2">{kpi.label}</p>
      <p className={`text-2xl font-black tabular-nums ${TRUTH_TONE[kpi.truth_class] || "text-foreground"}`}>
        {isMoney ? money(kpi.value, currency) : count(kpi.value)}
      </p>
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70">{kpi.truth_class}</span>
        {kpi.mixed_currency && (
          <span data-testid={`finance-kpi-mixed-${kpi.metric_key}`} className="text-[9px] font-bold text-amber-700">
            mixed currency — no total
          </span>
        )}
        {kpi.state === "UNAVAILABLE" && (
          <span className="text-[9px] font-bold text-rose-700">source unavailable</span>
        )}
      </div>
      {kpi.mixed_currency && kpi.by_currency && (
        <div className="mt-2 space-y-0.5">
          {Object.entries(kpi.by_currency).map(([code, amount]) => (
            <p key={code} className="text-[11px] tabular-nums text-muted-foreground">
              {money(amount, code)} <span className="font-bold">{code}</span>
            </p>
          ))}
        </div>
      )}
      {kpi.claim_boundary && (
        <p className="text-[10px] text-muted-foreground/70 mt-2 leading-snug">{kpi.claim_boundary}</p>
      )}
    </div>
  );
}

export function SourceHealthStrip({ health }) {
  const degraded = (health || []).filter((row) => row.state !== "OBSERVED");
  if (!degraded.length) return null;
  return (
    <div data-testid="finance-source-health" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
      <p className="font-bold mb-1">Coverage is incomplete — figures below are bounded by it</p>
      <ul className="space-y-0.5">
        {degraded.map((row) => (
          <li key={row.source} className="tabular-nums">
            {row.source}: {row.state}
            {/* null and 0 are different facts: unreadable versus genuinely empty. */}
            {row.records_read === null ? " (could not read)" : ` (${row.records_read} rows)`}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FinanceKpiGrid({ kpis }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      {(kpis || []).map((kpi) => <FinanceKpiCard key={kpi.metric_key} kpi={kpi} />)}
    </div>
  );
}
