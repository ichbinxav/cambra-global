import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRight, Check, ChevronDown, Filter, Loader2,
  RefreshCw, Save, Search, Target, UserRound, Users, X,
} from "lucide-react";
import { base44 } from "@/api/base44Client";

const PERSONA_LABELS = {
  FOUNDER: "Founder / owner",
  EXECUTIVE: "CEO / executive",
  FINANCE: "CFO / finance",
  PROCUREMENT: "Procurement / buyer",
  PAYMENTS: "Payments",
  ECOMMERCE: "Ecommerce",
  OPERATIONS: "Operations",
  PARTNERSHIPS: "Partnerships / BD",
  OTHER: "Other observed role",
  UNKNOWN: "Role unknown",
};

const GMV_LABELS = {
  UNDER_1M: "Under €1M",
  FROM_1M_TO_5M: "€1M–€5M",
  FROM_5M_TO_20M: "€5M–€20M",
  FROM_20M_TO_100M: "€20M–€100M",
  OVER_100M: "€100M+",
  UNKNOWN: "Unknown",
};

const initialFilters = {
  query: "",
  persona: "",
  country: "",
  gmv_band: "",
  min_score: "",
  readiness: "",
  pipeline_state: "",
  named_only: true,
};

const humanize = (value) => String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const number = (value) => Number.isFinite(Number(value)) ? Number(value).toLocaleString() : "—";
const money = (value) => Number.isFinite(Number(value))
  ? new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 }).format(Number(value))
  : "—";

function gmvRange(row) {
  if (row.gmv_truth_class !== "ESTIMATED") return "Unknown";
  if (row.estimated_gmv_min_eur != null && row.estimated_gmv_max_eur != null) {
    return `${money(row.estimated_gmv_min_eur)}–${money(row.estimated_gmv_max_eur)}`;
  }
  return money(row.estimated_gmv_min_eur ?? row.estimated_gmv_max_eur);
}

