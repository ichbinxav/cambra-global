// CAMP-C2 (2026-08-16) — Campaigns workspace (PROMPT_FIX_DISCOVERY_V2 Parte 4).
// C2 scope: Overview, All Campaigns and Detail, plus draft creation from an
// explicit lead selection. Audience/Content/Sequence/Preflight land in C3 and
// execution in C4 — the tabs for those are present but explicitly declare what
// is not built yet rather than showing an empty shell.
//
// Fail-visible (spec §23.2): an unavailable source renders "Data unavailable"
// with its blocker, never a silently empty table.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Ban, ChevronRight, Layers, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { base44 } from "@/api/base44Client";

const TABS = [
  ["overview", "Overview"],
  ["all", "All Campaigns"],
  ["detail", "Detail"],
];

const LANES = [
  ["MERCHANT_ACQUISITION", "Merchant acquisition"],
  ["PARTNER_ACQUISITION", "Partner acquisition"],
  ["PROVIDER_RELATIONS", "Provider relations"],
  ["MERCHANT_LIFECYCLE", "Merchant lifecycle"],
];

const CANONICAL_STATUSES = [
  "ALL", "DRAFT", "AUDIENCE_BUILDING", "AUDIENCE_READY", "CONTENT_INCOMPLETE",
  "SEQUENCE_INCOMPLETE", "SENDING_CONFIGURATION_REQUIRED", "PREFLIGHT_BLOCKED",
  "READY_FOR_APPROVAL", "APPROVED", "SCHEDULED", "RUNNING", "PAUSED",
  "COMPLETED", "STOPPED", "REVIEW_REQUIRED", "ARCHIVED",
];

const call = async (action, payload = {}) => {
  const response = await base44.functions.invoke("adminSummaries", { action: `campaign_${action}`, ...payload });
  const data = response?.data || response;
  if (data?.ok === false) throw Object.assign(new Error(data.error || "Campaign operation failed"), { data });
  return data;
};

const count = (value) => (Number.isFinite(Number(value)) ? Number(value).toLocaleString() : "—");
const date = (value) => (value ? new Date(value).toLocaleString() : "—");

