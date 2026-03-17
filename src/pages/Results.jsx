import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowRight, CreditCard, Truck, Package, TrendingDown,
  Zap, Shield, BarChart2, ExternalLink, ChevronRight
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import AnimatedCounter from "@/components/shared/AnimatedCounter";
import ScoreCard from "@/components/results/ScoreCard";
import { computeInfraScore } from "@/lib/scoreEngine";
import DataQualityBanner from "@/components/shared/DataQualityBanner";

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
  { title: "Network payment rate", desc: "1.4% effective fee — pre-negotiated at collective volume", saving: "Up to 52% reduction", cat: "Payments", color: "text-blue-600", bg: "bg-blue-500/[0.05]" },
  { title: "Collective shipping", desc: "Enterprise carrier rates without enterprise volume", saving: "−18% avg.", cat: "Shipping", color: "text-green-600", bg: "bg-green-500/[0.05]" },
  { title: "SaaS group licenses", desc: "Shared contracts on Klaviyo, Gorgias, and more", saving: "Up to 30% off", cat: "SaaS", color: "text-orange-500", bg: "bg-orange-500/[0.05]" },
];

function SectionLabel({ children }) {
  return (
    <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-5 flex items-center gap-2">
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

      // Fetch the input to compute detailed score
      let inp = null;
      if (r.input_id) {
        const inputs = await base44.entities.AnalyzerInput.filter({ id: r.input_id });
        if (inputs.length) inp = inputs[0];
      }
      setInput(inp);

      // Compute multi-dimensional score
      if (inp) {
        const report = computeInfraScore(inp, "manual");
        setScoreReport(report);
      }

      setLoading(false);
    });
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="relative w-12 h-12 mx-auto">
          <div className="w-12 h-12 rounded-full border-2 border-border border-t-foreground animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/20 text-xl select-none">✱</div>
        </div>
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

  // Fallback score from stored value if scoreReport isn't available
  const score = scoreReport?.total ?? result.infra_score ?? 0;
  const scoreColor = scoreReport?.scoreColor ?? (score >= 70 ? "#22c55e" : score >= 40 ? "#f97316" : "#3b82f6");
  const scoreLabel = scoreReport?.label ?? (score >= 70 ? "Good" : score >= 40 ? "Under-optimized" : "Poor");

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

      <div className="max-w-3xl mx-auto px-5 py-12 pb-28 space-y-12">

        {/* ── SECTION 1: Overpaying amount — HERO ─────────────────── */}
        <div className="text-center pb-10 border-b border-border/40">
          <p className="text-[11px] tracking-[0.35em] uppercase text-muted-foreground/50 mb-5">Infrastructure analysis complete</p>
          <p className="text-base text-muted-foreground mb-3">Estimated annual overspend</p>
          <div className="text-[clamp(4rem,13vw,8rem)] font-black tracking-[-0.05em] leading-none">
            <AnimatedCounter value={result.total_savings} prefix="€" duration={2} />
          </div>
          <p className="text-muted-foreground/60 text-sm mt-3 mb-6">per year, based on current infrastructure costs</p>

          {/* Mini score badge */}
          <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full border border-border/50 bg-card">
            <Shield size={13} className="text-muted-foreground/40" />
            <span className="text-sm font-semibold">Infrastructure Score:</span>
            <span className="text-sm font-black tabular-nums" style={{ color: scoreColor }}>{score} / 100</span>
            <span className="text-[11px] text-muted-foreground/50">{scoreLabel}</span>
          </div>
        </div>

        {/* Estimated data notice */}
        {(!scoreReport || scoreReport.dataQuality === "manual") && (
          <div className="flex items-center gap-3 p-4 rounded-xl border border-border/50 bg-secondary/30 -mt-4">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground/70 flex-1">
              <span className="font-semibold text-foreground">This is an estimated analysis</span> — based on manual inputs.
              {" "}Connect your tools to refine your results and improve your Infrastructure Score.
            </p>
            <Link to="/ConnectTools">
              <button className="h-8 px-3.5 rounded-full bg-foreground text-background text-xs font-bold flex items-center gap-1.5 shrink-0 hover:bg-foreground/90 transition-colors">
                <Zap size={10} /> Connect tools
              </button>
            </Link>
          </div>
        )}

        {/* ── SECTION 2: Cost breakdown ────────────────────────────── */}
        <div>
          <SectionLabel>Cost breakdown</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {BREAKDOWN.map((item) => (
              <div key={item.key} className={`p-6 rounded-2xl border ${item.bg}`}>
                <div className="flex items-center gap-2 mb-4">
                  <item.icon size={13} className={item.color} />
                  <span className="text-xs font-semibold">{item.label}</span>
                </div>
                <div className={`text-2xl font-black tracking-tight mb-2 ${item.color}`}>
                  <AnimatedCounter value={result[item.key]} prefix="€" suffix="/yr" duration={1.8} />
                </div>
                <p className="text-[11px] text-muted-foreground/50 leading-snug">{item.detail(result)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── SECTION 3: Infrastructure Score (full card) ───────────── */}
        <div>
          <SectionLabel>Infrastructure score</SectionLabel>
          {scoreReport ? (
            <ScoreCard scoreReport={scoreReport} />
          ) : (
            /* Fallback minimal score display if no input available */
            <div className="p-7 rounded-2xl border border-border/50 bg-card flex items-center gap-6">
              <div className="relative w-24 h-24 shrink-0">
                <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--border))" strokeWidth="7" />
                  <circle cx="50" cy="50" r="42" fill="none" stroke={scoreColor} strokeWidth="7" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 42}
                    strokeDashoffset={2 * Math.PI * 42 * (1 - score / 100)}
                    style={{ transition: "stroke-dashoffset 1.5s ease-out" }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-black" style={{ color: scoreColor }}>{score}</span>
                  <span className="text-[10px] text-muted-foreground/40">/100</span>
                </div>
              </div>
              <div>
                <p className="font-bold text-base mb-1">{scoreLabel}</p>
                <p className="text-sm text-muted-foreground">Your infrastructure score reflects cost efficiency, provider quality, and data completeness.</p>
              </div>
            </div>
          )}
        </div>

        {/* ── SECTION 4: Benchmark comparison ─────────────────────── */}
        <div>
          <SectionLabel>Benchmark comparison</SectionLabel>
          <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
            <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground/60">Your metrics vs THE NoDE network</span>
              <BarChart2 size={13} className="text-muted-foreground/30" />
            </div>
            <div className="divide-y divide-border/30">
              {[
                {
                  metric: "Payment fee rate",
                  yours: `${result.details?.payment_current_rate?.toFixed(1) ?? "~2.9"}%`,
                  network: "1.4%",
                  gap: result.details?.payment_current_rate
                    ? `−${(result.details.payment_current_rate - 1.4).toFixed(1)}%`
                    : "−1.5%",
                  positive: false,
                },
                {
                  metric: "Cost per shipment",
                  yours: `€${result.details?.shipping_current_avg?.toFixed(2) ?? "~7.50"}`,
                  network: "€5.20",
                  gap: result.details?.shipping_current_avg
                    ? `−€${(result.details.shipping_current_avg - 5.2).toFixed(2)}`
                    : "−€2.30",
                  positive: false,
                },
                {
                  metric: "SaaS as % of revenue",
                  yours: input?.monthly_revenue
                    ? `${((input.total_saas_spend / input.monthly_revenue) * 100).toFixed(1)}%`
                    : "~5%",
                  network: "2.5%",
                  gap: "Consolidation potential",
                  positive: false,
                },
                {
                  metric: "Infra score vs avg.",
                  yours: `${score}/100`,
                  network: "72/100",
                  gap: score >= 72 ? "Above average ↑" : `${72 - score} pts below avg.`,
                  positive: score >= 72,
                },
              ].map((row, i) => (
                <div key={i} className="grid grid-cols-4 px-6 py-3.5 text-sm">
                  <span className="text-muted-foreground/70 text-xs">{row.metric}</span>
                  <span className="font-semibold tabular-nums text-xs text-center">{row.yours}</span>
                  <span className="text-muted-foreground/50 tabular-nums text-xs text-center">{row.network}</span>
                  <span className={`text-xs font-semibold text-right tabular-nums ${row.positive ? "text-green-600" : "text-muted-foreground/50"}`}>{row.gap}</span>
                </div>
              ))}
              <div className="grid grid-cols-4 px-6 py-2.5 bg-secondary/30 text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40">
                <span>Metric</span>
                <span className="text-center">Yours</span>
                <span className="text-center">Network</span>
                <span className="text-right">Gap</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── SECTION 5: Savings opportunities ────────────────────── */}
        <div>
          <SectionLabel>Savings opportunities</SectionLabel>
          <div className="space-y-3">
            {BREAKDOWN.filter(b => result[b.key] > 0).map((item, i) => (
              <div key={i} className="flex items-center gap-4 p-5 rounded-xl border border-border/50 bg-card">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${item.bg}`}>
                  <item.icon size={14} className={item.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className="text-[11px] text-muted-foreground/50">{item.detail(result)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-lg font-black tabular-nums ${item.color}`}>
                    €{result[item.key].toLocaleString()}
                  </p>
                  <p className="text-[10px] text-muted-foreground/40">/year</p>
                </div>
              </div>
            ))}

            {/* Total */}
            <div className="flex items-center justify-between p-5 rounded-xl bg-foreground text-background">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] opacity-40 mb-0.5">Total annual potential</p>
                <p className="text-2xl font-black tracking-tight">
                  €{(result.total_savings || 0).toLocaleString()}<span className="text-base font-normal opacity-40">/yr</span>
                </p>
              </div>
              <TrendingDown size={24} className="opacity-15" />
            </div>
          </div>
        </div>

        {/* ── SECTION 6: Optimization actions ─────────────────────── */}
        <div>
          <SectionLabel>Optimization actions</SectionLabel>
          <div className="space-y-2">
            {(scoreReport?.impacts ?? [
              { category: "Payments", action: "Switch to network payment rate (1.4%)", pointsGain: 12, severity: "high" },
              { category: "Shipping", action: "Access network shipping contracts", pointsGain: 8, severity: "medium" },
              { category: "SaaS", action: "Consolidate tools via group licenses", pointsGain: 7, severity: "medium" },
            ]).map((item, i) => (
              <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-card hover:border-border transition-colors group">
                <span className="text-[10px] tracking-[0.2em] text-muted-foreground/30 w-5 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground/50 mb-0.5">{item.category}</p>
                  <p className="text-sm font-semibold">{item.action}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-green-600 font-bold bg-green-500/[0.08] border border-green-500/20 px-2.5 py-1 rounded-full">
                    +{item.pointsGain} pts
                  </span>
                  <ChevronRight size={14} className="text-muted-foreground/20 group-hover:text-muted-foreground/60 transition-colors" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── SECTION 7: Deals access ───────────────────────────────── */}
        <div>
          <SectionLabel>Deals access</SectionLabel>
          <div className="space-y-3">
            {DEALS.map((deal, i) => (
              <div key={i} className={`p-5 rounded-xl border flex items-center gap-4 ${deal.bg} border-border/40`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold">{deal.title}</p>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full bg-background/60 ${deal.color}`}>{deal.cat}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground/60">{deal.desc}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-sm font-black ${deal.color}`}>{deal.saving}</p>
                  <Link to="/Deals" className={`text-[10px] font-medium flex items-center justify-end gap-0.5 mt-0.5 opacity-60 hover:opacity-100 transition-opacity ${deal.color}`}>
                    Activate <ArrowRight size={9} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── SECTION 8: Accuracy level ────────────────────────────── */}
        <div className="p-6 rounded-2xl border border-border/40 bg-secondary/20">
          <SectionLabel>Accuracy level</SectionLabel>
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-background border border-border/50 flex items-center justify-center shrink-0">
              <Shield size={15} className="text-muted-foreground/40" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-sm font-semibold">
                  {scoreReport?.accuracyLabel ?? "Low — estimated"}
                </p>
                <span className="text-[10px] px-2.5 py-1 rounded-full bg-secondary border border-border/50 text-muted-foreground/50 font-medium">
                  {scoreReport?.dataQuality === "connected" ? "Real data" : scoreReport?.dataQuality === "partial" ? "Partial data" : "Manual estimate"}
                </span>
              </div>
              <p className="text-[12px] text-muted-foreground/60 leading-relaxed mb-4">
                This report is based on manual inputs. Connect your tools or upload your statements to improve accuracy and unlock a more precise infrastructure score.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Link to="/ConnectTools">
                  <button className="h-9 px-4 rounded-full border border-border/60 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors flex items-center gap-1.5">
                    <Zap size={11} /> Connect tools for better accuracy
                  </button>
                </Link>
                <Link to="/Analyzer">
                  <button className="h-9 px-4 rounded-full border border-border/60 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
                    Re-run analysis
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* ── CTA ──────────────────────────────────────────────────── */}
        <div className="text-center pt-4">
          <h3 className="text-2xl font-black tracking-tight mb-2">Ready to recover this?</h3>
          <p className="text-muted-foreground text-sm mb-8 max-w-sm mx-auto">
            Join THE NoDE and start improving your infrastructure score today.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/Onboarding" className="w-full sm:w-auto">
              <Button size="lg" className="w-full h-13 rounded-full px-10 text-sm font-bold gap-2 shadow-sm">
                Join THE NoDE <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/Deals" className="w-full sm:w-auto">
              <Button variant="outline" size="lg" className="w-full h-13 rounded-full px-10 text-sm border-border/60">
                Activate deals
              </Button>
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}