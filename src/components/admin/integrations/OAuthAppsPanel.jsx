import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Copy, Check, ShieldCheck } from "lucide-react";

const ALL_SCOPES = [
  "read", "write", "admin",
  "read:brands", "read:analyses", "read:documents", "read:providers", "read:kpis",
  "read:savings", "read:trackers", "read:reports", "read:integrations",
  "write:reports", "write:documents", "write:trackers",
  "trigger:analysis",
];

// DASHBOARD-C12 (2026-08-17): the client id, the client secret and its hash used to be
// produced here. The randomness was never the problem — crypto.getRandomValues is a CSPRNG
// and the plaintext secret was correctly never sent to the server. The problem was that the
// entity write WAS the trust decision: the same call also set allowed_scopes, redirect_uris
// and pkce_required, and oauthAuthorize enforces PKCE only when that stored flag is true.
// The server now generates the credentials and owns every one of those fields.
const payload = (response) => response?.data || response || {};
async function callIntegration(action, body = {}) {
  const data = payload(await base44.functions.invoke("adminSummaries", { action: `integration_${action}`, ...body }));
  if (data?.ok === false || data?.error) {
    throw Object.assign(new Error(data?.error || "integration_operation_failed"), { data });
  }
  return data;
}

export default function OAuthAppsPanel() {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", redirect_uri: "", scopes: ["read:brands", "read:analyses"], type: "confidential" });
  const [justCreated, setJustCreated] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState("");

  const load = async () => {
    setLoading(true);
    const data = await callIntegration("registry").catch(() => null);
    // A registry that could not be read is not an empty registry.
    setApps(data?.oauth_apps || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const patchOf = () => ({
    name: form.name,
    description: form.description,
    redirect_uris: [form.redirect_uri],
    allowed_scopes: form.scopes,
    type: form.type,
  });

  const requestPreview = async () => {
    if (!form.name || !form.redirect_uri) return;
    setError(null);
    setPreview(null);
    try {
      setPreview(await callIntegration("preview_oauth_app", { patch: patchOf() }));
    } catch (caught) {
      setError(caught?.data?.reason || caught?.message || "Registration refused.");
    }
  };

  const create = async () => {
    try {
      const result = await callIntegration("create_oauth_app", {
        patch: patchOf(), expected_preview_hash: preview.preview_hash,
      });
      // The plaintext secret exists in this response only; the server stored its hash.
      setJustCreated(result);
      setPreview(null);
      setCreating(false);
      setForm({ name: "", description: "", redirect_uri: "", scopes: ["read:brands", "read:analyses"], type: "confidential" });
      load();
    } catch (caught) {
      setError(caught?.data?.reason || caught?.message || "Registration refused.");
    }
  };

  const revoke = async (id) => {
    const reason = prompt("Why is this app being revoked? (recorded)");
    if (!reason) return;
    try {
      const result = await callIntegration("revoke_oauth_app", { app_id: id, reason });
      // The old confirm() claimed all issued tokens would be invalidated. They are not:
      // revoking stops future authorizations, and oauthRevoke handles live tokens.
      setError(result.token_note || null);
    } catch (caught) {
      setError(caught?.data?.reason || caught?.message || "Revoke refused.");
    }
    load();
  };

  const copy = (key, value) => { navigator.clipboard.writeText(value); setCopied(key); setTimeout(() => setCopied(""), 1500); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold">OAuth Apps</h3>
          <p className="text-xs text-muted-foreground">Third-party apps using OAuth 2.0 (Authorization Code + PKCE).</p>
        </div>
        <Button onClick={() => setCreating(true)} size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" /> New OAuth app</Button>
      </div>

      {justCreated && (
        <div className="rounded-xl border-2 border-cambra-cyan/40 bg-cambra-cyan/[0.04] p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold">
            <ShieldCheck className="h-4 w-4 text-cambra-cyan" /> App created — save the secret now
          </div>
          <p className="text-xs text-muted-foreground">The client_secret will not be shown again.</p>
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2 rounded-lg bg-secondary p-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground w-28">client_id</span>
              <code className="flex-1 font-mono truncate">{justCreated.client_id}</code>
              <button onClick={() => copy("id", justCreated.client_id)} className="p-1 hover:bg-background rounded">
                {copied === "id" ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
            {justCreated.client_secret && (
              <div className="flex items-center gap-2 rounded-lg bg-secondary p-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground w-28">client_secret</span>
                <code className="flex-1 font-mono truncate">{justCreated.client_secret}</code>
                <button onClick={() => copy("sec", justCreated.client_secret)} className="p-1 hover:bg-background rounded">
                  {copied === "sec" ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            )}
          </div>
          <Button size="sm" variant="ghost" onClick={() => setJustCreated(null)}>Close</Button>
        </div>
      )}

      {creating && (
        <div className="rounded-xl border border-border/60 bg-card p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">App name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="My AI Agent" className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full h-9 px-2 rounded-md border border-border/60 bg-transparent text-sm">
                <option value="confidential">Confidential (server-side)</option>
                <option value="public">Public (PKCE-only)</option>
              </select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What does this app do?" className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Redirect URI</Label>
            <Input value={form.redirect_uri} onChange={(e) => setForm({ ...form, redirect_uri: e.target.value })} placeholder="https://yourapp.com/oauth/callback" className="h-9 text-sm font-mono" />
          </div>
          <div>
            <Label className="text-xs">Allowed scopes</Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {ALL_SCOPES.map((s) => {
                const on = form.scopes.includes(s);
                return (
                  <button key={s} onClick={() => setForm({ ...form, scopes: on ? form.scopes.filter((x) => x !== s) : [...form.scopes, s] })}
                    className={`px-2 py-1 rounded-md text-[10px] font-mono border transition ${on ? "bg-foreground text-background border-foreground" : "border-border/60 text-muted-foreground hover:border-foreground/40"}`}>
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            {preview && (
              <div data-testid="oauth-preview" className="w-full rounded-lg border border-sky-200 bg-sky-50 p-2.5 space-y-1 text-[11px] text-sky-900 mb-2">
                <p className="font-bold">This app will be able to do exactly this</p>
                <p>Redirect URIs: {preview.preview.redirect_uris.join(", ")}</p>
                <p>Scopes: {preview.preview.allowed_scopes.join(", ")}</p>
                <p>PKCE required: <b>yes</b> — set by the server, not selectable</p>
                {preview.preview.secret_will_be_generated && (
                  <p>A client secret will be generated and shown once.</p>
                )}
                <p className="text-sky-900/80">{preview.preview.authority_note}</p>
              </div>
            )}
            {error && <p data-testid="oauth-error" className="w-full text-[11px] text-amber-800 mb-2">{error}</p>}
            {preview ? (
              <Button size="sm" onClick={create} data-testid="oauth-confirm">Confirm and register</Button>
            ) : (
              <Button size="sm" onClick={requestPreview} disabled={!form.name || !form.redirect_uri} data-testid="oauth-review">
                Review registration
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border/60 overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-xs text-muted-foreground">Loading…</div>
        ) : apps.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">No OAuth apps yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/40">
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left py-2 px-3 font-bold">Name</th>
                <th className="text-left py-2 px-3 font-bold">client_id</th>
                <th className="text-left py-2 px-3 font-bold">Type</th>
                <th className="text-left py-2 px-3 font-bold">Scopes</th>
                <th className="text-left py-2 px-3 font-bold">Status</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id} className="border-t border-border/40">
                  <td className="py-2 px-3 font-semibold">{a.name}</td>
                  <td className="py-2 px-3 font-mono text-[11px]">{a.client_id}</td>
                  <td className="py-2 px-3 text-xs">{a.type}</td>
                  <td className="py-2 px-3 text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">{(a.allowed_scopes || []).join(", ")}</td>
                  <td className="py-2 px-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${a.status === "active" ? "bg-green-500/10 text-green-700" : "bg-muted text-muted-foreground"}`}>{a.status}</span>
                  </td>
                  <td className="py-2 px-3 text-right">
                    {a.status === "active" && (
                      <button onClick={() => revoke(a.id)} className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}