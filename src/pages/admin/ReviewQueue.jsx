import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileSearch,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { base44 } from "@/api/base44Client";

const ACTIVE_STATUSES = ["open", "awaiting_merchant", "resolving"];
const HISTORY_STATUSES = ["resolved", "dismissed"];

const unwrap = (res) => res?.data || res || null;
const humanize = (value) => String(value || "—").replaceAll("_", " ");
const fmtDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
};

function statusClass(status) {
  if (["resolved", "completed"].includes(status)) return "border-emerald-500/30 bg-emerald-500/5 text-emerald-700";
  if (["failed", "resolving"].includes(status)) return "border-rose-500/30 bg-rose-500/5 text-rose-700";
  if (["open", "awaiting_merchant"].includes(status)) return "border-amber-500/30 bg-amber-500/5 text-amber-700";
  return "border-border/60 bg-secondary/20 text-foreground";
}

export default function ReviewQueue() {
  const [cases, setCases] = useState([]);
  const [history, setHistory] = useState([]);
  const [runtime, setRuntime] = useState(null);
  const [runResult, setRunResult] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  async function invokeReview(payload) {
    const result = unwrap(await base44.functions.invoke("eclReviewWorkflow", payload));
    if (!result?.ok) throw new Error(result?.message || result?.error || "ECL review workflow failed");
    return result;
  }

  async function fetchDetail(reviewCaseId) {
    if (!reviewCaseId) {
      setDetail(null);
      return null;
    }
    const result = await invokeReview({ action: "get", reviewCaseId });
    setDetail(result);
    setNotes(result?.case?.decisionNotes || "");
    return result;
  }

  async function load(keepSelection = true) {
    setRefreshing(true);
    try {
      const [activeBuckets, historyBuckets, runtimeResult] = await Promise.all([
        Promise.all(ACTIVE_STATUSES.map((status) => invokeReview({ action: "list", status, limit: 100 }))),
        Promise.all(HISTORY_STATUSES.map((status) => invokeReview({ action: "list", status, limit: 25 }))),
        invokeReview({ action: "runtime" }),
      ]);

      const active = activeBuckets.flatMap((bucket) => bucket.cases || []);
      const resolved = historyBuckets.flatMap((bucket) => bucket.cases || []);
      const newest = (a, b) => String(b.createdAt || b.resolvedAt || "").localeCompare(String(a.createdAt || a.resolvedAt || ""));
      active.sort(newest);
      resolved.sort(newest);
      setCases(active);
      setHistory(resolved.slice(0, 50));
      setRuntime(runtimeResult.scheduler || null);
      setError(null);

      if (keepSelection && selectedId) {
        if ([...active, ...resolved].some((row) => row.id === selectedId)) await fetchDetail(selectedId);
        else {
          setSelectedId(null);
          setDetail(null);
        }
      }
    } catch (err) {
      setError(err?.message || "Could not load the ECL operator surface.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Initial operator snapshot only; subsequent refreshes are explicit or follow an action.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(false); }, []);

  async function selectCase(id) {
    setSelectedId(id);
    setBusy("detail");
    try {
      await fetchDetail(id);
      setError(null);
    } catch (err) {
      setError(err?.message || "Could not load review detail.");
    } finally {
      setBusy(null);
    }
  }

  async function resolve(decision) {
    const reviewCaseId = detail?.case?.id;
    if (!reviewCaseId) return;
    if (["reject", "dismiss"].includes(decision) && !window.confirm(`Confirm ${humanize(decision)} for this review case?`)) return;

    setBusy(decision);
    try {
      const payload = { action: "resolve", reviewCaseId, decision, notes };
      if (detail?.evidence?.checksum) payload.expectedChecksum = detail.evidence.checksum;
      await invokeReview(payload);
      await load(true);
      setError(null);
    } catch (err) {
      setError(err?.message || "Could not resolve review case.");
      await fetchDetail(reviewCaseId).catch(() => null);
    } finally {
      setBusy(null);
    }
  }

  async function runScheduler() {
    setBusy("scheduler");
    try {
      const result = unwrap(await base44.functions.invoke("eclLifecycleScheduler", { limit: 25 }));
      setRunResult(result);
      if (!result?.ok) throw new Error(result?.message || result?.error || "Scheduler run failed");
      await load(true);
      setError(null);
    } catch (err) {
      setError(err?.message || "Could not run the ECL lifecycle scheduler.");
    } finally {
      setBusy(null);
    }
  }

  const queueCounts = useMemo(() => ({
    open: cases.filter((row) => row.status === "open").length,
    awaiting: cases.filter((row) => row.status === "awaiting_merchant").length,
    resolving: cases.filter((row) => row.status === "resolving").length,
  }), [cases]);

  const activeCase = detail?.case || null;
  const canResolve = activeCase && ["open", "awaiting_merchant"].includes(activeCase.status);
  const runtimeSummary = runtime?.summary || runResult?.summary || null;
  const counters = runtimeSummary?.counters || {};
  const runtimeStatus = runtime?.status || (runResult?.ok ? "completed" : "unknown");

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <ShieldCheck size={19} /> Evidence Review
          </h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            P4 Production Proof operator surface. Review decisions re-enter the canonical ECL lifecycle and have no billing, settlement or payment effects.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border/60 bg-card text-xs font-semibold hover:bg-secondary disabled:opacity-50"
        >
          <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} /> Refresh
        </button>
      </header>

      <section className="rounded-2xl border border-border/60 bg-card p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Activity size={15} />
              <h2 className="text-sm font-black">Lifecycle scheduler</h2>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusClass(runtimeStatus)}`}>
                {runtime ? humanize(runtimeStatus) : "no runtime proof"}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {runtime
                ? `Last recorded invocation: ${fmtDate(runtime.completedAt || runtime.startedAt)}`
                : "No scheduler invocation has been recorded yet. Recurring Base44 automation is external configuration; the button at right proves the deployed function manually."}
            </p>
            {runtime?.error && <p className="text-[11px] text-rose-700 mt-1">{runtime.error}</p>}
          </div>
          <button
            type="button"
            onClick={runScheduler}
            disabled={busy === "scheduler"}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-foreground text-background text-xs font-bold disabled:opacity-50"
          >
            <RotateCw size={11} className={busy === "scheduler" ? "animate-spin" : ""} /> Run once now
          </button>
        </div>

        {runtimeSummary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-4">
            {[
              ["Due", counters.dueFound ?? 0],
              ["Processed", counters.processed ?? 0],
              ["Reminder intents", counters.remindersCreated ?? 0],
              ["Expired", counters.expired ?? 0],
              ["Review cases", counters.reviewCasesCreated ?? 0],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border/50 bg-secondary/20 p-2.5">
                <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">{label}</p>
                <p className="text-lg font-black tabular-nums">{value}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid grid-cols-3 gap-3">
        {[
          ["Open", queueCounts.open],
          ["Awaiting merchant", queueCounts.awaiting],
          ["Resolving", queueCounts.resolving],
        ].map(([label, value]) => (
          <div key={label} className={`rounded-xl border p-3 ${value ? "border-amber-500/30 bg-amber-500/5" : "border-border/60 bg-card"}`}>
            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{label}</p>
            <p className="mt-0.5 text-2xl font-black tabular-nums">{value}</p>
          </div>
        ))}
      </section>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-700 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      <div className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] gap-4 items-start">
        <section className="rounded-2xl border border-border/60 bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
            <h2 className="text-sm font-black">Active queue</h2>
            <span className="text-[11px] text-muted-foreground tabular-nums">{cases.length}</span>
          </div>
          {loading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">Loading review cases…</div>
          ) : cases.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle2 size={22} className="mx-auto mb-2 text-emerald-600" />
              <p className="text-sm font-bold">Queue clear</p>
              <p className="text-xs text-muted-foreground mt-1">No open ECL review cases.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {cases.map((row) => (
                <button
                  type="button"
                  key={row.id}
                  onClick={() => selectCase(row.id)}
                  className={`w-full p-3 text-left hover:bg-secondary/30 transition-colors ${selectedId === row.id ? "bg-secondary/40" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-black truncate">{humanize(row.reasonCode)}</p>
                      <p className="text-[10px] text-muted-foreground mt-1 truncate">{humanize(row.evidenceEntityType)} · {row.evidenceId || "—"}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold ${statusClass(row.status)}`}>
                      {humanize(row.status)}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">{humanize(row.severity)} · {fmtDate(row.createdAt)}</p>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border/60 bg-card min-h-[380px]">
          {!activeCase ? (
            <div className="min-h-[380px] flex items-center justify-center p-8 text-center">
              <div>
                <FileSearch size={26} className="mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-bold">Select a review case</p>
                <p className="text-xs text-muted-foreground mt-1">Detail is fetched through the admin-only ECL workflow.</p>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Review case</p>
                  <h2 className="text-lg font-black mt-0.5">{humanize(activeCase.reasonCode)}</h2>
                  <p className="text-[10px] text-muted-foreground mt-1 font-mono break-all">{activeCase.id}</p>
                </div>
                <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${statusClass(activeCase.status)}`}>
                  {humanize(activeCase.status)}
                </span>
              </div>

              <div className="grid sm:grid-cols-2 gap-2">
                {[
                  ["Severity", humanize(activeCase.severity)],
                  ["Brand", activeCase.brandId || "—"],
                  ["Evidence", `${humanize(activeCase.evidenceEntityType)} · ${activeCase.evidenceId || "—"}`],
                  ["Evidence status", humanize(detail?.evidence?.status)],
                  ["Created", fmtDate(activeCase.createdAt)],
                  ["Expires", fmtDate(detail?.evidence?.expiresAt)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-border/50 bg-secondary/20 p-3 min-w-0">
                    <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">{label}</p>
                    <p className="text-xs font-semibold mt-1 break-all">{value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-border/50 p-3 space-y-2 text-[11px]">
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Checksum</span><span className="font-mono break-all text-right">{detail?.evidence?.checksum || "—"}</span></div>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Confidence hash</span><span className="font-mono break-all text-right">{detail?.evidence?.confidenceResultHash || "—"}</span></div>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Owner</span><span className="break-all text-right">{activeCase.ownerEmail || "—"}</span></div>
              </div>

              <div className="rounded-xl border border-border/50 p-3">
                <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">Blocking actions</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(activeCase.blockingActions || {}).filter(([, value]) => value === true).length === 0 ? (
                    <span className="text-xs text-muted-foreground">None recorded</span>
                  ) : Object.entries(activeCase.blockingActions || {}).filter(([, value]) => value === true).map(([key]) => (
                    <span key={key} className="rounded-full border border-border/60 bg-secondary/30 px-2 py-1 text-[10px] font-semibold text-muted-foreground">{humanize(key)}</span>
                  ))}
                </div>
              </div>

              {canResolve ? (
                <div className="space-y-3 pt-1">
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Decision notes</span>
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      rows={3}
                      placeholder="Optional audit note…"
                      className="mt-1.5 w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-foreground/10"
                    />
                  </label>
                  <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-2">
                    <button type="button" disabled={Boolean(busy)} onClick={() => resolve("approve")} className="h-9 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-50 inline-flex items-center justify-center gap-1.5"><CheckCircle2 size={12} /> Approve</button>
                    <button type="button" disabled={Boolean(busy)} onClick={() => resolve("request_more_evidence")} className="h-9 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-800 text-xs font-bold disabled:opacity-50 inline-flex items-center justify-center gap-1.5"><Clock3 size={12} /> More evidence</button>
                    <button type="button" disabled={Boolean(busy)} onClick={() => resolve("reject")} className="h-9 rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-700 text-xs font-bold disabled:opacity-50 inline-flex items-center justify-center gap-1.5"><XCircle size={12} /> Reject</button>
                    <button type="button" disabled={Boolean(busy)} onClick={() => resolve("dismiss")} className="h-9 rounded-lg border border-border/60 bg-secondary text-xs font-bold disabled:opacity-50">Dismiss</button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Approve/dismiss reprocess through the canonical engine; reject uses the lifecycle transition graph. This surface never directly writes verified status.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-border/50 bg-secondary/20 p-3 text-xs text-muted-foreground">
                  This case is not currently resolvable from the operator surface ({humanize(activeCase.status)}).
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
          <h2 className="text-sm font-black">Recent resolutions</h2>
          <span className="text-[11px] text-muted-foreground">{history.length}</span>
        </div>
        {history.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">No resolved ECL reviews yet.</div>
        ) : (
          <div className="divide-y divide-border/40">
            {history.slice(0, 20).map((row) => (
              <button key={row.id} type="button" onClick={() => selectCase(row.id)} className="w-full px-4 py-3 text-left hover:bg-secondary/30 flex items-center gap-3">
                <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${statusClass(row.status)}`}>{humanize(row.status)}</span>
                <span className="text-xs font-semibold flex-1 truncate">{humanize(row.reasonCode)}</span>
                <span className="text-[10px] text-muted-foreground">{humanize(row.decision)}</span>
                <span className="text-[10px] text-muted-foreground hidden sm:inline">{fmtDate(row.resolvedAt || row.createdAt)}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
