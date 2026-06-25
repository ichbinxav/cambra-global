import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Webhook, Send, Loader2 } from "lucide-react";

const EVENTS = ["new_brand_created", "new_document_uploaded", "analysis_completed", "savings_unlocked"];

function randomSecret() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return "whsec_" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

export default function WebhooksTable({ webhooks, onChanged }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState([]);
  const [testingId, setTestingId] = useState(null);
  const [testResult, setTestResult] = useState(null);

  const handleTest = async (id) => {
    setTestingId(id); setTestResult(null);
    try {
      const { data } = await base44.functions.invoke("sendTestWebhook", { webhook_id: id });
      setTestResult({ id, ...data });
    } catch (e) {
      setTestResult({ id, ok: false, error_message: e.message });
    }
    setTestingId(null);
    onChanged?.();
  };

  const handleCreate = async () => {
    if (!name || !url || events.length === 0) return;
    await base44.entities.WebhookEndpoint.create({
      name, url, events,
      secret: randomSecret(),
      status: "active",
      tool_name: "custom",
    });
    setName(""); setUrl(""); setEvents([]); setOpen(false);
    onChanged?.();
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this webhook?")) return;
    await base44.entities.WebhookEndpoint.delete(id);
    onChanged?.();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold">Webhook endpoints</h3>
          <p className="text-xs text-muted-foreground">Receive real-time events from CAMBRA.</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} className="gap-2"><Plus className="h-3.5 w-3.5" /> New webhook</Button>
      </div>

      {webhooks.length === 0 ? (
        <div className="border border-dashed border-border/60 rounded-xl p-10 text-center">
          <Webhook className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm font-semibold">No webhooks configured</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5">Name</th>
                <th className="text-left px-4 py-2.5">URL</th>
                <th className="text-left px-4 py-2.5">Events</th>
                <th className="text-left px-4 py-2.5">Last delivery</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {webhooks.map(w => (
                <tr key={w.id} className="hover:bg-secondary/30">
                  <td className="px-4 py-3 font-semibold">{w.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground truncate max-w-[260px]">{w.url}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(w.events || []).map(e => <span key={e} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary border border-border/60">{e}</span>)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {w.last_delivery_at ? new Date(w.last_delivery_at).toLocaleString() : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={w.last_delivery_status === "success" ? "bg-green-500/15 text-green-700 border-green-500/30" : w.last_delivery_status === "failed" ? "bg-red-500/15 text-red-700 border-red-500/30" : "bg-secondary border-border"}>
                      {w.last_delivery_status || w.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button size="icon" variant="ghost" onClick={() => handleTest(w.id)} disabled={testingId === w.id} className="h-8 w-8" title="Send test webhook">
                        {testingId === w.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(w.id)} className="h-8 w-8 text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {testResult && (
        <div className={`rounded-lg border p-3 text-xs ${testResult.ok ? "border-green-500/30 bg-green-500/5 text-green-800" : "border-red-500/30 bg-red-500/5 text-red-800"}`}>
          <div className="font-bold mb-1">{testResult.ok ? "✓ Test webhook delivered" : "✗ Test webhook failed"}</div>
          <div className="font-mono">HTTP {testResult.response_code || "—"} · {testResult.duration_ms || 0}ms · sig: HMAC-SHA256</div>
          {testResult.error_message && <div className="font-mono text-[10px] mt-1">{testResult.error_message}</div>}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New webhook endpoint</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Production Slack notifier" />
            </div>
            <div className="space-y-2">
              <Label>URL</Label>
              <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://your-app.com/webhooks/cambra" />
            </div>
            <div className="space-y-2">
              <Label>Events</Label>
              <div className="space-y-1.5 border border-border/60 rounded-lg p-3">
                {EVENTS.map(e => (
                  <label key={e} className="flex items-center gap-3 py-1 cursor-pointer">
                    <Checkbox checked={events.includes(e)} onCheckedChange={() => setEvents(s => s.includes(e) ? s.filter(x => x !== e) : [...s, e])} />
                    <span className="text-xs font-mono">{e}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create webhook</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}