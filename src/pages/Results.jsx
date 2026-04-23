import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowRight, CreditCard, Truck, Package, TrendingDown, Zap,
  Shield, AlertTriangle, CheckCircle2, ChevronRight, Lock
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import AnimatedCounter from "@/components/shared/AnimatedCounter";
import ScoreCard from "@/components/results/ScoreCard";
import IntelligencePanel from "@/components/results/IntelligencePanel";

import { computeInfraScore } from "@/lib/scoreEngine";
import NormalizedBarChart from "@/components/charts/NormalizedBarChart";
import { Download } from "lucide-react";
import { jsPDF } from "jspdf";

/* ── static data ─────────────────────────────────────────────── */
const BREAKDOWN_META = [
  { key: "payment_savings", label: "Payments", icon: CreditCard, color: "#3b82f6", bg: "bg-blue-500/[0.06] border-blue-500/15", textColor: "text-blue-600",
    detail: r => r.details?.payment_current_rate
      ? `${r.details.payment_current_rate.toFixed(1)}% current → ${r.details.payment_optimal_rate?.toFixed(1) ?? "1.4"}% network target`
      : "Efficiency improvement available" },
  { key: "shipping_savings", label: "Shipping", icon: Truck, color: "#22c55e", bg: "bg-green-500/[0.06] border-green-500/15", textColor: "text-green-600",
    detail: r => r.details?.shipping_current_avg
      ? `€${r.details.shipping_current_avg.toFixed(2)}/shipment → €${r.details.shipping_optimal_avg?.toFixed(2) ?? "5.20"} collective rate`
      : "Volume-based cost reduction available" },
  { key: "saas_savings", label: "SaaS & Tools", icon: Package, color: "#f97316", bg: "bg-orange-500/[0.06] border-orange-500/15", textColor: "text-orange-500",
    detail: r => r.details?.saas_current_total
      ? `€${r.details.saas_current_total.toLocaleString()}/mo current → €${r.details.saas_optimal_total?.toLocaleString() ?? "—"} via group licenses`
      : "Stack consolidation efficiency available" },
];

const DEALS = [
  { title: "Network payment rate", desc: "1.4% effective fee — pre-negotiated at collective volume", saving: "Up to −52%", cat: "Payments", textColor: "text-blue-600", bg: "bg-blue-500/[0.05] border-blue-500/15" },
  { title: "Collective shipping contracts", desc: "Enterprise carrier rates without enterprise volume", saving: "−18% avg.", cat: "Shipping", textColor: "text-green-600", bg: "bg-green-500/[0.05] border-green-500/15" },
  { title: "SaaS group licenses", desc: "Shared contracts on Klaviyo, Gorgias, Shopify and more", saving: "Up to −30%", cat: "SaaS", textColor: "text-orange-500", bg: "bg-orange-500/[0.05] border-orange-500/15" },
];

const RECS = [
  { cat: "Payments", action: "Switch to network payment rate", saving: "Recover €X/yr", icon: CreditCard, points: 12 },
  { cat: "Shipping", action: "Access collective shipping contracts", saving: "−18% average cost", icon: Truck, points: 8 },
  { cat: "SaaS", action: "Consolidate tools via group licenses", saving: "Save up to 30%", icon: Package, points: 7 },
];

/* ── sub-components ──────────────────────────────────────────── */
function SectionLabel({ children }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="w-5 h-px bg-border" />
      <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/45 font-medium">{children}</p>
    </div>
  );
}

