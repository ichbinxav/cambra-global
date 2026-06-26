import { useState } from "react";
import { ChevronDown, ChevronRight, AlertCircle, Clock, CheckCircle2, Loader2, Pause, XCircle, RefreshCw } from "lucide-react";

const STATUS_META = {
  queued:           { label: "queued",           cls: "bg-secondary text-muted-foreground border-border/60",      Icon: Clock },
  running:          { label: "running",          cls: "bg-blue-500/10 text-blue-700 border-blue-500/30",          Icon: Loader2 },
  waiting_approval: { label: "waiting approval", cls: "bg-amber-500/10 text-amber-700 border-amber-500/30",        Icon: Pause },
  completed:        { label: "completed",        cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",  Icon: CheckCircle2 },
  failed:           { label: "failed",           cls: "bg-rose-500/10 text-rose-700 border-rose-500/30",           Icon: AlertCircle },
  retrying:         { label: "retrying",         cls: "bg-purple-500/10 text-purple-700 border-purple-500/30",     Icon: RefreshCw },
  cancelled:        { label: "cancelled",        cls: "bg-secondary text-muted-foreground border-border/60",       Icon: XCircle },
};

const RISK_META = {
  0: { label: "L0 auto",     cls: "bg-secondary text-muted-foreground" },
  1: { label: "L1 internal", cls: "bg-secondary text-muted-foreground" },
  2: { label: "L2 draft",    cls: "bg-blue-500/10 text-blue-700" },
  3: { label: "L3 external", cls: "bg-amber-500/10 text-amber-700" },
  4: { label: "L4 fin/legal",cls: "bg-rose-500/10 text-rose-700" },
};

function fmtTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diff = now - d.getTime();
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

export default function AgentTaskRow({ task }) {
  const [open, setOpen] = useState(false);
  const sMeta = STATUS_META[task.status] || STATUS_META.queued;
  const rMeta = RISK_META[task.risk_level ?? 0] || RISK_META[0];
  const SIcon = sMeta.Icon;

  return (
    <div className="border-b border-border/40 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-secondary/40 transition-colors text-left"
      >
        <span className="text-muted-foreground">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>

        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold whitespace-nowrap ${sMeta.cls}`}>
          <SIcon size={9} className={task.status === "running" || task.status === "retrying" ? "animate-spin" : ""} />
          {sMeta.label}
        </span>

        <span className="text-xs font-bold text-foreground truncate min-w-0">
          {task.agent_name || "—"}
        </span>
        <span className="text-[11px] text-muted-foreground truncate min-w-0">
          {task.task_type || "—"}
        </span>

        <span className={`hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${rMeta.cls}`}>
          {rMeta.label}
        </span>

        {task.requires_approval && (
          <span className="hidden md:inline text-[9px] font-bold text-amber-700">
            • requires approval
          </span>
        )}

        <span className="ml-auto text-[11px] text-muted-foreground whitespace-nowrap tabular-nums">
          {fmtTime(task.created_date)}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 grid grid-cols-1 md:grid-cols-2 gap-4 text-[12px] bg-secondary/20">
          <div className="space-y-2">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-0.5">Brand</p>
              <p className="font-mono text-foreground">{shortId(task.brand_id)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-0.5">Related</p>
              <p className="text-foreground">
                {task.related_entity_type || "—"}
                {task.related_entity_id ? ` · ${shortId(task.related_entity_id)}` : ""}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-0.5">Input</p>
              <p className="text-foreground whitespace-pre-wrap break-words">{task.input_summary || "—"}</p>
            </div>
          </div>

          <div className="space-y-2">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-0.5">Output</p>
              <p className="text-foreground whitespace-pre-wrap break-words">{task.output_summary || "—"}</p>
            </div>
            {task.error && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-rose-700 font-bold mb-0.5">Error</p>
                <p className="text-rose-700 whitespace-pre-wrap break-words font-mono text-[11px]">{task.error}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground pt-1">
              <span>retries: <span className="text-foreground font-semibold tabular-nums">{task.retry_count ?? 0}</span></span>
              {task.started_at && <span>started: <span className="text-foreground font-semibold">{fmtTime(task.started_at)}</span></span>}
              {task.completed_at && <span>completed: <span className="text-foreground font-semibold">{fmtTime(task.completed_at)}</span></span>}
              {task.approval_id && <span>approval: <span className="font-mono text-foreground">{shortId(task.approval_id)}</span></span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}