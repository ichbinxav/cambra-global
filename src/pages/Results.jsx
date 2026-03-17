import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowRight, CreditCard, Truck, Package, TrendingDown,
  Zap, Shield, BarChart2, ChevronRight
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import AnimatedCounter from "@/components/shared/AnimatedCounter";
import ScoreCard from "@/components/results/ScoreCard";
import { computeInfraScore } from "@/lib/scoreEngine";

const BREAKDOWN = [
  {
    key: "payment_savings", label: "Payment fees", icon: CreditCard,
    color: "text-blue-600", bg: "bg-blue-500/[0.05] border-blue-500/15",
    detail: (r) => r.details?.payment_current_rate
      ? `${r.details.payment_current_rate.toFixed(1)}% → 1.4% network rate`
      : "Above network benchmark"
  },
  {
    key: "shipping_savings", label: "Shipping costs", icon: Truck,
    color: "text-green-600", bg: "bg-green-500/[0.05] border-green-500/15",
    detail: (r) => r.details?.shipping_current_avg
      ? `€${r.details.shipping_current_avg.toFixed(2)}/shipment → collective rate`
      : "Volume-based repricing available"
  },
  {
    key: "saas_savings", label: "SaaS & tools", icon: Package,
    color: "text-orange-500", bg: "bg-orange-500/[0.05] border-orange-500/15",
    detail: (r) => r.details?.saas_current_total
      ? `€${r.details.saas_current_total.toLocaleString()}/mo → group licenses`
      : "Stack consolidation potential"
  },
];

const DEALS = [
  { title: "Network payment rate", desc: "1.4% effective fee — pre-negotiated at collective volume", saving: "Up to −52%", cat: "Payments", color: "text-blue-600", bg: "bg-blue-500/[0.05] border-blue-500/15" },
  { title: "Collective shipping", desc: "Enterprise carrier rates without enterprise volume", saving: "−18% avg.", cat: "Shipping", color: "text-green-600", bg: "bg-green-500/[0.05] border-green-500/15" },
  { title: "SaaS group licenses", desc: "Shared contracts on Klaviyo, Gorgias, and more", saving: "Up to −30%", cat: "SaaS", color: "text-orange-500", bg: "bg-orange-500/[0.05] border-orange-500/15" },
];

function SectionLabel({ children }) {
  return (
    <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-4 flex items-center gap-2">
      <span className="w-4 h-px bg-border inline-block" />
      {children}
    </p>
  );
}

