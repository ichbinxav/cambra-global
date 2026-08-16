import { useState } from "react";
import { Check, X, Clock, AlertTriangle } from "lucide-react";

const RISK_META = {
  2: { label: "L2 client-visible draft", cls: "bg-amber-500/10 text-amber-700 border-amber-500/30" },
  3: { label: "L3 external action",      cls: "bg-orange-500/10 text-orange-700 border-orange-500/30" },
  4: { label: "L4 financial / legal",    cls: "bg-rose-500/10 text-rose-700 border-rose-500/30" },
};

function fmtAgo(iso) {
  if (!iso) return "—";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return "just now";
    const m = Math.floor(diff / 60_000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  } catch { return iso; }
}

function fmtUntil(iso) {
  if (!iso) return null;
  try {
    const diff = new Date(iso).getTime() - Date.now();
    if (diff < 0) return "expired";
    const h = Math.floor(diff / 3_600_000);
    if (h < 24) return `expires in ${h}h`;
    const d = Math.floor(h / 24);
    return `expires in ${d}d`;
  } catch { return null; }
}

function shortId(id) {
  if (!id) return "—";
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

export default function ApprovalCard({ approval, agentName, onApprove, onReject, busy, disabled = false }) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  const rMeta = RISK_META[approval.risk_level] || RISK_META[2];
  const expiry = fmtUntil(approval.expires_at);
  const isExpired = expiry === "expired";

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${rMeta.cls}`}>
          {rMeta.label}
        </span>
        <span className="text-sm font-bold text-foreground">{approval.action_type || "—"}</span>
        {agentName && (
          <span className="text-[11px] text-muted-foreground">
            by <span className="font-semibold text-foreground">{agentName}</span>
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock size={10} /> {fmtAgo(approval.created_date)}
        </span>
      </div>

      {/* Meta row */}
      <div className="px-4 py-2 bg-secondary/30 border-b border-border/40 flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px]">
        <span className="text-muted-foreground">
          Brand: <span className="font-mono text-foreground">{shortId(approval.brand_id)}</span>
        </span>
        {approval.related_entity_type && (
          <span className="text-muted-foreground">
            On: <span className="text-foreground">{approval.related_entity_type}</span>
            {approval.related_entity_id ? <span className="font-mono"> · {shortId(approval.related_entity_id)}</span> : null}
          </span>
        )}
        {expiry && (
          <span className={`inline-flex items-center gap-1 font-bold ${isExpired ? "text-rose-700" : "text-amber-700"}`}>
            {isExpired && <AlertTriangle size={10} />}
            {expiry}
          </span>
        )}
      </div>

      {/* Draft content */}
      <div className="px-4 py-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1.5">Draft content</p>
        {approval.draft_content ? (
          <pre className="text-[12px] text-foreground whitespace-pre-wrap break-words font-sans bg-secondary/40 rounded-lg p-3 max-h-64 overflow-auto">
            {approval.draft_content}
          </pre>
        ) : (
          <p className="text-[12px] text-muted-foreground italic">No draft content provided.</p>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-border/40 bg-secondary/20">
        {disabled ? (
          <div className="flex items-center gap-2 text-xs text-amber-700">
            <AlertTriangle size={12} />
            <span className="font-bold">Resolution in progress.</span>
            <span className="text-muted-foreground">
              CAMBRA keeps this visible and blocks a second decision while the durable command is reconciled.
            </span>
          </div>
        ) : !rejectOpen ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onApprove(approval)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              <Check size={12} /> Approve
            </button>
            <button
              type="button"
              onClick={() => setRejectOpen(true)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-border/60 bg-card text-xs font-bold text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
            >
              <X size={12} /> Reject
            </button>
            <span className="ml-auto text-[10px] text-muted-foreground">
              L4 commercial approvals revalidate mandate, offer and thread state server-side before continuing.
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for rejection (optional but helpful for the agent)…"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border/60 bg-card text-xs text-foreground"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { onReject(approval, reason.trim()); setRejectOpen(false); setReason(""); }}
                disabled={busy}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-colors disabled:opacity-50"
              >
                Confirm reject
              </button>
              <button
                type="button"
                onClick={() => { setRejectOpen(false); setReason(""); }}
                disabled={busy}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-border/60 bg-card text-xs font-semibold text-foreground hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
