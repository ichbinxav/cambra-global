import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, TrendingDown, Users, BookOpen, AlertTriangle, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import MetricCard from "@/components/dashboard/MetricCard";
import HeroSavings from "@/components/dashboard/HeroSavings";
import InfraScore from "@/components/dashboard/InfraScore";
import SavingsTrend from "@/components/dashboard/SavingsTrend";
import CumulativeSavingsChart from "@/components/dashboard/CumulativeSavingsChart";
import InfrastructureStatus from "@/components/dashboard/InfrastructureStatus";
import GMVMetrics from "@/components/dashboard/GMVMetrics";
import { CreditCard, Truck, Package, Store, ShieldCheck } from "lucide-react";
import RecommendationList from "@/components/recommendations/RecommendationList";
import DashboardSkeleton from "@/components/dashboard/DashboardSkeleton";
import LiveSystemHeader from "@/components/dashboard/LiveSystemHeader";
import DriftAlertStrip from "@/components/dashboard/DriftAlertStrip";
import IntelligenceWidget from "@/components/dashboard/IntelligenceWidget";



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
        base44.entities.AnalyzerResult.filter({ created_by: u.email }, "-created_date", 10),
        base44.entities.Brand.filter({ created_by: u.email }),
        base44.entities.PaymentsProfile.filter({ created_by: u.email }, "-created_date", 1),
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
      const [r, uds] = await Promise.all([
        base44.entities.AnalyzerResult.filter({ created_by: userEmail }, "-created_date", 10),
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
      <div className={`space-y-4 pb-10 px-6 ${!subscribed ? 'lock-blur' : ''}`}>

        {/* ── HEADER ── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-4">
          <div>
            <h1 className="text-2xl font-black tracking-[-0.03em]">
              {user?.full_name ? `${user.full_name.split(" ")[0]}.` : "Dashboard"}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">8 operational layers · Continuous monitoring</p>
          </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Link to="/Analyzer">
            <Button size="sm" className="h-10 rounded-full px-5 text-sm font-bold gap-1.5 bg-foreground text-background shadow-md hover:shadow-lg">
              New Analysis <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
          {!subscribed && (
            <Link to="/Onboarding">
              <Button size="sm" className="h-10 rounded-full px-5 text-sm font-bold gap-1.5 bg-saas-gradient text-white shadow-md hover:opacity-90">
                Unlock report — <span className="mx-1 line-through opacity-80">€60</span> <span className="font-semibold">Free</span>
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Economics strip */}
      <div className="mt-1">
        {econ && (
          <div>
            {/* lazy import avoided; small component inline to keep simple */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
              <div className="p-4 rounded-xl glass ring-1 ring-blue-500/10 hover:translate-y-0.5 transition-transform">
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-1">Identified savings</p>
                <p className="text-xl font-black tabular-nums text-chart-1">€{Math.round(econ.identified).toLocaleString()}/yr</p>
              </div>
              <div className="p-4 rounded-xl glass ring-1 ring-purple-500/10 hover:translate-y-0.5 transition-transform">
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-1">Activated savings</p>
                <p className="text-xl font-black tabular-nums text-chart-3">€{Math.round(econ.activated).toLocaleString()}/yr</p>
              </div>
              <div className="p-4 rounded-xl glass ring-1 ring-green-500/10 hover:translate-y-0.5 transition-transform">
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-1">Realized savings</p>
                <p className="text-xl font-black tabular-nums text-chart-2">€{Math.round(econ.realized).toLocaleString()}/yr</p>
              </div>
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

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <MetricCard label="Shipping" value={latest.shipping_savings} icon={Truck} color="text-chart-2" border="border-chart-2/20" bg="bg-green-500/[0.05]" note="shipping efficiency" />
            <MetricCard label="SaaS" value={latest.saas_savings} icon={Package} color="text-orange-500" border="border-orange-500/15" bg="bg-orange-500/[0.05]" note="stack efficiency" />
            <MetricCard label="Insurance" value={latest.details?.insurance_savings || 0} icon={ShieldCheck} color="text-chart-1" border="border-chart-1/20" bg="bg-blue-500/[0.05]" note={(latest.details?.insurance_status || "Not analyzed").toLowerCase()} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Banking & FX" value={latest.details?.banking_savings || 0} icon={CreditCard} color="text-amber-500" border="border-amber-500/20" bg="bg-amber-500/[0.05]" note="banking efficiency" />
            <MetricCard label="Telecom" value={latest.details?.telecom_savings || 0} icon={Package} color="text-cyan-500" border="border-cyan-500/20" bg="bg-cyan-500/[0.05]" note="connectivity costs" />
            <MetricCard label="Finance Ops" value={latest.details?.finance_ops_savings || 0} icon={Package} color="text-yellow-500" border="border-yellow-500/20" bg="bg-yellow-500/[0.05]" note="tooling efficiency" />
            <MetricCard label="HR Infra" value={latest.details?.hr_savings || 0} icon={Users} color="text-pink-500" border="border-pink-500/20" bg="bg-pink-500/[0.05]" note="benefits stack" />
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

          <InfrastructureStatus latest={latest} />

          {/* Recommendations */}
          <div className="rounded-2xl bg-card/50 border border-border/40 p-4 mt-3">
            <h3 className="text-sm font-semibold mb-2">Recommendations</h3>
            <RecommendationList />
          </div>

          {/* ── QUICK ACTIONS ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { title: "Run new analysis", desc: "Update your infra score", path: "/Analyzer", icon: TrendingDown, accent: true },
              { title: "Complete onboarding", desc: "Add banking, insurance & telecom data", path: "/Onboarding", icon: Zap },
              { title: "Connect your tools", desc: "Precision data across all verticals", path: "/ConnectTools", icon: ShieldCheck },
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
    </>
  );
}