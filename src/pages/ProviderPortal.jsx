import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, Clock, AlertCircle, ArrowRight, Send, Upload, ExternalLink, X, LogOut, Building2, FileText, TrendingUp, Zap, Eye, Save } from "lucide-react";
import { formatSavings } from "@/lib/deals";
import { toast } from "sonner";
import Navbar from "@/components/landing/Navbar";

const STATUS_CFG = {
  new: { label: "New Lead", color: "text-blue-600 bg-blue-500/10 border-blue-500/20" },
  viewed: { label: "Viewed", color: "text-purple-600 bg-purple-500/10 border-purple-500/20" },
  in_progress: { label: "In Progress", color: "text-orange-500 bg-orange-500/10 border-orange-500/20" },
  offer_sent: { label: "Offer Sent", color: "text-amber-600 bg-amber-500/10 border-amber-500/20" },
  accepted: { label: "Accepted", color: "text-green-600 bg-green-500/10 border-green-500/20" },
  rejected: { label: "Rejected", color: "text-red-600 bg-red-500/10 border-red-500/20" },
};

function KPI({ label, value, color = "text-foreground", sub }) {
  return (
    <div className="p-4 rounded-xl border border-border/50 bg-card">
      <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-1">{label}</p>
      <p className={`text-2xl font-black tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground/40 mt-1">{sub}</p>}
    </div>
  );
}

function LeadDetail({ lead, onClose, onUpdate }) {
  const [form, setForm] = useState({ ...lead });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const updated = await base44.entities.ProviderLead.update(form.id, form);
    onUpdate(updated);
    toast.success("Lead updated");
    setSaving(false);
  };

  const cfg = STATUS_CFG[form.status] || STATUS_CFG.new;

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-xl" onClick={onClose} />
      <motion.div className="relative w-full max-w-xl bg-background border border-border/60 rounded-2xl shadow-2xl overflow-hidden"
        initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}>
        <div className="px-6 py-5 border-b border-border/40 flex items-center justify-between">
          <div>
            <p className="text-sm font-black">{form.company_name || form.user_email}</p>
            <p className="text-[11px] text-muted-foreground/40">{form.deal_name}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground/40 hover:text-foreground"><X size={14} /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
          {/* Company context */}
          <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-secondary/30 border border-border/40">
            <div>
              <p className="text-[10px] text-muted-foreground/40 mb-0.5">Company</p>
              <p className="text-sm font-bold">{form.company_name || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground/40 mb-0.5">Category</p>
              <p className="text-sm font-bold capitalize">{form.category}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground/40 mb-0.5">Est. GMV</p>
              <p className="text-sm font-bold">{form.estimated_gmv ? formatSavings(form.estimated_gmv) + "/yr" : "—"}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground/40 mb-0.5">Est. Savings</p>
              <p className="text-sm font-bold text-green-600">{form.estimated_savings ? formatSavings(form.estimated_savings) + "/yr" : "—"}</p>
            </div>
          </div>

          {/* Status */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-2">Update Status</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(STATUS_CFG).map(([key, c]) => (
                <button key={key} onClick={() => setForm(f => ({ ...f, status: key }))}
                  className={`px-3 h-7 rounded-full text-[11px] font-semibold border transition-all ${form.status === key ? c.color : "bg-secondary/50 text-muted-foreground border-border/40"}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Optimized terms */}
          <div>
            <label className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 block mb-1.5">Your Optimized Terms</label>
            <textarea value={form.optimized_terms || ""} onChange={e => setForm(f => ({ ...f, optimized_terms: e.target.value }))}
              placeholder="e.g. New rate: 1.4% + €0.10 per transaction. Valid for 12 months..."
              rows={3} className="w-full px-3 py-2 text-xs bg-secondary/60 border border-border/50 rounded-lg focus:outline-none resize-none" />
          </div>

          {/* Offer link */}
          <div>
            <label className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 block mb-1.5">Offer / Contract Link</label>
            <div className="flex gap-2">
              <input value={form.offer_link || ""} onChange={e => setForm(f => ({ ...f, offer_link: e.target.value }))}
                placeholder="https://..." className="flex-1 h-9 px-3 text-xs bg-secondary/60 border border-border/50 rounded-lg focus:outline-none" />
              {form.offer_link && <a href={form.offer_link} target="_blank" rel="noreferrer" className="h-9 w-9 flex items-center justify-center rounded-lg bg-secondary hover:bg-border"><ExternalLink size={11} /></a>}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 block mb-1.5">Internal Notes</label>
            <textarea value={form.provider_notes || ""} onChange={e => setForm(f => ({ ...f, provider_notes: e.target.value }))}
              rows={2} className="w-full px-3 py-2 text-xs bg-secondary/60 border border-border/50 rounded-lg focus:outline-none resize-none" />
          </div>

          <button onClick={save} disabled={saving}
            className="w-full h-10 rounded-xl bg-foreground text-background text-sm font-bold flex items-center justify-center gap-2">
            {saving ? <div className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" /> : <><Save size={13} /> Save & Update</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function ProviderPortal() {
  const [user, setUser] = useState(null);
  const [provider, setProvider] = useState(null);
  const [leads, setLeads] = useState([]);
  const [acts, setActs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [notProvider, setNotProvider] = useState(false);

  const loadData = async () => {
    const res = await base44.functions.invoke('providerScopedData', {});
    if (res.data?.ok) {
      setLeads(res.data.leads || []);
      setActs(res.data.activations || []);
    }
  };

  useEffect(() => {
    const init = async () => {
      const u = await base44.auth.me();
      setUser(u);
      // Find provider by matching contact email or creator email
      const providers = await base44.entities.Provider.list();
      let p = providers.find(pr => pr.contact_email === u.email || pr.created_by === u.email);
      // Admins: if no direct provider match, default to the first available provider
      if (!p && u.role === "admin" && providers.length > 0) {
        p = providers[0];
      }
      if (!p) { setNotProvider(true); setLoading(false); return; }
      setProvider(p);
      await loadData();
      setLoading(false);
    };
    init();
  }, []);

  const updateLead = (updated) => {
    setLeads(prev => prev.map(l => l.id === updated.id ? updated : l));
    setSelected(updated);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin" /></div>;

  if (notProvider) return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-5">🔒</div>
        <h1 className="text-xl font-black mb-2">Provider Portal</h1>
        <p className="text-sm text-muted-foreground mb-6">Your account is not linked to a provider profile. Contact THE NoDE team to get access.</p>
        <button onClick={() => base44.auth.logout("/")} className="h-9 px-5 rounded-full border border-border text-sm font-medium">Back to home</button>
      </div>
    </div>
  );

  const newLeads = leads.filter(l => l.status === "new").length;
  const inProgress = leads.filter(l => ["in_progress", "viewed"].includes(l.status)).length;
  const offersSent = leads.filter(l => l.status === "offer_sent").length;
  const accepted = leads.filter(l => l.status === "accepted").length;
  const totalSavings = leads.filter(l => l.status === "accepted").reduce((s, l) => s + (l.estimated_savings || 0), 0);
  const conversion = leads.length > 0 ? Math.round((accepted / leads.length) * 100) : 0;

  const filtered = statusFilter === "all" ? leads : leads.filter(l => l.status === statusFilter);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <Navbar />
        <div className="flex-1">
          <p className="text-xs font-black tracking-tight">THE NoDE</p>
          <p className="text-[10px] text-muted-foreground/40">Provider Portal · {provider?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          {newLeads > 0 && (
            <span className="h-7 px-3 rounded-full bg-red-500/10 text-red-600 text-[11px] font-bold border border-red-500/20 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              {newLeads} new
            </span>
          )}
          <button onClick={() => base44.auth.logout("/")} className="h-8 px-3 rounded-lg border border-border/40 text-xs font-medium text-muted-foreground flex items-center gap-1.5 hover:text-foreground">
            <LogOut size={11} /> Sign out
          </button>
        </div>


      <main className="max-w-5xl mx-auto p-6 space-y-6 mt-16">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-black tracking-[-0.03em]">{provider?.name}</h1>
          <p className="text-xs text-muted-foreground/50 mt-0.5 capitalize">{provider?.category} · Partner since {new Date(provider?.created_date || Date.now()).getFullYear()}</p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <KPI label="Total Leads" value={leads.length} />
          <KPI label="New Leads" value={newLeads} color="text-blue-600" sub="requires action" />
          <KPI label="Offers Sent" value={offersSent} color="text-amber-600" />
          <KPI label="Accepted" value={accepted} color="text-green-600" sub="deals activated" />
          <KPI label="Conversion Rate" value={`${conversion}%`} color="text-purple-600" />
          <KPI label="Estimated savings" value={formatSavings(totalSavings)} color="text-green-600" sub="accepted deals · not realized" />
        </div>

        {/* Leads */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-black">Deal Requests</h2>
            <div className="flex gap-1">
              {["all", "new", "in_progress", "offer_sent", "accepted"].map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-3 h-7 rounded-lg text-[11px] font-medium transition-all capitalize ${statusFilter === s ? "bg-foreground text-background" : "bg-secondary/60 text-muted-foreground hover:text-foreground"}`}>
                  {s === "all" ? "All" : s.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-border/40 rounded-2xl">
              <Building2 size={24} className="text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No leads yet.</p>
              <p className="text-xs text-muted-foreground/40 mt-1">Leads from THE NoDE network will appear here.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border/50 overflow-hidden">
              <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_auto] px-5 py-3 bg-secondary/40 border-b border-border/40 text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 gap-3">
                <span>Company</span><span>Deal</span><span>Status</span><span>Est. Savings</span><span></span>
              </div>
              {filtered.map(lead => {
                const cfg = STATUS_CFG[lead.status] || STATUS_CFG.new;
                return (
                  <div key={lead.id} onClick={() => setSelected(lead)}
                    className="grid grid-cols-[2fr_1.5fr_1fr_1fr_auto] px-5 py-4 border-b border-border/20 last:border-0 items-center gap-3 cursor-pointer hover:bg-secondary/20 transition-colors">
                    <div>
                      <p className="text-xs font-bold">{lead.company_name || lead.user_email}</p>
                      <p className="text-[11px] text-muted-foreground/40 truncate">{lead.user_email}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium truncate">{lead.deal_name}</p>
                      <p className="text-[11px] text-muted-foreground/40 capitalize">{lead.category}</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border w-fit ${cfg.color}`}>{cfg.label}</span>
                    <p className="text-xs font-black text-green-600 tabular-nums">{lead.estimated_savings ? formatSavings(lead.estimated_savings) + "/yr" : "—"}</p>
                    <ArrowRight size={12} className="text-muted-foreground/30" />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Activations (scoped) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-black">Activations</h2>
            <span className="text-[11px] text-muted-foreground/50">Provider-scoped</span>
          </div>
          {acts.length === 0 ? (
            <div className="py-8 text-center border border-dashed border-border/40 rounded-2xl text-sm text-muted-foreground">No activations yet.</div>
          ) : (
            <div className="rounded-xl border border-border/50 overflow-hidden">
              <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] px-5 py-3 bg-secondary/40 border-b border-border/40 text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 gap-3">
                <span>Brand</span><span>Vertical</span><span>Status</span><span>Provider tasks</span>
              </div>
              {acts.map(a => (
                <div key={a.id} className="grid grid-cols-[1.5fr_1fr_1fr_1fr] px-5 py-3 border-b border-border/20 last:border-0 items-center gap-3">
                  <span className="text-xs font-medium">{a.brand_id}</span>
                  <span className="text-xs capitalize">{a.vertical}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full border bg-secondary/40">{a.status}</span>
                  <span className="text-xs">{a.task_counts?.provider_required || 0} req · {a.task_counts?.blocked || 0} blocked</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <AnimatePresence>
        {selected && (
          <LeadDetail lead={selected} onClose={() => setSelected(null)} onUpdate={updateLead} />
        )}
      </AnimatePresence>
    </div>
  );
}