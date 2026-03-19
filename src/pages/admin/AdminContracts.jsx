import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { Plus, FileCheck } from "lucide-react";

const STATUS_STYLE = {
  draft: "bg-secondary text-muted-foreground border-border/40",
  sent: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  viewed: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  signed: "bg-green-500/10 text-green-600 border-green-500/20",
  expired: "bg-red-500/10 text-red-600 border-red-500/20",
};

export default function AdminContracts() {
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ brand_name: "", brand_email: "", deal_name: "", status: "draft", owner: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const reload = () => base44.entities.Contract.list("-created_date", 200).then(setContracts);
  useEffect(() => { reload().then(() => setLoading(false)); }, []);

  const create = async () => {
    if (!form.brand_name.trim() || !form.deal_name.trim()) return;
    setSaving(true);
    await base44.entities.Contract.create({ ...form, sent_date: form.status === "sent" ? new Date().toISOString().split("T")[0] : "" });
    setForm({ brand_name: "", brand_email: "", deal_name: "", status: "draft", owner: "", notes: "" });
    setShowForm(false);
    setSaving(false);
    reload();
  };

  const updateStatus = async (id, status) => {
    const upd = { status };
    if (status === "signed") upd.signed_date = new Date().toISOString().split("T")[0];
    await base44.entities.Contract.update(id, upd);
    reload();
  };

  const filtered = contracts.filter(c => filter === "all" || c.status === filter);

  if (loading) return <div className="flex items-center justify-center py-40"><div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-[-0.03em]">Contracts</h1>
          <p className="text-xs text-muted-foreground/50 mt-0.5">{contracts.length} total · {contracts.filter(c => c.status === "signed").length} signed</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="h-8 px-4 rounded-lg bg-foreground text-background text-xs font-semibold flex items-center gap-1.5">
          <Plus size={11} /> New Contract
        </button>
      </div>

      {showForm && (
        <div className="p-5 rounded-xl border border-border/50 bg-card space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Brand name" value={form.brand_name} onChange={e => setForm({ ...form, brand_name: e.target.value })}
              className="h-9 px-3 text-sm bg-secondary/60 border border-border/50 rounded-lg focus:outline-none" />
            <input placeholder="Brand email" value={form.brand_email} onChange={e => setForm({ ...form, brand_email: e.target.value })}
              className="h-9 px-3 text-sm bg-secondary/60 border border-border/50 rounded-lg focus:outline-none" />
            <input placeholder="Deal name" value={form.deal_name} onChange={e => setForm({ ...form, deal_name: e.target.value })}
              className="h-9 px-3 text-sm bg-secondary/60 border border-border/50 rounded-lg focus:outline-none" />
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
              className="h-9 px-3 text-xs bg-secondary/60 border border-border/50 rounded-lg focus:outline-none">
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="signed">Signed</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={create} disabled={saving} className="h-8 px-4 rounded-lg bg-foreground text-background text-xs font-semibold disabled:opacity-40">
              {saving ? "Saving..." : "Create"}
            </button>
            <button onClick={() => setShowForm(false)} className="h-8 px-4 rounded-lg border border-border/50 text-xs text-muted-foreground">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex gap-1 p-1 rounded-xl bg-secondary/40 w-fit">
        {[["all", "All"], ["sent", "Sent"], ["viewed", "Viewed"], ["signed", "Signed"]].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`px-4 h-7 rounded-lg text-xs font-semibold transition-all ${filter === v ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border/50 overflow-hidden">
        <div className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr_auto] px-5 py-3 bg-secondary/40 border-b border-border/40 text-[9px] uppercase tracking-[0.15em] text-muted-foreground/40 gap-4">
          <span>Brand</span><span>Deal</span><span>Status</span><span>Sent</span><span>Signed</span><span></span>
        </div>
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground/40">No contracts</div>
        ) : filtered.map(c => (
          <div key={c.id} className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr_auto] px-5 py-3.5 border-b border-border/15 last:border-0 items-center gap-4 hover:bg-secondary/20 transition-colors">
            <div>
              <p className="text-xs font-semibold">{c.brand_name}</p>
              <p className="text-[10px] text-muted-foreground/40">{c.brand_email}</p>
            </div>
            <p className="text-xs text-muted-foreground/70">{c.deal_name}</p>
            <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border w-fit ${STATUS_STYLE[c.status]}`}>
              {c.status}
            </span>
            <p className="text-[10px] text-muted-foreground/40">{c.sent_date ? format(new Date(c.sent_date), "dd MMM") : "—"}</p>
            <p className="text-[10px] text-muted-foreground/40">{c.signed_date ? format(new Date(c.signed_date), "dd MMM") : "—"}</p>
            <div className="flex gap-1">
              {c.status !== "signed" && (
                <button onClick={() => updateStatus(c.id, "signed")}
                  className="h-6 px-2 rounded text-[10px] bg-green-500/10 text-green-600 hover:bg-green-500/20 transition-colors flex items-center gap-1">
                  <FileCheck size={9} /> Sign
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}