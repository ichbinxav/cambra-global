import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, TrendingDown, Users, BookOpen, AlertTriangle, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import DealsOverview from "@/components/deals/DealsOverview.jsx";
import MetricCard from "@/components/dashboard/MetricCard";
import HeroSavings from "@/components/dashboard/HeroSavings";
import InfraScore from "@/components/dashboard/InfraScore";
import SavingsTrend from "@/components/dashboard/SavingsTrend";
import InfrastructureStatus from "@/components/dashboard/InfrastructureStatus";
import GMVMetrics from "@/components/dashboard/GMVMetrics";
import { CreditCard, Truck, Package } from "lucide-react";



export default function Dashboard() {
  const [results, setResults] = useState([]);
  const [brands, setBrands] = useState([]);
  const [user, setUser] = useState(null);
  const [userDeals, setUserDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState(null);

  // Initial load — fetch user once, then data
  useEffect(() => {
    const init = async () => {
      const u = await base44.auth.me();
      setUser(u);
      setUserEmail(u.email);

      const [r, b, uds] = await Promise.all([
        base44.entities.AnalyzerResult.filter({ created_by: u.email }, "-created_date", 10),
        base44.entities.Brand.filter({ created_by: u.email }),
        base44.entities.UserDeal.filter({ user_email: u.email }),
      ]);
      setResults(r);
      setBrands(b);
      setUserDeals(uds);
      setLoading(false);
    };

    init().catch(err => {
      console.error('Dashboard init error:', err);
      setLoading(false);
    });
  }, []);

  // Subscribe to real-time updates once we have the user email
  useEffect(() => {
    if (!userEmail) return;

    const refresh = async () => {
      const [r, uds] = await Promise.all([
        base44.entities.AnalyzerResult.list("-created_date", 10),
        base44.entities.UserDeal.filter({ user_email: userEmail }),
      ]);
      setResults(r);
      setUserDeals(uds);
    };

    const subs = [];
    try {
      const unsub1 = base44.entities.UserDeal.subscribe(() => refresh());
      const unsub2 = base44.entities.AnalyzerResult.subscribe(() => refresh());
      if (unsub1) subs.push(unsub1);
      if (unsub2) subs.push(unsub2);
    } catch (err) {
      console.warn('Subscription error:', err);
    }

    return () => subs.forEach(unsub => unsub?.());
  }, [userEmail]);

  const latest = results[0];
  const chartData = results.slice().reverse().map((r, i) => ({ i, value: r.total_savings || 0 }));
  const score = latest?.infra_score || 0;
  
  // GMV calculations from AnalyzerInput monthly_revenue
  const gmvTotal = results.reduce((sum, r) => {
    const monthlyRevenue = r.details?.monthly_revenue || 0;
    return sum + (monthlyRevenue * 12);
  }, 0);
  const gmvAverage = results.length > 0 ? gmvTotal / Math.max(results.length, 1) : 0;

  if (loading) return (
    <div className="flex items-center justify-center py-40">
      <div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4 pb-10">

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-[-0.03em]">
            {user?.full_name ? `${user.full_name.split(" ")[0]}.` : "Dashboard"}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Infrastructure command center</p>
        </div>
        <Link to="/Analyzer">
          <Button size="sm" className="h-9 rounded-full px-5 text-xs font-bold gap-1.5">
            New Analysis <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>

      {!latest ? (
        /* ── EMPTY STATE ── */
        <div className="space-y-3">
          {/* Accuracy banner */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-5 rounded-2xl border border-orange-500/20 bg-orange-500/[0.04]">
            <AlertTriangle size={16} className="text-orange-500 shrink-0 mt-0.5 sm:mt-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold">Using estimated data</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">Connect your tools or upload a statement to unlock precise insights and verified savings figures.</p>
            </div>
            <div className="flex gap-2 shrink-0 flex-wrap">
              <Link to="/ConnectTools">
                <button className="h-8 px-4 rounded-full bg-foreground text-background text-xs font-bold">Connect tools</button>
              </Link>
              <Link to="/ConnectTools">
                <button className="h-8 px-4 rounded-full border border-border/60 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">Upload data</button>
              </Link>
            </div>
          </div>

          <div className="text-center py-20 border border-dashed border-border/40 rounded-2xl bg-secondary/10">
            <div className="text-5xl mb-5 select-none opacity-10">✱</div>
            <h3 className="text-xl font-bold tracking-tight mb-2">No analysis yet</h3>
            <p className="text-sm text-muted-foreground mb-8 max-w-xs mx-auto">
              Run the 2-minute Analyzer to identify your infrastructure optimization potential.
            </p>
            <Link to="/Analyzer">
              <Button className="rounded-full px-8 text-sm font-bold gap-2">
                Run the Analyzer <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* ── ACCURACY BANNER ── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 rounded-xl border border-orange-500/20 bg-orange-500/[0.04]">
            <div className="flex items-center gap-2 flex-1">
              <div className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
              <p className="text-xs font-semibold text-orange-600">Using estimated data</p>
              <span className="text-xs text-muted-foreground/50 hidden sm:block">— Connect your tools to unlock precise insights</span>
            </div>
            <Link to="/ConnectTools">
              <button className="h-7 px-3 rounded-full border border-orange-500/30 text-[11px] font-semibold text-orange-600 hover:bg-orange-500/10 transition-colors flex items-center gap-1.5">
                <Zap size={10} /> Connect your data
              </button>
            </Link>
          </div>

          <HeroSavings latest={latest} score={score} />

          {/* ── SAVINGS OPPORTUNITIES & GMV ── */}
          <div className="grid grid-cols-3 gap-3">
            <MetricCard label="Payments" value={latest.payment_savings} icon={CreditCard} color="text-blue-600" border="border-blue-500/15" bg="bg-blue-500/[0.05]" note="payment efficiency" />
            <MetricCard label="Shipping" value={latest.shipping_savings} icon={Truck} color="text-green-600" border="border-green-500/15" bg="bg-green-500/[0.05]" note="shipping efficiency" />
            <MetricCard label="SaaS" value={latest.saas_savings} icon={Package} color="text-orange-500" border="border-orange-500/15" bg="bg-orange-500/[0.05]" note="stack efficiency" />
          </div>

          <GMVMetrics gmvTotal={gmvTotal} gmvAverage={gmvAverage} />

          {/* ── SCORE + DEALS ROW ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <InfraScore score={score} resultId={latest.id} />
            {chartData.length > 1 ? (
              <SavingsTrend chartData={chartData} />
            ) : (
              <DealsOverview userDeals={userDeals} />
            )}
          </div>

          {/* ── DEALS OVERVIEW (when chart is shown instead) ── */}
          {chartData.length > 1 && (
            <DealsOverview userDeals={userDeals} />
          )}

          <InfrastructureStatus latest={latest} />

          {/* ── QUICK ACTIONS ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { title: "Run new analysis", desc: "Update your score", path: "/Analyzer", icon: TrendingDown, accent: true },
              { title: "Browse network", desc: "1,000+ member brands", path: "/Network", icon: Users },
              { title: "Read insights", desc: "Infrastructure intelligence", path: "/Insights", icon: BookOpen },
            ].map((action, i) => (
              <Link key={i} to={action.path}>
                <div className={`group p-5 rounded-2xl border transition-all cursor-pointer ${action.accent ? "border-foreground/8 bg-foreground text-background" : "border-border/50 bg-card hover:border-border"}`}>
                  <action.icon size={14} className={`mb-3 ${action.accent ? "opacity-40" : "text-muted-foreground/40"}`} />
                  <p className={`font-semibold text-sm mb-0.5 ${action.accent ? "text-background" : ""}`}>{action.title}</p>
                  <p className={`text-xs ${action.accent ? "text-background/40" : "text-muted-foreground/60"}`}>{action.desc}</p>
                  <ArrowRight size={12} className={`mt-3 group-hover:translate-x-1 transition-transform ${action.accent ? "text-background/30" : "text-muted-foreground/25"}`} />
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}