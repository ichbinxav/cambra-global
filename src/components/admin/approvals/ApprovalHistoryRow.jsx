import { CheckCircle2, XCircle, Clock } from "lucide-react";

const STATUS_META = {
  approved:  { Icon: CheckCircle2, cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30", label: "approved" },
  rejected:  { Icon: XCircle,      cls: "bg-rose-500/10 text-rose-700 border-rose-500/30",          label: "rejected" },
  expired:   { Icon: Clock,        cls: "bg-secondary text-muted-foreground border-border/60",      label: "expired" },
  cancelled: { Icon: XCircle,      cls: "bg-secondary text-muted-foreground border-border/60",      label: "cancelled" },
};

function fmtTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return "just now";
    const m = Math.floor(diff / 60_000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const days = Math.floor(h / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  } catch { return iso; }
}

function shortId(id) {
  if (!id) return "—";
  return id.length > 10 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

export default function ApprovalHistoryRow({ approval }) {
  const meta = STATUS_META[approval.status] || STATUS_META.cancelled;
  const Icon = meta.Icon;
  const resolvedAt = approval.approved_at || approval.updated_date || approval.created_date;

  return (
    <div className="px-4 py-3 border-b border-border/40 last:border-b-0 flex items-center gap-3 flex-wrap">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${meta.cls}`}>
        <Icon size={9} /> {meta.label}
      </span>
      <span className="text-xs font-bold text-foreground truncate min-w-0">{approval.action_type || "—"}</span>
      <span className="text-[11px] text-muted-foreground">L{approval.risk_level}</span>
      <span className="text-[11px] text-muted-foreground font-mono">{shortId(approval.brand_id)}</span>
      {approval.approved_by && (
        <span className="text-[11px] text-muted-foreground">
          by <span className="text-foreground font-semibold">{approval.approved_by}</span>
        </span>
      )}
      {approval.status === "rejected" && approval.rejected_reason && (
        <span className="text-[11px] text-muted-foreground italic truncate min-w-0">
          “{approval.rejected_reason}”
        </span>
      )}
      <span className="ml-auto text-[11px] text-muted-foreground whitespace-nowrap tabular-nums">
        {fmtTime(resolvedAt)}
      </span>
    </div>
  );
}