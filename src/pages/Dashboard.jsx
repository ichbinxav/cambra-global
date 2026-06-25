import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, TrendingDown, AlertTriangle, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import MetricCard from "@/components/dashboard/MetricCard";
import HeroSavings from "@/components/dashboard/HeroSavings";
import InfraScore from "@/components/dashboard/InfraScore";
import SavingsTrend from "@/components/dashboard/SavingsTrend";
import CumulativeSavingsChart from "@/components/dashboard/CumulativeSavingsChart";
import InfrastructureStatus from "@/components/dashboard/InfrastructureStatus";
import InfrastructureGraphPanel from "@/components/dashboard/InfrastructureGraphPanel";
import LastScanBar from "@/components/dashboard/LastScanBar";
import AIInsightsPanel from "@/components/dashboard/AIInsightsPanel";
import GMVMetrics from "@/components/dashboard/GMVMetrics";
import { CreditCard, Truck, Package, Store, ShieldCheck } from "lucide-react"; // ShieldCheck kept for quick actions only
import RecommendationList from "@/components/recommendations/RecommendationList";
import DashboardSkeleton from "@/components/dashboard/DashboardSkeleton";
import LiveSystemHeader from "@/components/dashboard/LiveSystemHeader";
import DriftAlertStrip from "@/components/dashboard/DriftAlertStrip";
import IntelligenceWidget from "@/components/dashboard/IntelligenceWidget";
import PageHero from "@/components/shared/PageHero";
import DriftMonitor from "@/components/dashboard/DriftMonitor";