function Chip({ children, tone = "neutral" }) {
  const style = {
    good: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warn: "border-amber-200 bg-amber-50 text-amber-700",
    bad: "border-rose-200 bg-rose-50 text-rose-700",
    info: "border-sky-200 bg-sky-50 text-sky-700",
    neutral: "border-border/60 bg-secondary/40 text-muted-foreground",
  }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[9px] font-bold tracking-wide ${style}`}>{children}</span>;
}

function statusTone(status) {
  if (["RUNNING", "APPROVED", "COMPLETED"].includes(status)) return "good";
  if (["PAUSED", "SCHEDULED"].includes(status)) return "info";
  if (["PREFLIGHT_BLOCKED", "REVIEW_REQUIRED", "STOPPED"].includes(status)) return "bad";
  return "neutral";
}

/** Fail-visible empty/error state — never an unexplained blank table. */
function DataUnavailable({ blockers = [], onRetry }) {
  return (
    <div data-testid="campaigns-data-unavailable" className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700" />
        <div className="min-w-0">
          <p className="text-xs font-black text-amber-900">Data unavailable</p>
          <p className="mt-1 text-[11px] text-amber-800">
            CAMBRA could not read the canonical campaign source, so this view is blocked rather than shown as empty.
          </p>
          {blockers.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[10px] text-amber-800">
              {blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
            </ul>
          )}
          {onRetry && (
            <button onClick={onRetry} className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-300 px-3 text-[10px] font-bold text-amber-900">
              <RefreshCw size={12} />Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ kpi }) {
  const unknown = kpi.status !== "OBSERVED";
  return (
    <div data-testid={`campaign-kpi-${kpi.key}`} className="rounded-2xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{kpi.label}</p>
        <Chip tone={unknown ? "warn" : "neutral"}>{kpi.status}</Chip>
      </div>
      <p className={`mt-2 text-2xl font-black ${unknown ? "text-muted-foreground" : ""}`}>
        {unknown ? "Unknown" : count(kpi.value)}
      </p>
      <dl className="mt-3 space-y-0.5 text-[9px] text-muted-foreground">
        <div><dt className="inline font-bold">Formula: </dt><dd className="inline">{kpi.formula}</dd></div>
        <div><dt className="inline font-bold">Denominator: </dt><dd className="inline">{kpi.denominator}</dd></div>
        <div><dt className="inline font-bold">Source: </dt><dd className="inline">{kpi.source}</dd></div>
        <div><dt className="inline font-bold">Freshness: </dt><dd className="inline">{kpi.freshness ? date(kpi.freshness) : "Unknown"}</dd></div>
        {unknown && kpi.blocker && (
          <div><dt className="inline font-bold">Blocked by: </dt><dd className="inline">{kpi.blocker}</dd></div>
        )}
      </dl>
    </div>
  );
}

function Overview({ data, loading, reload }) {
  if (loading && !data) return <div className="flex items-center gap-2 p-8 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" />Loading campaigns…</div>;
  if (data?.data_status === "UNAVAILABLE") return <DataUnavailable blockers={["commercial_campaign_source_unavailable"]} onRetry={reload} />;
  const posture = data?.outbound_posture || {};
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">Campaigns</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Who we contact, what we send, why, when, from which infrastructure — and with what observed result.
          </p>
        </div>
        <button onClick={reload} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold">
          <RefreshCw size={13} />Refresh
        </button>
      </div>

      <section data-testid="campaigns-posture" className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4">
        <ShieldAlert size={16} className="text-muted-foreground" />
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={posture.status === "ENABLED" ? "good" : posture.status === "UNKNOWN" ? "warn" : "info"}>
            Outbound: {posture.status || "UNKNOWN"}
          </Chip>
          <Chip tone={posture.safe_mode === "SAFE_MODE_ACTIVE" ? "bad" : posture.safe_mode === "UNKNOWN" ? "warn" : "neutral"}>
            {posture.safe_mode || "UNKNOWN"}
          </Chip>
        </div>
        <p className="min-w-0 flex-1 text-[10px] text-muted-foreground">{posture.truth_boundary}</p>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(data?.kpis || []).map((kpi) => <KpiCard key={kpi.key} kpi={kpi} />)}
      </div>

      <section className="rounded-2xl border bg-card">
        <div className="border-b p-4">
          <h3 className="text-sm font-black">Needs attention</h3>
          <p className="mt-1 text-[10px] text-muted-foreground">Campaigns with blockers or in REVIEW_REQUIRED.</p>
        </div>
        <div className="divide-y">
          {(data?.needs_attention || []).length === 0
            ? <p className="p-4 text-xs text-muted-foreground">No campaign currently reports a blocker.</p>
            : data.needs_attention.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold">{row.name}</p>
                  <p className="text-[10px] text-muted-foreground">{(row.blockers || []).join(" · ") || "REVIEW_REQUIRED"}</p>
                </div>
                <Chip tone={statusTone(row.status)}>{row.status}</Chip>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}

function AllCampaigns({ data, loading, filters, setFilters, reload, onOpen }) {
  if (loading && !data) return <div className="flex items-center gap-2 p-8 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" />Loading…</div>;
  if (data?.data_status === "UNAVAILABLE") return <DataUnavailable blockers={data?.blockers || []} onRetry={reload} />;
  const items = data?.items || [];
  return (
    <div className="space-y-4">
      <section className="grid gap-3 rounded-2xl border bg-card p-4 md:grid-cols-4">
        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase text-muted-foreground">Status</span>
          <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className="h-9 w-full rounded-lg border bg-background px-2 text-xs">
            {CANONICAL_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase text-muted-foreground">Lane</span>
          <select value={filters.lane} onChange={(event) => setFilters((current) => ({ ...current, lane: event.target.value }))} className="h-9 w-full rounded-lg border bg-background px-2 text-xs">
            <option value="ALL">ALL</option>
            {LANES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase text-muted-foreground">Search</span>
          <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Name or key" className="h-9 w-full rounded-lg border bg-background px-2 text-xs" />
        </label>
        <label className="flex items-end gap-2">
          <input type="checkbox" checked={filters.needs_attention} onChange={(event) => setFilters((current) => ({ ...current, needs_attention: event.target.checked }))} className="h-4 w-4" />
          <span className="pb-2 text-[10px] font-bold uppercase text-muted-foreground">Needs attention</span>
        </label>
      </section>

      <p className="text-[10px] text-muted-foreground">
        Showing {count(data?.returned)} of {count(data?.total)} campaigns.
      </p>

      <section className="overflow-hidden rounded-2xl border bg-card">
        {items.length === 0
          ? <p className="p-6 text-xs text-muted-foreground">No campaign matches these filters.</p>
          : (
            <div className="divide-y">
              {items.map((row) => (
                <button key={row.id} data-testid={`campaign-row-${row.id}`} onClick={() => onOpen(row.id)} className="flex w-full flex-wrap items-center gap-3 p-4 text-left hover:bg-secondary/40">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-black">{row.name}</p>
                      <Chip tone={statusTone(row.status)}>{row.status}</Chip>
                      {row.status_is_legacy && <Chip tone="warn">legacy: {row.stored_status}</Chip>}
                      {row.needs_attention && <Chip tone="bad">needs attention</Chip>}
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {[row.lane, row.objective_type, (row.markets || []).join("/"), row.owner].filter(Boolean).join(" · ") || "No lane set"}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-center text-[10px]">
                    <div><p className="font-black">{count(row.legacy_lead_count)}</p><p className="text-muted-foreground">Leads</p></div>
                    <div><p className="font-black">{row.metrics.provider_accepted === null ? "—" : count(row.metrics.provider_accepted)}</p><p className="text-muted-foreground">Accepted</p></div>
                    <div><p className="font-black">{row.metrics.replied === null ? "—" : count(row.metrics.replied)}</p><p className="text-muted-foreground">Replies</p></div>
                  </div>
                  <ChevronRight size={14} className="text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
      </section>
    </div>
  );
}

function Detail({ detail, loading, onBack }) {
  if (loading && !detail) return <div className="flex items-center gap-2 p-8 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" />Loading campaign…</div>;
  if (!detail) return <p className="p-6 text-xs text-muted-foreground">Select a campaign from All Campaigns.</p>;
  const item = detail.item || {};
  const gaps = detail.canonical_model_gaps || [];
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-[10px] font-bold text-muted-foreground">← Back to all campaigns</button>
      <section className="rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-black">{item.name}</h2>
          <Chip tone={statusTone(item.status)}>{item.status}</Chip>
          {item.status_is_legacy && <Chip tone="warn">stored as {item.stored_status}</Chip>}
        </div>
        <dl className="mt-4 grid gap-3 text-[11px] md:grid-cols-4">
          <div><dt className="text-muted-foreground">Lane</dt><dd className="font-bold">{item.lane || "—"}</dd></div>
          <div><dt className="text-muted-foreground">Objective</dt><dd className="font-bold">{item.objective_type || "—"}</dd></div>
          <div><dt className="text-muted-foreground">Owner</dt><dd className="font-bold">{item.owner || "—"}</dd></div>
          <div><dt className="text-muted-foreground">Policy</dt><dd className="font-bold">{item.policy_key || "—"}</dd></div>
        </dl>
        {(item.blockers || []).length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-[10px] font-black uppercase text-amber-800">Blockers</p>
            <ul className="mt-1 list-disc pl-4 text-[11px] text-amber-800">
              {item.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
            </ul>
          </div>
        )}
      </section>

      <section data-testid="campaign-canonical-model" className="rounded-2xl border bg-card p-5">
        <h3 className="text-sm font-black">Canonical model</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {[
            ["Audience", detail.audience_versions, "no_versioned_audience"],
            ["Content", detail.content_versions, "no_versioned_content"],
            ["Sequence", detail.sequence_versions, "no_versioned_sequence"],
          ].map(([label, versions, gapKey]) => (
            <div key={label} className="rounded-xl border bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold">{label}</p>
                <Chip tone={gaps.includes(gapKey) ? "warn" : "good"}>
                  {gaps.includes(gapKey) ? "not versioned" : `v${(versions || [])[0]?.version ?? "?"}`}
                </Chip>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                {gaps.includes(gapKey)
                  ? "This campaign predates the versioned authority. Its legacy evidence is shown below and is not reconstructed as a version."
                  : `${(versions || []).length} version(s) recorded.`}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl bg-secondary/40 p-3 text-[10px] text-muted-foreground">
          <p className="font-bold">Legacy projection</p>
          <p className="mt-1">
            {count(detail.legacy_projection?.lead_ids_count)} lead id(s) · message {detail.legacy_projection?.message_prepared ? "prepared" : "not prepared"} · sequence {detail.legacy_projection?.sequence_prepared ? "prepared" : "not prepared"}
          </p>
          <p className="mt-1">{detail.legacy_projection?.note}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-dashed bg-card p-5">
        <div className="flex items-start gap-3">
          <Layers size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-xs font-black">Audience, Content, Sequence and Preflight editing</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Not built yet — chunk C3. Execution, scheduling and analytics land in C4. This workspace performs no sends in any chunk of this work.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function AdminCampaigns() {
  const [tab, setTab] = useState("overview");
  const [overview, setOverview] = useState(null);
  const [list, setList] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ status: "ALL", lane: "ALL", search: "", needs_attention: false });

  const loadOverview = useCallback(async () => {
    setLoading(true); setError("");
    try { setOverview(await call("overview")); }
    catch (caught) { setError(caught.message); setOverview(caught.data || { data_status: "UNAVAILABLE" }); }
    finally { setLoading(false); }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true); setError("");
    try {
      setList(await call("list", {
        status: filters.status, lane: filters.lane, search: filters.search,
        needs_attention: filters.needs_attention,
      }));
    } catch (caught) { setError(caught.message); setList(caught.data || { data_status: "UNAVAILABLE" }); }
    finally { setLoading(false); }
  }, [filters]);

  const openDetail = useCallback(async (campaignId) => {
    setTab("detail"); setLoading(true); setError("");
    try { setDetail(await call("detail", { campaign_id: campaignId })); }
    catch (caught) { setError(caught.message); setDetail(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (tab === "overview") loadOverview(); }, [tab, loadOverview]);
  useEffect(() => { if (tab === "all") loadList(); }, [tab, loadList]);

  const body = useMemo(() => {
    if (tab === "overview") return <Overview data={overview} loading={loading} reload={loadOverview} />;
    if (tab === "all") return <AllCampaigns data={list} loading={loading} filters={filters} setFilters={setFilters} reload={loadList} onOpen={openDetail} />;
    return <Detail detail={detail} loading={loading} onBack={() => setTab("all")} />;
  }, [tab, overview, list, detail, loading, filters, loadOverview, loadList, openDetail]);

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-1">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            aria-current={tab === key ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-[11px] font-bold ${tab === key ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-[10px] font-bold text-muted-foreground">
          <Ban size={12} />No sends from this workspace
        </span>
      </div>
      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] text-rose-700">{error}</div>
      )}
      {body}
    </div>
  );
}
