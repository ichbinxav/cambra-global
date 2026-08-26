// DASHBOARD-C3 (2026-08-17) — Pipeline workspace.
//
// Replaces the kanban at /admin/pipeline, which rendered DealApplication — an
// entity with zero producers and zero rows. There is nothing to migrate.
//
// Follows the founder-approved Merchants shape: ONE server call with an action
// discriminator, zero base44.entities in the page, and the workspace contract's
// envelope (source health, truth classes, freshness).
//
// The display rules that matter, all enforced by the server and surfaced here:
//   - a value of null renders as an em dash, never as 0
//   - a KPI whose source failed says so instead of showing a number
//   - a stage whose source columns disagree is visibly marked, and the reading
//     shown is the LEAST-ADVANCED one
//   - a total is hidden entirely when a lane could not be read
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, GitBranch, Loader2, RefreshCw, ShieldCheck, Sparkles, Users,
} from "lucide-react";
import { base44 } from "@/api/base44Client";

const payload = (response) => response?.data || response || {};
async function callPipeline(action, body = {}) {
  const data = payload(await base44.functions.invoke("adminSummaries", { action: `pipeline_${action}`, ...body }));
  if (data?.ok === false || data?.error) {
    throw Object.assign(new Error(data?.error || "pipeline_operation_failed"), { data });
  }
  return data;
}

/** null and undefined render as an em dash. A real 0 renders as 0. */
const known = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
const count = (value) => (known(value) ? new Intl.NumberFormat("en-US").format(Number(value)) : "—");
const eur = (minor) => (known(minor)
  ? new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(minor) / 100)
  : "—");
const compactEur = (value) => (known(value)
  ? new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 }).format(Number(value))
  : "—");
const humanize = (value) => String(value || "").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const when = (value) => (value ? new Date(value).toLocaleString() : "—");

const TRUTH_TONE = {
  OBSERVED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  VERIFIED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  DERIVED: "border-sky-200 bg-sky-50 text-sky-700",
  MODELED: "border-violet-200 bg-violet-50 text-violet-700",
  CONFLICTED: "border-amber-200 bg-amber-50 text-amber-700",
  UNKNOWN: "border-border/60 bg-secondary/40 text-muted-foreground",
};

