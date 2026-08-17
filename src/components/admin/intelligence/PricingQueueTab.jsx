// DASHBOARD-C11 (2026-08-17) — the pricing-change queue, made reachable.
//
// `rateIntelligenceWatchWorker` has been detecting provider pricing changes every six
// hours and writing RateChangeCandidate rows that no code read. C10 built the adjudication
// backend; this is where a human can finally act on one.
//
// The display rule that carries the weight: a candidate that cannot be promoted shows NO
// promote button at all. Not a disabled one, not one that fails on click — the action is
// absent, because most candidates are "the page changed and we extracted no numbers", and
// an operator who can click promote on one of those will eventually click it.
import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, ShieldAlert, X } from "lucide-react";
import { callIntelligence } from "@/pages/admin/AdminIntelligenceWorkspace";

const STATE_TONE = {
  AUTO_PROMOTABLE: "border-emerald-200 bg-emerald-50 text-emerald-800",
  REVIEW_REQUIRED: "border-amber-200 bg-amber-50 text-amber-900",
  CONFLICT: "border-rose-200 bg-rose-50 text-rose-800",
  REJECTED: "border-border/60 bg-secondary/40 text-muted-foreground",
  CLOSED: "border-border/60 bg-secondary/40 text-muted-foreground",
};

function CandidateCard({ row, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState(null);
  const [reason, setReason] = useState("");

  async function requestPreview() {
    setBusy(true); setMessage(null);
    try {
      setPreview(await callIntelligence("preview_promotion", { candidate_id: row.candidate_id }));
    } catch (caught) {
      setMessage(caught?.data?.reason || caught?.message || "Preview refused.");
    }
    setBusy(false);
  }

  async function promote() {
    setBusy(true);
    try {
      await callIntelligence("apply_promotion", {
        candidate_id: row.candidate_id, reason,
        expected_preview_hash: preview.preview_hash,
      });
      setPreview(null);
      onChanged();
    } catch (caught) {
      setMessage(caught?.data?.reason || caught?.message || "Promotion refused.");
    }
    setBusy(false);
  }

  async function reject() {
    setBusy(true);
    try {
      await callIntelligence("reject_candidate", { candidate_id: row.candidate_id, reason });
      onChanged();
    } catch (caught) {
      setMessage(caught?.data?.reason || caught?.message || "Dismissal refused.");
    }
    setBusy(false);
  }

  return (
    <div data-testid={`candidate-${row.candidate_id}`} className="rounded-xl border border-border/60 bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-bold">{row.candidate_id}</p>
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold mt-1 ${STATE_TONE[row.state] || STATE_TONE.REVIEW_REQUIRED}`}>
            {row.state}
          </span>
          {row.copy_only && (
            <span data-testid={`copy-only-${row.candidate_id}`} className="ml-1.5 text-[9px] font-bold text-muted-foreground">
              wording changed, prices did not
            </span>
          )}
        </div>
        {row.current_is_verified && (
          <span data-testid={`verified-warning-${row.candidate_id}`} className="text-[10px] font-bold text-rose-700 inline-flex items-center gap-1">
            <ShieldAlert size={11} /> supersedes VERIFIED pricing
          </span>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground leading-snug">{row.decision_note}</p>

      {row.reason_codes?.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {row.reason_codes.map((code) => (
            <span key={code} className="text-[9px] font-mono rounded bg-secondary/60 px-1.5 py-0.5 text-muted-foreground">{code}</span>
          ))}
        </div>
      )}

      {preview && (
        <div data-testid={`promotion-preview-${row.candidate_id}`} className="rounded-lg border border-sky-200 bg-sky-50 p-2.5 space-y-1 text-[11px] text-sky-900">
          <p className="font-bold">This creates a new version and supersedes the current one</p>
          <p>
            {preview.preview.creates_version.provider_slug} · {preview.preview.creates_version.market} ·
            recorded as {preview.preview.creates_version.verification_status} (never VERIFIED on promotion)
          </p>
          {/* The old fact survives. Stated here because "supersede" reads like "replace". */}
          <p>Supersedes {preview.preview.supersedes || "no previous version"}; the previous row keeps its own rate.</p>
          {preview.preview.raises_conflict && (
            <p className="font-bold text-rose-800">Raises a knowledge conflict for impact review.</p>
          )}
        </div>
      )}

      <textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Reason (required for both promoting and dismissing)"
        aria-label="Reason"
        className="w-full text-xs bg-background border border-border rounded-lg px-2 py-1.5"
        rows={2}
      />

      {message && <p className="text-[11px] text-amber-800">{message}</p>}

      <div className="flex gap-2 flex-wrap">
        {/* A candidate that cannot be promoted has no promote control. Absent, not disabled. */}
        {row.promotable && !preview && (
          <button type="button" disabled={busy} onClick={requestPreview}
            data-testid={`review-${row.candidate_id}`}
            className="h-7 px-3 rounded-lg border border-border text-xs font-bold disabled:opacity-50">
            Review promotion
          </button>
        )}
        {row.promotable && preview && (
          <button type="button" disabled={busy || !reason.trim()} onClick={promote}
            data-testid={`promote-${row.candidate_id}`}
            className="h-7 px-3 rounded-lg bg-foreground text-background text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50">
            <Check size={12} /> Promote
          </button>
        )}
        <button type="button" disabled={busy || !reason.trim()} onClick={reject}
          data-testid={`reject-${row.candidate_id}`}
          className="h-7 px-3 rounded-lg border border-border text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50">
          <X size={12} /> Dismiss
        </button>
      </div>
    </div>
  );
}

export default function PricingQueueTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await callIntelligence("promotion_queue"));
    } catch (caught) {
      setData(null);
      setError(caught?.message || "promotion_queue_unavailable");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) {
    return (
      <div data-testid="queue-error" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 flex items-start gap-2">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <span>The pricing queue could not be read ({error}). That is not an empty queue.</span>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center gap-2 py-16 justify-center text-xs text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> Loading pricing changes…
      </div>
    );
  }

  const rows = data.rows || [];

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/50 bg-card p-3 text-xs flex items-center gap-4 flex-wrap">
        <span>
          <b data-testid="queue-open-count">{data.open_count === null ? "—" : data.open_count}</b> unresolved
        </span>
        <span><b>{data.promotable_count}</b> promotable</span>
        {data.truncated && <span className="text-amber-700 font-bold">list truncated</span>}
        {data.open_count === null && (
          <span className="text-rose-700 font-bold">source unreadable — this is not zero</span>
        )}
      </div>

      {Object.keys(data.unpromotable_reason_summary || {}).length > 0 && (
        <div data-testid="queue-reason-summary" className="rounded-xl border border-border/50 bg-secondary/30 p-3 text-[11px] space-y-0.5">
          <p className="font-bold text-muted-foreground uppercase tracking-wider text-[9px] mb-1">Why the rest cannot be promoted</p>
          {Object.entries(data.unpromotable_reason_summary).map(([code, count]) => (
            <p key={code} className="font-mono text-muted-foreground">{code}: {count}</p>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-12 text-center">
          {data.open_count === null ? "Queue unreadable." : "No unresolved pricing changes."}
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => <CandidateCard key={row.candidate_id} row={row} onChanged={load} />)}
        </div>
      )}
    </div>
  );
}
