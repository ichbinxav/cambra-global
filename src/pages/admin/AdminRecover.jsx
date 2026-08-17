// DASHBOARD-C7 (2026-08-17) — Recover workspace.
//
// Projects DealActivation, the canonical Recover root. Follows the Merchants shape:
// one server call with an action discriminator, zero base44.entities in the page.
//
// The display rules that matter here are about money:
//   - projected and verified savings are shown as SEPARATE figures, never summed
//   - a case with no verified figure says so; it does not show a projection where a
//     verified number belongs
//   - billing eligibility is shown as eligibility, with its blockers. Recover never
//     shows an invoice or a billable amount, because it does not have that authority
import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, FileCheck, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";

const payload = (response) => response?.data || response || {};
async function callRecover(action, body = {}) {
  const data = payload(await base44.functions.invoke("adminSummaries", { action: `recover_${action}`, ...body }));
  if (data?.ok === false || data?.error) {
    throw Object.assign(new Error(data?.error || "recover_operation_failed"), { data });
  }
  return data;
}

const known = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
const eur = (minor) => (known(minor)
  ? new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(minor) / 100)
  : "—");
const count = (v) => (known(v) ? new Intl.NumberFormat("en-US").format(Number(v)) : "—");
const humanize = (v) => String(v || "").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

const PHASE_TONE = {
  DRAFT: "border-border/60 bg-secondary/40 text-muted-foreground",
  ELIGIBILITY_REVIEW: "border-sky-200 bg-sky-50 text-sky-700",
  AWAITING_MANDATE: "border-amber-200 bg-amber-50 text-amber-700",
  MANDATE_ACTIVE: "border-sky-200 bg-sky-50 text-sky-700",
  MIGRATION_ACTIVE: "border-sky-200 bg-sky-50 text-sky-700",
  LIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  BILLING_ELIGIBLE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  BLOCKED: "border-rose-200 bg-rose-50 text-rose-700",
  REVIEW_REQUIRED: "border-rose-200 bg-rose-50 text-rose-700",
};

/**
 * A Recover case. The two savings figures are rendered in separate columns with
 * separate labels, so no reading of this card can merge them.
 */