function AccuracyBadge({ isEstimated }) {
  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold ${
      isEstimated ? "bg-orange-500/[0.07] border-orange-500/20 text-orange-600" : "bg-green-500/[0.07] border-green-500/20 text-green-600"
    }`}>
      <div className={`w-1.5 h-1.5 rounded-full ${isEstimated ? "bg-orange-400" : "bg-green-500"}`} />
      {isEstimated ? "Estimated analysis" : "Real data connected"}
    </div>
  );
}

/* ── main ────────────────────────────────────────────────────── */
export default function Results() {
  const [result, setResult] = useState(null);
  const [input, setInput] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scoreReport, setScoreReport] = useState(null);
  const [subscribed, setSubscribed] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [intelligence, setIntelligence] = useState(null);

  useEffect(() => {
    (async () => {
      const id = new URLSearchParams(window.location.search).get("id");
      const authed = await base44.auth.isAuthenticated();
      if (!authed) { setNeedsAuth(true); setLoading(false); return; }
      if (!id) { setLoading(false); return; }
      const me = await base44.auth.me();
      const res = await base44.entities.AnalyzerResult.filter({ id });
      if (!res.length || res[0].created_by !== me.email) { setLoading(false); setResult(null); return; }
      const r = res[0];
      setResult(r);
      if (r.input_id) {
        const inputs = await base44.entities.AnalyzerInput.filter({ id: r.input_id });
        if (inputs.length) {
          setInput(inputs[0]);
          setScoreReport(computeInfraScore(inputs[0], "manual"));
          const intel = await base44.functions.invoke('computeIntelligenceForBrand', { resultId: id });
          setIntelligence(intel.data?.intelligence || null);
        }
      }
      setLoading(false);
    })();

    // Check subscription status (non-blocking)
    base44.auth.isAuthenticated().then(async (authed) => {
      if (!authed) { setSubscribed(false); return; }
      const me = await base44.auth.me();
      const subs = await base44.entities.Subscription.filter({ user_email: me.email, status: 'active' }, '-created_date', 1);
      setSubscribed(subs.length > 0);
    });
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="w-10 h-10 rounded-full border-2 border-border border-t-foreground animate-spin mx-auto" />
        <p className="text-sm text-muted-foreground">Computing your infrastructure score…</p>
      </div>
    </div>
  );

  if (needsAuth) return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="text-center max-w-sm">
        <h1 className="text-lg font-bold mb-2">Sign-in required</h1>
        <p className="text-sm text-muted-foreground mb-4">Open the login window and return automatically.</p>
        <a href="/auth/start" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center h-9 px-4 rounded-full bg-foreground text-background text-sm font-bold">Sign in</a>
      </div>
    </div>
  );

  if (!result) return (
    <div className="min-h-screen flex items-center justify-center bg-background px-5">
      <div className="text-center">
        <p className="text-muted-foreground mb-4 text-sm">No results found.</p>
        <Link to="/Analyzer"><Button variant="outline" className="rounded-full px-6 text-sm h-11">Run the Analyzer</Button></Link>
      </div>
    </div>
  );

  const score = scoreReport?.total ?? result.infra_score ?? 0;
  const scoreColor = scoreReport?.scoreColor ?? (score >= 80 ? "#22c55e" : score >= 60 ? "#f97316" : "#3b82f6");
  const scoreLabel = scoreReport?.label ?? (score >= 60 ? "Efficient" : score >= 40 ? "Optimization opportunity detected" : "High optimization potential");
  const isEstimated = !scoreReport || scoreReport.dataQuality === "manual";

  const chartData = BREAKDOWN_META.map(m => ({
    name: m.label, value: result[m.key] || 0, fill: m.color,
  }));

  const recs = scoreReport?.impacts?.length
    ? scoreReport.impacts.map((imp, i) => ({ ...RECS[i] ?? RECS[0], action: imp.action, points: imp.pointsGain, cat: imp.category }))
    : RECS.map(r => ({ ...r, saving: r.saving.replace("€X", `€${Math.round((result.total_savings || 0) / 3).toLocaleString()}`) }));

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

  const handleExportPdf = async () => {
    // Ensure we have analysis data
    if (!result) { alert('No analysis data to export.'); return; }

    // Require authentication and a registered brand before exporting
    const authed = await base44.auth.isAuthenticated();
    if (!authed) { base44.auth.redirectToLogin(window.location.href); return; }
    const me = await base44.auth.me();
    const brands = await base44.entities.Brand.filter({ created_by: me.email });
    if (!brands.length) {
      alert('Please register your brand first (Account > Brand) before exporting the report.');
      return;
    }
    const brand = brands[0];

    // Gather benchmark comparisons
    const payCurr = result.details?.payment_current_rate ?? null;
    const payOpt = result.details?.payment_optimal_rate ?? null;
    const shipCurr = result.details?.shipping_current_avg ?? null;
    const shipOpt = result.details?.shipping_optimal_avg ?? null;
    const monthlyRevenue = input?.monthly_revenue ?? null;
    const saasCurrentPct = monthlyRevenue ? ((input.total_saas_spend / monthlyRevenue) * 100) : null;
    const saasOptPct = (monthlyRevenue && result.details?.saas_optimal_total)
      ? ((result.details.saas_optimal_total / monthlyRevenue) * 100) : null;

    // Create PDF
    const doc = new jsPDF();
    doc.setFontSize(18); doc.text('THE NoDE — Results Summary', 20, 20);

    let y = 28;
    doc.setFontSize(12);
    if (brand?.name) { doc.text(`Brand: ${brand.name}`, 20, y); y += 8; }

    const total = result.total_savings || 0;
    const scoreVal = score;
    doc.text(`Total annual savings: €${total.toLocaleString()}`, 20, y); y += 8;
    doc.text(`Infrastructure Score: ${scoreVal}/100`, 20, y); y += 12;

    // Benchmarks section
    doc.setFontSize(14); doc.text('Key benchmark comparisons', 20, y); y += 8; doc.setFontSize(12);
    doc.text(`Payment fee: ${payCurr !== null ? payCurr.toFixed(1)+'%' : 'N/A'} vs target ${payOpt !== null ? payOpt.toFixed(1)+'%' : 'N/A'}`, 20, y); y += 6;
    doc.text(`Cost/shipment: ${shipCurr !== null ? '€'+shipCurr.toFixed(2) : 'N/A'} vs target ${shipOpt !== null ? '€'+shipOpt.toFixed(2) : 'N/A'}`, 20, y); y += 6;
    doc.text(`SaaS / revenue: ${saasCurrentPct !== null ? saasCurrentPct.toFixed(1)+'%' : 'N/A'} vs target ${saasOptPct !== null ? saasOptPct.toFixed(1)+'%' : 'N/A'}`, 20, y); y += 12;

    // Timestamp
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, y);

    doc.save('thenode-results.pdf');
  };

  return (
    <div className="min-h-screen font-inter bg-background text-foreground">

      {/* ── Sticky top bar ── */}
      <div className="sticky top-0 z-20 border-b border-border/40 px-5 py-3.5 flex items-center justify-between bg-background/97 backdrop-blur-2xl">
        <Link to="/" className="text-sm font-black tracking-tight">THE NoDE</Link>
        <div className="flex items-center gap-2">
          <Link to="/Reports">
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground rounded-full px-3 hidden sm:flex">History</Button>
          </Link>
          <Link to="/ConnectTools">
            <Button variant="outline" size="sm" className="h-8 text-xs rounded-full px-3 border-border/60 gap-1.5">
              <Zap size={11} /> Connect tools
            </Button>
          </Link>
          {subscribed ? (
            <Button onClick={handleExportPdf} variant="outline" size="sm" className="h-8 text-xs rounded-full px-3 border-border/60 gap-1.5">
              <Download size={11} /> Export PDF
            </Button>
          ) : (
            <Link to="/Onboarding">
              <Button variant="outline" size="sm" className="h-8 text-xs rounded-full px-3 border-border/60 gap-1.5 bg-saas-gradient text-white">
                <Lock size={11} /> Unlock report — <span className="mx-1 line-through opacity-80">€60</span> <span className="font-semibold">Free</span>
              </Button>
            </Link>
          )}
          <Link to="/Dashboard">
            <Button size="sm" className="h-8 rounded-full text-xs px-4 font-semibold">Dashboard</Button>
          </Link>
        </div>
      </div>

      <div className={`max-w-3xl mx-auto px-5 py-10 pb-24 space-y-12 ${!subscribed ? 'lock-blur' : ''}`}>

        {/* ═══ 1. MAIN RESULT ═══════════════════════════════════════ */}
        <div className="text-center">
          <p className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground/40 mb-5">Infrastructure analysis complete</p>

          {/* Accuracy badge */}
          <div className="flex justify-center mb-5">
            <AccuracyBadge isEstimated={isEstimated} />
          </div>

          <p className="text-sm text-muted-foreground mb-3">Optimization potential identified across your infrastructure</p>

          {/* THE BIG NUMBER */}
          <div className="text-[clamp(5rem,18vw,10rem)] font-black tracking-[-0.055em] leading-none mb-2 no-blur">
            <AnimatedCounter value={result.total_savings} prefix="€" duration={2} />
          </div>
          <p className="text-muted-foreground/50 text-base mb-2">per year across your infrastructure</p>
          <p className="text-muted-foreground/35 text-sm mb-7">Value currently left unoptimized. Most brands your size improve this within the first cycle.</p>

          {!subscribed && (
            <div className="mt-2">
              <Link to="/Onboarding">
                <Button className="rounded-full px-6 text-sm gap-1.5 bg-saas-gradient text-white">
                  Unlock report — <span className="mx-1 line-through opacity-80">€60</span> <span className="font-bold">Free</span>
                </Button>
              </Link>
            </div>
          )}

          {/* Score pill */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <div className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-border/50 bg-card">
              <Shield size={12} className="text-muted-foreground/35" />
              <span className="text-sm font-bold">Infrastructure Score</span>
              <span className="text-sm font-black tabular-nums" style={{ color: scoreColor }}>{score}/100</span>
              <span className="text-xs text-muted-foreground/40">· {scoreLabel}</span>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* 1. Efficiency Score */}
          <div className="p-5 rounded-2xl border border-border/50 bg-card">
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 mb-2">Cost Efficiency</p>
            <div className="flex items-center gap-4">
              <div className="relative w-20 h-20">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="34" fill="none" stroke="#333" strokeWidth="6" />
                  <circle cx="40" cy="40" r="34" fill="none" stroke={score < 50 ? '#ef4444' : (score > 80 ? '#22c55e' : '#f59e0b')} strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 34} strokeDashoffset={2 * Math.PI * 34 * (1 - score / 100)} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-black" style={{ color: score < 50 ? '#ef4444' : (score > 80 ? '#22c55e' : '#f59e0b') }}>
                    {score}
                  </span>
                  <span className="text-[9px] text-muted-foreground/50">/100</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground/70 max-w-[180px]">Overall infrastructure efficiency.</p>
            </div>
          </div>

          {/* 2. Capital Liberado */}
          <div className="p-5 rounded-2xl border border-border/50 bg-card">
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 mb-2">Released Capital</p>
            <div className="text-4xl font-black tracking-tight">
              <span className="tabular-nums"><AnimatedCounter value={result.total_savings} prefix="€" duration={2} /></span>
              <span className="text-base text-muted-foreground/40 font-normal">/yr</span>
            </div>
          </div>

          {/* 3. Benchmark */}
          <div className="p-5 rounded-2xl border border-border/50 bg-card">
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 mb-2">Benchmark</p>
            {(() => {
              const gmvAnnual = input?.monthly_revenue ? input.monthly_revenue * 12 : null;
              const pct = gmvAnnual && gmvAnnual > 0 ? Math.round((result.total_savings / gmvAnnual) * 100) : null;
              return (
                <p className="text-sm text-foreground">
                  {pct !== null ? (
                    <>Your brand is spending <span className="font-bold">{pct}%</span> more than THE NoDE network average.</>
                  ) : (
                    <span className="text-muted-foreground/60">Not enough data for the benchmark.</span>
                  )}
                </p>
              );
            })()}
          </div>
        </div>

        {/* ═══ 2. ACCURACY NOTICE ══════════════════════════════════ */}
        {isEstimated && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-5 rounded-2xl border border-orange-500/20 bg-orange-500/[0.04]">
            <AlertTriangle size={16} className="text-orange-500 shrink-0 mt-0.5 sm:mt-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold">Using estimated data</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">This analysis uses your manual inputs. Connect your tools or upload statements to unlock precise, verified savings figures.</p>
              <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground/40">
                <span>🔒 Encrypted</span>
                <span>👁 Read-only access</span>
                <span>🚫 Never shared</span>
              </div>
            </div>
            <Link to="/ConnectTools" className="shrink-0">
              <button className="h-9 px-4 rounded-full bg-foreground text-background text-xs font-bold flex items-center gap-1.5 whitespace-nowrap">
                <Zap size={11} /> Connect your data
              </button>
            </Link>
          </div>
        )}

        {/* ═══ 3A. INTELLIGENCE ═════════════════════════════════════ */}
        {intelligence && (
          <IntelligencePanel intelligence={intelligence} />
        )}

        {/* ═══ 3. INFRASTRUCTURE SCORE ══════════════════════════════ */}
        <div>
          <SectionLabel>Infrastructure Score</SectionLabel>
          {scoreReport ? (
            <ScoreCard scoreReport={scoreReport} />
          ) : (
            <div className="p-7 rounded-2xl border border-border/50 bg-card flex items-center gap-6">
              <div className="relative w-20 h-20 shrink-0">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
                  <circle cx="40" cy="40" r="34" fill="none" stroke={scoreColor} strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 34} strokeDashoffset={2 * Math.PI * 34 * (1 - score / 100)}
                    style={{ transition: "stroke-dashoffset 1.5s ease-out" }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-black" style={{ color: scoreColor }}>{score}</span>
                  <span className="text-[9px] text-muted-foreground/40">/100</span>
                </div>
              </div>
              <div>
                <p className="font-bold text-xl mb-1">{scoreLabel}</p>
                <p className="text-sm text-muted-foreground">Connect your tools to unlock a precise multi-dimensional score.</p>
              </div>
            </div>
          )}
        </div>

        {/* ═══ 4. TOP SAVINGS OPPORTUNITIES ════════════════════════ */}
        <div className="relative">
          <SectionLabel>Top savings opportunities</SectionLabel>

          {/* Visual bar chart */}
          <div className="mb-4 p-5 rounded-2xl border border-border/50 bg-card overflow-hidden">
            <p className="text-[10px] text-muted-foreground/40 uppercase tracking-[0.15em] mb-4">Annual savings by category</p>
            <NormalizedBarChart data={chartData} className="h-28 sm:h-32 md:h-36" hideLabels={!subscribed} />
          </div>

          {/* Cards */}
          <div className="space-y-2.5">
            {BREAKDOWN_META.map(item => (
              <div key={item.key} className={`flex items-center gap-4 p-5 rounded-xl border ${item.bg}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${item.bg}`}>
                  <item.icon size={15} className={item.textColor} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className="text-[11px] text-muted-foreground/50 sensitive">{item.detail(result)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-2xl font-black tabular-nums ${item.textColor}`}>
                    €{(result[item.key] || 0).toLocaleString()}
                  </p>
                  <p className="text-[10px] text-muted-foreground/40">/year</p>
                  <a
                    href={`/deal/activate?vertical=${item.label.toLowerCase().includes('payment') ? 'payments' : (item.label.toLowerCase().includes('shipping') ? 'shipping' : 'saas')}&resultId=${result.id}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 mt-2 rounded-full border text-[11px] hover:opacity-80"
                  >
                    Activate this deal
                  </a>
                </div>
              </div>
            ))}

            {/* Total row */}
            <div className="flex items-center justify-between p-5 rounded-xl bg-foreground text-background">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] opacity-35 mb-0.5">Total annual potential</p>
                <p className="text-2xl font-black tracking-tight tabular-nums">
                  €{(result.total_savings || 0).toLocaleString()}
                  <span className="text-base font-normal opacity-35 ml-1">/yr</span>
                </p>
              </div>
              <TrendingDown size={22} className="opacity-15" />
            </div>
          </div>
        </div>


        {/* ═══ 5. BENCHMARK COMPARISON ══════════════════════════════ */}
        <div className="relative">
          <SectionLabel>Benchmark comparison</SectionLabel>
          <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
            <div className="grid grid-cols-4 px-6 py-2.5 bg-secondary/50 border-b border-border/30">
              {["Metric", "Yours", "Network avg", "Gap"].map((h, i) => (
                <span key={i} className={`text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 ${i > 0 ? "text-center" : ""} ${i === 3 ? "text-right" : ""}`}>{h}</span>
              ))}
            </div>
            {[
              {
                metric: "Payment fee", bad: (result.details?.payment_current_rate ?? 2.9) > (result.details?.payment_optimal_rate ?? 1.4),
                yours: `${(result.details?.payment_current_rate ?? 2.9).toFixed(1)}%`,
                network: `${(result.details?.payment_optimal_rate ?? 1.4).toFixed(1)}%`,
                gap: result.details?.payment_current_rate && result.details?.payment_optimal_rate
                  ? `−${(result.details.payment_current_rate - result.details.payment_optimal_rate).toFixed(1)}%`
                  : "Potential gap",
              },
              {
                metric: "Cost/shipment", bad: (result.details?.shipping_current_avg ?? 7.5) > (result.details?.shipping_optimal_avg ?? 5.2),
                yours: `€${(result.details?.shipping_current_avg ?? 7.5).toFixed(2)}`,
                network: `€${(result.details?.shipping_optimal_avg ?? 5.2).toFixed(2)}`,
                gap: result.details?.shipping_current_avg && result.details?.shipping_optimal_avg
                  ? `−€${(result.details.shipping_current_avg - result.details.shipping_optimal_avg).toFixed(2)}`
                  : "Potential gap",
              },
              {
                metric: "SaaS / revenue", bad: true,
                yours: input?.monthly_revenue ? `${((input.total_saas_spend / input.monthly_revenue) * 100).toFixed(1)}%` : "~5%",
                network: result.details?.saas_optimal_total && input?.monthly_revenue
                  ? `${((result.details.saas_optimal_total / input.monthly_revenue) * 100).toFixed(1)}%`
                  : "2.5%",
                gap: "Efficiency gap",
              },
              {
                metric: "Infrastructure score", bad: score < 72,
                yours: `${score}/100`, network: "72/100",
                gap: score >= 72 ? "Above avg ↑" : `−${72 - score} pts`,
              },
            ].map((row, i) => (
              <div key={i} className="grid grid-cols-4 px-6 py-4 border-b border-border/15 last:border-0 items-center">
                <span className="text-xs text-muted-foreground/60">{row.metric}</span>
                <span className="text-xs font-bold tabular-nums text-center">{row.yours}</span>
                <span className="text-xs text-muted-foreground/35 tabular-nums text-center">{row.network}</span>
                <span className={`text-xs font-bold text-right tabular-nums ${row.bad ? "text-orange-500" : "text-green-600"}`}>{row.gap}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ 6. RECOMMENDATIONS ══════════════════════════════════ */}
        <div className="relative">
          <SectionLabel>Recommended actions</SectionLabel>
          <div className="space-y-2">
            {recs.map((item, i) => (
              <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-card hover:border-border transition-colors group">
                <div className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                  <item.icon size={13} className="text-muted-foreground/50" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground/40 mb-0.5">{item.cat}</p>
                  <p className="text-sm font-semibold">{item.action}</p>
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <p className="text-xs font-semibold text-green-600">{item.saving}</p>
                  <p className="text-[10px] font-bold text-green-600/60 bg-green-500/[0.07] border border-green-500/15 px-2 py-0.5 rounded-full">
                    +{item.points} pts
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ 7. DEALS ════════════════════════════════════════════ */}
        <div>
          <SectionLabel>Available deals via THE NoDE</SectionLabel>
          <div className="space-y-3">
            {DEALS.map((deal, i) => (
              <div key={i} className={`p-5 rounded-xl border flex items-center gap-4 ${deal.bg}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-sm font-semibold">{deal.title}</p>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full bg-background/70 ${deal.textColor}`}>{deal.cat}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground/55">{deal.desc}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-base font-black ${deal.textColor} mb-1`}>{deal.saving}</p>
                  <Link to="/Onboarding">
                    <button className={`text-[11px] font-bold flex items-center justify-end gap-1 px-3 py-1.5 rounded-full border ${deal.bg} ${deal.textColor} hover:opacity-80 transition-opacity`}>
                      Unlock <ArrowRight size={9} />
                    </button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ ACCURACY FOOTER ══════════════════════════════════════ */}
        <div className="p-6 rounded-2xl border border-border/40 bg-secondary/15">
          <div className="flex items-start gap-3 mb-4">
            <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${isEstimated ? "bg-orange-400" : "bg-green-500"}`} />
            <div>
              <p className="text-sm font-semibold">{scoreReport?.accuracyLabel ?? "Estimated — connect tools to refine"}</p>
              <p className="text-xs text-muted-foreground/55 mt-1 leading-relaxed">
                This report uses manual inputs. Connect your tools or upload statements to unlock a verified Infrastructure Score with precise savings figures.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/ConnectTools">
              <button className="h-9 px-4 rounded-full bg-foreground text-background text-xs font-bold flex items-center gap-1.5">
                <Zap size={11} /> Connect your data
              </button>
            </Link>
            <Link to="/Analyzer">
              <button className="h-9 px-4 rounded-full border border-border/60 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                Re-run analysis
              </button>
            </Link>
          </div>
        </div>

        {/* ═══ FINAL CTA ════════════════════════════════════════════ */}
        <div className="text-center pt-2">
          <h3 className="text-2xl font-black tracking-[-0.03em] mb-2">Ready to recover this?</h3>
          <p className="text-muted-foreground text-sm mb-7 max-w-sm mx-auto">
            Join THE NoDE network and start fixing your infrastructure today.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/Onboarding" className="w-full sm:w-auto">
              <Button size="lg" className="w-full rounded-full px-10 text-sm font-bold gap-2 shadow-sm">
                Join & unlock — <span className="mx-1 line-through opacity-80">€60</span> <span className="font-semibold">Free</span> <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-10 pt-6 border-t border-[#333] text-center">
          <p className="text-[11px] text-muted-foreground/60">This analysis is an estimate based on the current aggregated volume of THE NoDE network.</p>
        </div>

      </div>
    </div>
  );
}