export default function Dashboard() {
  const [results, setResults] = useState([]);
  const [brands, setBrands] = useState([]);
  const [paymentsProfiles, setPaymentsProfiles] = useState([]);
  const [user, setUser] = useState(null);
  const [userDeals, setUserDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [userEmail, setUserEmail] = useState(null);
  const [econ, setEcon] = useState({ identified: 0, activated: 0, realized: 0 });

  // Initial load — fetch user once, then data
  useEffect(() => {
    const init = async () => {
      const u = await base44.auth.me();
      setUser(u);
      setUserEmail(u.email);

      const [r, b, p, uds] = await Promise.all([
        base44.entities.AnalyzerResult.filter({ created_by_id: u.id }, "-created_date", 10),
        base44.entities.Brand.filter({ created_by_id: u.id }),
        base44.entities.PaymentsProfile.filter({ created_by_id: u.id }, "-created_date", 1),
        base44.entities.UserDeal.filter({ user_email: u.email }),
      ]);
      setResults(r);
      setBrands(b);
      setPaymentsProfiles(p);
      setUserDeals(uds);
      // After basics, if brand exists fetch economics
      if (b?.length) {
        try {
          const res = await base44.functions.invoke('getBrandSavings', { brandId: b[0].id });
          const d = res?.data || {};
          setEcon({
            identified: Number(d?.identified?.yearly || 0),
            activated: Number(d?.activated?.yearly || 0),
            realized: Number(d?.realized?.yearly || 0),
          });
        } catch (e) { console.warn('getBrandSavings failed', e?.message || e); }
      }
      setLoading(false);
    };

    init().catch(err => {
      console.error('Dashboard init error:', err);
      setLoading(false);
    });
  }, []);

  // Check subscription status (non-blocking)
  useEffect(() => {
    const check = async () => {
      try {
        const authed = await base44.auth.isAuthenticated();
        if (!authed) { setSubscribed(false); return; }
        const me = await base44.auth.me();
        const subs = await base44.entities.Subscription.filter({ user_email: me.email, status: 'active' }, '-created_date', 1);
        setSubscribed(subs.length > 0);
      } catch {}
    };
    check();
  }, []);

  // Subscribe to real-time updates once we have the user email
  useEffect(() => {
    if (!userEmail) return;

    const refresh = async () => {
      const me = await base44.auth.me();
      const [r, uds] = await Promise.all([
        base44.entities.AnalyzerResult.filter({ created_by_id: me.id }, "-created_date", 10),
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
  const latestPaymentsProfile = paymentsProfiles[0];
  const tpeEstimated = latest?.details?.tpe_savings || latestPaymentsProfile?.tpe_estimated_annual_savings || 0;
  const onlinePayments = Math.max(0, (latest?.payment_savings || 0) - tpeEstimated);
  const totalPaymentSavings = onlinePayments + tpeEstimated;
  const paymentCards = useMemo(() => ([
    { label: "Online Payments", value: onlinePayments, icon: CreditCard, color: "text-chart-1", border: "border-chart-1/20", bg: "bg-blue-500/[0.05]", note: "online PSP" },
    { label: "In-Store / TPE", value: tpeEstimated, icon: Store, color: "text-chart-3", border: "border-chart-3/20", bg: "bg-orange-500/[0.05]", note: "terminals & fees" },
    { label: "Total Payments", value: totalPaymentSavings, icon: CreditCard, color: "text-foreground", border: "border-border/40", bg: "bg-secondary/40", note: "combined savings" },
  ]), [onlinePayments, tpeEstimated, totalPaymentSavings]);

  const handleSubscribe = async () => {
    const authed = await base44.auth.isAuthenticated();
    if (!authed) { base44.auth.redirectToLogin(window.location.href); return; }
    const res = await base44.functions.invoke('startSubscription', {});
    const status = res?.data?.status;
    if (status === 'activated_free' || status === 'already_active') {
      setSubscribed(true);
      alert('Access activated — early partners free for life.');
    } else if (status === 'requires_checkout') {
      alert("Free seats are over. We'll enable the paid plan (€60/mo) soon.");
    } else if (res?.data?.error) {
      alert(res.data.error);
    }
  };
  const chartData = results.slice().reverse().map((r, i) => ({ i, value: r.total_savings || 0 }));
  const score = latest?.infra_score || 0;
  
  // GMV calculations from AnalyzerInput monthly_revenue
  const gmvTotal = results.reduce((sum, r) => {
    const monthlyRevenue = r.details?.annual_gmv ? r.details.annual_gmv / 12 : 0;
    return sum + (monthlyRevenue * 12);
  }, 0);
  const gmvAverage = results.length > 0 ? gmvTotal / Math.max(results.length, 1) : 0;

  if (loading) return (<DashboardSkeleton />);

  return (
    <>
      <LiveSystemHeader />
      <div className={`space-y-4 pb-10 ${!subscribed ? 'lock-blur' : ''}`}>

        {/* ── HERO HEADER — landing grade ── */}
        <PageHero
          eyebrow="Live · 3-pillar framework"
          title={`${user?.full_name ? user.full_name.split(" ")[0] : "Dashboard"}.`}
          subtitle="Continuous monitoring · Benchmarked against your peers in real-time."
          actions={
            <>
              <Link to="/Analyzer">
                <Button size="sm" className="h-10 rounded-full px-5 text-sm font-bold gap-1.5 bg-foreground text-background hover:opacity-90">
                  New Analysis <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
              {!subscribed && (
                <Link to="/Onboarding">
                  <Button size="sm" variant="outline" className="h-10 rounded-full px-5 text-sm font-bold gap-1.5 border-border">
                    Unlock — <span className="mx-1 line-through opacity-60">€60</span> Free
                  </Button>
                </Link>
              )}
            </>
          }
        />

      {/* Economics strip */}
      <div className="mt-1">
        {econ && (
          <div>
            {/* lazy import avoided; small component inline to keep simple */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              {[
                { label: "Identified savings", value: econ.identified, glow: "rgba(31,78,216,0.35)", ring: "ring-blue-500/15" },
                { label: "Activated savings", value: econ.activated, glow: "rgba(168,85,247,0.30)", ring: "ring-purple-500/15" },
                { label: "Realized savings", value: econ.realized, glow: "rgba(44,167,193,0.35)", ring: "ring-green-500/15" },
              ].map((s) => (
                <div key={s.label} className={`group relative p-5 rounded-2xl glass ring-1 ${s.ring} overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-16px_rgba(0,0,0,0.18)]`}>
                  <div className="pointer-events-none absolute -top-16 -right-16 w-44 h-44 rounded-full blur-3xl opacity-40 group-hover:opacity-70 transition-opacity"
                       style={{ background: `radial-gradient(closest-side, ${s.glow}, transparent)` }} />
                  <div className="relative">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 font-semibold mb-2">{s.label}</p>
                    <p className="text-2xl font-black tabular-nums tracking-tight gradient-text">
                      €{Math.round(s.value).toLocaleString()}<span className="text-muted-foreground/50 text-base font-bold">/yr</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {!latest ? (
        /* ── EMPTY STATE ── */
        <div className="space-y-3">
          {/* Accuracy banner */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-5 rounded-2xl border border-chart-3/20 bg-orange-500/[0.04]">
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
          <DriftAlertStrip />

          {/* ── ACCURACY BANNER ── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 rounded-xl border border-chart-3/20 bg-orange-500/[0.04]">
            <div className="flex items-center gap-2 flex-1">
              <div className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
              <p className="text-xs font-semibold text-chart-3">Using estimated data</p>
              <span className="text-xs text-muted-foreground/50 hidden sm:block">— Connect your tools to unlock precise insights</span>
            </div>
            <Link to="/ConnectTools">
              <button className="h-7 px-3 rounded-full border border-chart-3/30 text-[11px] font-semibold text-chart-3 hover:bg-chart-3/10 transition-colors flex items-center gap-1.5">
                <Zap size={10} /> Connect your data
              </button>
            </Link>
          </div>

          <HeroSavings latest={latest} score={score} />

          {/* ── SAVINGS OPPORTUNITIES & GMV ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {paymentCards.map((card) => (
              <MetricCard key={card.label} label={card.label} value={card.value} icon={card.icon} color={card.color} border={card.border} bg={card.bg} note={card.note} />
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <MetricCard label="Logistics" value={latest.shipping_savings} icon={Truck} color="text-chart-2" border="border-chart-2/20" bg="bg-green-500/[0.05]" note="carrier + 3PL efficiency" />
            <MetricCard label="Commerce SaaS" value={latest.saas_savings} icon={Package} color="text-orange-500" border="border-orange-500/15" bg="bg-orange-500/[0.05]" note="stack efficiency" />
          </div>

          <GMVMetrics gmvTotal={gmvTotal} gmvAverage={gmvAverage} />

          {/* ── CUMULATIVE SAVINGS — historical impact ── */}
          <CumulativeSavingsChart results={results} />

          {/* ── SCORE + INTELLIGENCE WIDGET ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <InfraScore score={score} resultId={latest.id} />
            {chartData.length > 1 ? (
              <SavingsTrend chartData={chartData} />
            ) : (
              <IntelligenceWidget />
            )}
          </div>

          {/* ── DRIFT MONITOR — multi-pillar degradation tracking ── */}
          <DriftMonitor results={results} />

          <InfrastructureStatus latest={latest} />

          {/* M7 — Last scan indicator + re-scan */}
          <LastScanBar />

          {/* M6 — Infrastructure Graph */}
          <InfrastructureGraphPanel />

          {/* M8 — AI Insights (last 3 agent runs) */}
          <AIInsightsPanel />

          {/* Recommendations */}
          <div className="relative rounded-2xl bg-card/95 backdrop-blur-sm border border-border/60 p-5 mt-3 overflow-hidden shadow-[0_8px_24px_-12px_rgba(0,0,0,0.08)]">
            <div className="pointer-events-none absolute -top-20 -right-20 w-52 h-52 rounded-full blur-3xl opacity-40" style={{ background: "radial-gradient(closest-side, rgba(31,78,216,0.18), transparent)" }} />
            <div className="relative">
              <h3 className="text-sm font-bold tracking-tight mb-3">Recommendations</h3>
              <RecommendationList />
            </div>
          </div>

          {/* ── QUICK ACTIONS ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { title: "Run new analysis", desc: "Update your infra score", path: "/Analyzer", icon: TrendingDown, accent: true },
              { title: "Complete onboarding", desc: "Map Payments, Logistics & Commerce SaaS", path: "/Onboarding", icon: Zap, glow: "rgba(168,85,247,0.25)" },
              { title: "Connect your tools", desc: "Precision data across all 3 pillars", path: "/ConnectTools", icon: ShieldCheck, glow: "rgba(44,167,193,0.25)" },
            ].map((action, i) => (
              <Link key={i} to={action.path}>
                <div className={`group relative p-5 rounded-2xl border transition-all cursor-pointer overflow-hidden ${action.accent ? "border-foreground/10 bg-foreground text-background shadow-[0_18px_40px_-20px_rgba(0,0,0,0.5)]" : "border-border/60 bg-card/95 backdrop-blur-sm hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-16px_rgba(0,0,0,0.12)]"}`}>
                  {action.accent ? (
                    <>
                      <div className="pointer-events-none absolute -top-16 -left-12 w-44 h-44 rounded-full blur-3xl opacity-60" style={{ background: "radial-gradient(closest-side, rgba(31,78,216,0.6), transparent)" }} />
                      <div className="pointer-events-none absolute -bottom-16 -right-12 w-40 h-40 rounded-full blur-3xl opacity-50" style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.55), transparent)" }} />
                    </>
                  ) : (
                    <div className="pointer-events-none absolute -top-16 -right-16 w-40 h-40 rounded-full blur-3xl opacity-0 group-hover:opacity-70 transition-opacity" style={{ background: `radial-gradient(closest-side, ${action.glow}, transparent)` }} />
                  )}
                  <div className="relative">
                    <action.icon size={14} className={`mb-3 ${action.accent ? "opacity-60" : "text-muted-foreground/50"}`} />
                    <p className={`font-bold text-sm mb-0.5 ${action.accent ? "text-background" : ""}`}>{action.title}</p>
                    <p className={`text-xs ${action.accent ? "text-background/50" : "text-muted-foreground/65"}`}>{action.desc}</p>
                    <ArrowRight size={12} className={`mt-3 group-hover:translate-x-1 transition-transform ${action.accent ? "text-background/40" : "text-muted-foreground/30"}`} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
      </div>
    </>
  );
}