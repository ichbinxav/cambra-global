import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, X, Save, Building2 } from "lucide-react";

const CATEGORIES = ["payments", "shipping", "saas", "insurance", "banking", "logistics"];
const API_COLORS = {
  connected: "text-green-600 bg-green-500/10 border-green-500/20",
  not_connected: "text-muted-foreground bg-secondary border-border/40",
  error: "text-red-600 bg-red-500/10 border-red-500/20",
};

export default function AdminProviders() {
  const [providers, setProviders] = useState([]);
  const [userDeals, setUserDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", category: "payments", contact_email: "", account_manager: "", api_status: "not_connected", contract_type: "", revenue_share_pct: "", notes: "" });

  const load = () => Promise.all([
    base44.entities.Provider.list(),
    base44.entities.UserDeal.list(),
  ]).then(([p, ud]) => { setProviders(p); setUserDeals(ud); setLoading(false); });

  useEffect(() => { load(); }, []);

  const getMetrics = (providerName) => {
    const deals = userDeals.filter(d => d.provider?.toLowerCase() === providerName?.toLowerCase());
    const active = deals.filter(d => d.status === "active");
    const savings = active.reduce((s, d) => s + (d.estimated_savings || 0), 0);
    return { leads: deals.length, active: active.length, savings, conversion: deals.length > 0 ? Math.round((active.length / deals.length) * 100) : 0 };
  };

  const save = async () => {
    if (!form.name) return;
    const data = { ...form, revenue_share_pct: parseFloat(form.revenue_share_pct) || 0 };
    if (selected?.id) {
      const updated = await base44.entities.Provider.update(selected.id, data);
      setProviders(prev => prev.map(p => p.id === selected.id ? updated : p));
      setSelected(updated);
    } else {
      const created = await base44.entities.Provider.create(data);
      setProviders(prev => [...prev, created]);
      setShowNew(false);
      setForm({ name: "", category: "payments", contact_email: "", account_manager: "", api_status: "not_connected", contract_type: "", revenue_share_pct: "", notes: "" });
    }
  };

  if (loading) return <div className="flex items-center justify-center py-40"><div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-[-0.03em]">Providers</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{providers.length} providers in directory</p>
        </div>
        <button onClick={() => { setShowNew(true); setSelected(null); }}
          className="h-9 px-4 rounded-xl bg-foreground text-background text-xs font-bold flex items-center gap-1.5">
          <Plus size={12} /> Add Provider
        </button>
      </div>

      <div className="flex gap-4">
        {/* Provider list */}
        <div className={`${selected || showNew ? "w-1/2" : "w-full"} rounded-xl border border-border/50 overflow-hidden`}>
          {providers.length === 0 ? (
            <div className="py-16 text-center">
              <Building2 size={24} className="text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No providers yet. Add your first provider.</p>
            </div>
          ) : providers.map(p => {
            const m = getMetrics(p.name);
            return (
              <div key={p.id} onClick={() => { setSelected(p); setForm(p); setShowNew(false); }}
                className={`px-5 py-4 border-b border-border/20 last:border-0 cursor-pointer transition-colors ${selected?.id === p.id ? "bg-secondary/40" : "hover:bg-secondary/20"}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-bold">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground/40 capitalize">{p.category}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${API_COLORS[p.api_status]}`}>
                    {p.api_status === "connected" ? "API Connected" : p.api_status === "error" ? "API Error" : "Not connected"}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: "Leads", val: m.leads },
                    { label: "Active", val: m.active },
                    { label: "Conversion", val: `${m.conversion}%` },
                    { label: "Savings", val: `€${(m.savings / 1000).toFixed(1)}K/yr` },
                  ].map((s, i) => (
                    <div key={i}>
                      <p className="text-[10px] text-muted-foreground/40">{s.label}</p>
                      <p className="text-sm font-bold">{s.val}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Form panel */}
        {(selected || showNew) && (
          <div className="w-1/2 rounded-xl border border-border/50 bg-card overflow-hidden sticky top-20">
            <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between">
              <p className="text-sm font-bold">{showNew ? "New Provider" : selected?.name}</p>
              <button onClick={() => { setSelected(null); setShowNew(false); }} className="text-muted-foreground/40 hover:text-foreground"><X size={14} /></button>
            </div>
            <div className="p-5 space-y-3 overflow-y-auto max-h-[calc(100vh-200px)]">
              {[
                { key: "name", label: "Provider Name", type: "input" },
                { key: "contact_email", label: "Contact Email", type: "input" },
                { key: "account_manager", label: "Account Manager", type: "input" },
                { key: "contract_type", label: "Contract Type", type: "input" },
                { key: "revenue_share_pct", label: "Revenue Share %", type: "input" },
              ].map(f => (
                <div key={f.key}>
                  <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-1.5">{f.label}</p>
                  <input value={form[f.key] || ""} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full h-9 px-3 text-sm bg-secondary/60 border border-border/50 rounded-lg focus:outline-none focus:border-foreground/20" />
                </div>
              ))}
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-1.5">Category</p>
                <select value={form.category} onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full h-9 px-3 text-sm bg-secondary/60 border border-border/50 rounded-lg focus:outline-none">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-1.5">API Status</p>
                <select value={form.api_status} onChange={e => setForm(prev => ({ ...prev, api_status: e.target.value }))}
                  className="w-full h-9 px-3 text-sm bg-secondary/60 border border-border/50 rounded-lg focus:outline-none">
                  <option value="not_connected">Not Connected</option>
                  <option value="connected">Connected</option>
                  <option value="error">Error</option>
                </select>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-1.5">Notes</p>
                <textarea value={form.notes || ""} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full h-20 px-3 py-2 text-sm bg-secondary/60 border border-border/50 rounded-lg focus:outline-none resize-none" />
              </div>
              <button onClick={save} className="w-full h-10 rounded-xl bg-foreground text-background text-sm font-bold flex items-center justify-center gap-2">
                <Save size={13} /> {showNew ? "Create Provider" : "Save Changes"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}