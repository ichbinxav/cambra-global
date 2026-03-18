import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, TrendingDown, Zap, Package, Shield, ArrowUpRight,
  BarChart2, Users, BookOpen, CreditCard, Truck, CheckCircle2,
  AlertTriangle, Plug, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import AnimatedCounter from "@/components/shared/AnimatedCounter";
import { AreaChart, Area, ResponsiveContainer, Tooltip, RadialBarChart, RadialBar } from "recharts";

const SCORE_LABEL = s => s >= 90 ? "Best-in-class" : s >= 80 ? "Strong" : s >= 60 ? "Efficient" : s >= 40 ? "Optimization opportunity detected" : "High optimization potential";
const SCORE_COLOR = s => s >= 80 ? "#22c55e" : s >= 60 ? "#f97316" : "#3b82f6";

const DEALS_PREVIEW = [
  { label: "Network payment rate", saving: "−52%", color: "text-blue-600", dot: "bg-blue-500" },
  { label: "Collective shipping", saving: "−18%", color: "text-green-600", dot: "bg-green-500" },
  { label: "SaaS group licenses", saving: "−30%", color: "text-orange-500", dot: "bg-orange-400" },
];

export default function Dashboard() {
  const [results, setResults] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.AnalyzerResult.list("-created_date", 10),
      base44.auth.me(),
    ]).then(([r, u]) => { setResults(r); setUser(u); setLoading(false); });
  }, []);

  const latest = results[0];
  const chartData = results.slice().reverse().map((r, i) => ({ i, value: r.total_savings || 0 }));
  const score = latest?.infra_score || 0;
  const scoreColor = SCORE_COLOR(score);

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

          {/* ── HERO: OVERPAYING ── */}
          <div className="rounded-2xl border border-foreground/8 bg-foreground text-background overflow-hidden">
            <div className="p-7 sm:p-8">
              <p className="text-[10px] tracking-[0.3em] uppercase opacity-35 mb-3">Optimization potential identified</p>
              <div className="text-[clamp(3.5rem,11vw,6rem)] font-black tracking-[-0.055em] leading-none mb-1">
                <AnimatedCounter value={latest.total_savings} prefix="€" duration={1.8} />
              </div>
              <p className="text-sm opacity-40 mb-6">per year left unoptimized across your infrastructure</p>

              {/* 3 key metrics inline */}
              <div className="grid grid-cols-3 gap-3 mb-6 pb-6 border-b border-background/10">
                {[
                  { label: "Payments", value: latest.payment_savings, icon: CreditCard },
                  { label: "Shipping", value: latest.shipping_savings, icon: Truck },
                  { label: "SaaS", value: latest.saas_savings, icon: Package },
                ].map((item, i) => (
                  <div key={i}>
                    <p className="text-[10px] uppercase tracking-[0.15em] opacity-35 mb-1">{item.label}</p>
                    <p className="text-base sm:text-lg font-black tabular-nums opacity-90">
                      €{(item.value || 0).toLocaleString()}
                    </p>
                    <p className="text-[10px] opacity-30">/yr</p>
                  </div>
                ))}
              </div>

              {/* Score row */}
              <div className="flex items-center gap-3 mb-5">
                <svg className="w-8 h-8 -rotate-90 shrink-0" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2.5" />
                  <circle cx="12" cy="12" r="10" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 10}
                    strokeDashoffset={2 * Math.PI * 10 * (1 - score / 100)}
                    style={{ transition: "stroke-dashoffset 1.5s ease-out" }} />
                </svg>
                <div className="flex-1">
                  <p className="text-xs font-black opacity-80">Infra Score: <span className="font-black">{score}/100</span></p>
                  <p className="text-[10px] opacity-35">{SCORE_LABEL(score)}</p>
                </div>
                {/* Progress bar to 100 */}
                <div className="hidden sm:block w-24 h-1.5 rounded-full bg-background/10 overflow-hidden">
                  <div className="h-full rounded-full bg-background/60 transition-all duration-1000"
                    style={{ width: `${score}%` }} />
                </div>
              </div>

              <div className="flex flex-wrap gap-4">
                <Link to={`/Results?id=${latest.id}`} className="flex items-center gap-1.5 text-xs opacity-60 hover:opacity-100 transition-opacity font-semibold">
                  Full report <ArrowUpRight size={11} />
                </Link>
                <Link to="/Deals" className="flex items-center gap-1.5 text-xs opacity-60 hover:opacity-100 transition-opacity font-semibold">
                  Activate deals <ArrowUpRight size={11} />
                </Link>
                <Link to="/ConnectTools" className="flex items-center gap-1.5 text-xs opacity-60 hover:opacity-100 transition-opacity font-semibold">
                  Connect tools <ArrowUpRight size={11} />
                </Link>
              </div>
            </div>
          </div>

          {/* ── SAVINGS OPPORTUNITIES ── */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Payments", value: latest.payment_savings, icon: CreditCard, color: "text-blue-600", border: "border-blue-500/15", bg: "bg-blue-500/[0.05]", note: "payment efficiency" },
              { label: "Shipping", value: latest.shipping_savings, icon: Truck, color: "text-green-600", border: "border-green-500/15", bg: "bg-green-500/[0.05]", note: "shipping efficiency" },
              { label: "SaaS", value: latest.saas_savings, icon: Package, color: "text-orange-500", border: "border-orange-500/15", bg: "bg-orange-500/[0.05]", note: "stack efficiency" },
            ].map((item, i) => (
              <div key={i} className={`p-4 rounded-2xl border ${item.border} ${item.bg} flex flex-col`}>
                <item.icon size={13} className={`mb-2 ${item.color}`} />
                <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground/50 mb-1">{item.label}</p>
                <p className={`text-lg sm:text-xl font-black tabular-nums ${item.color}`}>
                  €{(item.value || 0).toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground/35 mt-0.5 hidden sm:block">{item.note}</p>
              </div>
            ))}
          </div>

          {/* ── SCORE + DEALS ROW ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Score card */}
            <Link to={`/Results?id=${latest.id}`}>
              <div className="p-6 rounded-2xl border border-border/50 bg-card hover:border-border transition-all h-full group">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">Infrastructure score</p>
                  <p className="text-[10px] text-muted-foreground/40 group-hover:text-foreground transition-colors flex items-center gap-0.5">
                    Details <ChevronRight size={9} />
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="relative w-16 h-16 shrink-0">
                    <svg className="w-16 h-16 -rotate-90" viewBox="0 0 60 60">
                      <circle cx="30" cy="30" r="26" fill="none" stroke="hsl(var(--border))" strokeWidth="5" />
                      <circle cx="30" cy="30" r="26" fill="none" stroke={scoreColor} strokeWidth="5" strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 26}
                        strokeDashoffset={2 * Math.PI * 26 * (1 - score / 100)}
                        style={{ transition: "stroke-dashoffset 1.5s ease-out" }} />
                      <text x="30" y="35" textAnchor="middle" fill={scoreColor} fontSize="12" fontWeight="900" transform="rotate(90 30 30)">{score}</text>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-xl font-black mb-0.5" style={{ color: scoreColor }}>{SCORE_LABEL(score)}</p>
                    <p className="text-xs text-muted-foreground leading-snug">
                      {score >= 60 ? "Above average. THE NoDE can push this further." : "Optimization opportunities identified — activate deals to improve."}
                    </p>
                    {/* Mini progress bar */}
                    <div className="mt-3 h-1 rounded-full bg-border/40 overflow-hidden w-full">
                      <div className="h-full rounded-full transition-all duration-1500"
                        style={{ width: `${score}%`, background: scoreColor }} />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[9px] text-muted-foreground/30">0</span>
                      <span className="text-[9px] text-muted-foreground/30">100</span>
                    </div>
                  </div>
                </div>
              </div>
            </Link>

            {/* Deals or chart */}
            {chartData.length > 1 ? (
              <div className="p-6 rounded-2xl border border-border/50 bg-card">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">Savings trend</p>
                  <Link to="/Reports">
                    <Button variant="ghost" size="sm" className="h-6 text-[11px] text-muted-foreground p-0 gap-1 hover:text-foreground">
                      All reports <ArrowUpRight size={10} />
                    </Button>
                  </Link>
                </div>
                <ResponsiveContainer width="100%" height={80}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(215,100%,50%)" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="hsl(215,100%,50%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 11, background: "hsl(var(--card))" }}
                      formatter={v => [`€${v?.toLocaleString()}/yr`, ""]} />
                    <Area type="monotone" dataKey="value" stroke="hsl(215,100%,50%)" strokeWidth={2} fill="url(#sg)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              /* Deals preview */
              <Link to="/Deals">
                <div className="p-6 rounded-2xl border border-border/50 bg-card hover:border-border transition-all h-full group">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">Available deals</p>
                    <span className="text-[10px] text-muted-foreground/40 group-hover:text-foreground transition-colors flex items-center gap-0.5">
                      View all <ChevronRight size={9} />
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {DEALS_PREVIEW.map((d, i) => (
                      <div key={i} className="flex items-center gap-2.5">
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${d.dot}`} />
                        <p className="text-xs font-medium flex-1">{d.label}</p>
                        <p className={`text-xs font-black tabular-nums ${d.color}`}>{d.saving}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t border-border/30">
                    <p className="text-xs text-muted-foreground/50">Pre-negotiated rates ready to activate</p>
                  </div>
                </div>
              </Link>
            )}
          </div>

          {/* ── YOUR INFRASTRUCTURE ── */}
          <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
            <div className="px-6 py-4 border-b border-border/30 flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">Your infrastructure</p>
              <Link to="/ConnectTools">
                <button className="text-[11px] font-semibold text-muted-foreground/50 hover:text-foreground transition-colors flex items-center gap-1">
                  <Plug size={10} /> Connect tools
                </button>
              </Link>
            </div>
            <div className="divide-y divide-border/20">
              {[
                { label: "Payments", value: latest.details?.payment_current_rate ? `${latest.details.payment_current_rate.toFixed(1)}% fee rate` : "Rate not connected", status: "warn", icon: CreditCard },
                { label: "Shipping", value: latest.details?.shipping_current_avg ? `€${latest.details.shipping_current_avg.toFixed(2)}/shipment` : "Rate not connected", status: "warn", icon: Truck },
                { label: "SaaS stack", value: latest.details?.saas_current_total ? `€${latest.details.saas_current_total.toLocaleString()}/mo` : "Tools not listed", status: "neutral", icon: Package },
              ].map((row, i) => (
                <div key={i} className="px-6 py-3.5 flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <row.icon size={12} className="text-muted-foreground/50" />
                  </div>
                  <p className="text-xs font-semibold text-muted-foreground/70 w-20 shrink-0">{row.label}</p>
                  <p className="text-xs font-bold flex-1">{row.value}</p>
                  {row.status === "warn" ? (
                    <span className="flex items-center gap-1 text-[10px] text-orange-500 font-semibold bg-orange-500/[0.08] border border-orange-500/20 px-2 py-0.5 rounded-full">
                      <AlertTriangle size={8} /> Estimated
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground/40 bg-secondary px-2 py-0.5 rounded-full">
                      Estimated
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

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