import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { Activity } from "lucide-react";

const STATUS_STYLE = {
  success: "bg-green-500/15 text-green-700 border-green-500/30",
  error: "bg-red-500/15 text-red-700 border-red-500/30",
  unauthorized: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  forbidden: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  not_found: "bg-secondary border-border",
};

export default function ActivityLogTable({ logs }) {
  if (logs.length === 0) {
    return (
      <div className="border border-dashed border-border/60 rounded-xl p-10 text-center">
        <Activity className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-sm font-semibold">No activity yet</p>
        <p className="text-xs text-muted-foreground mt-1">Activity from external tools will appear here.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-secondary/50 text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left px-4 py-2.5">Time</th>
            <th className="text-left px-4 py-2.5">Tool</th>
            <th className="text-left px-4 py-2.5">Key</th>
            <th className="text-left px-4 py-2.5">Endpoint</th>
            <th className="text-left px-4 py-2.5">Scope</th>
            <th className="text-left px-4 py-2.5">Status</th>
            <th className="text-left px-4 py-2.5">Duration</th>
            <th className="text-left px-4 py-2.5">IP</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {logs.map(l => (
            <tr key={l.id} className="hover:bg-secondary/30">
              <td className="px-4 py-3 text-xs text-muted-foreground">{formatDistanceToNow(new Date(l.created_date), { addSuffix: true })}</td>
              <td className="px-4 py-3 capitalize">{l.tool_name || "—"}</td>
              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{l.key_prefix || "—"}</td>
              <td className="px-4 py-3 font-mono text-xs">{l.endpoint || `${l.method} —`}</td>
              <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">{l.scope_used || "—"}</td>
              <td className="px-4 py-3">
                <Badge className={STATUS_STYLE[l.status] || ""}>
                  {l.status_code || ""} {l.status}
                </Badge>
              </td>
              <td className="px-4 py-3 tabular-nums text-xs text-muted-foreground">{l.duration_ms ? `${l.duration_ms}ms` : "—"}</td>
              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{l.ip_address || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}