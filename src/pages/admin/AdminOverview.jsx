import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Users, FileText, Zap, TrendingUp, DollarSign, ArrowUpRight, CheckCircle2, Clock } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from "recharts";
import { DEALS } from "@/lib/deals.js";

export default function AdminOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.User.list(),
      base44.entities.Brand.list(),
      base44.entities.UserDeal.list(),
      base44.entities.AnalyzerResult.list("-created_date", 200),
      base44.entities.DealApplication.list(),
    ]).then(([users, brands, userDeals, results, apps]) => {
      setData({ users, brands, userDeals, results, apps });
      setLoading(false);
    }).catch(err => {
      console.error('Error loading admin data:', err);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex items-center justify-center py-40"><div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin" /></div>;

  const { users, brands, userDeals, results, apps } = data;

  const activeDeals = userDeals.filter(d => d.status === "active");
  const waitlistDeals = userDeals.filter(d => d.status === "waitlist" || d.status === "pending");
  const totalSavingsIdentified = results.reduce((s, r) => s + (r.total_savings || 0), 0);
  const totalSavingsActivated = activeDeals.reduce((s, d) => s + (d.estimated_savings || 0), 0);

  // Revenue model: 15% of activated savings (estimated)
  const estimatedRevenue = Math.round(totalSavingsActivated * 0.15);

  // Conversion rate
  const conversionRate = userDeals.length > 0 ? Math.round((activeDeals.length / userDeals.length) * 100) : 0;

  // Last 7 days
  const now = new Date();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const newUsers7d = users.filter(u => new Date(u.created_date) >= sevenDaysAgo).length;
  const newUsers30d = users.filter(u => new Date(u.created_date) >= thirtyDaysAgo).length;
  const newDeals7d = userDeals.filter(d => new Date(d.created_date) >= sevenDaysAgo).length;

  // Top deal
  const dealCount = {};
  userDeals.forEach(d => { dealCount[d.deal_name] = (dealCount[d.deal_name] || 0) + 1; });
  const topDeal = Object.entries(dealCount).sort((a, b) => b[1] - a[1])[0];

  // Chart: savings per week (last 8 weeks)
  const weeklyData = [];
  for (let i = 7; i >= 0; i--) {
    const start = new Date(now - (i + 1) * 7 * 24 * 60 * 60 * 1000);
    const end = new Date(now - i * 7 * 24 * 60 * 60 * 1000);
    const weekSavings = results
      .filter(r => new Date(r.created_date) >= start && new Date(r.created_date) < end)
      .reduce((s, r) => s + (r.total_savings || 0), 0);
    weeklyData.push({ week: `W${8 - i}`, savings: Math.round(weekSavings) });
  }

  // Applications by status
  const appsByStatus = {};
  apps.forEach(a => { appsByStatus[a.status] = (appsByStatus[a.status] || 0) + 1; });

  const KPIs = [
    { label: "Total Users", value: users.length, sub: `+${newUsers7d} this week`, icon: Users, color: "text-blue-600" },
    { label: "Active Companies", value: brands.length, sub: `+${newUsers30d} this month`, icon: Users, color: "text-purple-600" },
    { label: "Deal Applications", value: userDeals.length, sub: `+${newDeals7d} this week`, icon: FileText, color: "text-orange-500" },
    { label: "Deals Activated", value: activeDeals.length, sub: `${conversionRate}% conversion`, icon: CheckCircle2, color: "text-green-600" },
    { label: "Savings Identified", value: `€${(totalSavingsIdentified / 1000).toFixed(0)}K`, sub: "across all analyses", icon: TrendingUp, color: "text-foreground" },
    { label: "Savings Activated", value: `€${(totalSavingsActivated / 1000).toFixed(1)}K/yr`, sub: "live contracts", icon: Zap, color: "text-green-600" },
    { label: "Est. THE NoDE Revenue", value: `€${(estimatedRevenue / 1000).toFixed(1)}K/yr`, sub: "15% of activated savings", icon: DollarSign, color: "text-amber-600" },
    { label: "On Waitlist", value: waitlistDeals.length, sub: "access list signups", icon: Clock, color: "text-blue-500" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-[-0.03em]">Command Center</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Real-time operational overview · THE NoDE</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {KPIs.map((kpi, i) => (
          <div key={i} className="p-4 rounded-xl border border-border/50 bg-card">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50">{kpi.label}</p>
              <kpi.icon size={12} className={kpi.color} />
            </div>
            <p className={`text-2xl font-black tabular-nums ${kpi.color}`}>{kpi.value}</p>
            <p className="text-[11px] text-muted-foreground/40 mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Weekly savings trend */}
        <div className="p-5 rounded-xl border border-border/50 bg-card">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-4">Savings identified — weekly</p>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={weeklyData}>
              <defs>
                <linearGradient id="sg2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 11 }}
                formatter={v => [`€${v?.toLocaleString()}`, "Savings"]} />
              <Area type="monotone" dataKey="savings" stroke="#22c55e" strokeWidth={2} fill="url(#sg2)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Applications by status */}
        <div className="p-5 rounded-xl border border-border/50 bg-card">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">Applications by status</p>
            <Link to="/admin/applications" className="text-[11px] text-muted-foreground/50 hover:text-foreground flex items-center gap-1">
              View all <ArrowUpRight size={10} />
            </Link>
          </div>
          <div className="space-y-2">
            {[
              { key: "submitted", label: "Submitted", color: "bg-blue-500" },
              { key: "in_review", label: "In Review", color: "bg-orange-500" },
              { key: "provider_contacted", label: "Provider Contacted", color: "bg-purple-500" },
              { key: "offer_ready", label: "Offer Ready", color: "bg-amber-500" },
              { key: "activated", label: "Activated", color: "bg-green-500" },
            ].map(s => {
              const count = appsByStatus[s.key] || 0;
              const total = apps.length || 1;
              return (
                <div key={s.key} className="flex items-center gap-3">
                  <p className="text-[11px] w-28 text-muted-foreground/60 shrink-0">{s.label}</p>
                  <div className="flex-1 h-1.5 rounded-full bg-border/40 overflow-hidden">
                    <div className={`h-full rounded-full ${s.color}`} style={{ width: `${(count / total) * 100}%` }} />
                  </div>
                  <p className="text-[11px] font-bold w-6 text-right">{count}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Top performing deal */}
        <div className="p-5 rounded-xl border border-border/50 bg-card">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-3">Top Deal</p>
          {topDeal ? (
            <>
              <p className="font-bold text-sm">{topDeal[0]}</p>
              <p className="text-2xl font-black text-green-600 mt-1">{topDeal[1]}</p>
              <p className="text-[11px] text-muted-foreground/40">applications</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No data yet</p>
          )}
        </div>

        {/* Conversion funnel */}
        <div className="p-5 rounded-xl border border-border/50 bg-card">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-3">Conversion Funnel</p>
          <div className="space-y-2">
            {[
              { label: "Signups", val: users.length },
              { label: "Analyzed", val: results.length },
              { label: "Applied", val: userDeals.length },
              { label: "Activated", val: activeDeals.length },
            ].map((row, i) => (
              <div key={i} className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground/60">{row.label}</p>
                <p className="text-sm font-bold tabular-nums">{row.val}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div className="p-5 rounded-xl border border-border/50 bg-card">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-3">Quick Actions</p>
          <div className="space-y-2">
            {[
              { label: "View pipeline", path: "/admin/pipeline" },
              { label: "Manage applications", path: "/admin/applications" },
              { label: "Add provider", path: "/admin/providers" },
              { label: "Update benchmarks", path: "/admin/benchmarks" },
            ].map((a, i) => (
              <Link key={i} to={a.path} className="flex items-center justify-between py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors">
                {a.label} <ArrowUpRight size={11} />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}