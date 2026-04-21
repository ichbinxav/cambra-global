import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Search, X, Save, FileText, Link2, Plus, ExternalLink, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { formatSavings } from "@/lib/deals";
import { useI18n } from "@/lib/i18n.jsx";

const STATUS_CFG = {
  pending: { label: "Pending", color: "text-muted-foreground bg-secondary border-border/40" },
  sent: { label: "Sent", color: "text-blue-600 bg-blue-500/10 border-blue-500/20" },
  signed: { label: "Signed", color: "text-purple-600 bg-purple-500/10 border-purple-500/20" },
  active: { label: "Active", color: "text-green-600 bg-green-500/10 border-green-500/20" },
  expired: { label: "Expired", color: "text-orange-500 bg-orange-500/10 border-orange-500/20" },
  terminated: { label: "Terminated", color: "text-red-600 bg-red-500/10 border-red-500/20" },
};

export default function AdminContracts() { const { t } = useI18n();
  const [contracts, setContracts] = useState([]);
  const [brands, setBrands] = useState([]);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);

  const load = async () => {
    const [c, b] = await Promise.all([
      base44.entities.Contract.list("-created_date", 500),
      base44.entities.Brand.list(),
    ]);
    setContracts(c);
    setBrands(b);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const unsub = base44.entities.Contract.subscribe(load);
    return () => unsub?.();
  }, []);

  const select = (c) => {
    setSelected(c);
    setForm({ ...c });
  };

  const saveContract = async () => {
    if (!form) return;
    setSaving(true);
    const updated = await base44.entities.Contract.update(form.id, form);
    setContracts(prev => prev.map(c => c.id === updated.id ? updated : c));
    setSelected(updated);
    setSaving(false);
  };

  const getBrand = (email) => brands.find(b => b.created_by === email);

  const filtered = contracts.filter(c => {
    const brand = getBrand(c.user_email);
    const q = search.toLowerCase();
    const matchQ = !q || c.deal_name?.toLowerCase().includes(q) || c.provider?.toLowerCase().includes(q) || brand?.name?.toLowerCase().includes(q);
    const matchS = statusFilter === "all" || c.status === statusFilter;
    return matchQ && matchS;
  });

  const totalActive = contracts.filter(c => c.status === "active").length;
  const totalValue = contracts.filter(c => c.status === "active").reduce((s, c) => s + (c.estimated_savings_annual || 0), 0);
  const nodeRevenue = contracts.filter(c => c.status === "active").reduce((s, c) => s + ((c.estimated_savings_annual || 0) * ((c.node_revenue_pct || 15) / 100)), 0);

  if (loading) return <div className="flex items-center justify-center py-40"><div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black tracking-[-0.03em]">{t('admin.contracts.title', { default: 'Contract Tracking' })}</h1>
        <p className="text-xs text-muted-foreground/50 mt-0.5">{t('admin.contracts.subtitle', { default: 'Centralized visibility — THE NoDE does not own contracts' })}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 rounded-xl border border-green-500/20 bg-green-500/[0.04]">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-1">{t('admin.contracts.kpis.active', { default: 'Active Contracts' })}</p>
          <p className="text-2xl font-black text-green-600">{totalActive}</p>
        </div>
        <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/[0.04]">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-1">{t('admin.contracts.kpis.savings', { default: 'Savings Activated' })}</p>
          <p className="text-2xl font-black text-blue-600">{formatSavings(totalValue)}/yr</p>
        </div>
        <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.04]">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-1">{t('admin.contracts.kpis.revenue', { default: 'Estimated THE NoDE revenue (config-based)' })}</p>
          <p className="text-2xl font-black text-amber-600">{formatSavings(nodeRevenue)}/yr</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('admin.contracts.search_ph', { default: 'Search...' })}
            className="h-9 pl-8 pr-4 text-sm bg-secondary/60 border border-border/50 rounded-lg focus:outline-none w-52" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {["all", "pending", "sent", "signed", "active", "expired"].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 h-8 rounded-lg text-xs font-medium transition-all capitalize ${statusFilter === s ? "bg-foreground text-background" : "bg-secondary/60 text-muted-foreground hover:text-foreground"}`}>
              {s === "all" ? "All" : s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-4 items-start">
        {/* Table */}
        <div className={`${selected ? "w-1/2" : "w-full"} rounded-xl border border-border/50 overflow-hidden transition-all`}>
          <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr] px-5 py-3 bg-secondary/40 border-b border-border/40 text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 gap-3">
            <span>{t('admin.contracts.table.company', { default: 'Company' })}</span><span>{t('admin.contracts.table.deal', { default: 'Deal' })}</span><span>{t('admin.contracts.table.status', { default: 'Status' })}</span><span>{t('admin.contracts.table.savings', { default: 'Savings/yr' })}</span><span>{t('admin.contracts.table.expires', { default: 'Expires' })}</span>
          </div>
          {filtered.length === 0 && (
            <div className="py-16 text-center">
              <FileText size={24} className="text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground/50">{t('admin.contracts.empty.title', { default: 'No contracts found' })}</p>
              <p className="text-xs text-muted-foreground/30 mt-1">{t('admin.contracts.empty.hint', { default: 'Contracts are created automatically when deals are activated' })}</p>
            </div>
          )}
          {filtered.map(c => {
            const brand = getBrand(c.user_email);
            const cfg = STATUS_CFG[c.status] || STATUS_CFG.pending;
            return (
              <div key={c.id} onClick={() => select(c)}
                className={`grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr] px-5 py-3.5 border-b border-border/20 last:border-0 items-center gap-3 cursor-pointer transition-colors ${selected?.id === c.id ? "bg-secondary/40" : "hover:bg-secondary/20"}`}>
                <div>
                  <p className="text-xs font-bold truncate">{brand?.name || c.user_email}</p>
                  <p className="text-[11px] text-muted-foreground/40 truncate">{c.user_email}</p>
                </div>
                <div>
                  <p className="text-xs font-medium truncate">{c.deal_name}</p>
                  <p className="text-[11px] text-muted-foreground/40">{c.provider}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border w-fit capitalize ${cfg.color}`}>{cfg.label}</span>
                <p className="text-xs font-black text-green-600 tabular-nums">{c.estimated_savings_annual ? formatSavings(c.estimated_savings_annual) : "—"}</p>
                <p className="text-xs text-muted-foreground/50">{c.end_date ? new Date(c.end_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : "—"}</p>
              </div>
            );
          })}
        </div>

        {/* Detail panel */}
        {selected && form && (
          <div className="w-1/2 rounded-xl border border-border/50 bg-card overflow-hidden sticky top-20">
            <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold">{selected.deal_name}</p>
                <p className="text-[11px] text-muted-foreground/40">{getBrand(selected.user_email)?.name || selected.user_email}</p>
              </div>
              <button onClick={() => { setSelected(null); setForm(null); }} className="text-muted-foreground/40 hover:text-foreground"><X size={14} /></button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto max-h-[calc(100vh-220px)]">
              {/* Status */}
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-2">{t('admin.contracts.detail.status', { default: 'Contract Status' })}</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(STATUS_CFG).map(([key, cfg]) => (
                    <button key={key} onClick={() => setForm(f => ({ ...f, status: key }))}
                      className={`px-3 h-7 rounded-full text-[11px] font-semibold border transition-all capitalize ${form.status === key ? cfg.color : "bg-secondary/50 text-muted-foreground border-border/40"}`}>
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Contract docs */}
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-2">{t('admin.contracts.detail.docs', { default: 'Contract Documents' })}</p>
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground/40 block mb-1">{t('admin.contracts.detail.contract_link', { default: 'Contract Link (URL)' })}</label>
                    <div className="flex gap-2">
                      <input value={form.contract_link || ""} onChange={e => setForm(f => ({ ...f, contract_link: e.target.value }))}
                        placeholder="https://..." className="flex-1 h-8 px-3 text-xs bg-secondary/60 border border-border/50 rounded-lg focus:outline-none" />
                      {form.contract_link && <a href={form.contract_link} target="_blank" rel="noreferrer" className="h-8 w-8 flex items-center justify-center rounded-lg bg-secondary hover:bg-border transition-colors"><ExternalLink size={11} /></a>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Previous vs New conditions */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: "previous_conditions", label: t('admin.contracts.detail.prev_conditions', { default: 'Previous Conditions' }), color: "border-red-500/20 bg-red-500/[0.03]" },
                  { key: "new_conditions", label: t('admin.contracts.detail.new_conditions', { default: 'New Conditions (Node)' }), color: "border-green-500/20 bg-green-500/[0.03]" },
                ].map(({ key, label, color }) => (
                  <div key={key} className={`p-3 rounded-lg border ${color} space-y-2`}>
                    <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/40">{label}</p>
                    {["fee_pct", "cost_per_unit", "monthly_cost"].map(field => (
                      <div key={field}>
                        <label className="text-[9px] text-muted-foreground/30 uppercase block mb-0.5">{field.replace("_", " ")}</label>
                        <input type="number" step="0.01"
                          value={form[key]?.[field] || ""}
                          onChange={e => setForm(f => ({ ...f, [key]: { ...f[key], [field]: parseFloat(e.target.value) || null } }))}
                          className="w-full h-7 px-2 text-xs bg-background border border-border/50 rounded focus:outline-none" />
                      </div>
                    ))}
                    <div>
                      <label className="text-[9px] text-muted-foreground/30 uppercase block mb-0.5">Description</label>
                      <input value={form[key]?.description || ""}
                        onChange={e => setForm(f => ({ ...f, [key]: { ...f[key], description: e.target.value } }))}
                        className="w-full h-7 px-2 text-xs bg-background border border-border/50 rounded focus:outline-none" />
                    </div>
                  </div>
                ))}
              </div>

              {/* Savings */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: "estimated_savings_annual", label: t('admin.contracts.detail.estimated_savings', { default: 'Estimated Savings (€/yr)' }) },
                  { key: "actual_savings_annual", label: t('admin.contracts.detail.realized_savings', { default: 'Realized Savings (€/yr) — admin verified' }) },
                  { key: "start_date", label: t('common.start_date', { default: 'Start Date' }), type: "date" },
                  { key: "end_date", label: t('common.end_date', { default: 'End Date' }), type: "date" },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-[10px] text-muted-foreground/40 block mb-1">{f.label}</label>
                    <input type={f.type || "number"} value={form[f.key] || ""}
                      onChange={e => setForm(prev => ({ ...prev, [f.key]: f.type === "date" ? e.target.value : parseFloat(e.target.value) || null }))}
                      className="w-full h-8 px-3 text-xs bg-secondary/60 border border-border/50 rounded-lg focus:outline-none" />
                  </div>
                ))}
              </div>

              {/* Notes */}
              <div>
                <label className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 block mb-1.5">{t('admin.contracts.detail.internal_notes', { default: 'Internal Notes' })}</label>
                <textarea value={form.internal_notes || ""} onChange={e => setForm(f => ({ ...f, internal_notes: e.target.value }))}
                  rows={3} className="w-full px-3 py-2 text-xs bg-secondary/60 border border-border/50 rounded-lg focus:outline-none resize-none" />
              </div>

              <button onClick={saveContract} disabled={saving}
                className="w-full h-10 rounded-xl bg-foreground text-background text-sm font-bold flex items-center justify-center gap-2">
                {saving ? <div className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" /> : <><Save size={13} /> Save Contract</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}