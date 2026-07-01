import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Search, ArrowUpRight } from "lucide-react";

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [brands, setBrands] = useState([]);
  const [results, setResults] = useState([]);
  const [userDeals, setUserDeals] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("created_date");

  useEffect(() => {
    Promise.all([
      base44.entities.User.list(),
      base44.entities.Brand.list(),
      base44.entities.AnalyzerResult.list("-created_date", 500),
      base44.entities.UserDeal.list(),
    ]).then(([u, b, r, ud]) => {
      setUsers(u); setBrands(b); setResults(r); setUserDeals(ud);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex items-center justify-center py-40"><div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin" /></div>;

  const getBrand = (email) => brands.find(b => b.created_by === email);
  const getLatestResult = (email) => results.find(r => r.created_by === email);
  const getDeals = (email) => userDeals.filter(d => d.user_email === email);

  const filtered = users.filter(u => {
    const brand = getBrand(u.email);
    const q = search.toLowerCase();
    return !q || u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || brand?.name?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-[-0.03em]">Users & Companies</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{users.length} registered users</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name, email, company..."
          className="w-full h-9 pl-8 pr-4 text-sm bg-secondary/60 border border-border/50 rounded-lg focus:outline-none focus:border-foreground/20"
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/50 overflow-hidden">
        <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_1fr_auto] px-5 py-3 bg-secondary/40 border-b border-border/40 text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 gap-4">
          <span>User / Company</span>
          <span>Email</span>
          <span>Score</span>
          <span>Analyses</span>
          <span>Active Deals</span>
          <span>Joined</span>
          <span></span>
        </div>
        {filtered.map(u => {
          const brand = getBrand(u.email);
          const result = getLatestResult(u.email);
          const deals = getDeals(u.email);
          const active = deals.filter(d => d.status === "active").length;
          const score = result?.infra_score;
          const scoreColor = score >= 80 ? "text-green-600" : score >= 60 ? "text-orange-500" : score ? "text-blue-600" : "text-muted-foreground/30";

          return (
            <div key={u.id} className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_1fr_auto] px-5 py-3.5 border-b border-border/20 last:border-0 items-center gap-4 hover:bg-secondary/20 transition-colors">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{u.full_name || "—"}</p>
                <p className="text-[11px] text-muted-foreground/40 truncate">{brand?.name || "No company"}</p>
              </div>
              <p className="text-xs text-muted-foreground/60 truncate">{u.email}</p>
              <p className={`text-sm font-black tabular-nums ${scoreColor}`}>{score ? `${score}/100` : "—"}</p>
              <p className="text-sm tabular-nums">{results.filter(r => r.created_by === u.email).length}</p>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold tabular-nums text-green-600">{active}</p>
                {deals.filter(d => d.status === "waitlist").length > 0 && (
                  <span className="text-[10px] text-blue-500">+{deals.filter(d => d.status === "waitlist").length} waitlist</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground/40">{new Date(u.created_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>
              <Link to={`/admin/users/${u.id}?email=${u.email}`}>
                <button className="h-7 px-3 rounded-lg bg-secondary/80 text-xs font-medium hover:bg-secondary transition-colors flex items-center gap-1">
                  View <ArrowUpRight size={10} />
                </button>
              </Link>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">No users found</div>
        )}
      </div>
    </div>
  );
}