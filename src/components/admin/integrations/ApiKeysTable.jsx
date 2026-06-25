import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Key } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const SCOPE_COLORS = {
  "read:kpis": "bg-blue-500/10 text-blue-600 border-blue-500/30",
  "read:brands": "bg-blue-500/10 text-blue-600 border-blue-500/30",
  "read:analyses": "bg-blue-500/10 text-blue-600 border-blue-500/30",
  "write:reports": "bg-purple-500/10 text-purple-600 border-purple-500/30",
  "trigger:analysis": "bg-orange-500/10 text-orange-600 border-orange-500/30",
  "update:trackers": "bg-orange-500/10 text-orange-600 border-orange-500/30",
};

export default function ApiKeysTable({ keys, loading, onChanged }) {
  const handleRevoke = async (id) => {
    if (!confirm("Revoke this key? Tools using it will lose access immediately.")) return;
    await base44.functions.invoke("revokeApiKey", { key_id: id });
    onChanged?.();
  };

  if (loading) return <div className="text-sm text-muted-foreground p-8 text-center">Loading…</div>;
  if (keys.length === 0) {
    return (
      <div className="border border-dashed border-border/60 rounded-xl p-10 text-center">
        <Key className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-sm font-semibold">No API keys yet</p>
        <p className="text-xs text-muted-foreground mt-1">Create one to let external tools talk to CAMBRA.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-secondary/50 text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left px-4 py-2.5">Name</th>
            <th className="text-left px-4 py-2.5">Tool</th>
            <th className="text-left px-4 py-2.5">Key</th>
            <th className="text-left px-4 py-2.5">Scopes</th>
            <th className="text-left px-4 py-2.5">Last used</th>
            <th className="text-left px-4 py-2.5">Calls</th>
            <th className="text-left px-4 py-2.5">Status</th>
            <th className="px-4 py-2.5"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {keys.map(k => (
            <tr key={k.id} className="hover:bg-secondary/30">
              <td className="px-4 py-3 font-semibold">{k.name}</td>
              <td className="px-4 py-3 capitalize text-muted-foreground">{k.tool_name}</td>
              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{k.key_prefix}…{k.key_last4}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1 max-w-xs">
                  {(k.scopes || []).map(s => (
                    <span key={s} className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${SCOPE_COLORS[s] || "bg-secondary border-border"}`}>{s}</span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {k.last_used_at ? formatDistanceToNow(new Date(k.last_used_at), { addSuffix: true }) : "Never"}
              </td>
              <td className="px-4 py-3 tabular-nums text-xs">{k.usage_count || 0}</td>
              <td className="px-4 py-3">
                <Badge variant={k.status === "active" ? "default" : "secondary"} className={k.status === "active" ? "bg-green-500/15 text-green-700 border-green-500/30" : "bg-red-500/15 text-red-700 border-red-500/30"}>
                  {k.status}
                </Badge>
              </td>
              <td className="px-4 py-3 text-right">
                {k.status === "active" && (
                  <Button size="icon" variant="ghost" onClick={() => handleRevoke(k.id)} className="h-8 w-8 text-destructive hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}