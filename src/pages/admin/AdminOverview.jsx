import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { DEAL_STATUSES, STATUS_COLORS } from "@/lib/adminStatusConstants";
import { Link } from "react-router-dom";
import {
  Users, FileText, Zap, TrendingUp, DollarSign, ArrowRight,
  CheckCircle2, BarChart3, AlertTriangle, Clock, Activity,
  ChevronUp, ChevronDown, Minus, GitBranch, Building2, Star
} from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, BarChart, Bar, Cell } from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { formatSavings } from "@/lib/deals";

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, color = "text-foreground", trend, prefix = "", suffix = "" }) {
  return (
    <div className="p-4 rounded-xl border border-border/50 bg-card hover:border-border/80 transition-all">
      <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-2">{label}</p>
      <p className={`text-2xl font-black tabular-nums ${color}`}>{prefix}{typeof value === "number" ? value.toLocaleString() : value}{suffix}</p>
      {sub && <p className="text-[11px] text-muted-foreground/40 mt-1 flex items-center gap-1">{sub}</p>}
      {trend !== undefined && (
        <div className={`flex items-center gap-0.5 mt-1 text-[11px] font-semibold ${trend > 0 ? "text-green-600" : trend < 0 ? "text-red-500" : "text-muted-foreground/40"}`}>
          {trend > 0 ? <ChevronUp size={11} /> : trend < 0 ? <ChevronDown size={11} /> : <Minus size={11} />}
          {Math.abs(trend)}%
        </div>
      )}
    </div>
  );
}

// ─── Priority tag ─────────────────────────────────────────────────────────────
function PriorityTag({ savings }) {
  if (savings >= 10000) return <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-red-500/10 text-red-600 border border-red-500/20">HIGH</span>;
  if (savings >= 4000) return <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-orange-500/10 text-orange-500 border border-orange-500/20">MED</span>;
  return <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-secondary text-muted-foreground/50 border border-border/30">LOW</span>;
}

