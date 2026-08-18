// DASHBOARD-C16 (2026-08-17) — the single founder queue.
//
// The remaining half of founder decision 3. C14 put Inbox and Approvals in one place and said
// plainly that it had NOT merged them into one ranked list. This is the list.
//
// The ordering is rendered next to the items, not hidden behind them. A ranked queue whose rule
// you cannot see is a queue you have to trust; one that states its rule is one you can argue
// with — and the rule can be wrong on a given day.
import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Clock3, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { base44 } from "@/api/base44Client";

const payload = (response) => response?.data || response || {};
async function callQueue(action) {
  const data = payload(await base44.functions.invoke("adminSummaries", { action: `integration_${action}` }));
  if (data?.ok === false || data?.error) {
    throw Object.assign(new Error(data?.error || "queue_unavailable"), { data });
  }
  // Defensive shape check: a stale or mismatched backend build must surface as
  // a readable error card, never crash the whole Founder OS page.
  if (!Array.isArray(data?.items) || !Array.isArray(data?.ordering_rule)) {
    throw Object.assign(new Error("queue_response_invalid"), { data });
  }
  return data;
}

const BAND_TONE = {
  EXPIRED: "border-rose-200 bg-rose-50 text-rose-800",
  APPROVAL: "border-amber-200 bg-amber-50 text-amber-900",
  QUESTION: "border-sky-200 bg-sky-50 text-sky-800",
  REVIEW_REQUIRED: "border-border/60 bg-secondary/40 text-muted-foreground",
};

export default function FounderQueue() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await callQueue("founder_queue"));
    } catch (caught) {
      setData(null);
      setError(caught?.message || "queue_unavailable");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) {
    return (
      <div data-testid="queue-error" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 flex items-start gap-2">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <span>The queue could not be read ({error}). That is not an empty queue.</span>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center gap-2 py-16 justify-center text-xs text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> Loading the queue…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="rounded-xl border border-border/50 bg-card p-3 text-xs flex items-center gap-4 flex-wrap">
          <span>
            {/* Withheld rather than understated when a source failed. */}
            <b data-testid="queue-total">{data.total === null ? "—" : data.total}</b> waiting
          </span>
          {data.counts && (
            <>
              <span className="text-rose-700"><b>{data.counts.expired}</b> expired</span>
              <span><b>{data.counts.approvals}</b> approvals</span>
              <span><b>{data.counts.questions}</b> questions</span>
              <span><b>{data.counts.tasks_in_review}</b> in review</span>
            </>
          )}
          {data.oldest_waiting_days !== null && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Clock3 size={11} /> oldest {data.oldest_waiting_days}d
            </span>
          )}
        </div>
        <button type="button" onClick={load} className="h-8 px-3 rounded-lg border border-border text-xs font-bold inline-flex items-center gap-1.5">
          <RefreshCw size={12} /> Reload
        </button>
      </div>

      {!data.complete && (
        <p data-testid="queue-incomplete" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
          {data.coverage_note}
        </p>
      )}

      <details data-testid="queue-ordering" className="rounded-xl border border-border/50 bg-secondary/30 p-3">
        <summary className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70 cursor-pointer">
          How this is ordered
        </summary>
        <ol className="mt-2 space-y-1 text-[11px] text-muted-foreground list-decimal pl-4">
          {data.ordering_rule.map((row) => (
            <li key={row.key}><b>{row.key}</b> — {row.why}</li>
          ))}
        </ol>
        <p className="text-[11px] text-muted-foreground/80 mt-2 leading-snug">{data.ordering_note}</p>
      </details>

      {data.items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-12 text-center">
          {data.total === null ? "Queue unreadable." : "Nothing waiting."}
        </p>
      ) : (
        <div className="space-y-2">
          {data.items.map((item) => (
            <div key={`${item.source_entity}-${item.id}`} data-testid={`queue-item-${item.id}`}
              className="rounded-xl border border-border/60 bg-card p-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{item.summary}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold ${BAND_TONE[item.band_key]}`}>
                      {item.band_key}
                    </span>
                    {item.agent_name && <span className="text-[10px] text-muted-foreground">{item.agent_name}</span>}
                    {item.blocks_running_work && (
                      <span className="text-[9px] font-bold text-amber-700 inline-flex items-center gap-1">
                        <ShieldAlert size={10} /> work stopped
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground/60 shrink-0">
                  {/* Undated sorts last, so it is worth saying that it is undated. */}
                  {item.waiting_days === null ? "no date recorded" : `${item.waiting_days}d`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}