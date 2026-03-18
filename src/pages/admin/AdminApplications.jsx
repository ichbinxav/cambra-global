import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Search, ArrowUpRight, Filter } from "lucide-react";
import AdminApplicationDetail from "./AdminApplicationDetail.jsx";

const STATUSES = ["all", "submitted", "in_review", "provider_contacted", "offer_ready", "activated", "rejected", "closed"];
const STATUS_COLORS = {
  submitted: "text-blue-600 bg-blue-500/10 border-blue-500/20",
  in_review: "text-orange-500 bg-orange-500/10 border-orange-500/20",
  provider_contacted: "text-purple-600 bg-purple-500/10 border-purple-500/20",
  offer_ready: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  activated: "text-green-600 bg-green-500/10 border-green-500/20",
  rejected: "text-red-600 bg-red-500/10 border-red-500/20",
  closed: "text-muted-foreground bg-secondary border-border/40",
};

export default function AdminApplications() {
  const [apps, setApps] = useState([]);
  const [brands, setBrands] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [a, b] = await Promise.all([
        base44.entities.UserDeal.list("-created_date", 500),
        base44.entities.Brand.list(),
      ]);
      setApps(a);
      setBrands(b);
    } catch (err) {
      console.error('Error loading applications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const getBrand = (email) => brands.find(b => b.created_by === email);

  const filtered = apps.filter(a => {
    const brand = getBrand(a.user_email);
    const q = search.toLowerCase();
    const matchQ = !q || a.deal_name?.toLowerCase().includes(q) || a.provider?.toLowerCase().includes(q) || a.user_email?.toLowerCase().includes(q) || brand?.name?.toLowerCase().includes(q);
    const matchS = statusFilter === "all" || a.status === statusFilter;
    return matchQ && matchS;
  });

  const updateStatus = async (id, status) => {
    try {
      await base44.entities.UserDeal.update(id, { status });
      setApps(prev => prev.map(a => a.id === id ? { ...a, status } : a));
      if (selected?.id === id) setSelected(prev => ({ ...prev, status }));
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-40"><div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black tracking-[-0.03em]">Deal Applications</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{apps.length} total applications</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
            className="h-9 pl-8 pr-4 text-sm bg-secondary/60 border border-border/50 rounded-lg focus:outline-none focus:border-foreground/20 w-56" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {STATUSES.map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 h-8 rounded-lg text-xs font-medium transition-all ${statusFilter === s ? "bg-foreground text-background" : "bg-secondary/60 text-muted-foreground hover:text-foreground"}`}>
              {s === "all" ? "All" : s.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Table + detail side panel */}
      <div className={`flex gap-4 ${selected ? "items-start" : ""}`}>
        <div className={`${selected ? "w-1/2" : "w-full"} rounded-xl border border-border/50 overflow-hidden transition-all`}>
          <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_auto] px-5 py-3 bg-secondary/40 border-b border-border/40 text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 gap-3">
            <span>Company / User</span>
            <span>Deal</span>
            <span>Status</span>
            <span>Mode</span>
            <span>Savings</span>
            <span></span>
          </div>
          {filtered.map(a => {
            const brand = getBrand(a.user_email);
            return (
              <div key={a.id}
                onClick={() => setSelected(selected?.id === a.id ? null : a)}
                className={`grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_auto] px-5 py-3.5 border-b border-border/20 last:border-0 items-center gap-3 cursor-pointer transition-colors ${selected?.id === a.id ? "bg-secondary/40" : "hover:bg-secondary/20"}`}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{brand?.name || a.user_email}</p>
                  <p className="text-[11px] text-muted-foreground/40 truncate">{a.user_email}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{a.deal_name}</p>
                  <p className="text-[11px] text-muted-foreground/40">{a.provider}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border w-fit ${STATUS_COLORS[a.status] || ""}`}>
                  {a.status?.replace("_", " ")}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border w-fit ${a.deal_mode === "instant" ? "bg-purple-500/10 text-purple-600 border-purple-500/20" : "bg-secondary text-muted-foreground border-border/40"}`}>
                  {a.deal_mode || "negotiated"}
                </span>
                <p className="text-sm font-bold tabular-nums text-green-600">
                  {a.estimated_savings ? `€${a.estimated_savings.toLocaleString()}` : "—"}
                </p>
                <ArrowUpRight size={12} className="text-muted-foreground/30" />
              </div>
            );
          })}
          {filtered.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">No applications found</div>}
        </div>

        {/* Detail panel */}
        {selected && (
          <AdminApplicationDetail
            app={selected}
            brand={brands.find(b => b.created_by === selected.user_email)}
            onClose={() => setSelected(null)}
            onStatusChange={updateStatus}
          />
        )}
      </div>
    </div>
  );
}