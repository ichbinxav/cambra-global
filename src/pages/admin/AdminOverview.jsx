import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import {
  Plus, AlertCircle, Clock, ArrowUpRight, CheckCircle2,
  TrendingUp, Zap, Users, FileText, Building2, ChevronRight
} from "lucide-react";

const PRIORITY_STYLE = {
  high: "bg-red-500/10 text-red-600 border-red-500/20",
  medium: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  low: "bg-secondary text-muted-foreground border-border/40",
};

const DEAL_STAGE_STYLE = {
  sourcing: "bg-secondary text-muted-foreground",
  negotiating: "bg-blue-500/10 text-blue-600",
  legal: "bg-purple-500/10 text-purple-600",
  ready: "bg-amber-500/10 text-amber-600",
  live: "bg-green-500/10 text-green-600",
  blocked: "bg-red-500/10 text-red-600",
};

export default function AdminOverview() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [brands, setBrands] = useState([]);
  const [userDeals, setUserDeals] = useState([]);
  const [apps, setApps] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [providers, setProviders] = useState([]);
  const [results, setResults] = useState([]);

  const reload = async () => {
    const [u, b, ud, a, t, c, p, r] = await Promise.all([
      base44.entities.User.list(),
      base44.entities.Brand.list(),
      base44.entities.UserDeal.list(),
      base44.entities.DealApplication.list(),
      base44.entities.Task.list("-created_date", 100),
      base44.entities.Contract.list("-created_date", 100),
      base44.entities.Provider.list(),
      base44.entities.AnalyzerResult.list("-created_date", 200),
    ]);
    setUsers(u); setBrands(b); setUserDeals(ud); setApps(a);
    setTasks(t); setContracts(c); setProviders(p); setResults(r);
  };

  useEffect(() => {
    reload().then(() => setLoading(false));
    const interval = setInterval(reload, 30000);
    const subs = [];
    try {
      [base44.entities.UserDeal, base44.entities.DealApplication, base44.entities.Task, base44.entities.Contract]
        .forEach(e => { const u = e.subscribe(() => reload()); if (u) subs.push(u); });
    } catch {}
    return () => { subs.forEach(u => u?.()); clearInterval(interval); };
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-40">
      <div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin" />
    </div>
  );

  // KPIs
  const liveDeals = userDeals.filter(d => d.status === "active");
  const inProgressDeals = userDeals.filter(d => d.status === "pending");
  const totalSavings = liveDeals.reduce((s, d) => s + (d.estimated_savings || 0), 0);
  const pendingContracts = contracts.filter(c => c.status === "sent" || c.status === "viewed");
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const tasksDueThisWeek = tasks.filter(t => t.status === "open" && t.due_date && new Date(t.due_date) <= weekEnd);
  const qualifiedBrands = brands.filter(b => b.onboarding_complete);

  // Funnel stages
  const totalUsers = users.length;
  const funnelStages = [
    { label: "New Leads", count: users.length, key: "leads" },
    { label: "Onboarded", count: brands.length, key: "onboarded" },
    { label: "Data Received", count: results.length > 0 ? brands.filter(b => results.find(r => r.brand_id === b.id || r.created_by)).length : 0, key: "data" },
    { label: "Qualified", count: qualifiedBrands.length, key: "qualified" },
    { label: "Assigned to Deal", count: [...new Set(userDeals.map(d => d.user_email))].length, key: "assigned" },
    { label: "Converted (Live)", count: [...new Set(liveDeals.map(d => d.user_email))].length, key: "converted" },
  ];

  // Action center items
  const actions = [];

  // Deals with no movement > 14 days
  const staleApps = apps.filter(a => {
    if (a.status === "activated" || a.status === "rejected" || a.status === "closed") return false;
    const updated = new Date(a.updated_date || a.created_date);
    return (now - updated) / (1000 * 60 * 60 * 24) > 14;
  });
  staleApps.slice(0, 3).forEach(a => actions.push({
    id: `stale-${a.id}`,
    text: `${a.deal_name} — no movement for 14+ days`,
    sub: a.company_name || a.user_email,
    priority: "high",
    cta: "Review",
    link: "/admin/applications",
  }));

  // Tasks due this week
  tasksDueThisWeek.slice(0, 3).forEach(t => actions.push({
    id: `task-${t.id}`,
    text: t.title,
    sub: t.linked_name ? `→ ${t.linked_name}` : "General task",
    priority: t.priority || "medium",
    cta: "View Task",
    link: "/admin/tasks",
  }));

  // Contracts pending
  pendingContracts.slice(0, 2).forEach(c => actions.push({
    id: `contract-${c.id}`,
    text: `Contract pending — ${c.brand_name}`,
    sub: c.deal_name,
    priority: "medium",
    cta: "Follow up",
    link: "/admin/contracts",
  }));

  // Brands missing data
  const missingData = brands.filter(b => !results.find(r => r.brand_id === b.id) && !b.onboarding_complete);
  missingData.slice(0, 2).forEach(b => actions.push({
    id: `missing-${b.id}`,
    text: `${b.name} — no analysis data yet`,
    sub: b.country || "Unknown location",
    priority: "low",
    cta: "Request data",
    link: "/admin/users",
  }));

  // Deal pipeline grouped by deal_id
  const dealGroups = {};
  userDeals.forEach(d => {
    if (!dealGroups[d.deal_id]) dealGroups[d.deal_id] = { name: d.deal_name, provider: d.provider, category: d.category, brands: [], savings: 0 };
    dealGroups[d.deal_id].brands.push(d);
    dealGroups[d.deal_id].savings += (d.estimated_savings || 0);
  });
  const pipelineDeals = Object.entries(dealGroups).map(([id, g]) => ({
    id, name: g.name, provider: g.provider, category: g.category,
    total: g.brands.length,
    confirmed: g.brands.filter(b => b.status === "active").length,
    pending: g.brands.filter(b => b.status === "pending").length,
    savings: g.savings,
    stage: g.brands.some(b => b.status === "active") ? "live"
      : g.brands.some(b => b.status === "pending") ? "negotiating"
      : "sourcing",
  })).sort((a, b) => b.confirmed - a.confirmed);

  // Provider pipeline
  const providerPipeline = providers.map(p => {
    const linked = userDeals.filter(d => d.provider === p.name).length;
    return { ...p, linked };
  });

  // Intelligence
  const byCountry = {};
  brands.forEach(b => { byCountry[b.country || "Unknown"] = (byCountry[b.country || "Unknown"] || 0) + 1; });
  const topCountries = Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const byCategory = {};
  brands.forEach(b => { byCategory[b.category || "other"] = (byCategory[b.category || "other"] || 0) + 1; });
  const topCategories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Activity feed (recent userDeals + apps)
  const activity = [
    ...userDeals.map(d => ({ date: d.created_date, text: `${d.user_email} applied for ${d.deal_name}`, type: "deal" })),
    ...apps.filter(a => a.status === "activated").map(a => ({ date: a.updated_date || a.created_date, text: `${a.company_name || a.user_email} activated ${a.deal_name}`, type: "activated" })),
    ...brands.map(b => ({ date: b.created_date, text: `${b.name} joined the network`, type: "brand" })),
    ...contracts.filter(c => c.status === "signed").map(c => ({ date: c.signed_date || c.updated_date, text: `Contract signed — ${c.brand_name} / ${c.deal_name}`, type: "contract" })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 15);

  const kpis = [
    { label: "Total Brands", value: brands.length, color: "text-foreground", link: "/admin/users" },
    { label: "Qualified", value: qualifiedBrands.length, color: "text-green-600", link: "/admin/users" },
    { label: "Live Deals", value: liveDeals.length, color: "text-green-600", link: "/admin/deals" },
    { label: "In Progress", value: inProgressDeals.length, color: "text-blue-600", link: "/admin/applications" },
    { label: "Est. Annual Savings", value: `€${(totalSavings / 1000).toFixed(0)}K`, color: "text-amber-600", link: "/admin/deals" },
    { label: "Contracts Pending", value: pendingContracts.length, color: "text-orange-500", link: "/admin/contracts" },
    { label: "Tasks This Week", value: tasksDueThisWeek.length, color: tasksDueThisWeek.length > 0 ? "text-red-600" : "text-foreground", link: "/admin/tasks" },
  ];

  return (
    <div className="space-y-8 pb-12">

      {/* HEADER */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-[-0.04em]">THE NoDE Admin</h1>
          <p className="text-xs text-muted-foreground/50 mt-1 tracking-[0.1em] uppercase">Economic Control Layer · {format(new Date(), "dd MMM yyyy")}</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {[
            { label: "Add Brand", icon: Users, link: "/admin/users" },
            { label: "Create Deal", icon: Zap, link: "/admin/deals" },
            { label: "Add Provider", icon: Building2, link: "/admin/providers" },
            { label: "Create Task", icon: Plus, link: "/admin/tasks" },
          ].map((a, i) => (
            <Link key={i} to={a.link}>
              <button className={`h-8 px-3.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border ${
                i === 0 ? "bg-foreground text-background border-foreground" : "bg-background border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
              }`}>
                <a.icon size={11} /> {a.label}
              </button>
            </Link>
          ))}
        </div>
      </div>

      {/* KPI ROW */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {kpis.map((k, i) => (
          <Link key={i} to={k.link}>
            <div className="p-4 rounded-xl border border-border/40 bg-card hover:border-border transition-all cursor-pointer group">
              <p className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-1.5">{k.label}</p>
              <p className={`text-2xl font-black tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* ACTION CENTER + FUNNEL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ACTION CENTER */}
        <div className="lg:col-span-2 rounded-xl border border-border/50 bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle size={13} className="text-red-500" />
              <p className="text-xs font-bold">Action Center</p>
            </div>
            <span className="text-[10px] text-muted-foreground/40">{actions.length} items require attention</span>
          </div>
          {actions.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground/40">All clear — no actions required</div>
          ) : (
            <div className="divide-y divide-border/20">
              {actions.map((a) => (
                <div key={a.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-secondary/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{a.text}</p>
                    <p className="text-[10px] text-muted-foreground/40 mt-0.5">{a.sub}</p>
                  </div>
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${PRIORITY_STYLE[a.priority]}`}>
                    {a.priority}
                  </span>
                  <Link to={a.link}>
                    <button className="h-7 px-3 rounded-lg bg-secondary/80 text-[11px] font-semibold hover:bg-secondary transition-colors whitespace-nowrap">
                      {a.cta} →
                    </button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* FUNNEL */}
        <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border/30">
            <p className="text-xs font-bold">Brand Funnel</p>
          </div>
          <div className="p-5 space-y-3">
            {funnelStages.map((s, i) => {
              const pct = funnelStages[0].count > 0 ? Math.round((s.count / funnelStages[0].count) * 100) : 0;
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[11px] text-muted-foreground/70">{s.label}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] font-black tabular-nums">{s.count}</p>
                      <p className="text-[9px] text-muted-foreground/30">{pct}%</p>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-border/30 overflow-hidden">
                    <div className="h-full rounded-full bg-foreground/70 transition-all duration-700"
                      style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* DEAL PIPELINE */}
      <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap size={13} className="text-amber-500" />
            <p className="text-xs font-bold">Deal Pipeline</p>
          </div>
          <Link to="/admin/deals">
            <button className="text-[11px] text-muted-foreground/40 hover:text-foreground transition-colors flex items-center gap-1">
              Manage <ChevronRight size={10} />
            </button>
          </Link>
        </div>
        {pipelineDeals.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground/40">No deals yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/20">
                  {["Deal", "Provider", "Stage", "Brands", "Confirmed", "Est. Savings", ""].map((h, i) => (
                    <th key={i} className="px-4 py-2.5 text-left text-[9px] uppercase tracking-[0.15em] text-muted-foreground/40 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/15">
                {pipelineDeals.map((d) => (
                  <tr key={d.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-xs font-semibold">{d.name}</p>
                      <p className="text-[10px] text-muted-foreground/40 capitalize">{d.category}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground/70">{d.provider}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${DEAL_STAGE_STYLE[d.stage]}`}>
                        {d.stage}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-bold tabular-nums">{d.total}</td>
                    <td className="px-4 py-3 text-xs font-bold tabular-nums text-green-600">{d.confirmed}</td>
                    <td className="px-4 py-3 text-xs font-black tabular-nums text-amber-600">€{(d.savings / 1000).toFixed(1)}K</td>
                    <td className="px-4 py-3">
                      <Link to="/admin/applications">
                        <button className="text-[10px] text-muted-foreground/40 hover:text-foreground transition-colors">
                          <ArrowUpRight size={12} />
                        </button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* PROVIDER PIPELINE + INTELLIGENCE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* PROVIDER PIPELINE */}
        <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border/30 flex items-center justify-between">
            <p className="text-xs font-bold">Provider Pipeline</p>
            <Link to="/admin/providers">
              <button className="text-[11px] text-muted-foreground/40 hover:text-foreground transition-colors">Manage →</button>
            </Link>
          </div>
          <div className="divide-y divide-border/20">
            {providerPipeline.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground/40">No providers yet</div>
            ) : providerPipeline.slice(0, 6).map((p) => (
              <div key={p.id} className="px-5 py-3.5 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground/40 capitalize">{p.category}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-[9px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                    p.api_status === "connected" ? "bg-green-500/10 text-green-600"
                    : p.api_status === "error" ? "bg-red-500/10 text-red-600"
                    : "bg-secondary text-muted-foreground/50"
                  }`}>
                    {p.api_status?.replace("_", " ") || "inactive"}
                  </span>
                  <span className="text-[10px] text-muted-foreground/40">{p.linked} deals</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* INTELLIGENCE SNAPSHOT */}
        <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border/30">
            <p className="text-xs font-bold">Intelligence Snapshot</p>
          </div>
          <div className="p-5 grid grid-cols-2 gap-5">
            <div>
              <p className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-3">Brands by Country</p>
              <div className="space-y-2">
                {topCountries.map(([country, count]) => (
                  <div key={country} className="flex items-center justify-between">
                    <p className="text-[11px] text-muted-foreground/70">{country}</p>
                    <p className="text-[11px] font-bold">{count}</p>
                  </div>
                ))}
                {topCountries.length === 0 && <p className="text-[11px] text-muted-foreground/30">No data</p>}
              </div>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-3">By Category</p>
              <div className="space-y-2">
                {topCategories.map(([cat, count]) => (
                  <div key={cat} className="flex items-center justify-between">
                    <p className="text-[11px] text-muted-foreground/70 capitalize">{cat}</p>
                    <p className="text-[11px] font-bold">{count}</p>
                  </div>
                ))}
                {topCategories.length === 0 && <p className="text-[11px] text-muted-foreground/30">No data</p>}
              </div>
            </div>
          </div>
          <div className="px-5 pb-5 pt-0 grid grid-cols-3 gap-3 border-t border-border/20 pt-4">
            <div>
              <p className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground/40 mb-1">Total Brands</p>
              <p className="text-lg font-black">{brands.length}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground/40 mb-1">Analyses</p>
              <p className="text-lg font-black">{results.length}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground/40 mb-1">Applications</p>
              <p className="text-lg font-black">{apps.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ACTIVITY FEED */}
      <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border/30">
          <p className="text-xs font-bold">Activity Feed</p>
        </div>
        <div className="divide-y divide-border/15">
          {activity.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground/40">No recent activity</div>
          ) : activity.map((a, i) => (
            <div key={i} className="px-5 py-3 flex items-center gap-4">
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                a.type === "activated" ? "bg-green-500"
                : a.type === "deal" ? "bg-blue-500"
                : a.type === "contract" ? "bg-amber-500"
                : "bg-border"
              }`} />
              <p className="text-xs text-muted-foreground/70 flex-1">{a.text}</p>
              <p className="text-[10px] text-muted-foreground/30 shrink-0">
                {a.date ? format(new Date(a.date), "dd MMM") : "—"}
              </p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}