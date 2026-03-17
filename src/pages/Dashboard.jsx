import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, TrendingDown, Zap, Package, Shield, ArrowUpRight, BarChart2, Users, BookOpen, CreditCard, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import AnimatedCounter from "@/components/shared/AnimatedCounter";
import DataQualityBanner from "@/components/shared/DataQualityBanner";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";

const SCORE_LABEL = s => s >= 90 ? "Best-in-class" : s >= 80 ? "Strong" : s >= 60 ? "Good" : s >= 40 ? "Under-optimized" : "Poor";
const SCORE_COLOR = s => s >= 80 ? "#22c55e" : s >= 60 ? "#f97316" : "#3b82f6";

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
    <div className="space-y-4 pb-8">

      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="text-2xl font-black tracking-[-0.03em]">
            {user?.full_name ? `${user.full_name.split(" ")[0]}.` : "Dashboard"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Powering independent commerce.</p>
        </div>
        <Link to="/Analyzer">
          <Button size="sm" className="h-9 rounded-full px-5 text-xs font-bold shadow-sm gap-1.5">
            New Analysis <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>

      {!latest ? (
        /* ── Empty state ── */
        <div className="space-y-4">
          <DataQualityBanner variant="banner" />
          <div className="text-center py-20 border border-dashed border-border/50 rounded-2xl">
            <div className="text-5xl mb-5 select-none text-muted-foreground/10">✱</div>
            <h3 className="text-xl font-bold tracking-tight mb-2">No analysis yet</h3>
            <p className="text-muted-foreground text-sm mb-8 max-w-xs mx-auto">
              Run the Analyzer to see how much you're overpaying on infrastructure.
            </p>
            <Link to="/Analyzer">
              <Button className="rounded-full px-8 text-sm font-bold shadow-sm gap-2">
                Run the Analyzer <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Data quality banner */}
          <DataQualityBanner variant="banner" />

          {/* ── HERO: Overpaying amount ── */}
          <div className="p-7 sm:p-8 rounded-2xl border border-foreground/10 bg-foreground text-background">
            <p className="text-[10px] tracking-[0.25em] uppercase opacity-40 mb-3">You are overpaying by</p>
            <div className="text-[clamp(3rem,10vw,5.5rem)] font-black tracking-[-0.05em] leading-none mb-1">
              <AnimatedCounter value={latest.total_savings} prefix="€" duration={1.5} />
            </div>
            <p className="text-base opacity-40 mb-5">per year on your infrastructure</p>

            {/* Score inline */}
            <div className="flex items-center gap-3 mb-5 pb-5 border-b border-background/10">
              {(() => {
                const c = 2 * Math.PI * 10;
                return (
                  <svg className="w-8 h-8 -rotate-90 shrink-0" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2.5" />
                    <circle cx="12" cy="12" r="10" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"
                      strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
                  </svg>
                );
              })()}
              <div>
                <span className="text-sm font-black opacity-90">Infra Score: {score}/100</span>
                <span className="ml-2 text-xs opacity-40">{SCORE_LABEL(score)}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <Link to={`/Results?id=${latest.id}`} className="flex items-center gap-1.5 text-xs opacity-70 hover:opacity-100 transition-opacity font-semibold">
                Full report <ArrowUpRight size={11} />
              </Link>
              <Link to="/Deals" className="flex items-center gap-1.5 text-xs opacity-70 hover:opacity-100 transition-opacity font-semibold">
                Activate deals <ArrowUpRight size={11} />
              </Link>
              <Link to="/ConnectTools" className="flex items-center gap-1.5 text-xs opacity-70 hover:opacity-100 transition-opacity font-semibold">
                Connect tools <ArrowUpRight size={11} />
              </Link>
            </div>
          </div>

          {/* ── TIER 2: Category breakdown ── */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Payments", value: latest.payment_savings, icon: CreditCard, color: "text-blue-600", bg: "bg-blue-500/[0.06]", border: "border-blue-500/15" },
              { label: "Shipping", value: latest.shipping_savings, icon: Truck, color: "text-green-600", bg: "bg-green-500/[0.06]", border: "border-green-500/15" },
              { label: "SaaS", value: latest.saas_savings, icon: Package, color: "text-orange-500", bg: "bg-orange-500/[0.06]", border: "border-orange-500/15" },
            ].map((item, i) => (
              <div key={i} className={`p-4 sm:p-5 rounded-2xl border ${item.border} ${item.bg}`}>
                <item.icon size={13} className={`mb-3 ${item.color}`} />
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 mb-1">{item.label}</p>
                <div className={`text-lg sm:text-xl font-black tracking-tight tabular-nums ${item.color}`}>
                  <AnimatedCounter value={item.value} prefix="€" duration={1.5} />
                </div>
                <p className="text-[10px] text-muted-foreground/40 mt-0.5">/yr</p>
              </div>
            ))}
          </div>

          {/* ── TIER 3: Score + chart ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Score card */}
            <Link to={`/Results?id=${latest.id}`}>
              <div className="p-6 rounded-2xl border border-border/50 bg-card hover:border-border transition-all h-full">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-4">Infrastructure score</p>
                <div className="flex items-center gap-4">
                  <div className="relative w-16 h-16 shrink-0">
                    {(() => {
                      const c = 2 * Math.PI * 26;
                      return (
                        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 60 60">
                          <circle cx="30" cy="30" r="26" fill="none" stroke="hsl(var(--border))" strokeWidth="5" />
                          <circle cx="30" cy="30" r="26" fill="none" stroke={scoreColor} strokeWidth="5" strokeLinecap="round"
                            strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)}
                            style={{ transition: "stroke-dashoffset 1.5s ease-out" }} />
                          <text x="30" y="35" textAnchor="middle" fill={scoreColor} fontSize="13" fontWeight="900" transform="rotate(90 30 30)">{score}</text>
                        </svg>
                      );
                    })()}
                  </div>
                  <div>
                    <p className="text-xl font-black" style={{ color: scoreColor }}>{SCORE_LABEL(score)}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {score >= 60 ? "Solid baseline — deals can push further." : "Key inefficiencies detected."}
                    </p>
                    <p className="text-[11px] text-muted-foreground/40 mt-2 flex items-center gap-1">
                      View full breakdown <ArrowRight size={10} />
                    </p>
                  </div>
                </div>
              </div>
            </Link>

            {/* Chart or deals */}
            {chartData.length > 1 ? (
              <div className="p-6 rounded-2xl border border-border/50 bg-card">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">Savings trend</p>
                  <Link to="/Reports"><Button variant="ghost" size="sm" className="h-6 text-[11px] text-muted-foreground p-0 gap-1 hover:text-foreground">Reports <ArrowUpRight size={10} /></Button></Link>
                </div>
                <ResponsiveContainer width="100%" height={80}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(215,100%,50%)" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="hsl(215,100%,50%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 11, background: "hsl(var(--card))" }} formatter={v => [`€${v?.toLocaleString()}/yr`, ""]} />
                    <Area type="monotone" dataKey="value" stroke="hsl(215,100%,50%)" strokeWidth={2} fill="url(#g)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Link to="/Deals">
                <div className="group p-6 rounded-2xl border border-border/50 bg-card hover:border-border transition-all h-full flex flex-col justify-between cursor-pointer">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-2">Network deals</p>
                    <p className="text-lg font-bold">4 live deals available</p>
                    <p className="text-xs text-muted-foreground mt-1">Pre-negotiated rates ready to activate</p>
                  </div>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground/40 group-hover:text-foreground transition-colors mt-4">
                    View deals <ArrowRight size={12} />
                  </p>
                </div>
              </Link>
            )}
          </div>

          {/* Accuracy card */}
          <DataQualityBanner variant="card" />

          {/* ── Quick actions ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { title: "Run new analysis", desc: "Update your infrastructure score", path: "/Analyzer", icon: TrendingDown, accent: true },
              { title: "Browse network", desc: "Discover member brands", path: "/Network", icon: Users },
              { title: "Read insights", desc: "Infrastructure intelligence", path: "/Insights", icon: BookOpen },
            ].map((action, i) => (
              <Link key={i} to={action.path}>
                <div className={`group p-5 rounded-2xl border transition-all cursor-pointer ${action.accent ? "border-foreground/10 bg-foreground text-background" : "border-border/50 bg-card hover:border-border"}`}>
                  <action.icon size={14} className={`mb-3 ${action.accent ? "opacity-40" : "text-muted-foreground/40"}`} />
                  <p className={`font-semibold text-sm mb-1 ${action.accent ? "text-background" : ""}`}>{action.title}</p>
                  <p className={`text-xs ${action.accent ? "text-background/50" : "text-muted-foreground"}`}>{action.desc}</p>
                  <ArrowRight size={12} className={`mt-3 group-hover:translate-x-1 transition-transform ${action.accent ? "text-background/40" : "text-muted-foreground/30"}`} />
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}