export function RecoverCaseCard({ row }) {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid={`case-${row.canonical_id}`} className="rounded-xl border border-border/60 bg-card p-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <button type="button" onClick={() => setOpen((v) => !v)} className="text-sm font-bold hover:underline text-left">
            {row.brand_id || row.canonical_id}
          </button>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold ${PHASE_TONE[row.phase] || PHASE_TONE.DRAFT}`}>
              {row.phase ? humanize(row.phase) : "phase unmappable"}
            </span>
            {!row.mandate_present && (
              <span className="text-[10px] text-amber-700 font-bold">no mandate</span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0 grid grid-cols-2 gap-x-4">
          <div>
            <p className="text-[9px] uppercase text-muted-foreground">Projected</p>
            <p className="text-sm font-black tabular-nums">{eur(row.expected_recoverable_savings_minor)}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase text-muted-foreground">Verified</p>
            <p className="text-sm font-black tabular-nums">{eur(row.verified_savings_minor)}</p>
          </div>
        </div>
      </div>

      {row.verified_savings_minor === null && row.expected_recoverable_savings_minor !== null && (
        <p data-testid={`unverified-${row.canonical_id}`} className="mt-2 text-[11px] text-amber-700">
          <AlertTriangle size={10} className="inline mr-1" />
          Nothing verified yet. The projected figure is not a saving and nothing here is billable.
        </p>
      )}

      {!row.billing_eligible && row.billing_block_reasons.length > 0 && (
        <p data-testid={`blocked-${row.canonical_id}`} className="mt-1 text-[10px] text-muted-foreground">
          Not billing eligible: {row.billing_block_reasons.map(humanize).join(", ")}.
        </p>
      )}

      {open && (
        <div className="mt-3 border-t border-border/60 pt-3 space-y-2">
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-[11px]">
            <dt className="text-muted-foreground">Root</dt><dd className="font-bold font-mono">{row.entity_type}</dd>
            <dt className="text-muted-foreground">Raw status</dt><dd className="font-bold font-mono">{row.raw_status || "—"}</dd>
            <dt className="text-muted-foreground">From → to</dt>
            <dd className="font-bold">{row.provider_from || "—"} → {row.provider_to || "—"}</dd>
            <dt className="text-muted-foreground">Mandate</dt><dd className="font-bold">{row.mandate_id || "none"}</dd>
          </dl>
          <p className="text-[10px] text-muted-foreground leading-snug">{row.claim_boundary}</p>
        </div>
      )}
    </div>
  );
}

export function RecoverKpiCard({ kpi }) {
  const unavailable = (kpi.unavailable_sources || []).length > 0;
  return (
    <div data-testid={`kpi-${kpi.metric_key}`} className="rounded-2xl border border-border/60 bg-card p-4 min-w-0">
      <p className="text-[10px] uppercase tracking-[.12em] text-muted-foreground font-bold truncate">{kpi.label}</p>
      <p className="text-xl md:text-2xl font-black mt-2 tabular-nums truncate">
        {kpi.unit === "EUR_minor" ? eur(kpi.value) : count(kpi.value)}
      </p>
      <p className="text-[9px] uppercase text-muted-foreground mt-2">{kpi.truth_class}</p>
      {unavailable && (
        <p className="mt-1 text-[10px] text-amber-700 font-semibold">
          Source unavailable: {kpi.unavailable_sources.join(", ")}. This is not a zero.
        </p>
      )}
      {kpi.claim_boundary && !unavailable && (
        <p className="mt-1 text-[10px] text-muted-foreground leading-snug">{kpi.claim_boundary}</p>
      )}
    </div>
  );
}

export default function AdminRecover() {
  const [data, setData] = useState(null);
  const [view, setView] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filters = view === "all" ? {} : { [view]: true };
      setData(await callRecover("portfolio", { filters }));
      setError(null);
    } catch (e) {
      setError(e?.message || "Could not load Recover.");
    } finally { setLoading(false); }
  }, [view]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <FileCheck size={18} /> Recover
          </h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-3xl">
            Turning an approved opportunity into verified savings. Projected and verified figures
            are kept separate here, and Recover reports billing eligibility only — invoices are
            Finance&apos;s authority.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={load} disabled={loading}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-border/60 text-[11px] font-bold hover:bg-secondary disabled:opacity-50">
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-emerald-200 bg-emerald-50 text-[11px] font-bold text-emerald-700">
            <ShieldCheck size={11} /> No sends, no invoices
          </span>
        </div>
      </div>

      {data?.context?.data_complete === false && (
        <p data-testid="recover-degraded" className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-[11px] text-rose-700">
          Could not read: {(data.context.degraded_sources || []).join(", ")}. Cases from that source
          are absent, not zero, and the total is hidden.
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
        {(data?.kpis || []).map((kpi) => <RecoverKpiCard key={kpi.metric_key} kpi={kpi} />)}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {(data?.quick_views || []).map((qv) => (
          <button key={qv.key} type="button" onClick={() => setView(qv.key)}
            className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-full border text-[10px] font-bold ${
              view === qv.key ? "border-foreground/40 bg-secondary" : "border-border/60 hover:bg-secondary/60"
            }`}>
            {qv.label} <span className="text-muted-foreground">{count(qv.count)}</span>
          </button>
        ))}
      </div>

      {error && <p data-testid="recover-error" className="text-[11px] text-rose-700">{error}</p>}

      <div className="space-y-2">
        {loading && !data && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 size={12} className="animate-spin" /> Reading the Recover root…
          </p>
        )}
        {data && (data.items?.rows || []).length === 0 && (
          <p data-testid="recover-empty" className="text-xs text-muted-foreground">
            {data.context?.data_complete === false
              ? "No cases to show, and the root could not be read — this is not an empty Recover."
              : "No cases match this view."}
          </p>
        )}
        {(data?.items?.rows || []).map((row) => <RecoverCaseCard key={row.canonical_id} row={row} />)}
      </div>
    </div>
  );
}