function Chip({ children, tone = "UNKNOWN", title = undefined }) {
  return (
    <span title={title}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-wide ${TRUTH_TONE[tone] || TRUTH_TONE.UNKNOWN}`}>
      {children}
    </span>
  );
}

/**
 * A KPI card. When the server reports the value as unproven it says which source
 * failed rather than rendering a number the evidence does not support.
 */
export function KpiCard({ kpi }) {
  const unavailable = (kpi.unavailable_sources || []).length > 0;
  return (
    <div data-testid={`kpi-${kpi.metric_key}`} className="rounded-2xl border border-border/60 bg-card p-4 min-w-0">
      <p className="text-[10px] uppercase tracking-[.12em] text-muted-foreground font-bold truncate">{kpi.label}</p>
      <p className="text-xl md:text-2xl font-black mt-2 tabular-nums truncate">
        {kpi.unit === "EUR_minor" ? eur(kpi.value) : count(kpi.value)}
      </p>
      <div className="flex items-center justify-between gap-2 mt-2">
        <Chip tone={kpi.truth_class} title={kpi.claim_boundary || undefined}>{kpi.truth_class}</Chip>
        {known(kpi.numerator) && known(kpi.denominator) && (
          <span className="text-[9px] text-muted-foreground">{kpi.numerator}/{kpi.denominator}</span>
        )}
      </div>
      {unavailable && (
        <p data-testid={`kpi-${kpi.metric_key}-unavailable`} className="mt-2 text-[10px] text-amber-700 font-semibold">
          Source unavailable: {kpi.unavailable_sources.join(", ")}. This is not a zero.
        </p>
      )}
      {kpi.claim_boundary && !unavailable && (
        <p className="mt-2 text-[10px] text-muted-foreground leading-snug">{kpi.claim_boundary}</p>
      )}
    </div>
  );
}

/** States what the founder is not seeing, per the workspace contract. */
export function SourceHealthBar({ context, sourceHealth }) {
  if (!context) return null;
  const degraded = (sourceHealth || []).filter((row) => row.state !== "OBSERVED");
  return (
    <div data-testid="source-health" className="rounded-xl border border-border/60 bg-secondary/20 p-3 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap text-[11px]">
        <span className="font-black uppercase tracking-wider text-muted-foreground">Sources</span>
        <span className="font-bold">
          {(sourceHealth || []).length - degraded.length}/{(sourceHealth || []).length} observed
        </span>
        <span className="text-muted-foreground">· reconstructed {when(context.reconstructed_at)}</span>
      </div>
      {degraded.length > 0 && (
        <p data-testid="source-degraded" className="text-[11px] text-rose-700 font-semibold">
          Could not read: {degraded.map((row) => `${row.source} (${row.state.toLowerCase()})`).join(", ")}.
          Rows from those sources are absent, not zero, and the total is hidden.
        </p>
      )}
      <p className="text-[10px] text-muted-foreground">{context.truth_boundary}</p>
    </div>
  );
}

export function PipelineRowCard({ row, onPreview, busy }) {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid={`row-${row.canonical_id}`} className="rounded-xl border border-border/60 bg-card p-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <button type="button" onClick={() => setOpen((value) => !value)}
            className="text-sm font-bold truncate hover:underline text-left">
            {row.person_name || row.display_name}
          </button>
          {row.person_name && <p className="mt-0.5 max-w-xl truncate text-[10px] text-muted-foreground">{[row.person_title, row.display_name].filter(Boolean).join(" · ")}</p>}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <Chip tone={row.stage_conflicted ? "CONFLICTED" : row.stage_confidence}>
              {row.stage ? humanize(row.stage) : "stage unreadable"}
            </Chip>
            <span className="text-[10px] text-muted-foreground">{humanize(row.lane)}</span>
            {row.country && <span className="text-[10px] text-muted-foreground">· {row.country}</span>}
            {(row.personas || []).slice(0, 2).map((persona) => <Chip key={persona} tone="DERIVED">{humanize(persona)}</Chip>)}
          </div>
        </div>
        <div className="text-right shrink-0">
          {row.entity_type === "OutboundLead"
            ? <><p className="text-sm font-black tabular-nums">Score {row.score == null ? "—" : row.score}</p><p className="text-[10px] text-muted-foreground">GMV/TPV {row.gmv_truth_class === "ESTIMATED" ? `${compactEur(row.estimated_gmv_min_eur)}–${compactEur(row.estimated_gmv_max_eur)}` : "unknown"}</p></>
            : <p className="text-sm font-black tabular-nums">{eur(row.expected_value_minor)}</p>}
          <p className="text-[10px] text-muted-foreground">{row.owner || "unassigned"}</p>
        </div>
      </div>

      {row.stage_conflicted && (
        <p data-testid={`conflict-${row.canonical_id}`} className="mt-2 text-[11px] text-amber-700">
          <AlertTriangle size={10} className="inline mr-1" />
          Stage sources disagree. Showing the least-advanced reading, because claiming progress that
          cannot be proven would be worse than showing less.
        </p>
      )}

      {row.attention_reasons.length > 0 && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Needs attention: {row.attention_reasons.map(humanize).join(", ")}
        </p>
      )}

      {open && (
        <div className="mt-3 border-t border-border/60 pt-3 space-y-2">
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-[11px]">
            <dt className="text-muted-foreground">Entity</dt><dd className="font-bold">{row.entity_type}</dd>
            <dt className="text-muted-foreground">Person</dt><dd className="font-bold">{row.person_name || "—"}</dd>
            <dt className="text-muted-foreground">Role</dt><dd className="font-bold">{row.person_title || "—"}</dd>
            <dt className="text-muted-foreground">Contact</dt><dd className="font-bold">{row.person_email || "Verified email required"}</dd>
            <dt className="text-muted-foreground">Next action</dt><dd className="font-bold">{row.next_action || "—"}</dd>
            <dt className="text-muted-foreground">Due</dt><dd className="font-bold">{when(row.next_action_at)}</dd>
            <dt className="text-muted-foreground">Last activity</dt><dd className="font-bold">{when(row.last_activity_at)}</dd>
          </dl>
          {(row.readings || []).length > 0 && (
            <div data-testid={`readings-${row.canonical_id}`}>
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Stage sources</p>
              <ul className="mt-1 space-y-0.5">
                {row.readings.map((reading) => (
                  <li key={reading.column} className="text-[11px]">
                    <span className="text-muted-foreground">{reading.column}</span>{" = "}
                    <span className="font-mono">{reading.raw}</span>{" → "}
                    <span className="font-bold">{reading.canonical}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button type="button" onClick={() => onPreview(row)} disabled={busy}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-border/60 text-[10px] font-bold hover:bg-secondary disabled:opacity-50">
            <GitBranch size={10} /> Preview stage change
          </button>
        </div>
      )}
    </div>
  );
}

/** Shows exactly what a transition would do, including what it will NOT touch. */
export function TransitionPreview({ preview, onClose, onApply, busy }) {
  if (!preview) return null;
  return (
    <div data-testid="transition-preview" className="rounded-xl border border-border/60 bg-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Stage change preview</p>
        <button type="button" onClick={onClose} className="text-[10px] font-bold text-muted-foreground hover:text-foreground">Close</button>
      </div>
      <p className="text-sm font-bold">
        {humanize(preview.from_stage || "unknown")} → {humanize(preview.to_stage)}
        <span className="ml-2 text-[10px] font-normal text-muted-foreground">{preview.direction}</span>
      </p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <dt className="text-muted-foreground">Writes</dt>
        <dd className="font-bold font-mono">{preview.subject_type}.{preview.writes_column}</dd>
        <dt className="text-muted-foreground">Left untouched</dt>
        <dd className="font-bold font-mono">{(preview.other_columns_untouched || []).join(", ") || "—"}</dd>
      </dl>
      {(preview.other_columns_untouched || []).length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          Only one progression column moves. Writing the others would assert values nobody supplied.
        </p>
      )}
      {!preview.allowed && (
        <p data-testid="preview-blocked" className="text-[11px] text-rose-700 font-semibold">
          Refused: {preview.blockers.map(humanize).join(", ")}.
        </p>
      )}
      <button type="button" onClick={onApply} disabled={busy || !preview.allowed}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-foreground text-background text-[11px] font-bold hover:opacity-90 disabled:opacity-50">
        Apply exactly this change
      </button>
    </div>
  );
}

const QUICK_VIEW_FILTERS = {
  all: {},
  needs_attention: { needs_attention: true },
  unassigned: { unassigned: true },
  conflicted: { conflicted: true },
  overdue: { needs_attention: true },
  open: { terminal: false },
};

export default function AdminPipelineWorkspace() {
  const [data, setData] = useState(null);
  const [quickView, setQuickView] = useState("all");
  const [query, setQuery] = useState("");
  const [lane, setLane] = useState("");
  const [persona, setPersona] = useState("");
  const [readiness, setReadiness] = useState("");
  const [gmvBand, setGmvBand] = useState("");
  const [minimumScore, setMinimumScore] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);

  const filters = useMemo(() => ({
    ...QUICK_VIEW_FILTERS[quickView],
    ...(query.trim() ? { q: query.trim() } : {}),
    ...(lane ? { lane } : {}),
    ...(persona ? { persona } : {}),
    ...(readiness ? { readiness } : {}),
    ...(gmvBand ? { gmv_band: gmvBand } : {}),
    ...(minimumScore ? { min_score: Number(minimumScore) } : {}),
  }), [gmvBand, lane, minimumScore, persona, query, quickView, readiness]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await callPipeline("portfolio", { filters, sort: "stage" }));
      setError(null);
    } catch (e) {
      setError(e?.message || "Could not load the pipeline.");
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const openPreview = async (row) => {
    setBusy(true);
    try {
      const next = await callPipeline("preview_stage_change", {
        lane: row.lane, subject_id: row.canonical_id, to_stage: "CONTACTED",
      });
      setPreview({ ...next.preview, preview_hash: next.preview_hash });
    } catch (e) {
      setError(e?.message || "Could not preview that change.");
    } finally { setBusy(false); }
  };

  const applyPreview = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      await callPipeline("apply_stage_change", {
        lane: preview.lane, subject_id: preview.subject_id, to_stage: preview.to_stage,
        expected_preview_hash: preview.preview_hash,
      });
      setPreview(null);
      await load();
    } catch (e) {
      setError(e?.message || "Could not apply that change.");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <Users size={18} /> Pipeline
          </h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-3xl">
            Every commercial relationship from discovery to handoff. Stage is read from the
            authority that owns it in each lane — this page projects, it never becomes a second
            source of truth.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={load} disabled={loading}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-border/60 text-[11px] font-bold hover:bg-secondary disabled:opacity-50">
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-emerald-200 bg-emerald-50 text-[11px] font-bold text-emerald-700">
            <ShieldCheck size={11} /> Projection only
          </span>
        </div>
      </div>

      <SourceHealthBar context={data?.context} sourceHealth={data?.source_health} />

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2.5">
        {(data?.kpis || []).map((kpi) => <KpiCard key={kpi.metric_key} kpi={kpi} />)}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {(data?.quick_views || []).map((view) => (
          <button key={view.key} type="button" onClick={() => setQuickView(view.key)}
            className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-full border text-[10px] font-bold ${
              quickView === view.key ? "border-foreground/40 bg-secondary" : "border-border/60 hover:bg-secondary/60"
            }`}>
            {view.label} <span className="text-muted-foreground">{count(view.count)}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input type="text" value={query} onChange={(event) => setQuery(event.target.value)}
          placeholder="Search person, role or company…"
          className="h-8 px-3 rounded-lg border border-border/60 bg-background text-xs min-w-[200px]" />
        <select value={lane} onChange={(event) => setLane(event.target.value)}
          className="h-8 px-2 rounded-lg border border-border/60 bg-background text-xs">
          <option value="">All lanes</option>
          {(data?.filter_options?.lane || []).map((value) => (
            <option key={value} value={value}>{humanize(value)}</option>
          ))}
        </select>
        <select value={persona} onChange={(event) => setPersona(event.target.value)} aria-label="Pipeline role filter"
          className="h-8 px-2 rounded-lg border border-border/60 bg-background text-xs">
          <option value="">All people roles</option>
          {(data?.filter_options?.persona || []).map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
        </select>
        <select value={gmvBand} onChange={(event) => setGmvBand(event.target.value)} aria-label="Pipeline GMV filter"
          className="h-8 px-2 rounded-lg border border-border/60 bg-background text-xs">
          <option value="">Any estimated GMV / TPV</option>
          <option value="UNDER_1M">Under €1M</option><option value="FROM_1M_TO_5M">€1M–€5M</option><option value="FROM_5M_TO_20M">€5M–€20M</option><option value="FROM_20M_TO_100M">€20M–€100M</option><option value="OVER_100M">€100M+</option><option value="UNKNOWN">Unknown</option>
        </select>
        <select value={minimumScore} onChange={(event) => setMinimumScore(event.target.value)} aria-label="Pipeline minimum score"
          className="h-8 px-2 rounded-lg border border-border/60 bg-background text-xs">
          <option value="">Any score</option>{[50, 60, 70, 80, 90].map((value) => <option key={value} value={value}>{value}+</option>)}
        </select>
        <select value={readiness} onChange={(event) => setReadiness(event.target.value)} aria-label="Pipeline readiness filter"
          className="h-8 px-2 rounded-lg border border-border/60 bg-background text-xs">
          <option value="">Any outreach readiness</option>
          {(data?.filter_options?.readiness || []).map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
        </select>
        <span className="text-[11px] text-muted-foreground">
          {data?.items?.total === null
            ? `${(data?.items?.rows || []).length} shown · total hidden while a source is unreadable`
            : `${count(data?.items?.total)} total`}
        </span>
      </div>

      <TransitionPreview preview={preview} onClose={() => setPreview(null)} onApply={applyPreview} busy={busy} />

      {error && <p data-testid="pipeline-error" className="text-[11px] text-rose-700">{error}</p>}

      <div className="space-y-2">
        {loading && !data && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 size={12} className="animate-spin" /> Reconstructing from canonical authorities…
          </p>
        )}
        {data && (data.items?.rows || []).length === 0 && (
          <p data-testid="pipeline-empty" className="text-xs text-muted-foreground">
            {data.context?.data_complete === false
              ? "No rows to show, and at least one source could not be read — this is not an empty pipeline."
              : "No rows match this view."}
          </p>
        )}
        {(data?.items?.rows || []).map((row) => (
          <PipelineRowCard key={row.canonical_id} row={row} onPreview={openPreview} busy={busy} />
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
        <Sparkles size={10} /> Reaching a won stage does not create a merchant. Brand onboarding remains the only authority for that.
      </p>
    </div>
  );
}
