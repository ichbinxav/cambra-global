import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Users, FileText, Zap, TrendingUp, DollarSign, ArrowUpRight, CheckCircle2, BarChart3 } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell } from "recharts";
import { motion } from "framer-motion";

export default function AdminOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [timeRange, setTimeRange] = useState("7d");

  const reloadData = async () => {
    try {
      const [users, brands, userDeals, results, apps] = await Promise.all([
        base44.entities.User.list(),
        base44.entities.Brand.list(),
        base44.entities.UserDeal.list(),
        base44.entities.AnalyzerResult.list("-created_date", 500),
        base44.entities.DealApplication.list(),
      ]);
      setData({ users, brands, userDeals, results, apps });
    } catch (err) {
      console.error('Error reloading admin data:', err);
    }
  };

  useEffect(() => {
    reloadData().then(() => setLoading(false));

    // Suscribirse a cambios en tiempo real
    const subs = [];
    try {
      const unsub1 = base44.entities.UserDeal.subscribe(() => reloadData());
      const unsub2 = base44.entities.AnalyzerResult.subscribe(() => reloadData());
      const unsub3 = base44.entities.DealApplication.subscribe(() => reloadData());
      if (unsub1) subs.push(unsub1);
      if (unsub2) subs.push(unsub2);
      if (unsub3) subs.push(unsub3);
    } catch (err) {
      console.warn('Subscription error:', err);
    }

    return () => {
      subs.forEach(unsub => unsub?.());
    };
  }, []);

  if (loading || !data) return <div className="flex items-center justify-center py-40"><div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin" /></div>;

  const { users, brands, userDeals, results, apps } = data;
  
  // Time range filtering
  const now = new Date();
  const getDaysAgo = (days) => new Date(now - days * 24 * 60 * 60 * 1000);
  const timeRangeMap = { "7d": 7, "30d": 30, "90d": 90 };
  const daysBack = timeRangeMap[timeRange];
  const rangeStart = getDaysAgo(daysBack);

  const activeDeals = userDeals.filter(d => d.status === "active");
  const waitlistDeals = userDeals.filter(d => d.status === "waitlist" || d.status === "pending" || d.status === "submitted");
  const totalSavingsIdentified = results.reduce((s, r) => s + (r.total_savings || 0), 0);
  const totalSavingsActivated = activeDeals.reduce((s, d) => s + (d.estimated_savings || 0), 0);
  const estimatedRevenue = Math.round(totalSavingsActivated * 0.15);
  const conversionRate = userDeals.length > 0 ? Math.round((activeDeals.length / userDeals.length) * 100) : 0;

  // Filtered by time range
  const newUsersRange = users.filter(u => new Date(u.created_date) >= rangeStart).length;
  const newDealsRange = userDeals.filter(d => new Date(d.created_date) >= rangeStart).length;
  const newAppsRange = apps.filter(a => new Date(a.created_date) >= rangeStart).length;

  // Top deals
  const dealCount = {};
  userDeals.forEach(d => { dealCount[d.deal_name] = (dealCount[d.deal_name] || 0) + 1; });
  const topDeals = Object.entries(dealCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Chart: savings per week
  const weeklyData = [];
  for (let i = (daysBack > 30 ? 12 : daysBack > 7 ? 4 : 1); i >= 0; i--) {
    const start = new Date(now - (i + 1) * 7 * 24 * 60 * 60 * 1000);
    const end = new Date(now - i * 7 * 24 * 60 * 60 * 1000);
    const weekSavings = results
      .filter(r => new Date(r.created_date) >= start && new Date(r.created_date) < end)
      .reduce((s, r) => s + (r.total_savings || 0), 0);
    weeklyData.push({ week: `W${12 - i}`, savings: Math.round(weekSavings / 1000) });
  }

  // Savings by category
  const savingsByCategory = {};
  results.forEach(r => {
    savingsByCategory["Payments"] = (savingsByCategory["Payments"] || 0) + (r.payment_savings || 0);
    savingsByCategory["Shipping"] = (savingsByCategory["Shipping"] || 0) + (r.shipping_savings || 0);
    savingsByCategory["SaaS"] = (savingsByCategory["SaaS"] || 0) + (r.saas_savings || 0);
  });
  const categoryData = Object.entries(savingsByCategory).map(([name, value]) => ({ name, value: Math.round(value / 1000) }));
  const COLORS = ["#3b82f6", "#22c55e", "#f97316"];

  // Applications by status
  const appsByStatus = {};
  apps.forEach(a => { appsByStatus[a.status] = (appsByStatus[a.status] || 0) + 1; });

  return (
    <div className="space-y-6">
      {/* Header with tabs */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-[-0.03em]">Command Center</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Real-time operational overview</p>
        </div>
        <div className="flex gap-1 p-1 rounded-xl bg-secondary/60">
          {["overview", "analytics", "deals"].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 h-8 rounded-lg text-xs font-semibold transition-all ${
                activeTab === tab ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Time range selector */}
      <div className="flex gap-2">
        {["7d", "30d", "90d"].map(range => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={`px-3 h-8 rounded-lg text-xs font-medium transition-all ${
              timeRange === range ? "bg-foreground text-background" : "bg-secondary/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {range === "7d" ? "Last 7 days" : range === "30d" ? "Last 30 days" : "Last 90 days"}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === "overview" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {/* Top metric cards */}
          <div className="grid grid-cols-2 gap-3">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="p-4 rounded-xl border border-border/50 bg-card">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50">Deals Applied</p>
                <FileText size={12} className="text-orange-500" />
              </div>
              <p className={`text-3xl font-black tabular-nums text-orange-500`}>{userDeals.length}</p>
              <p className="text-[11px] text-muted-foreground/40 mt-1">+{newDealsRange}</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="p-4 rounded-xl border border-border/50 bg-card">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50">Deals Activated</p>
                <CheckCircle2 size={12} className="text-green-600" />
              </div>
              <p className={`text-3xl font-black tabular-nums text-green-600`}>{activeDeals.length}</p>
              <p className="text-[11px] text-muted-foreground/40 mt-1">0% rate</p>
            </motion.div>
          </div>

          {/* Key metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Users", value: users.length, sub: `+${newUsersRange}`, icon: Users, color: "text-blue-600" },
              { label: "Active Companies", value: brands.length, sub: "Growing", icon: Users, color: "text-purple-600" },
              { label: "Deals Applied", value: userDeals.length, sub: `+${newDealsRange}`, icon: FileText, color: "text-orange-500" },
              { label: "Deals Activated", value: activeDeals.length, sub: `${conversionRate}% rate`, icon: CheckCircle2, color: "text-green-600" },
            ].map((kpi, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="p-4 rounded-xl border border-border/50 bg-card hover:border-border/80 transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50">{kpi.label}</p>
                  <kpi.icon size={12} className={kpi.color} />
                </div>
                <p className={`text-3xl font-black tabular-nums ${kpi.color}`}>{kpi.value}</p>
                <p className="text-[11px] text-muted-foreground/40 mt-1">{kpi.sub}</p>
              </motion.div>
            ))}
          </div>

          {/* Savings metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="p-5 rounded-xl border border-green-500/20 bg-green-500/[0.05]">
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-2">Savings Identified</p>
              <p className="text-3xl font-black text-green-600">€{(totalSavingsIdentified / 1000).toFixed(0)}K</p>
              <p className="text-[11px] text-muted-foreground/40 mt-2">across all analyses</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="p-5 rounded-xl border border-blue-500/20 bg-blue-500/[0.05]">
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-2">Savings Activated</p>
              <p className="text-3xl font-black text-blue-600">€{(totalSavingsActivated / 1000).toFixed(1)}K</p>
              <p className="text-[11px] text-muted-foreground/40 mt-2">live contracts/yr</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="p-5 rounded-xl border border-amber-500/20 bg-amber-500/[0.05]">
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-2">Est. Revenue</p>
              <p className="text-3xl font-black text-amber-600">€{(estimatedRevenue / 1000).toFixed(1)}K</p>
              <p className="text-[11px] text-muted-foreground/40 mt-2">15% of activated</p>
            </motion.div>
          </div>

          {/* Status breakdown */}
          <div className="p-5 rounded-xl border border-border/50 bg-card">
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-4">Applications Pipeline</p>
            <div className="space-y-3">
              {[
                { key: "submitted", label: "Submitted", color: "bg-blue-500" },
                { key: "in_review", label: "In Review", color: "bg-orange-500" },
                { key: "provider_contacted", label: "Provider Contacted", color: "bg-purple-500" },
                { key: "offer_ready", label: "Offer Ready", color: "bg-amber-500" },
                { key: "activated", label: "Activated", color: "bg-green-500" },
              ].map(s => {
                const count = appsByStatus[s.key] || 0;
                const total = apps.length || 1;
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={s.key}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
                      <p className="text-xs font-bold">{count} ({pct}%)</p>
                    </div>
                    <div className="h-2 rounded-full bg-border/40 overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${s.color}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* ANALYTICS TAB */}
      {activeTab === "analytics" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Weekly savings chart */}
            <div className="p-5 rounded-xl border border-border/50 bg-card">
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-4">Weekly Trend</p>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={weeklyData}>
                  <defs>
                    <linearGradient id="sg3" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="week" stroke="hsl(var(--muted-foreground))" style={{ fontSize: 11 }} />
                  <YAxis stroke="hsl(var(--muted-foreground))" style={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 11 }} formatter={v => `€${v}K`} />
                  <Area type="monotone" dataKey="savings" stroke="#22c55e" strokeWidth={2} fill="url(#sg3)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Savings by category pie chart */}
            <div className="p-5 rounded-xl border border-border/50 bg-card">
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-4">Savings by Category</p>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} dataKey="value" label>
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={v => `€${v}K`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-4 justify-center text-xs">
                {categoryData.map((cat, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i] }} />
                    <span className="text-muted-foreground">{cat.name} €{cat.value}K</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Conversion funnel */}
          <div className="p-5 rounded-xl border border-border/50 bg-card">
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-4">User Journey</p>
            <div className="space-y-3">
              {[
                { label: "Sign ups", val: users.length, pct: 100 },
                { label: "Analyzed infrastructure", val: results.length, pct: (results.length / users.length) * 100 },
                { label: "Applied for deals", val: userDeals.length, pct: (userDeals.length / users.length) * 100 },
                { label: "Activated deals", val: activeDeals.length, pct: (activeDeals.length / users.length) * 100 },
              ].map((row, i) => (
                <div key={i}>
                  <div className="flex justify-between mb-1">
                    <p className="text-xs font-medium text-muted-foreground">{row.label}</p>
                    <p className="text-xs font-bold">{row.val} ({Math.round(row.pct)}%)</p>
                  </div>
                  <div className="h-2 rounded-full bg-border/40 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-blue-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${row.pct}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* DEALS TAB */}
      {activeTab === "deals" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top deals */}
            <div className="p-5 rounded-xl border border-border/50 bg-card">
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-4">Top Performing Deals</p>
              <div className="space-y-3">
                {topDeals.map((deal, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-secondary/40 border border-border/20">
                    <div>
                      <p className="text-sm font-semibold">{deal[0]}</p>
                      <p className="text-[11px] text-muted-foreground/50">{deal[1]} applications</p>
                    </div>
                    <p className="text-lg font-black text-green-600">{deal[1]}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Deal status */}
            <div className="p-5 rounded-xl border border-border/50 bg-card">
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-4">Deal Status</p>
              <div className="space-y-3">
                {[
                  { label: "Active", val: activeDeals.length, color: "text-green-600" },
                  { label: "Waitlist", val: waitlistDeals.length, color: "text-blue-600" },
                  { label: "Pending", val: newAppsRange, color: "text-orange-500" },
                ].map((row, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-secondary/40 border border-border/20">
                    <p className="text-sm font-medium text-muted-foreground">{row.label}</p>
                    <p className={`text-xl font-black tabular-nums ${row.color}`}>{row.val}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick links */}
          <div className="p-5 rounded-xl border border-border/50 bg-card">
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-4">Manage Deals</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { label: "View Pipeline", path: "/admin/pipeline", icon: BarChart3 },
                { label: "Applications", path: "/admin/applications", icon: FileText },
                { label: "Providers", path: "/admin/providers", icon: Users },
                { label: "Benchmarks", path: "/admin/benchmarks", icon: TrendingUp },
              ].map((action, i) => (
                <Link
                  key={i}
                  to={action.path}
                  className="p-4 rounded-lg border border-border/50 hover:border-border text-center transition-all group"
                >
                  <action.icon size={16} className="mx-auto mb-2 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <p className="text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors">{action.label}</p>
                </Link>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}