export default function Results() {
  const [result, setResult] = useState(null);
  const [input, setInput] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scoreReport, setScoreReport] = useState(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) { setLoading(false); return; }

    base44.entities.AnalyzerResult.filter({ id }).then(async (res) => {
      if (!res.length) { setLoading(false); return; }
      const r = res[0];
      setResult(r);

      if (r.input_id) {
        const inputs = await base44.entities.AnalyzerInput.filter({ id: r.input_id });
        if (inputs.length) {
          setInput(inputs[0]);
          setScoreReport(computeInfraScore(inputs[0], "manual"));
        }
      }
      setLoading(false);
    });
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="w-10 h-10 rounded-full border-2 border-border border-t-foreground animate-spin mx-auto" />
        <p className="text-sm text-muted-foreground">Computing your infrastructure score...</p>
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
  const scoreLabel = scoreReport?.label ?? (score >= 60 ? "Good" : score >= 40 ? "Under-optimized" : "Poor");
  const isEstimated = !scoreReport || scoreReport.dataQuality === "manual";

  return (
    <div className="min-h-screen bg-background font-inter">

      {/* Top bar */}
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
          <Link to="/Dashboard">
            <Button size="sm" className="h-8 rounded-full text-xs px-4 font-semibold">Dashboard →</Button>
          </Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 py-10 pb-24 space-y-10">

        {/* ── 1. OVERPAYING HERO ─────────────────────────────────── */}
        <div className="text-center pb-8 border-b border-border/40">
          <p className="text-[11px] tracking-[0.35em] uppercase text-muted-foreground/50 mb-4">Infrastructure analysis complete</p>
          <p className="text-muted-foreground mb-2 text-sm">Stop overpaying for your infrastructure</p>
          <div className="text-[clamp(4.5rem,15vw,9rem)] font-black tracking-[-0.05em] leading-none text-foreground">
            <AnimatedCounter value={result.total_savings} prefix="€" duration={2} />
          </div>
          <p className="text-muted-foreground/60 text-base mt-2 mb-6">per year in recoverable infrastructure costs</p>

          {/* Score + accuracy badges */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-border/50 bg-card">
              <Shield size={12} className="text-muted-foreground/40" />
              <span className="text-sm font-bold">Score:</span>
              <span className="text-sm font-black" style={{ color: scoreColor }}>{score}/100</span>
              <span className="text-xs text-muted-foreground/50">{scoreLabel}</span>
            </div>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full border ${isEstimated ? "border-orange-500/20 bg-orange-500/[0.05]" : "border-green-500/20 bg-green-500/[0.05]"}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isEstimated ? "bg-orange-400" : "bg-green-500"}`} />
              <span className={`text-xs font-semibold ${isEstimated ? "text-orange-500" : "text-green-600"}`}>
                {isEstimated ? "Estimated analysis" : "Real data"}
              </span>
            </div>
          </div>
        </div>

        {/* ── Estimated data notice ─────────────────────────────── */}
        {isEstimated && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-5 rounded-xl border border-border/50 bg-secondary/30 -mt-4">
            <div className="flex-1">
              <p className="text-sm font-semibold mb-0.5">This is an estimated analysis</p>
              <p className="text-xs text-muted-foreground/60">Connect your tools to refine your results and get a more accurate Infrastructure Score.</p>
            </div>
            <Link to="/ConnectTools" className="shrink-0">
              <button className="h-9 px-4 rounded-full bg-foreground text-background text-xs font-bold flex items-center gap-1.5 whitespace-nowrap">
                <Zap size={11} /> Connect tools
              </button>
            </Link>
          </div>
        )}

        {/* ── 2. INFRASTRUCTURE SCORE ──────────────────────────── */}
        <div>
          <SectionLabel>Infrastructure score</SectionLabel>
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
                <p className="font-bold text-lg mb-1">{scoreLabel}</p>
                <p className="text-sm text-muted-foreground">Connect your tools to get a precise multi-dimensional score.</p>
              </div>
            </div>
          )}
        </div>

        {/* ── 3. TOP SAVINGS OPPORTUNITIES ────────────────────── */}
        <div>
          <SectionLabel>Top savings opportunities</SectionLabel>
          <div className="space-y-3">
            {BREAKDOWN.map((item) => (
              <div key={item.key} className={`flex items-center gap-4 p-5 rounded-xl border ${item.bg}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${item.bg}`}>
                  <item.icon size={15} className={item.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className="text-[11px] text-muted-foreground/50">{item.detail(result)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-xl font-black tabular-nums ${item.color}`}>
                    €{(result[item.key] || 0).toLocaleString()}
                  </p>
                  <p className="text-[10px] text-muted-foreground/40">/year</p>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between p-5 rounded-xl bg-foreground text-background">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] opacity-40 mb-0.5">Total annual potential</p>
                <p className="text-2xl font-black tracking-tight tabular-nums">
                  €{(result.total_savings || 0).toLocaleString()}<span className="text-base font-normal opacity-40">/yr</span>
                </p>
              </div>
              <TrendingDown size={22} className="opacity-15" />
            </div>
          </div>
        </div>

        {/* ── 4. BENCHMARK COMPARISON ─────────────────────────── */}
        <div>
          <SectionLabel>Benchmark comparison</SectionLabel>
          <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
            <div className="grid grid-cols-4 px-6 py-2.5 bg-secondary/40 text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 border-b border-border/30">
              <span>Metric</span><span className="text-center">Yours</span><span className="text-center">Network</span><span className="text-right">Gap</span>
            </div>
            {[
              {
                metric: "Payment rate", yours: `${result.details?.payment_current_rate?.toFixed(1) ?? "~2.9"}%`,
                network: "1.4%", gap: result.details?.payment_current_rate ? `−${(result.details.payment_current_rate - 1.4).toFixed(1)}%` : "−1.5%", positive: false,
              },
              {
                metric: "Cost/shipment", yours: `€${result.details?.shipping_current_avg?.toFixed(2) ?? "~7.50"}`,
                network: "€5.20", gap: result.details?.shipping_current_avg ? `−€${(result.details.shipping_current_avg - 5.2).toFixed(2)}` : "−€2.30", positive: false,
              },
              {
                metric: "SaaS % of rev", yours: input?.monthly_revenue ? `${((input.total_saas_spend / input.monthly_revenue) * 100).toFixed(1)}%` : "~5%",
                network: "2.5%", gap: "Consolidate", positive: false,
              },
              {
                metric: "Infra score", yours: `${score}/100`, network: "72/100",
                gap: score >= 72 ? "Above avg ↑" : `−${72 - score} pts`, positive: score >= 72,
              },
            ].map((row, i) => (
              <div key={i} className="grid grid-cols-4 px-6 py-3.5 border-b border-border/20 last:border-0 text-sm items-center">
                <span className="text-muted-foreground/70 text-xs">{row.metric}</span>
                <span className="font-bold tabular-nums text-xs text-center">{row.yours}</span>
                <span className="text-muted-foreground/40 tabular-nums text-xs text-center">{row.network}</span>
                <span className={`text-xs font-semibold text-right tabular-nums ${row.positive ? "text-green-600" : "text-orange-500"}`}>{row.gap}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── 5. RECOMMENDATIONS ──────────────────────────────── */}
        <div>
          <SectionLabel>Recommended actions</SectionLabel>
          <div className="space-y-2">
            {(scoreReport?.impacts ?? [
              { category: "Payments", action: "Switch to network payment rate (1.4%)", pointsGain: 12, severity: "high" },
              { category: "Shipping", action: "Access collective shipping contracts via THE NoDE", pointsGain: 8, severity: "medium" },
              { category: "SaaS", action: "Consolidate tools and join group license programs", pointsGain: 7, severity: "medium" },
            ]).map((item, i) => (
              <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-card group hover:border-border transition-colors">
                <span className="text-[10px] tracking-[0.2em] text-muted-foreground/30 w-5 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground/40 mb-0.5">{item.category}</p>
                  <p className="text-sm font-semibold">{item.action}</p>
                </div>
                <span className="text-[11px] text-green-600 font-bold bg-green-500/[0.08] border border-green-500/20 px-2.5 py-1 rounded-full shrink-0">
                  +{item.pointsGain} pts
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── 6. DEALS ────────────────────────────────────────── */}
        <div>
          <SectionLabel>Available deals via THE NoDE</SectionLabel>
          <div className="space-y-3">
            {DEALS.map((deal, i) => (
              <div key={i} className={`p-5 rounded-xl border flex items-center gap-4 ${deal.bg}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold">{deal.title}</p>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full bg-background/60 ${deal.color}`}>{deal.cat}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground/60">{deal.desc}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-sm font-black ${deal.color}`}>{deal.saving}</p>
                  <Link to="/Deals" className={`text-[10px] font-medium flex items-center justify-end gap-0.5 mt-1 opacity-60 hover:opacity-100 transition-opacity ${deal.color}`}>
                    Unlock <ArrowRight size={9} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 7. ACCURACY ─────────────────────────────────────── */}
        <div className="p-6 rounded-2xl border border-border/40 bg-secondary/20">
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-2 h-2 rounded-full ${isEstimated ? "bg-orange-400" : "bg-green-500"}`} />
            <p className="text-sm font-semibold">
              Accuracy: {scoreReport?.accuracyLabel ?? "Low — estimated"}
            </p>
          </div>
          <p className="text-xs text-muted-foreground/60 leading-relaxed mb-4">
            This report is based on manual inputs. Connect your tools or upload statements to improve accuracy and unlock a more precise Infrastructure Score.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Link to="/ConnectTools">
              <button className="h-9 px-4 rounded-full bg-foreground text-background text-xs font-bold flex items-center gap-1.5">
                <Zap size={11} /> Connect tools
              </button>
            </Link>
            <Link to="/ConnectTools">
              <button className="h-9 px-4 rounded-full border border-border/60 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
                Upload data instead
              </button>
            </Link>
          </div>
        </div>

        {/* ── CTA ─────────────────────────────────────────────── */}
        <div className="text-center pt-2">
          <h3 className="text-2xl font-black tracking-tight mb-2">Ready to recover this?</h3>
          <p className="text-muted-foreground text-sm mb-7 max-w-sm mx-auto">
            Join THE NoDE and start fixing your infrastructure today.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/Onboarding" className="w-full sm:w-auto">
              <Button size="lg" className="w-full rounded-full px-10 text-sm font-bold gap-2 shadow-sm">
                Join THE NoDE <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/Deals" className="w-full sm:w-auto">
              <Button variant="outline" size="lg" className="w-full rounded-full px-10 text-sm border-border/60">
                Activate deals
              </Button>
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}