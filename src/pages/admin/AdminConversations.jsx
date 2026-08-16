// CAMP-C5 (2026-08-16) — Inbox & Conversations workspace
// (PROMPT_FIX_DISCOVERY_V2 Parte 4, spec §4.2, §10).
//
// This is the COMMERCIAL inbox. It is deliberately a new route
// (/admin/conversations) and does not touch /admin/inbox, which is the
// approvals inbox and stays exactly where it is until C9 consolidation.
//
// C5 scope: queues, thread list, thread detail with the timeline, and the
// commercial/operational status split. Replies are draft-only — this workspace
// sends nothing in any chunk of this work.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Ban, Bot, Clock, Loader2, RefreshCw, ShieldAlert, User } from "lucide-react";
import { base44 } from "@/api/base44Client";

const QUEUES = [
  ["all", "All conversations"],
  ["unread", "Unread"],
  ["needs_human", "Needs my attention"],
  ["ai_handling", "AI handling"],
  ["waiting_on_us", "Waiting on us"],
  ["waiting_on_them", "Waiting on them"],
  ["escalated", "Escalated"],
  ["review_required", "Review required"],
];

const call = async (action, payload = {}) => {
  const response = await base44.functions.invoke("adminSummaries", { action: `conversation_${action}`, ...payload });
  const data = response?.data || response;
  if (data?.ok === false) throw Object.assign(new Error(data.error || "Conversation operation failed"), { data });
  return data;
};

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

function operationalTone(status) {
  if (["NEEDS_HUMAN", "ESCALATED", "REVIEW_REQUIRED"].includes(status)) return "bad";
  if (["PAUSED_BY_FOUNDER", "PAUSED_BY_POLICY"].includes(status)) return "warn";
  if (["AI_HANDLING", "AI_TRIAGE"].includes(status)) return "info";
  return "neutral";
}

