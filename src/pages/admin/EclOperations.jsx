import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Play, RefreshCw, RotateCcw, ShieldAlert, Wrench } from "lucide-react";
import { base44 } from "@/api/base44Client";

const ACTIVE = ["open", "acknowledged", "recovering"];
const SCHEDULER_RECOVERY_WORKERS = [
  ["maintenanceEngine", "Maintenance Engine"],
  ["recoverAutopilotWorker", "Recover Autopilot"],
  ["alwaysOnLeadDiscoveryWorker", "Always-On Discovery"],
  ["instantlyProviderEventRetryWorker", "Instantly Event Retry"],
  ["getEuropeMarketsCommandCenter", "Europe Markets"],
  ["autonomousCompanyOrchestrator", "Company Orchestrator"],
];
const unwrap = (res) => res?.data || res || null;
const human = (v) => String(v || "—").replaceAll("_", " ");
const fmt = (v) => { if (!v) return "—"; const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString(); };

async function inspectScheduler(workerKey, label) {
  try {
    const result = unwrap(await base44.functions.invoke("eclIncidentWorkflow", { action: "inspect_scheduler_control", workerKey }));
    return { workerKey, label, ...result };
  } catch (error) {
    const result = unwrap(error?.response);
    if (result && typeof result === "object") return { workerKey, label, ...result };
    return { workerKey, label, ok: false, action: "blocked", reason: error?.message || "scheduler_inspection_failed" };
  }
}

function pill(severity, status) {
  if (status === "resolved") return "border-emerald-500/30 bg-emerald-500/5 text-emerald-700";
  if (severity === "critical") return "border-rose-500/30 bg-rose-500/5 text-rose-700";
  return "border-amber-500/30 bg-amber-500/5 text-amber-800";
}

