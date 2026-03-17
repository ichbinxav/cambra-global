import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, TrendingDown, Zap, Package, Shield, ArrowUpRight, BarChart2, Users, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import AnimatedCounter from "@/components/shared/AnimatedCounter";
import DataQualityBanner from "@/components/shared/DataQualityBanner";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";

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

  if (loading) return (
    <div className="flex items-center justify-center py-40">
      <div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Data quality banner — shown when results exist but are based on manual data */}
      {latest && <DataQualityBanner variant="banner" />}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-1.5">Infrastructure command center</p>
          <h1 className="text-3xl font-black tracking-[-0.03em]">
            {user?.full_name ? `${user.full_name.split(" ")[0]}.` : "Dashboard"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Powering independent commerce.</p>
        </div>
        <Link to="/Analyzer">
          <Button size="sm" className="h-9 rounded-full px-5 text-xs font-bold shadow-sm gap-1.5">
            New Analysis <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>

      {!latest ? (
        <div className="text-center py-24 border border-dashed border-border/50 rounded-2xl">
          <div className="text-5xl mb-5 select-none text-muted-foreground/10">✱</div>
          <h3 className="text-xl font-bold tracking-tight mb-2">No analysis yet</h3>
          <p className="text-muted-foreground text-sm mb-8 max-w-xs mx-auto">Run the Analyzer to see how much you can save on your infrastructure.</p>
          <Link to="/Analyzer">
            <Button className="rounded-full px-8 text-sm font-bold shadow-sm gap-2">
              Run the Analyzer <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      ) : (
        <>
          {/* TIER 1 — Total savings hero */}
          <div className="p-8 rounded-2xl border border-foreground/10 bg-foreground text-background">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-[10px] tracking-[0.25em] uppercase opacity-40 mb-2">Annual savings potential</p>
                <div className="text-[clamp(2.5rem,7vw,4.5rem)] font-black tracking-[-0.04em] leading-none">
                  <AnimatedCounter value={latest.total_savings} prefix="€" suffix="/yr" duration={1.5} />
                </div>
                <p className="text-sm opacity-40 mt-3">Based on your latest infrastructure analysis</p>
              </div>
              <TrendingDown size={20} className="opacity-20 mt-1 shrink-0" />
            </div>
            <div className="flex items-center gap-4 mt-5 pt-5 border-t border-background/10">
              <Link to={`/Results?id=${latest.id}`} className="flex items-center gap-1.5 text-xs opacity-60 hover:opacity-100 transition-opacity font-medium">
                View full report <ArrowUpRight size={11} />
              </Link>
              <Link to="/Deals" className="flex items-center gap-1.5 text-xs opacity-60 hover:opacity-100 transition-opacity font-medium">
                Activate deals <ArrowUpRight size={11} />
              </Link>
            </div>
          </div>

          {/* TIER 2 — Category breakdown */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Payments", value: latest.payment_savings, icon: Zap, color: "text-blue-600", bg: "bg-blue-500/[0.06]" },
              { label: "Shipping", value: latest.shipping_savings, icon: Package, color: "text-green-600", bg: "bg-green-500/[0.06]" },
              { label: "SaaS", value: latest.saas_savings, icon: BarChart2, color: "text-orange-500", bg: "bg-orange-500/[0.06]" },
            ].map((item, i) => (
              <div key={i} className="p-5 rounded-2xl border border-border/50 bg-card">
                <div className={`w-8 h-8 rounded-lg ${item.bg} flex items-center justify-center mb-3`}>
                  <item.icon size={14} className={item.color} />
                </div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-1">{item.label}</p>
                <div className={`text-xl font-black tracking-tight ${item.color}`}>
                  <AnimatedCounter value={item.value} prefix="€" duration={1.5} />
                </div>
                <p className="text-[11px] text-muted-foreground/40 mt-0.5">/year</p>
              </div>
            ))}
          </div>

          {/* Infra score + chart */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-6 rounded-2xl border border-border/50 bg-card flex items-center gap-5">
              <div className="relative w-16 h-16 shrink-0">
                {(() => {
                  const score = latest.infra_score || 0;
                  const c = 2 * Math.PI * 26;
                  const color = score >= 70 ? "#22c55e" : score >= 40 ? "#f97316" : "#3b82f6";
                  return (
                    <svg className="w-16 h-16 -rotate-90" viewBox="0 0 60 60">
                      <circle cx="30" cy="30" r="26" fill="none" stroke="hsl(var(--border))" strokeWidth="5" />
                      <circle cx="30" cy="30" r="26" fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
                        strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
                      <text x="30" y="35" textAnchor="middle" fill={color} fontSize="13" fontWeight="900" transform="rotate(90 30 30)">{score}</text>
                    </svg>
                  );
                })()}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-1">Infra score</p>
                <div className="flex items-center gap-1.5 mb-1">
                  <Shield size={12} className="text-muted-foreground/40" />
                  <p className="text-base font-bold">
                    {(latest.infra_score || 0) >= 70 ? "Strong" : (latest.infra_score || 0) >= 40 ? "Moderate" : "Needs work"}
                  </p>
                </div>
                <Link to={`/Results?id=${latest.id}`} className="text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors">
                  Full report →
                </Link>
              </div>
            </div>

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
                    <p className="text-base font-bold">4 live deals available</p>
                    <p className="text-xs text-muted-foreground mt-1">Pre-negotiated rates ready to activate</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground/40 group-hover:text-foreground transition-colors mt-4">
                    View deals <ArrowRight size={12} />
                  </div>
                </div>
              </Link>
            )}
          </div>

          {/* Quick actions */}
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