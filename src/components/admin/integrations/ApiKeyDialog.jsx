import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Copy, Check, AlertCircle } from "lucide-react";

const SCOPES = [
  { id: "platform", label: "Platform-wide boundary", desc: "Explicitly allow this key to operate across merchants, limited by its other scopes. Leave off for tenant-bound keys." },
  { id: "read:kpis", label: "Read KPIs", desc: "Platform-level aggregated metrics" },
  { id: "read:brands", label: "Read brands", desc: "Brand directory and details" },
  { id: "read:analyses", label: "Read analyses", desc: "Analyzer results" },
  { id: "write:reports", label: "Write reports", desc: "Push reports to CAMBRA" },
  { id: "trigger:analysis", label: "Trigger analysis", desc: "Start a new analysis run" },
];

const TOOLS = [
  { id: "claude", label: "Claude" },
  { id: "chatgpt", label: "ChatGPT" },
  { id: "make", label: "Make" },
  { id: "n8n", label: "n8n" },
  { id: "zapier", label: "Zapier" },
  { id: "custom", label: "Custom" },
];

export default function ApiKeyDialog({ open, onOpenChange, onCreated }) {
  const [name, setName] = useState("");
  const [tool, setTool] = useState("custom");
  const [scopes, setScopes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdKey, setCreatedKey] = useState(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setName(""); setTool("custom"); setScopes([]); setError(""); setCreatedKey(null); setCopied(false);
  };

  const toggleScope = (id) => {
    setScopes(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };

  const handleCreate = async () => {
    setError("");
    if (!name.trim()) return setError("Name is required");
    if (scopes.length === 0) return setError("Select at least one scope");
    setLoading(true);
    try {
      const res = await base44.functions.invoke("createApiKey", { name, tool_name: tool, scopes });
      if (res.data?.error) throw new Error(res.data.error);
      setCreatedKey(res.data);
      onCreated?.();
    } catch (e) {
      setError(e.message || "Failed to create key");
    }
    setLoading(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(createdKey.api_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = (val) => {
    if (!val) reset();
    onOpenChange(val);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        {!createdKey ? (
          <>
            <DialogHeader>
              <DialogTitle>Create API key</DialogTitle>
              <DialogDescription>Generate a scoped key for an external tool or agent.</DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-2">
              <div className="space-y-2">
                <Label>Key name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Claude Production" />
              </div>

              <div className="space-y-2">
                <Label>Tool</Label>
                <div className="grid grid-cols-3 gap-2">
                  {TOOLS.map(t => (
                    <button key={t.id} onClick={() => setTool(t.id)}
                      className={`h-9 rounded-lg text-xs font-semibold border transition ${tool === t.id ? "bg-foreground text-background border-foreground" : "border-border/60 hover:border-foreground/40"}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Scopes</Label>
                <div className="space-y-1.5 border border-border/60 rounded-lg p-3">
                  {SCOPES.map(s => (
                    <label key={s.id} className="flex items-start gap-3 py-1.5 cursor-pointer hover:bg-secondary/40 rounded px-1.5">
                      <Checkbox checked={scopes.includes(s.id)} onCheckedChange={() => toggleScope(s.id)} className="mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-mono font-semibold">{s.id}</div>
                        <div className="text-[11px] text-muted-foreground">{s.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => handleClose(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={loading}>
                {loading ? "Creating..." : "Create key"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>API key created</DialogTitle>
              <DialogDescription>
                Copy this key now. It will <strong>never be shown again</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-border/60 bg-secondary/40 p-3 font-mono text-xs break-all select-all">
                {createdKey.api_key}
              </div>
              <Button onClick={handleCopy} className="w-full gap-2" variant="outline">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy key"}
              </Button>
              <div className="text-[11px] text-muted-foreground p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                Use it as <code className="font-mono">Authorization: Bearer {createdKey.key_prefix}…</code>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={() => handleClose(false)}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}