import { Link } from "react-router-dom";
import { Activity, ChevronRight } from "lucide-react";

function statusBadge(status) {
  const map = {
    running:          "bg-blue-50 text-blue-700 border-blue-200",
    completed:        "bg-emerald-50 text-emerald-700 border-emerald-200",
    failed:           "bg-rose-50 text-rose-700 border-rose-200",
    waiting_approval: "bg-amber-50 text-amber-700 border-amber-200",
    waiting_input:    "bg-violet-50 text-violet-700 border-violet-200",
    queued:           "bg-secondary text-muted-foreground border-border/60",
    retrying:         "bg-orange-50 text-orange-700 border-orange-200",
    cancelled:        "bg-secondary text-muted-foreground border-border/60",
  };
  return map[status] || "bg-secondary text-muted-foreground border-border/60";
}

function timeAgo(iso) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function RecentActivity({ tasks = [] }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={12} className="text-muted-foreground" />
          <h3 className="text-sm font-black tracking-tight">Recent activity</h3>
          <span className="text-[10px] text-muted-foreground">last 10</span>
        </div>
        <Link to="/admin/activity" className="text-[11px] font-bold text-foreground hover:underline inline-flex items-center gap-0.5">
          See all <ChevronRight size={10} />
        </Link>
      </div>
      {tasks.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-xs text-muted-foreground">No recent agent activity.</p>
        </div>
      ) : (
        <div className="divide-y divide-border/40">
          {tasks.map(t => (
            <div key={t.id} className="px-4 py-2.5 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-foreground shrink-0">{t.agent_name}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{t.task_type}</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusBadge(t.status)} shrink-0`}>{t.status}</span>
              <span className="text-[11px] text-muted-foreground truncate flex-1 min-w-0">
                {t.output_summary || t.input_summary || "—"}
              </span>
              <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">{timeAgo(t.completed_at || t.created_date)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}