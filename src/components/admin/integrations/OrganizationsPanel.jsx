import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Building2, Trash2 } from "lucide-react";

const PLANS = [
  { id: "free",       quota: 1000,    overage: 1.00, rate: 60  },
  { id: "starter",    quota: 10000,   overage: 0.50, rate: 120 },
  { id: "growth",     quota: 100000,  overage: 0.30, rate: 300 },
  { id: "enterprise", quota: 1000000, overage: 0.10, rate: 1000 },
];

export default function OrganizationsPanel() {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", owner_email: "", plan: "starter" });

  const load = async () => {
    setLoading(true);
    setOrgs(await base44.entities.Organization.list("-created_date", 100));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name || !form.owner_email) return;
    const plan = PLANS.find((p) => p.id === form.plan);
    await base44.entities.Organization.create({
      name: form.name,
      slug: form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      owner_email: form.owner_email,
      plan: form.plan,
      monthly_api_quota: plan.quota,
      overage_price_per_1k: plan.overage,
      rate_limit_per_minute: plan.rate,
      billing_status: "trial",
      trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    });
    setCreating(false);
    setForm({ name: "", slug: "", owner_email: "", plan: "starter" });
    load();
  };

  const suspend = async (id) => {
    if (!confirm("Suspend this organization? All keys will be rejected.")) return;
    await base44.entities.Organization.update(id, { billing_status: "canceled", suspended_at: new Date().toISOString() });
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
              {PLANS.map((p) => (
                <button key={p.id} onClick={() => setForm({ ...form, plan: p.id })}
                  className={`p-2 rounded-md border text-xs transition ${form.plan === p.id ? "bg-foreground text-background border-foreground" : "border-border/60 hover:border-foreground/40"}`}>
                  <div className="font-bold capitalize">{p.id}</div>
                  <div className="text-[9px] opacity-70 mt-0.5">{p.quota.toLocaleString()}/mo</div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            <Button size="sm" onClick={create} disabled={!form.name || !form.owner_email}>Create</Button>
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
                      <button onClick={() => suspend(o.id)} className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-destructive">
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