// DASHBOARD-C16 (2026-08-17) — the single founder queue.
import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldAlert,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import AgentQuestionCard from "@/components/admin/inbox/AgentQuestionCard";

const payload = (response) => response?.data || response || {};
async function callQueue(action) {
  const data = payload(await base44.functions.invoke("adminSummaries", { action: `integration_${action}` }));
  if (data?.ok === false || data?.error) {
    throw Object.assign(new Error(data?.error || "queue_unavailable"), { data });
  }
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

const humanize = (value) => String(value || "—").replaceAll("_", " ");

function DecisionPreview({ value, busy, onConfirm, onCancel }) {
  const preview = value.preview || {};
  return (
    <div role="dialog" aria-label="Approval decision preview" data-testid={`approval-preview-${value.item.id}`}
      className="mt-3 rounded-xl border border-amber-300/50 bg-amber-50/70 p-3 space-y-3">
      <div>
        <p className="text-[10px] uppercase tracking-[0.14em] font-black text-amber-900">Decision preview</p>
        <p className="mt-1 text-xs font-bold text-amber-950">
          {value.decision === "approve" ? "Approve and continue through the canonical resolver" : "Reject and stop this action"}
        </p>
      </div>
      <dl className="grid sm:grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg border border-amber-200 bg-white/70 p-2"><dt className="text-amber-800">Risk</dt><dd className="font-bold">L{preview.risk_level ?? "—"}</dd></div>
        <div className="rounded-lg border border-amber-200 bg-white/70 p-2"><dt className="text-amber-800">Resolver</dt><dd className="font-bold break-all">{humanize(preview.resolver)}</dd></div>
        <div className="rounded-lg border border-amber-200 bg-white/70 p-2"><dt className="text-amber-800">Reversibility</dt><dd className="font-bold">{humanize(preview.reversible)}</dd></div>
        <div className="rounded-lg border border-amber-200 bg-white/70 p-2"><dt className="text-amber-800">Financial impact</dt><dd className="font-bold">{preview.financial_impact ?? "Not recorded"}</dd></div>
      </dl>
      {value.reason && <p className="text-[11px] text-amber-950"><b>Reason:</b> {value.reason}</p>}
      <p className="text-[10px] leading-4 text-amber-900">
        Nothing has changed yet. Confirmation revalidates the approval, task, expiry and authority snapshot server-side.
      </p>
      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={onConfirm} disabled={busy}
          data-testid={`confirm-${value.decision}-${value.item.id}`}
          className={`h-9 px-4 rounded-lg text-xs font-black text-white disabled:opacity-50 ${value.decision === "approve" ? "bg-emerald-600" : "bg-rose-600"}`}>
          {busy ? "Confirming…" : `Confirm ${value.decision}`}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}
          className="h-9 px-4 rounded-lg border border-border bg-card text-xs font-bold disabled:opacity-50">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function FounderQueue() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [decision, setDecision] = useState(null);
  const [rejectReasons, setRejectReasons] = useState({});

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

  const prepareDecision = async (item, nextDecision) => {
    const reason = nextDecision === "reject" ? String(rejectReasons[item.id] || "").trim() : "";
    setBusyId(item.id);
    setActionError(null);
    setFeedback(null);
    try {
      const response = payload(await base44.functions.invoke("founderOSCommand", {
        action: "resolve_approval",
        approval_id: item.id,
        decision: nextDecision,
        reason,
        confirmed: false,
      }));
      if (response?.ok === false || !response.command_key || !response.confirmation_nonce || !response.preview) {
        throw new Error(response?.error || "approval_preview_failed");
      }
      setDecision({
        item,
        decision: nextDecision,
        reason,
        commandKey: response.command_key,
        confirmationNonce: response.confirmation_nonce,
        preview: response.preview,
      });
    } catch (caught) {
      setDecision(null);
      setActionError(caught?.message || "Could not prepare the approval decision.");
    } finally {
      setBusyId(null);
    }
  };

  const confirmDecision = async () => {
    if (!decision) return;
    setBusyId(decision.item.id);
    setActionError(null);
    try {
      const result = payload(await base44.functions.invoke("founderOSCommand", {
        action: "resolve_approval",
        approval_id: decision.item.id,
        decision: decision.decision,
        reason: decision.reason,
        confirmed: true,
        command_key: decision.commandKey,
        confirmation_nonce: decision.confirmationNonce,
      }));
      if (result?.ok === false) throw new Error(result?.error || "approval_resolution_failed");
      setFeedback(`Approval ${decision.decision === "approve" ? "approved" : "rejected"}. The queue has been refreshed.`);
      setDecision(null);
      setExpandedId(null);
      await load();
    } catch (caught) {
      setActionError(caught?.message || "Could not resolve the approval.");
    } finally {
      setBusyId(null);
    }
  };

  const toggle = (item) => {
    setActionError(null);
    setDecision(null);
    setExpandedId((current) => current === item.id ? null : item.id);
  };

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
          <span><b data-testid="queue-total">{data.total === null ? "—" : data.total}</b> waiting</span>
          {data.counts && (
            <>
              <span className="text-rose-700"><b>{data.counts.expired}</b> expired</span>
              <span><b>{data.counts.approvals}</b> approvals</span>
              <span><b>{data.counts.questions}</b> questions</span>
              <span><b>{data.counts.tasks_in_review}</b> in review</span>
            </>
          )}
          {data.oldest_waiting_days !== null && (
            <span className="inline-flex items-center gap-1 text-muted-foreground"><Clock3 size={11} /> oldest {data.oldest_waiting_days}d</span>
          )}
        </div>
        <button type="button" onClick={load} className="h-8 px-3 rounded-lg border border-border text-xs font-bold inline-flex items-center gap-1.5">
          <RefreshCw size={12} /> Reload
        </button>
      </div>

      {feedback && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{feedback}</p>}
      {actionError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{actionError}</p>}

      {!data.complete && (
        <p data-testid="queue-incomplete" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">{data.coverage_note}</p>
      )}

      <details data-testid="queue-ordering" className="rounded-xl border border-border/50 bg-secondary/30 p-3">
        <summary className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70 cursor-pointer">How this is ordered</summary>
        <ol className="mt-2 space-y-1 text-[11px] text-muted-foreground list-decimal pl-4">
          {data.ordering_rule.map((row) => <li key={row.key}><b>{row.key}</b> — {row.why}</li>)}
        </ol>
        <p className="text-[11px] text-muted-foreground/80 mt-2 leading-snug">{data.ordering_note}</p>
      </details>

      {data.items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-12 text-center">{data.total === null ? "Queue unreadable." : "Nothing waiting."}</p>
      ) : (
        <div className="space-y-2">
          {data.items.map((item) => {
            const expanded = expandedId === item.id;
            const action = item.action || { type: "OPEN_WORKSPACE", label: "Open workspace", href: "/admin/founder-control", enabled: true };
            const record = item.record || {};
            return (
              <div key={`${item.source_entity}-${item.id}`} data-testid={`queue-item-${item.id}`}
                className="rounded-xl border border-border/60 bg-card p-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{item.summary}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold ${BAND_TONE[item.band_key] || BAND_TONE.REVIEW_REQUIRED}`}>{item.band_key}</span>
                      {item.agent_name && <span className="text-[10px] text-muted-foreground">{item.agent_name}</span>}
                      {item.blocks_running_work && <span className="text-[9px] font-bold text-amber-700 inline-flex items-center gap-1"><ShieldAlert size={10} /> work stopped</span>}
                    </div>
                    {record.output_summary && <p className="mt-2 text-[11px] text-muted-foreground">{record.output_summary}</p>}
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <p className="text-[10px] text-muted-foreground/60">{item.waiting_days === null ? "no date recorded" : `${item.waiting_days}d`}</p>
                    {action.type === "OPEN_WORKSPACE" ? (
                      <Link to={action.href} data-testid={`queue-action-${item.id}`}
                        className="h-8 px-3 rounded-lg bg-foreground text-background text-[11px] font-bold inline-flex items-center gap-1.5">
                        {action.label} <ExternalLink size={10} />
                      </Link>
                    ) : (
                      <button type="button" onClick={() => toggle(item)} disabled={!action.enabled}
                        data-testid={`queue-action-${item.id}`}
                        className="h-8 px-3 rounded-lg bg-foreground text-background text-[11px] font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                        {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />} {action.label}
                      </button>
                    )}
                  </div>
                </div>

                {action.disabled_reason && <p className="mt-2 text-[10px] text-rose-700">{action.disabled_reason}</p>}

                {expanded && action.type === "APPROVAL_DECISION" && (
                  <div className="mt-3 border-t border-border/50 pt-3 space-y-3" data-testid={`approval-actions-${item.id}`}>
                    <div className="grid sm:grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[11px]">
                      <span className="text-muted-foreground">Action</span><b>{humanize(record.action_type)}</b>
                      <span className="text-muted-foreground">Risk</span><b>L{record.risk_level ?? "—"}</b>
                      <span className="text-muted-foreground">Target</span><b>{humanize(record.related_entity_type)} {record.related_entity_id || ""}</b>
                    </div>
                    <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-lg bg-secondary/40 p-3 text-[11px] font-sans">{record.draft_content || "No draft content recorded."}</pre>
                    <label className="block">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Rejection reason</span>
                      <textarea value={rejectReasons[item.id] || ""}
                        onChange={(event) => setRejectReasons((current) => ({ ...current, [item.id]: event.target.value }))}
                        rows={2} placeholder="Optional audit reason…"
                        className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs" />
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      <button type="button" onClick={() => prepareDecision(item, "approve")} disabled={busyId === item.id}
                        className="h-9 px-4 rounded-lg bg-emerald-600 text-white text-xs font-black inline-flex items-center gap-1.5 disabled:opacity-50">
                        <Check size={12} /> Approve
                      </button>
                      <button type="button" onClick={() => prepareDecision(item, "reject")} disabled={busyId === item.id}
                        className="h-9 px-4 rounded-lg border border-rose-300 bg-rose-50 text-rose-700 text-xs font-black inline-flex items-center gap-1.5 disabled:opacity-50">
                        <X size={12} /> Reject
                      </button>
                    </div>
                    {decision?.item.id === item.id && (
                      <DecisionPreview value={decision} busy={busyId === item.id} onConfirm={confirmDecision} onCancel={() => setDecision(null)} />
                    )}
                  </div>
                )}

                {expanded && action.type === "ANSWER_QUESTION" && (
                  <div className="mt-3 border-t border-border/50 pt-3" data-testid={`question-actions-${item.id}`}>
                    <AgentQuestionCard question={record} onAnswered={async () => {
                      setFeedback("Answer recorded. The queue has been refreshed.");
                      setExpandedId(null);
                      await load();
                    }} />
                  </div>
                )}

                {action.type === "OPEN_WORKSPACE" && item.kind === "TASK_REVIEW" && (
                  <div className="mt-3 border-t border-border/50 pt-3 text-[11px] text-muted-foreground">
                    {(record.review_blocks || []).length > 0 && <p><b className="text-foreground">Blocking checks:</b> {record.review_blocks.map(humanize).join(", ")}</p>}
                    {record.error && <p className="mt-1 text-rose-700"><b>Error:</b> {humanize(record.error)}</p>}
                    <p className="mt-1">This is a reconciliation hold, not an approval. Resolve the underlying blocker in the governed workspace; a later successful run supersedes this review.</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
