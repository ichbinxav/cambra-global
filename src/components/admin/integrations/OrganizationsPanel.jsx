import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Building2, Trash2 } from "lucide-react";

// DASHBOARD-C15 (2026-08-17): this array used to map a plan id to monthly_api_quota,
// overage_price_per_1k and rate_limit_per_minute, and the browser wrote those values into the
// entity. All three ARE read in production — apiV1 and mcpServer gate access on the quota and
// rate limit, apiUsageBilling invoices the overage — so this was commercial terms set from a
// form that the platform then enforces and bills against. The catalogue is server-side now and
// only the plan NAME is sent; the ids below exist solely to populate the dropdown.
const PLAN_IDS = ["free", "starter", "growth", "enterprise"];

const payload = (response) => response?.data || response || {};
async function callIntegration(action, body = {}) {
  const data = payload(await base44.functions.invoke("adminSummaries", { action: `integration_${action}`, ...body }));
  if (data?.ok === false || data?.error) {
    throw Object.assign(new Error(data?.error || "integration_operation_failed"), { data });
  }
  return data;
}

export default function OrganizationsPanel() {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ name: "", slug: "", owner_email: "", plan: "starter" });

  const load = async () => {
    setLoading(true);
    const data = await callIntegration("registry").catch(() => null);
    // An unreadable registry is not an empty registry.
    setOrgs(data?.organizations || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const requestPreview = async () => {
    if (!form.name || !form.owner_email) return;
    setError(null);
    setPreview(null);
    try {
      setPreview(await callIntegration("preview_organization", { patch: form }));
    } catch (caught) {
      setError(caught?.data?.reason || caught?.message || "Registration refused.");
    }
  };

  const create = async () => {
    try {
      await callIntegration("create_organization", {
        patch: form, expected_preview_hash: preview.preview_hash,
      });
      setPreview(null);
      setCreating(false);
      setForm({ name: "", slug: "", owner_email: "", plan: "starter" });
      load();
    } catch (caught) {
      setError(caught?.data?.reason || caught?.message || "Registration refused.");
    }
  };

  // Named cancel, not suspend. billing_status enumerates active, past_due, canceled and trial —
  // there is no suspended state, so the old "Suspend?" prompt offered a reversible-sounding
  // action that performed a terminal one.
  const cancel = async (id) => {
    const reason = prompt("Cancelling is terminal: API keys are rejected from now on and there is no suspended state to return to. Why? (recorded)");
    if (!reason) return;
    try {
      await callIntegration("cancel_organization", { organization_id: id, reason });
    } catch (caught) {
      setError(caught?.data?.reason || caught?.message || "Cancel refused.");
    }
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold">Organizations</h3>
          <p className="text-xs text-muted-foreground">Multi-tenant workspaces. Each owns API keys, webhooks and usage quota.</p>
        </div>
        <Button onClick={() => setCreating(true)} size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" /> New organization</Button>
      </div>

      {creating && (
        <div className="rounded-xl border border-border/60 bg-card p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Acme Corp" className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Slug</Label>
              <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="acme-corp" className="h-9 text-sm font-mono" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Owner email</Label>
            <Input value={form.owner_email} onChange={(e) => setForm({ ...form, owner_email: e.target.value })} placeholder="owner@acme.com" className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Plan</Label>
            <div className="grid grid-cols-4 gap-2 mt-1.5">
              {PLAN_IDS.map((id) => (
                <button key={id} onClick={() => { setForm({ ...form, plan: id }); setPreview(null); }}
                  className={`p-2 rounded-md border text-xs transition ${form.plan === id ? "bg-foreground text-background border-foreground" : "border-border/60 hover:border-foreground/40"}`}>
                  <div className="font-bold capitalize">{id}</div>
                  {/* The quota is no longer printed from a browser constant. It comes back on the
                      preview, from the server catalogue that apiV1 and apiUsageBilling enforce. */}
                  <div className="text-[9px] opacity-70 mt-0.5">terms on review</div>
                </button>
              ))}
            </div>
          </div>
          {preview && (
            <div data-testid="organization-preview" className="rounded-lg border border-sky-200 bg-sky-50 p-2.5 space-y-1 text-[11px] text-sky-900">
              <p className="font-bold">These terms will be enforced and invoiced</p>
              <p>{preview.preview.slug} · plan {preview.preview.plan}</p>
              <p>
                Quota {preview.preview.applies_terms.monthly_api_quota.toLocaleString()}/mo ·
                overage {preview.preview.applies_terms.overage_price_per_1k}/1k ·
                {" "}{preview.preview.applies_terms.rate_limit_per_minute} req/min
              </p>
              {/* The old form showed a plan name and wrote these three numbers itself. */}
              <p className="text-sky-900/80">{preview.preview.terms_note}</p>
            </div>
          )}
          {error && <p data-testid="organization-error" className="text-[11px] text-amber-800">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setPreview(null); setError(null); }}>Cancel</Button>
            {preview ? (
              <Button size="sm" onClick={create} data-testid="organization-confirm">Confirm and create</Button>
            ) : (
              <Button size="sm" onClick={requestPreview} disabled={!form.name || !form.owner_email} data-testid="organization-review">
                Review terms
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border/60 overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-xs text-muted-foreground">Loading…</div>
        ) : orgs.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
            <Building2 className="h-6 w-6 opacity-40" /> No organizations yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/40">
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left py-2 px-3 font-bold">Name</th>
                <th className="text-left py-2 px-3 font-bold">Plan</th>
                <th className="text-left py-2 px-3 font-bold">Quota</th>
                <th className="text-left py-2 px-3 font-bold">Status</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id} className="border-t border-border/40">
                  <td className="py-2 px-3 font-semibold">{o.name}<div className="text-[10px] text-muted-foreground font-mono">{o.slug}</div></td>
                  <td className="py-2 px-3 text-xs capitalize">{o.plan}</td>
                  <td className="py-2 px-3 text-xs tabular-nums">{(o.monthly_api_quota || 0).toLocaleString()}/mo</td>
                  <td className="py-2 px-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      o.billing_status === "active" ? "bg-green-500/10 text-green-700"
                      : o.billing_status === "trial" ? "bg-blue-500/10 text-blue-700"
                      : "bg-muted text-muted-foreground"}`}>{o.billing_status}</span>
                  </td>
                  <td className="py-2 px-3 text-right">
                    {o.billing_status !== "canceled" && (
                      <button onClick={() => cancel(o.id)} className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-destructive">
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