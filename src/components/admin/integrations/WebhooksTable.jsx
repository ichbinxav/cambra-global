import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Webhook, Send, Loader2, PauseCircle } from "lucide-react";

const EVENTS = ["new_brand_created", "new_document_uploaded", "analysis_completed", "savings_unlocked"];

// DASHBOARD-C12 (2026-08-17): the signing secret used to be generated here. The randomness
// was fine; the problem was that the browser also chose the URL, the events and the status
// with nothing validating any of them, and then a hard delete could destroy the secret and
// the whole delivery history behind a confirm(). The server generates the secret now, the URL
// is validated, and deleting is refused in favour of disabling.
const payload = (response) => response?.data || response || {};
async function callIntegration(action, body = {}) {
  const data = payload(await base44.functions.invoke("adminSummaries", { action: `integration_${action}`, ...body }));
  if (data?.ok === false || data?.error) {
    throw Object.assign(new Error(data?.error || "integration_operation_failed"), { data });
  }
  return data;
}

export default function WebhooksTable({ webhooks, onChanged }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState([]);
  const [testingId, setTestingId] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [createdSecret, setCreatedSecret] = useState(null);

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

  const handleReview = async () => {
    if (!name || !url || events.length === 0) return;
    setError(null);
    setPreview(null);
    try {
      setPreview(await callIntegration("preview_webhook", { patch: { name, url, events, tool_name: "custom" } }));
    } catch (caught) {
      setError(caught?.data?.reason || caught?.message || "Registration refused.");
    }
  };

  const handleCreate = async () => {
    try {
      const result = await callIntegration("create_webhook", {
        patch: { name, url, events, tool_name: "custom" },
        expected_preview_hash: preview.preview_hash,
      });
      // Shown once: the receiver needs it to verify signatures and the server keeps only
      // this copy on the row.
      setCreatedSecret(result.secret);
      setPreview(null);
      setName(""); setUrl(""); setEvents([]); setOpen(false);
      onChanged?.();
    } catch (caught) {
      setError(caught?.data?.reason || caught?.message || "Registration refused.");
    }
  };

  const handleDisable = async (id) => {
    const reason = prompt("Why is this endpoint being disabled? (recorded)");
    if (!reason) return;
    try {
      await callIntegration("disable_webhook", { webhook_id: id, reason });
    } catch (caught) {
      setError(caught?.data?.reason || caught?.message || "Disable refused.");
    }
    onChanged?.();
  };

  return (
    <div className="space-y-4">
      {createdSecret && (
        <div data-testid="webhook-secret-once" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-1">
          <p className="text-xs font-bold text-emerald-900">Signing secret — save it now</p>
          <p className="text-[11px] text-emerald-900/80">It will not be shown again.</p>
          <code className="block font-mono text-[11px] break-all">{createdSecret}</code>
          <Button size="sm" variant="ghost" onClick={() => setCreatedSecret(null)}>Done</Button>
        </div>
      )}
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
                      {/* Disable, not delete. A hard delete destroyed the signing secret and
                          the delivery history with no undo. */}
                      <Button size="icon" variant="ghost" onClick={() => handleDisable(w.id)}
                        data-testid={`disable-webhook-${w.id}`} title="Disable delivery (keeps the secret and history)"
                        className="h-8 w-8 text-amber-700" disabled={w.status === "disabled"}>
                        <PauseCircle className="h-3.5 w-3.5" />
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
          {preview && (
            <div data-testid="webhook-preview" className="rounded-lg border border-sky-200 bg-sky-50 p-2.5 space-y-1 text-[11px] text-sky-900">
              <p className="font-bold">This endpoint will receive signed deliveries</p>
              <p>{preview.preview.url}</p>
              <p>Events: {preview.preview.events.join(", ")}</p>
              <p>A signing secret will be generated and shown once.</p>
            </div>
          )}
          {error && <p data-testid="webhook-error" className="text-[11px] text-amber-800">{error}</p>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setOpen(false); setPreview(null); setError(null); }}>Cancel</Button>
            {preview ? (
              <Button onClick={handleCreate} data-testid="webhook-confirm">Confirm and create</Button>
            ) : (
              <Button onClick={handleReview} data-testid="webhook-review">Review endpoint</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}