export default function EclOperations() {
  const [incidents, setIncidents] = useState([]);
  const [history, setHistory] = useState([]);
  const [runtime, setRuntime] = useState(null);
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [schedulerRows, setSchedulerRows] = useState([]);
  const [schedulerBusy, setSchedulerBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function invoke(payload) {
    const result = unwrap(await base44.functions.invoke("eclIncidentWorkflow", payload));
    if (!result?.ok) throw new Error(result?.message || result?.error || "P7 incident workflow failed");
    return result;
  }

  async function load() {
    setBusy("refresh");
    try {
      const [activeBuckets, resolved, runtimeResult] = await Promise.all([
        Promise.all(ACTIVE.map((status) => invoke({ action: "list", status, limit: 100 }))),
        invoke({ action: "list", status: "resolved", limit: 50 }),
        invoke({ action: "runtime" }),
      ]);
      const activeRows = activeBuckets.flatMap((x) => x.incidents || []).sort((a, b) => String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || "")));
      setIncidents(activeRows);
      setHistory(resolved.incidents || []);
      setRuntime(runtimeResult.health || null);
      if (selected?.id) setSelected(activeRows.find((x) => x.id === selected.id) || null);
      setError("");
    } catch (e) { setError(e?.message || "Could not load P7 operations."); }
    finally { setBusy(""); setLoading(false); }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function inspectSchedulers() {
    setSchedulerBusy("inspect");
    try {
      setSchedulerRows(await Promise.all(SCHEDULER_RECOVERY_WORKERS.map(([workerKey, label]) => inspectScheduler(workerKey, label))));
    } finally { setSchedulerBusy(""); }
  }

  async function reconcileScheduler(row) {
    const postEffect = row?.action === "reconcile_post_effect";
    const supported = row?.action === "reset_control" || postEffect;
    if (!row?.ok || !supported || !row.expectedConfirmation || !row.attempt?.id || row.control?.control_revision == null) return;
    const confirmation = postEffect
      ? `Acknowledge the observed effects for ${row.label}, retain every result and receipt, mark attempt ${row.attempt.id} as failed post-effect, and release the control without replay or rollback?`
      : `Reconcile ${row.label} without replaying attempt ${row.attempt.id}?`;
    if (!window.confirm(confirmation)) return;
    setSchedulerBusy(row.workerKey);
    setError("");
    try {
      await invoke({
        action: "reconcile_scheduler_control",
        workerKey: row.workerKey,
        attemptId: row.attempt.id,
        controlRevision: Number(row.control.control_revision),
        confirmation: row.expectedConfirmation,
      });
      setSchedulerRows(await Promise.all(SCHEDULER_RECOVERY_WORKERS.map(([workerKey, label]) => inspectScheduler(workerKey, label))));
      await load();
    } catch (e) { setError(e?.message || "Scheduler reconciliation failed."); }
    finally { setSchedulerBusy(""); }
  }

  async function runHealth() {
    setBusy("health");
    try {
      const result = unwrap(await base44.functions.invoke("eclProductionHealth", {}));
      if (!result?.ok) throw new Error(result?.message || result?.error || "Health sweep failed");
      await load();
    } catch (e) { setError(e?.message || "Health sweep failed."); setBusy(""); }
  }

  async function action(kind) {
    if (!selected?.id) return;
    if (kind === "recover" && !window.confirm(`Run bounded recovery: ${human(selected.recoveryAction)}?`)) return;
    if (kind === "resolve" && !note.trim()) { setError("A resolution note is required."); return; }
    setBusy(kind);
    try {
      await invoke({ action: kind, incidentId: selected.id, ...(kind === "resolve" ? { note } : {}) });
      setNote("");
      setSelected(null);
      await load();
    } catch (e) { setError(e?.message || `Could not ${kind} incident.`); setBusy(""); }
  }

  const counts = useMemo(() => ({ critical: incidents.filter((x) => x.severity === "critical").length, warning: incidents.filter((x) => x.severity === "warning").length, recovering: incidents.filter((x) => x.status === "recovering").length }), [incidents]);
  const health = runtime?.summary || null;

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2"><Activity size={20} /> ECL Operations</h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-3xl">P7 production health and incident recovery. Detection is automatic; recovery is explicit, bounded and admin-only. This surface cannot authorize economic actions or change ECL confidence.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={load} disabled={Boolean(busy)} className="h-8 px-3 rounded-lg border border-border/60 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"><RefreshCw size={12} className={busy === "refresh" ? "animate-spin" : ""} /> Refresh</button>
          <button type="button" onClick={runHealth} disabled={Boolean(busy)} className="h-8 px-3 rounded-lg bg-foreground text-background text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"><Play size={12} /> Run health sweep</button>
        </div>
      </header>

      <section className="rounded-2xl border border-border/60 bg-card p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Production health</p>
            <div className="flex items-center gap-2 mt-1"><h2 className="text-lg font-black">{health ? human(health.status) : human(runtime?.status || "no runtime proof")}</h2>{health?.status === "healthy" && <CheckCircle2 size={16} className="text-emerald-600" />}</div>
            <p className="text-[11px] text-muted-foreground mt-1">Last sweep: {fmt(runtime?.completedAt || runtime?.startedAt)}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 min-w-[300px]">
            {[["Critical", counts.critical], ["Warning", counts.warning], ["Recovering", counts.recovering]].map(([label, value]) => <div key={label} className="rounded-xl border border-border/50 bg-secondary/20 px-3 py-2"><p className="text-[9px] uppercase font-bold text-muted-foreground">{label}</p><p className="text-xl font-black tabular-nums">{value}</p></div>)}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Scheduler recovery</p>
            <h2 className="text-sm font-black mt-1">Proof-gated control reconciliation</h2>
            <p className="text-[11px] text-muted-foreground mt-1 max-w-3xl">Inspection is read-only. Reconciliation is offered only after the server proves either zero downstream effects or a terminal, quiescent receipt chain. Historical attempts are never replayed and observed effects are never rolled back.</p>
          </div>
          <button type="button" onClick={inspectSchedulers} disabled={Boolean(schedulerBusy)} className="h-8 px-3 rounded-lg border border-border/60 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"><RefreshCw size={12} className={schedulerBusy === "inspect" ? "animate-spin" : ""} /> Inspect controls</button>
        </div>
        {schedulerRows.length === 0 ? <div className="rounded-xl border border-dashed border-border/60 p-4 text-xs text-muted-foreground">No scheduler control has been inspected in this session.</div> : <div className="grid md:grid-cols-2 gap-2">{schedulerRows.map((row) => {
          const postEffectReady = row.ok === true && row.action === "reconcile_post_effect" && Boolean(row.expectedConfirmation);
          const ready = row.ok === true && ["reset_control", "reconcile_post_effect"].includes(row.action) && Boolean(row.expectedConfirmation);
          const settled = row.ok === true && !ready;
          return <div key={row.workerKey} className="rounded-xl border border-border/50 bg-secondary/20 p-3 space-y-2"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-black">{row.label}</p><p className="text-[10px] font-mono text-muted-foreground mt-1">{row.workerKey}</p></div><span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${ready ? "border-amber-500/30 text-amber-800" : settled ? "border-emerald-500/30 text-emerald-700" : "border-rose-500/30 text-rose-700"}`}>{postEffectReady ? "post-effect proof ready" : ready ? "proof ready" : settled ? "no reset required" : "blocked"}</span></div><p className="text-[11px] text-muted-foreground">{human(row.domainProof?.reason || row.reason || row.action)}</p>{row.attempt?.id && <p className="text-[10px] font-mono text-muted-foreground break-all">Attempt {row.attempt.id} · revision {row.control?.control_revision ?? "—"}</p>}{ready && <button type="button" onClick={() => reconcileScheduler(row)} disabled={Boolean(schedulerBusy)} className="h-8 px-3 rounded-lg bg-foreground text-background text-[11px] font-bold inline-flex items-center gap-1.5 disabled:opacity-50"><RotateCcw size={11} /> {schedulerBusy === row.workerKey ? "Reconciling…" : postEffectReady ? "Acknowledge effects and reconcile" : "Reconcile without replay"}</button>}</div>;
        })}</div>}
      </section>

      {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-700 flex gap-2"><AlertTriangle size={14} className="shrink-0" />{error}</div>}

      <div className="grid lg:grid-cols-[0.95fr_1.35fr] gap-4 items-start">
        <section className="rounded-2xl border border-border/60 bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border/50 flex justify-between"><h2 className="text-sm font-black">Active incidents</h2><span className="text-xs text-muted-foreground">{incidents.length}</span></div>
          {loading ? <div className="p-8 text-center text-xs text-muted-foreground">Loading…</div> : incidents.length === 0 ? <div className="p-8 text-center"><CheckCircle2 size={24} className="mx-auto text-emerald-600" /><p className="text-sm font-bold mt-2">No active incidents</p></div> : <div className="divide-y divide-border/40">{incidents.map((row) => <button key={row.id} type="button" onClick={() => { setSelected(row); setNote(""); }} className={`w-full p-3 text-left hover:bg-secondary/30 ${selected?.id === row.id ? "bg-secondary/40" : ""}`}><div className="flex justify-between gap-2"><p className="text-xs font-black truncate">{human(row.incidentType)}</p><span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${pill(row.severity, row.status)}`}>{human(row.status)}</span></div><p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{row.summary}</p><p className="text-[10px] text-muted-foreground mt-2">{human(row.domain)} · seen {fmt(row.lastSeenAt)}</p></button>)}</div>}
        </section>

        <section className="rounded-2xl border border-border/60 bg-card min-h-[420px]">
          {!selected ? <div className="min-h-[420px] flex items-center justify-center text-center p-8"><div><ShieldAlert size={26} className="mx-auto text-muted-foreground" /><p className="text-sm font-bold mt-2">Select an incident</p><p className="text-xs text-muted-foreground mt-1">Inspect the signal and choose an explicit recovery action.</p></div></div> : <div className="p-4 space-y-4">
            <div className="flex justify-between gap-3"><div><p className="text-[10px] uppercase font-bold text-muted-foreground">{human(selected.domain)}</p><h2 className="text-lg font-black mt-1">{human(selected.incidentType)}</h2><p className="text-[10px] font-mono text-muted-foreground mt-1 break-all">{selected.id}</p></div><span className={`h-fit rounded-full border px-2 py-1 text-[10px] font-bold ${pill(selected.severity, selected.status)}`}>{human(selected.severity)}</span></div>
            <div className="rounded-xl border border-border/50 p-3 text-xs">{selected.summary}</div>
            <div className="grid sm:grid-cols-2 gap-2">{[["Status", human(selected.status)], ["Recovery", human(selected.recoveryAction)], ["Subject", `${human(selected.subjectType)} · ${selected.subjectId || "—"}`], ["Occurrences", selected.occurrenceCount], ["First seen", fmt(selected.firstSeenAt)], ["Last seen", fmt(selected.lastSeenAt)]].map(([label, value]) => <div key={label} className="rounded-xl border border-border/50 bg-secondary/20 p-3"><p className="text-[9px] uppercase font-bold text-muted-foreground">{label}</p><p className="text-xs font-semibold mt-1 break-all">{value}</p></div>)}</div>
            {selected.lastRecoveryError && <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-700">Last recovery error: {selected.lastRecoveryError}</div>}
            <div className="flex flex-wrap gap-2"><button type="button" disabled={Boolean(busy)} onClick={() => action("acknowledge")} className="h-9 px-3 rounded-lg border border-border/60 text-xs font-bold disabled:opacity-50">Acknowledge</button>{selected.recoveryAction !== "inspect_manual" && <button type="button" disabled={Boolean(busy)} onClick={() => action("recover")} className="h-9 px-3 rounded-lg bg-foreground text-background text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"><Wrench size={12} /> Run bounded recovery</button>}</div>
            <div className="pt-2 border-t border-border/50"><label className="text-[10px] uppercase font-bold text-muted-foreground">Resolution note</label><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-1.5 w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-xs" placeholder="Why this incident is safe to close…" /><button type="button" disabled={Boolean(busy) || !note.trim()} onClick={() => action("resolve")} className="mt-2 h-9 px-3 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-50">Resolve manually</button><p className="text-[10px] text-muted-foreground mt-2">If the authoritative signal still exists, the next health sweep reopens the episode automatically.</p></div>
          </div>}
        </section>
      </div>

      <section className="rounded-2xl border border-border/60 bg-card overflow-hidden"><div className="px-4 py-3 border-b border-border/50"><h2 className="text-sm font-black">Recent resolved incidents</h2></div>{history.length === 0 ? <div className="p-6 text-center text-xs text-muted-foreground">No resolved incidents yet.</div> : <div className="divide-y divide-border/40">{history.slice(0, 20).map((row) => <div key={row.id} className="px-4 py-3 flex gap-3 items-center"><span className="rounded-full border border-emerald-500/30 bg-emerald-500/5 text-emerald-700 px-2 py-0.5 text-[9px] font-bold">resolved</span><span className="text-xs font-semibold flex-1 truncate">{human(row.incidentType)}</span><span className="text-[10px] text-muted-foreground hidden sm:inline">{fmt(row.resolvedAt)}</span></div>)}</div>}</section>
    </div>
  );
}
