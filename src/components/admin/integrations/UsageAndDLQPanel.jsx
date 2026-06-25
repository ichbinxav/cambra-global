import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, BarChart3, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function UsageAndDLQPanel() {
  const [usage, setUsage] = useState([]);
  const [dlq, setDlq] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [u, d] = await Promise.all([
      base44.entities.ApiUsageRecord.list("-last_updated_at", 50).catch(() => []),
      base44.entities.WebhookDeadLetter.list("-created_date", 50).catch(() => []),
    ]);
    setUsage(u);
    setDlq(d);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      {/* Usage by org */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2"><BarChart3 className="h-4 w-4" /> API Usage (billable)</h3>
            <p className="text-xs text-muted-foreground">Per-organization request counts and overage charges this cycle.</p>
          </div>
          <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
        <div className="rounded-xl border border-border/60 overflow-hidden">
          {loading ? (
            <div className="p-6 text-center text-xs text-muted-foreground">Loading…</div>
          ) : usage.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">No API usage recorded yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/40">
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left py-2 px-3 font-bold">Period</th>
                  <th className="text-left py-2 px-3 font-bold">Organization</th>
                  <th className="text-right py-2 px-3 font-bold">Requests</th>
                  <th className="text-right py-2 px-3 font-bold">Quota</th>
                  <th className="text-right py-2 px-3 font-bold">Overage</th>
                  <th className="text-right py-2 px-3 font-bold">Owed</th>
                  <th className="text-left py-2 px-3 font-bold">Billed</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((u) => (
                  <tr key={u.id} className="border-t border-border/40">
                    <td className="py-2 px-3 font-mono text-xs">{u.period_month}</td>
                    <td className="py-2 px-3 text-xs font-mono">{u.organization_id?.slice(0, 8)}…</td>
                    <td className="py-2 px-3 text-right tabular-nums text-xs">{(u.request_count || 0).toLocaleString()}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-xs text-muted-foreground">{(u.included_quota || 0).toLocaleString()}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-xs">{(u.overage_count || 0).toLocaleString()}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-xs font-bold">€{(u.overage_amount_eur || 0).toFixed(2)}</td>
                    <td className="py-2 px-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${u.billed ? "bg-green-500/10 text-green-700" : "bg-orange-500/10 text-orange-700"}`}>
                        {u.billed ? "billed" : "pending"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Dead Letter Queue */}
      <div>
        <h3 className="text-sm font-bold flex items-center gap-2 mb-1"><AlertTriangle className="h-4 w-4 text-orange-500" /> Webhook Dead Letter Queue</h3>
        <p className="text-xs text-muted-foreground mb-3">Failed deliveries pending background retry (5m → 30m → 2h → 12h → 24h).</p>
        <div className="rounded-xl border border-border/60 overflow-hidden">
          {loading ? (
            <div className="p-6 text-center text-xs text-muted-foreground">Loading…</div>
          ) : dlq.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">✓ No failed deliveries — DLQ is empty.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/40">
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left py-2 px-3 font-bold">Webhook</th>
                  <th className="text-left py-2 px-3 font-bold">Event</th>
                  <th className="text-left py-2 px-3 font-bold">Attempts</th>
                  <th className="text-left py-2 px-3 font-bold">Status</th>
                  <th className="text-left py-2 px-3 font-bold">Next retry</th>
                  <th className="text-left py-2 px-3 font-bold">Last error</th>
                </tr>
              </thead>
              <tbody>
                {dlq.map((d) => (
                  <tr key={d.id} className="border-t border-border/40">
                    <td className="py-2 px-3 text-xs font-semibold">{d.webhook_name}</td>
                    <td className="py-2 px-3 text-xs font-mono">{d.event_type}</td>
                    <td className="py-2 px-3 text-xs tabular-nums">{d.total_attempts || 0}</td>
                    <td className="py-2 px-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        d.status === "resolved" ? "bg-green-500/10 text-green-700"
                        : d.status === "exhausted" ? "bg-red-500/10 text-red-700"
                        : d.status === "abandoned" ? "bg-muted text-muted-foreground"
                        : "bg-orange-500/10 text-orange-700"}`}>{d.status}</span>
                    </td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">{d.next_retry_at ? new Date(d.next_retry_at).toLocaleString() : "—"}</td>
                    <td className="py-2 px-3 text-[10px] text-muted-foreground truncate max-w-[200px]">{d.last_error_message || `HTTP ${d.last_response_code}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}