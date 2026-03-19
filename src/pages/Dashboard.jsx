import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, TrendingDown, BookOpen, AlertTriangle, Zap,
  CreditCard, Truck, Package, BarChart2, RefreshCw, ChevronRight,
  CheckCircle2, Clock, ArrowUpRight, Flame, Target, Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import DealsOverview from "@/components/deals/DealsOverview.jsx";
import InfraScore from "@/components/dashboard/InfraScore";
import SavingsTrend from "@/components/dashboard/SavingsTrend";

function KPICard({ label, value, sub, icon: Icon, color, bg, border, link }) {
  const inner = (
    <div className={`p-4 rounded-2xl border ${border} ${bg} flex flex-col gap-3 hover:scale-[1.02] transition-transform cursor-pointer`}>
      <div className="flex items-start justify-between">
        <Icon size={14} className={color} />
        {link && <ArrowUpRight size={11} className="text-muted-foreground/30" />}
      </div>
      <div>
        <p className={`text-2xl font-black tabular-nums ${color}`}>{value}</p>
        <p className="text-[10px] text-muted-foreground/50 mt-0.5 uppercase tracking-[0.1em]">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/35 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
  return link ? <Link to={link}>{inner}</Link> : inner;
}

function QuickAction({ label, desc, icon: Icon, to, accent }) {
  return (
    <Link to={to}>
      <div className={`group flex items-center gap-3.5 p-4 rounded-xl border transition-all ${
        accent
          ? "bg-foreground text-background border-foreground hover:bg-foreground/90"
          : "bg-card border-border/50 hover:border-border"
      }`}>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
          accent ? "bg-background/10" : "bg-secondary border border-border/40"
        }`}>
          <Icon size={15} className={accent ? "text-background/70" : "text-muted-foreground/50"} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-bold ${accent ? "text-background" : ""}`}>{label}</p>
          <p className={`text-[10px] ${accent ? "text-background/40" : "text-muted-foreground/50"}`}>{desc}</p>
        </div>
        <ArrowRight size={12} className={`shrink-0 group-hover:translate-x-1 transition-transform ${accent ? "text-background/30" : "text-muted-foreground/25"}`} />
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const [results, setResults] = useState([]);
  const [user, setUser] = useState(null);
  const [userDeals, setUserDeals] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    const [r, u] = await Promise.all([
      base44.entities.AnalyzerResult.list("-created_date", 10),
      base44.auth.me(),
    ]);
    setResults(r);
    setUser(u);
    const uds = await base44.entities.UserDeal.filter({ user_email: u.email });
    setUserDeals(uds);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const subs = [];
    try {
      const u1 = base44.entities.UserDeal.subscribe(() => loadData());
      const u2 = base44.entities.AnalyzerResult.subscribe(() => loadData());
      if (u1) subs.push(u1);
      if (u2) subs.push(u2);
    } catch {}
    return () => subs.forEach(u => u?.());
  }, []);

  const latest = results[0];
  const chartData = results.slice().reverse().map((r, i) => ({ i, value: r.total_savings || 0 }));
  const score = latest?.infra_score || 0;

  const activeDeals = userDeals.filter(d => d.status === "active");
  const pendingDeals = userDeals.filter(d => d.status === "pending");
  const totalSavings = activeDeals.reduce((s, d) => s + (d.estimated_savings || 0), 0);
  const expiringSoon = activeDeals.filter(d => {
    if (!d.end_date) return false;
    const days = (new Date(d.end_date) - new Date()) / (1000 * 60 * 60 * 24);
    return days > 0 && days <= 60;
  });

  const firstName = user?.full_name?.split(" ")[0] || "Dashboard";

  if (loading) return (
    <div className="flex items-center justify-center py-40">
      <div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5 pb-10">

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-[-0.03em]">{firstName}.</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Infrastructure command center</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setLoading(true); loadData(); }}
            className="h-8 w-8 rounded-lg border border-border/50 flex items-center justify-center text-muted-foreground/40 hover:text-foreground hover:border-border transition-all"
          >
            <RefreshCw size={13} />
          </button>
          <Link to="/Analyzer">
            <Button size="sm" className="h-8 rounded-full px-5 text-xs font-bold gap-1.5">
              New Analysis <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </div>

      {!latest ? (
        /* ── EMPTY STATE ── */
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-5 rounded-2xl border border-orange-500/20 bg-orange-500/[0.04]">
            <AlertTriangle size={16} className="text-orange-500 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold">Sin análisis todavía</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">Conecta tus herramientas o ejecuta el Analyzer para ver tus métricas reales.</p>
            </div>
            <Link to="/Analyzer">
              <button className="h-8 px-4 rounded-full bg-foreground text-background text-xs font-bold">Empezar</button>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { label: "Run the Analyzer", desc: "2 min · identify your potential", to: "/Analyzer", icon: BarChart2, accent: true },
              { label: "Browse deals", desc: "Unlock savings across your stack", to: "/Deals", icon: Zap },
              { label: "Connect your tools", desc: "Stripe, Shopify & more", to: "/ConnectTools", icon: Activity },
            ].map((a, i) => <QuickAction key={i} {...a} />)}
          </div>
        </div>
      ) : (
        <>
          {/* ── ACCURACY BANNER ── */}
          <div className="flex items-center gap-3 p-3.5 rounded-xl border border-orange-500/20 bg-orange-500/[0.04]">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
            <p className="text-xs font-semibold text-orange-600 flex-1">Estimated data — <span className="font-normal text-muted-foreground/60">connect your tools to unlock precise insights</span></p>
            <Link to="/ConnectTools">
              <button className="h-6 px-3 rounded-full border border-orange-500/30 text-[10px] font-semibold text-orange-600 hover:bg-orange-500/10 transition-colors flex items-center gap-1">
                <Zap size={9} /> Connect
              </button>
            </Link>
          </div>

          {/* ── KPI GRID ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPICard
              label="Potential savings"
              value={`€${((latest.total_savings || 0) / 1000).toFixed(0)}K/yr`}
              sub="across your stack"
              icon={Flame}
              color="text-amber-500"
              bg="bg-amber-500/[0.05]"
              border="border-amber-500/15"
              link="/Results"
            />
            <KPICard
              label="Infra score"
              value={`${score}/100`}
              sub={score >= 80 ? "Excellent" : score >= 60 ? "Good" : "Room to grow"}
              icon={Target}
              color={score >= 80 ? "text-green-600" : score >= 60 ? "text-blue-600" : "text-orange-500"}
              bg={score >= 80 ? "bg-green-500/[0.05]" : score >= 60 ? "bg-blue-500/[0.05]" : "bg-orange-500/[0.05]"}
              border={score >= 80 ? "border-green-500/15" : score >= 60 ? "border-blue-500/15" : "border-orange-500/15"}
              link="/Results"
            />
            <KPICard
              label="Active deals"
              value={activeDeals.length}
              sub={`€${(totalSavings / 1000).toFixed(0)}K/yr saved`}
              icon={CheckCircle2}
              color="text-green-600"
              bg="bg-green-500/[0.05]"
              border="border-green-500/15"
              link="/Deals"
            />
            <KPICard
              label="Pending"
              value={pendingDeals.length}
              sub="deals in progress"
              icon={Clock}
              color="text-blue-600"
              bg="bg-blue-500/[0.05]"
              border="border-blue-500/15"
              link="/Deals"
            />
          </div>

          {/* ── SAVINGS BREAKDOWN ── */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Payments", value: latest.payment_savings, icon: CreditCard, color: "text-blue-600", border: "border-blue-500/15", bg: "bg-blue-500/[0.05]" },
              { label: "Shipping", value: latest.shipping_savings, icon: Truck, color: "text-green-600", border: "border-green-500/15", bg: "bg-green-500/[0.05]" },
              { label: "SaaS", value: latest.saas_savings, icon: Package, color: "text-orange-500", border: "border-orange-500/15", bg: "bg-orange-500/[0.05]" },
            ].map((item, i) => (
              <Link key={i} to="/Results">
                <div className={`p-4 rounded-2xl border ${item.border} ${item.bg} hover:scale-[1.02] transition-transform cursor-pointer`}>
                  <item.icon size={13} className={`${item.color} mb-2`} />
                  <p className={`text-xl font-black tabular-nums ${item.color}`}>
                    €{((item.value || 0) / 1000).toFixed(0)}K
                  </p>
                  <p className="text-[10px] text-muted-foreground/50 uppercase tracking-[0.1em] mt-0.5">{item.label}</p>
                </div>
              </Link>
            ))}
          </div>

          {/* ── EXPIRY ALERT ── */}
          {expiringSoon.length > 0 && (
            <div className="flex items-center gap-3 p-4 rounded-xl border border-orange-500/20 bg-orange-500/[0.04]">
              <Clock size={13} className="text-orange-500 shrink-0" />
              <p className="text-xs text-orange-600 font-medium flex-1">
                {expiringSoon.length} deal{expiringSoon.length > 1 ? "s" : ""} expiring in the next 60 days
              </p>
              <Link to="/Deals">
                <button className="text-[10px] font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1">
                  Review <ChevronRight size={10} />
                </button>
              </Link>
            </div>
          )}

          {/* ── SCORE + CHART / DEALS ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <InfraScore score={score} resultId={latest.id} />
            {chartData.length > 1 ? (
              <SavingsTrend chartData={chartData} />
            ) : (
              <DealsOverview userDeals={userDeals} />
            )}
          </div>

          {chartData.length > 1 && <DealsOverview userDeals={userDeals} />}

          {/* ── QUICK ACTIONS ── */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40 mb-3">Quick actions</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { label: "Run new analysis", desc: "Update your infra score", to: "/Analyzer", icon: TrendingDown, accent: true },
                { label: "Browse deals", desc: "Unlock savings opportunities", to: "/Deals", icon: Zap },
                { label: "Connect tools", desc: "Stripe, Shopify, DHL & more", to: "/ConnectTools", icon: Activity },
                { label: "View full report", desc: "Detailed savings breakdown", to: "/Results", icon: BarChart2 },
                { label: "Read insights", desc: "Infrastructure intelligence", to: "/Insights", icon: BookOpen },
                { label: "History", desc: "Past analyses & trends", to: "/Reports", icon: ArrowUpRight },
              ].map((a, i) => <QuickAction key={i} {...a} />)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}