function Tone({ children, value }) {
  const style = value === "READY" || value === "IN_PIPELINE" || value === "WON"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : value === "BLOCKED" || value === "EXCLUDED"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : value === "REVIEW_REQUIRED" || value === "DISCOVERED"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-border/60 bg-secondary/40 text-muted-foreground";
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-black ${style}`}>{children}</span>;
}

async function callPipeline(action, payload = {}) {
  const response = await base44.functions.invoke("adminSummaries", { action: `pipeline_${action}`, ...payload });
  const data = response?.data || response;
  if (data?.ok === false || data?.error) throw Object.assign(new Error(data.error || "pipeline_operation_failed"), { data });
  return data;
}

function FilterSelect({ label, value, onChange, children }) {
  return (
    <label className="space-y-1">
      <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-xl border bg-background px-2 text-xs">
        {children}
      </select>
    </label>
  );
}

function Detail({ row }) {
  return (
    <div className="grid gap-3 border-t bg-secondary/15 p-4 lg:grid-cols-3">
      <section className="rounded-xl border bg-background p-3">
        <p className="text-[10px] font-black uppercase tracking-wider">Why this score</p>
        {(row.reasons || []).length
          ? <ul className="mt-2 space-y-1 text-[10px] text-muted-foreground">{row.reasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul>
          : <p className="mt-2 text-[10px] text-muted-foreground">No score explanation was persisted. The score is not treated as self-explanatory.</p>}
        {Object.keys(row.score_breakdown || {}).length > 0 && <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-secondary/40 p-2 text-[9px]">{JSON.stringify(row.score_breakdown, null, 2)}</pre>}
      </section>
      <section className="rounded-xl border bg-background p-3">
        <p className="text-[10px] font-black uppercase tracking-wider">Company evidence</p>
        <dl className="mt-2 grid grid-cols-2 gap-1 text-[10px]">
          <dt className="text-muted-foreground">Employees</dt><dd className="font-bold">{row.employee_range || "Unknown"}</dd>
          <dt className="text-muted-foreground">Revenue</dt><dd className="font-bold">{row.revenue_range || "Unknown"}</dd>
          <dt className="text-muted-foreground">GMV / TPV</dt><dd className="font-bold">{gmvRange(row)}</dd>
          <dt className="text-muted-foreground">Source</dt><dd className="font-bold">{row.source || "Unknown"}</dd>
        </dl>
        {Object.keys(row.source_evidence || {}).length > 0 && <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-secondary/40 p-2 text-[9px]">{JSON.stringify(row.source_evidence, null, 2)}</pre>}
      </section>
      <section className="rounded-xl border bg-background p-3">
        <p className="text-[10px] font-black uppercase tracking-wider">Next governed action</p>
        <p className="mt-2 text-xs font-bold">{row.next_action || "Review and qualify for Pipeline"}</p>
        <div className="mt-3 flex flex-wrap gap-1"><Tone value={row.pipeline_state}>{humanize(row.pipeline_state)}</Tone><Tone value={row.readiness}>{humanize(row.readiness)}</Tone></div>
        {(row.blockers || []).length > 0 && <p className="mt-2 text-[9px] leading-4 text-muted-foreground">{row.blockers.join(" / ")}</p>}
        {row.linkedin_url && <a href={row.linkedin_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-[10px] font-black underline">Open observed LinkedIn profile</a>}
      </section>
    </div>
  );
}

export default function PeopleDiscovery({ call }) {
  const [filters, setFilters] = useState(initialFilters);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [expanded, setExpanded] = useState("");
  const [audienceName, setAudienceName] = useState("");
  const [savingAudience, setSavingAudience] = useState(false);
  const [savedAudience, setSavedAudience] = useState(null);
  const [pipelinePlan, setPipelinePlan] = useState(null);
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const filterKey = JSON.stringify(filters);

  const load = async () => {
    setLoading(true);
    setError("");
    try { setData(await call("people", { ...filters, limit: 120 })); }
    catch (caught) { setError(caught?.message || "People discovery is unavailable"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const next = await call("people", { ...filters, limit: 120 });
        if (active) setData(next);
      } catch (caught) {
        if (active) setError(caught?.message || "People discovery is unavailable");
      } finally { if (active) setLoading(false); }
    }, filters.query ? 300 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [filterKey]);

  const rows = data?.items || [];
  const selectedRows = useMemo(() => rows.filter((row) => selected.has(row.id)), [rows, selected]);
  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const toggle = (id) => setSelected((current) => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const selectVisible = () => setSelected(new Set(rows.map((row) => row.id)));
  const selectAllMatches = () => setSelected(new Set(data?.matched_ids || []));
  const selectTop = () => setSelected(new Set(rows.slice(0, 50).map((row) => row.id)));

  const saveAudience = async () => {
    if (!audienceName.trim() || !selected.size || savingAudience) return;
    setSavingAudience(true); setError(""); setNotice("");
    try {
      const result = await call("save_audience", {
        name: audienceName.trim(), lead_ids: [...selected], filters,
      });
      setSavedAudience(result.audience);
      setAudienceName("");
      setNotice(`Audience saved with ${result.audience.member_count} people. Nothing was sent.`);
    } catch (caught) { setError(caught?.message || "Audience could not be saved"); }
    finally { setSavingAudience(false); }
  };

  const preparePipeline = async () => {
    if (!selectedRows.length || selectedRows.length > 25) return;
    setPipelineBusy(true); setError(""); setPipelinePlan(null);
    const previews = [], already = [], failed = [];
    for (const row of selectedRows) {
      if (row.pipeline_state !== "DISCOVERED") { already.push(row); continue; }
      try {
        const result = await callPipeline("preview_stage_change", {
          lane: "MERCHANT_ACQUISITION", subject_id: row.id, to_stage: "QUALIFIED",
          reason_code: "FOUNDER_SELECTED_FROM_DISCOVERY_PEOPLE",
        });
        previews.push({ row, preview: result.preview, preview_hash: result.preview_hash });
      } catch (caught) { failed.push({ row, error: caught?.message || "preview_failed" }); }
    }
    setPipelinePlan({ previews, already, failed });
    setPipelineBusy(false);
  };

  const applyPipeline = async () => {
    if (!pipelinePlan?.previews?.length || pipelineBusy) return;
    setPipelineBusy(true); setError("");
    let applied = 0;
    const failed = [...pipelinePlan.failed];
    for (const item of pipelinePlan.previews) {
      try {
        await callPipeline("apply_stage_change", {
          lane: "MERCHANT_ACQUISITION",
          subject_id: item.row.id,
          to_stage: "QUALIFIED",
          expected_preview_hash: item.preview_hash,
          reason_code: "FOUNDER_SELECTED_FROM_DISCOVERY_PEOPLE",
          reason_detail: "Explicitly confirmed in Discovery People workspace",
        });
        applied += 1;
      } catch (caught) { failed.push({ row: item.row, error: caught?.message || "apply_failed" }); }
    }
    setPipelinePlan(null);
    setNotice(`${applied} people moved to Pipeline; ${pipelinePlan.already.length} were already there.${failed.length ? ` ${failed.length} need review.` : ""} No message was sent.`);
    setPipelineBusy(false);
    await load();
  };

  const metrics = data?.metrics || {};
  const cards = [
    ["Named people", metrics.named_contacts],
    ["High fit", metrics.high_fit],
    ["Send-ready", metrics.send_ready],
    ["GMV known", metrics.gmv_known],
  ];

  return (
    <div className="space-y-5" data-testid="people-discovery">
      <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-5 text-white shadow-xl md:p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-300">People-first discovery</p>
            <h2 className="mt-2 text-2xl font-black">Find the person, understand the fit, take the next action</h2>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-white/60">Founders, CFOs, procurement, payments and ecommerce leaders inside the companies CAMBRA has discovered. Scores and GMV remain explicitly derived or unknown.</p>
            <p className="mt-3 text-[10px] font-bold text-emerald-200">Operational launch scope: {(data?.market_scope?.active_launch_markets || []).join(" · ") || "the 10 founder-approved markets"}. Historical leads outside this scope stay stored but cannot enter an audience or campaign.</p>
          </div>
          <div className="flex gap-2"><button onClick={load} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/15 px-3 text-xs font-black"><RefreshCw size={12} className={loading ? "animate-spin" : ""} />Refresh</button><a href="/admin/campaigns?mode=create" className="inline-flex h-9 items-center gap-2 rounded-xl bg-white px-3 text-xs font-black text-slate-950">Campaign Studio<ArrowRight size={12} /></a></div>
        </div>
      </section>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><AlertTriangle size={13} className="mr-2 inline" />{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800"><Check size={13} className="mr-2 inline" />{notice}</div>}
      {savedAudience && <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 text-xs"><b>{savedAudience.name}</b><span className="text-muted-foreground">{savedAudience.member_count} people</span><a href={`/admin/campaigns?mode=create&audience=${encodeURIComponent(savedAudience.id)}`} className="ml-auto rounded-lg bg-foreground px-3 py-2 font-black text-background">Use in campaign</a><a href="/admin/pipeline" className="rounded-lg border px-3 py-2 font-black">Open Pipeline</a></div>}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{cards.map(([label, value]) => <div key={label} className="rounded-2xl border bg-card p-4"><p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-black">{number(value)}</p></div>)}</div>

      <section className="rounded-2xl border bg-card p-4">
        <div className="flex items-center gap-2"><Filter size={14} /><h3 className="text-sm font-black">Filter people and their companies</h3><button onClick={() => setFilters(initialFilters)} className="ml-auto inline-flex items-center gap-1 text-[10px] font-black text-muted-foreground"><X size={11} />Clear</button></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <label className="space-y-1 xl:col-span-2"><span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">Search</span><div className="flex h-9 items-center rounded-xl border px-2"><Search size={12} /><input value={filters.query} onChange={(event) => setFilter("query", event.target.value)} placeholder="Person, title, company or email" className="h-full w-full bg-transparent px-2 text-xs outline-none" /></div></label>
          <FilterSelect label="Role" value={filters.persona} onChange={(value) => setFilter("persona", value)}><option value="">All roles</option>{(data?.filter_options?.personas || Object.keys(PERSONA_LABELS)).map((value) => <option key={value} value={value}>{PERSONA_LABELS[value] || humanize(value)}{data?.facet_counts?.personas?.[value] != null ? ` (${data.facet_counts.personas[value]})` : ""}</option>)}</FilterSelect>
          <FilterSelect label="Country" value={filters.country} onChange={(value) => setFilter("country", value)}><option value="">All countries</option>{(data?.filter_options?.countries || []).map((value) => <option key={value}>{value}</option>)}</FilterSelect>
          <FilterSelect label="Estimated GMV / TPV" value={filters.gmv_band} onChange={(value) => setFilter("gmv_band", value)}><option value="">Any size</option>{(data?.filter_options?.gmv_bands || []).map((value) => <option key={value} value={value}>{GMV_LABELS[value] || humanize(value)}</option>)}</FilterSelect>
          <FilterSelect label="Minimum score" value={filters.min_score} onChange={(value) => setFilter("min_score", value)}><option value="">Any score</option>{[50, 60, 70, 80, 90].map((value) => <option key={value} value={value}>{value}+</option>)}</FilterSelect>
          <FilterSelect label="Readiness" value={filters.readiness} onChange={(value) => setFilter("readiness", value)}><option value="">All readiness</option>{(data?.filter_options?.readiness || []).map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</FilterSelect>
          <FilterSelect label="Pipeline" value={filters.pipeline_state} onChange={(value) => setFilter("pipeline_state", value)}><option value="">Any stage</option>{(data?.filter_options?.pipeline_state || []).map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</FilterSelect>
        </div>
        <label className="mt-3 flex items-center gap-2 text-[10px] font-bold"><input type="checkbox" checked={filters.named_only} onChange={(event) => setFilter("named_only", event.target.checked)} />Named people only</label>
      </section>

      <section className="rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs"><b>{number(data?.total)}</b> matching people · showing {number(data?.returned)}</p>
          <button onClick={selectVisible} disabled={!rows.length} className="rounded-lg border px-3 py-2 text-[10px] font-black">Select visible</button>
          <button onClick={selectTop} disabled={!rows.length} className="rounded-lg border px-3 py-2 text-[10px] font-black">Select top 50</button>
          <button onClick={selectAllMatches} disabled={!data?.matched_ids?.length} className="rounded-lg border px-3 py-2 text-[10px] font-black">Select all matches (max 1,000)</button>
          {selected.size > 0 && <button onClick={() => setSelected(new Set())} className="rounded-lg border px-3 py-2 text-[10px] font-black">Clear {selected.size}</button>}
        </div>
        {selected.size > 0 && <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-secondary/35 p-3"><Users size={14} /><b className="text-xs">{selected.size} selected</b><input aria-label="Audience name" value={audienceName} onChange={(event) => setAudienceName(event.target.value)} placeholder="Audience name, e.g. ES CFOs · €5M+" className="h-9 min-w-[240px] flex-1 rounded-xl border bg-background px-3 text-xs" /><button onClick={saveAudience} disabled={!audienceName.trim() || savingAudience} className="inline-flex h-9 items-center gap-2 rounded-xl bg-foreground px-3 text-xs font-black text-background disabled:opacity-40">{savingAudience ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}Save audience</button><button onClick={preparePipeline} disabled={!selectedRows.length || selectedRows.length > 25 || pipelineBusy} className="inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-black disabled:opacity-40"><Target size={12} />Prepare Pipeline move</button>{selectedRows.length > 25 && <span className="text-[9px] text-amber-700">Pipeline confirmation is limited to 25 visible people per batch.</span>}</div>}
      </section>

      {pipelinePlan && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950"><div className="flex items-start gap-3"><AlertTriangle size={16} className="mt-0.5" /><div className="flex-1"><h3 className="text-sm font-black">Confirm Pipeline qualification</h3><p className="mt-1 text-[10px]">{pipelinePlan.previews.length} will move to Qualified, {pipelinePlan.already.length} are already in Pipeline and {pipelinePlan.failed.length} could not be prepared. This changes Pipeline stage only; it does not send or schedule outreach.</p><div className="mt-3 flex gap-2"><button onClick={applyPipeline} disabled={!pipelinePlan.previews.length || pipelineBusy} className="rounded-lg bg-amber-950 px-3 py-2 text-xs font-black text-white disabled:opacity-40">{pipelineBusy ? "Applying…" : `Confirm ${pipelinePlan.previews.length} changes`}</button><button onClick={() => setPipelinePlan(null)} className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-black">Cancel</button></div></div></div></section>}

      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="max-h-[720px] overflow-auto">
          <table className="min-w-[1100px] w-full text-left text-[10px]">
            <thead className="sticky top-0 z-10 bg-secondary text-[9px] uppercase tracking-wider text-muted-foreground"><tr><th className="p-3">Select</th><th className="p-3">Person</th><th className="p-3">Company</th><th className="p-3">Est. GMV / TPV</th><th className="p-3">Score</th><th className="p-3">Why</th><th className="p-3">State</th><th className="p-3">Details</th></tr></thead>
            <tbody>{rows.map((row) => [<tr key={row.id} className="border-t align-top hover:bg-secondary/25"><td className="p-3"><input aria-label={`Select ${row.person_name || row.company_name || row.id}`} type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} /></td><td className="p-3"><div className="flex items-start gap-2"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary"><UserRound size={12} /></span><div><p className="font-black">{row.person_name || "No named person"}</p><p className="max-w-xs text-muted-foreground">{row.person_title || "Role not observed"}</p><div className="mt-1 flex flex-wrap gap-1">{(row.personas || []).map((persona) => <Tone key={persona} value="UNKNOWN">{PERSONA_LABELS[persona] || humanize(persona)}</Tone>)}</div></div></div></td><td className="p-3"><p className="font-black">{row.company_name || "Unnamed company"}</p><p className="text-muted-foreground">{row.company_domain || "Domain unknown"}</p><p className="mt-1">{[row.country, row.industry].filter(Boolean).join(" · ") || "Market unknown"}</p></td><td className="p-3"><p className="font-black">{gmvRange(row)}</p><p className="text-[9px] text-muted-foreground">{row.gmv_truth_class}</p></td><td className="p-3"><p className="text-xl font-black">{row.score == null ? "—" : row.score}</p><p className="text-[9px] text-muted-foreground">{row.score_truth_class}</p></td><td className="p-3"><ul className="max-w-xs space-y-1">{(row.reasons || []).slice(0, 2).map((reason) => <li key={reason}>• {reason}</li>)}</ul>{!(row.reasons || []).length && <span className="text-muted-foreground">Explanation unavailable</span>}</td><td className="p-3"><div className="flex flex-col items-start gap-1"><Tone value={row.pipeline_state}>{humanize(row.pipeline_state)}</Tone><Tone value={row.readiness}>{humanize(row.readiness)}</Tone></div></td><td className="p-3"><button onClick={() => setExpanded(expanded === row.id ? "" : row.id)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 font-black">{expanded === row.id ? "Close" : "View why"}<ChevronDown size={10} className={expanded === row.id ? "rotate-180" : ""} /></button></td></tr>, expanded === row.id && <tr key={`${row.id}-detail`}><td colSpan={8}><Detail row={row} /></td></tr>])}</tbody>
          </table>
          {loading && <div className="flex items-center justify-center gap-2 p-8 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" />Loading people…</div>}
          {!loading && !rows.length && <div className="p-10 text-center"><UserRound className="mx-auto text-muted-foreground" /><p className="mt-3 text-sm font-black">No person matches these filters</p><p className="mt-1 text-xs text-muted-foreground">Clear a filter or include records whose contact is not named yet.</p></div>}
        </div>
      </section>
      <p className="text-[10px] text-muted-foreground"><b>Truth boundary:</b> {data?.truth_boundary || "Observed person and company fields remain separate from derived classifications."}</p>
    </div>
  );
}