function DataUnavailable({ blockers = [], onRetry }) {
  return (
    <div data-testid="conversations-data-unavailable" className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700" />
        <div className="min-w-0">
          <p className="text-xs font-black text-amber-900">Data unavailable</p>
          <p className="mt-1 text-[11px] text-amber-800">
            CAMBRA could not read the canonical conversation source, so this view is blocked rather than shown as empty.
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

function ThreadRow({ thread, active, onOpen }) {
  return (
    <button
      data-testid={`conversation-row-${thread.id}`}
      onClick={() => onOpen(thread.id)}
      className={`w-full border-b p-3 text-left hover:bg-secondary/40 ${active ? "bg-secondary/60" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-black">{thread.counterparty_name || thread.counterparty_email || "Unknown contact"}</p>
          <p className="truncate text-[10px] text-muted-foreground">{thread.company_name || thread.counterparty_email}</p>
        </div>
        {thread.unread_count > 0 && <Chip tone="info">{thread.unread_count} unread</Chip>}
      </div>
      <p className="mt-1.5 line-clamp-2 text-[10px] text-muted-foreground">{thread.last_message_preview || "No preview available"}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {/* Commercial and operational status are shown SEPARATELY (spec §6.7). */}
        {thread.commercial_status && <Chip tone="neutral">{thread.commercial_status}</Chip>}
        <Chip tone={operationalTone(thread.operational_status)}>{thread.operational_status || "UNKNOWN"}</Chip>
        {thread.owner_type === "HUMAN" && <Chip tone="warn"><User size={9} className="mr-1" />human</Chip>}
        {thread.owner_type === "CAMBRA" && <Chip tone="info"><Bot size={9} className="mr-1" />CAMBRA</Chip>}
      </div>
    </button>
  );
}

function ThreadDetail({ detail, loading }) {
  if (loading && !detail) {
    return <div className="flex items-center gap-2 p-8 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" />Loading conversation…</div>;
  }
  if (!detail) return <p className="p-8 text-xs text-muted-foreground">Select a conversation.</p>;
  const thread = detail.thread || {};
  const autonomy = detail.autonomy || {};
  return (
    <div className="space-y-4 p-4">
      <header className="rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-black">{thread.counterparty_name || thread.counterparty_email}</h2>
          {thread.commercial_status && <Chip tone="neutral">{thread.commercial_status}</Chip>}
          <Chip tone={operationalTone(thread.operational_status)}>{thread.operational_status || "UNKNOWN"}</Chip>
        </div>
        <dl className="mt-3 grid gap-2 text-[10px] md:grid-cols-4">
          <div><dt className="text-muted-foreground">Company</dt><dd className="font-bold">{thread.company_name || "—"}</dd></div>
          <div><dt className="text-muted-foreground">Market</dt><dd className="font-bold">{thread.market_jurisdiction || "—"}</dd></div>
          <div><dt className="text-muted-foreground">Language</dt><dd className="font-bold">{thread.language || "—"}</dd></div>
          <div><dt className="text-muted-foreground">Owner</dt><dd className="font-bold">{thread.owner_type === "HUMAN" ? (thread.owner_id || "human") : "CAMBRA"}</dd></div>
        </dl>
      </header>

      {/* Autonomy: why CAMBRA may or may not reply on its own. */}
      <section data-testid="conversation-autonomy" className="rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldAlert size={14} className="text-muted-foreground" />
          <p className="text-xs font-black">Autonomy</p>
          <Chip tone={autonomy.may_send_autonomously ? "good" : "warn"}>
            {autonomy.may_send_autonomously ? "AUTONOMOUS" : "HUMAN REQUIRED"}
          </Chip>
          {autonomy.escalation_required && <Chip tone="bad">escalation required</Chip>}
        </div>
        {(autonomy.blockers || []).length > 0 && (
          <ul className="mt-2 list-disc pl-4 text-[10px] text-muted-foreground">
            {autonomy.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
          </ul>
        )}
      </section>

      {/* Classification with provenance: a human correction never erases the model's prediction. */}
      {detail.classification && (
        <section data-testid="conversation-classification" className="rounded-2xl border bg-card p-4">
          <p className="text-xs font-black">Classification</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Chip tone="neutral">{detail.classification.classification}</Chip>
            <Chip tone={detail.classification.classification_source === "HUMAN" ? "good" : "info"}>
              {detail.classification.classification_source}
            </Chip>
            {detail.classification.classification_confidence !== null && (
              <span className="text-[10px] text-muted-foreground">
                confidence {detail.classification.classification_confidence}
              </span>
            )}
          </div>
          {detail.classification.superseded_prediction && (
            <p className="mt-2 text-[10px] text-muted-foreground">
              Superseded model prediction: {detail.classification.superseded_prediction.classification}
              {detail.classification.superseded_prediction.model ? ` (${detail.classification.superseded_prediction.model})` : ""} — kept for evaluation, not deleted.
            </p>
          )}
        </section>
      )}

      <section data-testid="conversation-timeline" className="rounded-2xl border bg-card">
        <div className="border-b p-4">
          <p className="text-xs font-black">Timeline</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Inbound content is treated as untrusted: it is displayed as text and never executed or obeyed.
          </p>
        </div>
        <div className="divide-y">
          {(detail.timeline || []).length === 0
            ? <p className="p-4 text-xs text-muted-foreground">No messages recorded for this thread.</p>
            : detail.timeline.map((entry) => (
              <article key={entry.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={entry.direction === "inbound" ? "info" : "neutral"}>{entry.direction}</Chip>
                  <span className="text-[10px] text-muted-foreground">{date(entry.at)}</span>
                  {entry.send_status && <Chip tone="neutral">{entry.send_status}</Chip>}
                </div>
                {entry.subject && <p className="mt-2 text-[11px] font-bold">{entry.subject}</p>}
                <p className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">{entry.text_preview}</p>
              </article>
            ))}
        </div>
      </section>
    </div>
  );
}

export default function AdminConversations() {
  const [queue, setQueue] = useState("all");
  const [list, setList] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadList = useCallback(async () => {
    setLoading(true); setError("");
    try { setList(await call("list", { queue })); }
    catch (caught) { setError(caught.message); setList(caught.data || { data_status: "UNAVAILABLE" }); }
    finally { setLoading(false); }
  }, [queue]);

  const openThread = useCallback(async (threadId) => {
    setSelected(threadId); setLoading(true); setError("");
    try { setDetail(await call("detail", { thread_id: threadId })); }
    catch (caught) { setError(caught.message); setDetail(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  const threads = useMemo(() => list?.items || [], [list]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-black">Inbox &amp; Conversations</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            What each person replied, what it means, who must act and whether the infrastructure is healthy.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-[10px] font-bold text-muted-foreground">
            <Ban size={12} />Draft only · no sends
          </span>
          <button onClick={loadList} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold">
            <RefreshCw size={13} />Refresh
          </button>
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] text-rose-700">{error}</div>}

      {list?.data_status === "UNAVAILABLE"
        ? <DataUnavailable blockers={list?.blockers || []} onRetry={loadList} />
        : (
          <div className="grid gap-4 lg:grid-cols-[200px_320px_1fr]">
            <nav className="space-y-1">
              {QUEUES.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setQueue(key)}
                  aria-current={queue === key ? "true" : undefined}
                  className={`w-full rounded-lg px-3 py-2 text-left text-[11px] font-bold ${queue === key ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </nav>

            <section className="overflow-hidden rounded-2xl border bg-card">
              {loading && !list
                ? <div className="flex items-center gap-2 p-6 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" />Loading…</div>
                : threads.length === 0
                ? <p className="p-6 text-xs text-muted-foreground">No conversation in this queue.</p>
                : threads.map((thread) => (
                  <ThreadRow key={thread.id} thread={thread} active={selected === thread.id} onOpen={openThread} />
                ))}
            </section>

            <section className="overflow-hidden rounded-2xl border bg-card">
              <ThreadDetail detail={detail} loading={loading} />
            </section>
          </div>
        )}

      <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Clock size={11} />
        Reply drafting, follow-up queue and SLA land in C6; domains, suppressions and provider events in C7.
      </p>
    </div>
  );
}