// ─── Feed Item ────────────────────────────────────────────────────────────────
function FeedItem({ app, brands }) {
  const brand = brands.find(b => b.created_by === app.user_email);
  const name = brand?.name || app.company_name || app.user_email?.split("@")[0];
  const timeAgo = (() => {
    const diff = Date.now() - new Date(app.created_date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  })();

  const statusLabel = {
    submitted: "Deal submitted",
    in_review: "In review",
    provider_contacted: "Provider contacted",
    offer_ready: "🔥 Offer ready",
    activated: "✅ Activated",
  }[app.status] || app.status;

  return (
    <div className="flex items-center gap-3 py-3 border-b border-border/20 last:border-0">
      <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
        <span className="text-[10px] font-black text-muted-foreground">{name?.charAt(0)?.toUpperCase()}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-xs font-bold truncate">{name}</p>
          <PriorityTag savings={app.estimated_savings || 0} />
        </div>
        <p className="text-[11px] text-muted-foreground/50 truncate">{statusLabel} · {app.deal_name}</p>
      </div>
      <div className="text-right shrink-0">
        {app.estimated_savings > 0 && <p className="text-xs font-black text-green-600">{formatSavings(app.estimated_savings)}</p>}
        <p className="text-[10px] text-muted-foreground/30">{timeAgo}</p>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AdminOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("30d");

  const loadAll = async () => {
    const [users, brands, userDeals, results, apps] = await Promise.all([
      base44.entities.User.list(),
      base44.entities.Brand.list(),
      base44.entities.UserDeal.list(),
      base44.entities.AnalyzerResult.list("-created_date", 500),
      base44.entities.DealApplication.list("-created_date", 500),
    ]);
    setData({ users, brands, userDeals, results, apps });
  };

  useEffect(() => {
    loadAll().catch(console.error).finally(() => setLoading(false));
    const subs = [];
    try {
      subs.push(base44.entities.DealApplication.subscribe(() => loadAll().catch(console.error)));
      subs.push(base44.entities.UserDeal.subscribe(() => loadAll().catch(console.error)));
      subs.push(base44.entities.AnalyzerResult.subscribe(() => loadAll().catch(console.error)));
    } catch (e) { console.warn("Subscription error:", e); }
    return () => subs.forEach(u => u?.());
  }, []);

  if (loading || !data) return (
    <div className="flex items-center justify-center py-40">
      <div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin" />
    </div>
  );

  const { users, brands, userDeals, results, apps } = data;

  // ── Time range ──────────────────────────────────────────────────────────────
  const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
  const since = new Date(Date.now() - days * 86400000);
  const prev = new Date(Date.now() - days * 2 * 86400000);

  const inRange = (d) => new Date(d.created_date) >= since;
  const inPrev = (d) => new Date(d.created_date) >= prev && new Date(d.created_date) < since;

  const trend = (curr, prevVal) => {
    if (!prevVal) return 0;
    return Math.round(((curr - prevVal) / prevVal) * 100);
  };

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const newUsers = users.filter(inRange).length;
  const prevUsers = users.filter(inPrev).length;

  const activatedApps = apps.filter(a => a.status === DEAL_STATUSES.ACTIVATED);
  const submittedApps = apps.filter(a => a.status === DEAL_STATUSES.SUBMITTED);
  const inProgressApps = apps.filter(a => [DEAL_STATUSES.IN_REVIEW, DEAL_STATUSES.PROVIDER_CONTACTED, DEAL_STATUSES.OFFER_READY].includes(a.status));
  const offerReadyApps = apps.filter(a => a.status === DEAL_STATUSES.OFFER_READY);

  const totalSavingsIdentified = results.reduce((s, r) => s + (r.total_savings || 0), 0);
  const totalSavingsActivated = activatedApps.reduce((s, a) => s + (a.estimated_savings || 0), 0);
  const estimatedRevenue = totalSavingsActivated * 0.15;
  const avgSavingsPerUser = users.length > 0 ? totalSavingsIdentified / users.length : 0;

  // ── Conversion ──────────────────────────────────────────────────────────────
  const convAnalysis = results.length > 0 ? Math.round((apps.length / results.length) * 100) : 0;
  const convActivation = apps.length > 0 ? Math.round((activatedApps.length / apps.length) * 100) : 0;

  // ── Pipeline by status ──────────────────────────────────────────────────────
  const pipelineStages = [
    { key: DEAL_STATUSES.SUBMITTED, label: "Submitted", color: "#3b82f6" },
    { key: DEAL_STATUSES.IN_REVIEW, label: "In Review", color: "#f97316" },
    { key: DEAL_STATUSES.PROVIDER_CONTACTED, label: "Provider Contacted", color: "#a855f7" },
    { key: DEAL_STATUSES.OFFER_READY, label: "Offer Ready", color: "#f59e0b" },
    { key: DEAL_STATUSES.ACTIVATED, label: "Activated", color: "#22c55e" },
  ];

  const pipelineData = pipelineStages.map(s => ({
    ...s,
    count: apps.filter(a => a.status === s.key).length,
    value: apps.filter(a => a.status === s.key).reduce((sum, a) => sum + (a.estimated_savings || 0), 0),
  }));

  // ── Weekly trend ────────────────────────────────────────────────────────────
  const weeklyData = Array.from({ length: 8 }, (_, i) => {
    const wStart = new Date(Date.now() - (7 - i + 1) * 7 * 86400000);
    const wEnd = new Date(Date.now() - (7 - i) * 7 * 86400000);
    const wApps = apps.filter(a => {
      const d = new Date(a.created_date);
      return d >= wStart && d < wEnd;
    });
    return {
      week: `W${i + 1}`,
      apps: wApps.length,
      savings: Math.round(wApps.reduce((s, a) => s + (a.estimated_savings || 0), 0) / 1000),
    };
  });

  // ── Live feed (last 20 apps) ─────────────────────────────────────────────
  const feedItems = [...apps].slice(0, 20);

  // ── Alerts ──────────────────────────────────────────────────────────────────
  const alerts = [];
  if (offerReadyApps.length > 0) alerts.push({ type: "urgent", msg: `${offerReadyApps.length} deal${offerReadyApps.length > 1 ? "s" : ""} with offer ready — needs activation` });

  const stuckApps = apps.filter(a => {
    const days = (Date.now() - new Date(a.created_date).getTime()) / 86400000;
    return days > 7 && [DEAL_STATUSES.IN_REVIEW, DEAL_STATUSES.PROVIDER_CONTACTED].includes(a.status);
  });
  if (stuckApps.length > 0) alerts.push({ type: "warn", msg: `${stuckApps.length} deal${stuckApps.length > 1 ? "s" : ""} stuck in pipeline > 7 days` });

  const highValueNew = apps.filter(a => inRange(a) && (a.estimated_savings || 0) >= 10000);
  if (highValueNew.length > 0) alerts.push({ type: "info", msg: `${highValueNew.length} high-value application${highValueNew.length > 1 ? "s" : ""} this period` });

  // ── Top brands by savings potential ──────────────────────────────────────
  const brandSavings = {};
  results.forEach(r => {
    const email = r.created_by;
    if (!brandSavings[email]) brandSavings[email] = 0;
    brandSavings[email] = Math.max(brandSavings[email], r.total_savings || 0);
  });
  const topBrands = Object.entries(brandSavings)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([email, savings]) => ({
      email,
      savings,
      brand: brands.find(b => b.created_by === email),
    }));

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-[-0.03em]">Command Center</h1>
          <p className="text-xs text-muted-foreground/50 mt-0.5">Real-time operations overview · THE NoDE</p>
        </div>
        <div className="flex gap-1 p-1 rounded-lg bg-secondary/60">
          {["7d", "30d", "90d"].map(r => (
            <button key={r} onClick={() => setTimeRange(r)}
              className={`px-3 h-7 rounded-md text-xs font-semibold transition-all ${timeRange === r ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* ── Alerts ── */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-xs font-semibold border ${
                a.type === "urgent" ? "bg-red-500/[0.06] border-red-500/20 text-red-600" :
                a.type === "warn" ? "bg-orange-500/[0.06] border-orange-500/20 text-orange-500" :
                "bg-blue-500/[0.06] border-blue-500/20 text-blue-600"
              }`}>
              <AlertTriangle size={13} />
              {a.msg}
            </motion.div>
          ))}
        </div>
      )}

      {/* ── KPI Grid ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard label="Total Users" value={users.length} sub={`+${newUsers} this period`} color="text-foreground" trend={trend(newUsers, prevUsers)} />
        <KPICard label="Analyses Run" value={results.length} sub="infrastructure scans" color="text-blue-600" />
        <KPICard label="Apps Submitted" value={apps.length} sub={`${submittedApps.length} awaiting review`} color="text-orange-500" />
        <KPICard label="Deals Activated" value={activatedApps.length} sub={`${convActivation}% conversion rate`} color="text-green-600" />
      </div>

      {/* ── Financial KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl border border-green-500/20 bg-green-500/[0.04] col-span-1">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-1">Savings Identified</p>
          <p className="text-xl font-black text-green-600">{formatSavings(totalSavingsIdentified)}</p>
          <p className="text-[11px] text-muted-foreground/40 mt-1">across all analyses</p>
        </div>
        <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/[0.04]">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-1">Savings Activated</p>
          <p className="text-xl font-black text-blue-600">{formatSavings(totalSavingsActivated)}</p>
          <p className="text-[11px] text-muted-foreground/40 mt-1">live contracts/yr</p>
        </div>
        <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.04]">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-1">Est. Revenue</p>
          <p className="text-xl font-black text-amber-600">{formatSavings(estimatedRevenue)}</p>
          <p className="text-[11px] text-muted-foreground/40 mt-1">15% take rate</p>
        </div>
        <div className="p-4 rounded-xl border border-purple-500/20 bg-purple-500/[0.04]">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-1">Avg / User</p>
          <p className="text-xl font-black text-purple-600">{formatSavings(avgSavingsPerUser)}</p>
          <p className="text-[11px] text-muted-foreground/40 mt-1">savings potential</p>
        </div>
      </div>

      {/* ── Conversion funnel ── */}
      <div className="p-5 rounded-xl border border-border/50 bg-card">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50">Conversion Funnel</p>
          <div className="flex gap-3 text-[11px]">
            <span className="text-muted-foreground/50">Analysis→Deal: <strong className="text-foreground">{convAnalysis}%</strong></span>
            <span className="text-muted-foreground/50">Deal→Activated: <strong className="text-foreground">{convActivation}%</strong></span>
          </div>
        </div>
        <div className="flex items-end gap-1 h-12">
          {[
            { label: "Users", val: users.length, color: "bg-foreground/20" },
            { label: "Analyses", val: results.length, color: "bg-blue-500/50" },
            { label: "Applied", val: apps.length, color: "bg-orange-500/60" },
            { label: "Active", val: activatedApps.length, color: "bg-green-500/70" },
          ].map((s, i) => {
            const maxVal = users.length || 1;
            const pct = Math.max((s.val / maxVal) * 100, 4);
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full relative" style={{ height: "40px" }}>
                  <div className={`absolute bottom-0 w-full rounded-t-sm ${s.color}`} style={{ height: `${pct}%` }} />
                </div>
                <p className="text-[9px] text-muted-foreground/40 text-center leading-tight">{s.label}<br /><strong className="text-foreground/70">{s.val}</strong></p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Main grid: pipeline + feed ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pipeline overview */}
        <div className="p-5 rounded-xl border border-border/50 bg-card">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50">Deal Pipeline</p>
            <Link to="/admin/pipeline" className="text-[11px] text-muted-foreground/50 hover:text-foreground flex items-center gap-1 transition-colors">
              Full pipeline <ArrowRight size={10} />
            </Link>
          </div>
          <div className="space-y-2.5">
            {pipelineData.map(stage => {
              const pct = apps.length > 0 ? (stage.count / apps.length) * 100 : 0;
              return (
                <div key={stage.key}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: stage.color }} />
                      <p className="text-xs font-medium">{stage.label}</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground/50">{formatSavings(stage.value)}</span>
                      <span className="font-bold w-5 text-right">{stage.count}</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-border/30 overflow-hidden">
                    <motion.div className="h-full rounded-full" style={{ background: stage.color }}
                      initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-border/30 grid grid-cols-3 gap-2 text-center">
            <Link to="/admin/pipeline" className="p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
              <p className="text-xs font-black text-orange-500">{inProgressApps.length}</p>
              <p className="text-[10px] text-muted-foreground/40">In Progress</p>
            </Link>
            <Link to="/admin/applications" className="p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
              <p className="text-xs font-black text-amber-500">{offerReadyApps.length}</p>
              <p className="text-[10px] text-muted-foreground/40">Offer Ready</p>
            </Link>
            <Link to="/admin/pipeline" className="p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
              <p className="text-xs font-black text-red-500">{stuckApps.length}</p>
              <p className="text-[10px] text-muted-foreground/40">Stuck {">"}7d</p>
            </Link>
          </div>
        </div>

        {/* Live activity feed */}
        <div className="p-5 rounded-xl border border-border/50 bg-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50">Live Activity</p>
            </div>
            <Link to="/admin/applications" className="text-[11px] text-muted-foreground/50 hover:text-foreground flex items-center gap-1 transition-colors">
              All <ArrowRight size={10} />
            </Link>
          </div>
          <div className="overflow-y-auto max-h-[280px]">
            {feedItems.length === 0 ? (
              <p className="text-xs text-muted-foreground/40 text-center py-8">No activity yet</p>
            ) : (
              feedItems.map(app => <FeedItem key={app.id} app={app} brands={brands} />)
            )}
          </div>
        </div>
      </div>

      {/* ── Weekly chart ── */}
      <div className="p-5 rounded-xl border border-border/50 bg-card">
        <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-4">Weekly Applications & Savings Pipeline</p>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={weeklyData} barGap={2}>
            <XAxis dataKey="week" stroke="hsl(var(--muted-foreground))" style={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 11 }}
              formatter={(v, name) => [name === "savings" ? `€${v}K` : v, name === "savings" ? "Savings" : "Apps"]} />
            <Bar dataKey="apps" fill="hsl(var(--border))" radius={[3, 3, 0, 0]} />
            <Bar dataKey="savings" fill="#22c55e" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Top opportunities + Quick nav ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top brands by savings potential */}
        <div className="p-5 rounded-xl border border-border/50 bg-card">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50">Top Opportunities</p>
            <Link to="/admin/users" className="text-[11px] text-muted-foreground/50 hover:text-foreground flex items-center gap-1 transition-colors">
              All users <ArrowRight size={10} />
            </Link>
          </div>
          <div className="space-y-2">
            {topBrands.length === 0 && <p className="text-xs text-muted-foreground/40 py-4 text-center">No data yet</p>}
            {topBrands.map(({ email, savings, brand }, i) => (
              <Link key={email} to="/admin/users" className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary/50 transition-colors">
                <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center shrink-0">
                  <span className="text-[9px] font-black">{i + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate">{brand?.name || email.split("@")[0]}</p>
                  <p className="text-[10px] text-muted-foreground/40 truncate">{email}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-green-600">{formatSavings(savings)}</p>
                  {savings >= 10000 && <Star size={9} className="text-amber-500 ml-auto" />}
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Quick navigation */}
        <div className="p-5 rounded-xl border border-border/50 bg-card">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-4">Operations</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Deal Pipeline", path: "/admin/pipeline", icon: GitBranch, count: apps.length, color: "text-blue-600" },
              { label: "Applications", path: "/admin/applications", icon: FileText, count: submittedApps.length, color: "text-orange-500" },
              { label: "Users", path: "/admin/users", icon: Users, count: users.length, color: "text-purple-600" },
              { label: "Providers", path: "/admin/providers", icon: Building2, color: "text-foreground" },
              { label: "Revenue", path: "/admin/revenue", icon: TrendingUp, color: "text-green-600" },
              { label: "Benchmarks", path: "/admin/benchmarks", icon: BarChart3, color: "text-amber-600" },
            ].map((item, i) => (
              <Link key={i} to={item.path}
                className="flex items-center gap-2.5 p-3 rounded-lg border border-border/40 hover:border-border hover:bg-secondary/30 transition-all group">
                <item.icon size={13} className={item.color} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{item.label}</p>
                  {item.count !== undefined && <p className="text-[10px] text-muted-foreground/40">{item.count} total</p>}
                </div>
                <ArrowRight size={10} className="text-muted-foreground/20 group-hover:text-muted-foreground/50 transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}