import { Link } from "react-router-dom";
import { Search, Zap, TrendingUp, ArrowRight } from "lucide-react";

const PILLARS = [
  {
    num: "01",
    icon: Search,
    color: "text-blue-600",
    bg: "bg-blue-500/[0.07] border-blue-500/20",
    title: "Identify overspend",
    desc: "The Analyzer benchmarks your payments, shipping, and SaaS against real network data.",
    stat: "2 min",
    statLabel: "to complete",
    note: "Exact euros, not vague %",
  },
  {
    num: "02",
    icon: Zap,
    color: "text-orange-500",
    bg: "bg-orange-500/[0.07] border-orange-500/20",
    title: "Unlock network rates",
    desc: "Access pre-negotiated deals secured across 1,000+ brands at collective volume.",
    stat: "1.4%",
    statLabel: "payment rate",
    note: "Unavailable to individual brands",
  },
  {
    num: "03",
    icon: TrendingUp,
    color: "text-green-600",
    bg: "bg-green-500/[0.07] border-green-500/20",
    title: "Improve over time",
    desc: "Track savings, monitor your Infrastructure Score, and optimize continuously.",
    stat: "€29K",
    statLabel: "avg. saved/yr",
    note: "Compounds as network grows",
  },
];

export default function SolutionSection() {
  return (
    <section className="py-24 px-5 border-t border-border/40 bg-secondary/10">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="text-center mb-14">
          <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-5 flex items-center justify-center gap-2">
            <span className="w-4 h-px bg-border" /> The solution
          </p>
          <h2 className="text-[clamp(2.2rem,6vw,5rem)] font-black tracking-[-0.05em] leading-[0.88] mb-4">
            Collective leverage.<br />Individual savings.
          </h2>
          <p className="text-muted-foreground text-base max-w-sm mx-auto">
            Turn your infrastructure from a cost center into a competitive advantage.
          </p>
        </div>

        {/* System flow */}
        <div className="mb-10 p-5 rounded-2xl border border-border/50 bg-background max-w-2xl mx-auto">
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {[
              { label: "Your tools", sub: "Stripe · DHL · Shopify" },
              null,
              { label: "THE NoDE", sub: "Analysis engine", highlight: true },
              null,
              { label: "Savings", sub: "€18K–72K/yr" },
            ].map((item, i) =>
              item === null ? (
                <ArrowRight key={i} size={14} className="text-muted-foreground/30 shrink-0" />
              ) : (
                <div key={i} className={`px-4 py-2.5 rounded-xl border text-center flex-1 min-w-[100px] ${
                  item.highlight ? "bg-foreground text-background border-foreground/10" : "bg-card border-border/40"
                }`}>
                  <p className={`text-xs font-bold ${item.highlight ? "text-background" : ""}`}>{item.label}</p>
                  <p className={`text-[10px] mt-0.5 ${item.highlight ? "text-background/40" : "text-muted-foreground/40"}`}>{item.sub}</p>
                </div>
              )
            )}
          </div>
        </div>

        {/* Pillars grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PILLARS.map((p, i) => (
            <div key={i} className="p-7 rounded-2xl bg-background border border-border/50 flex flex-col group hover:border-border transition-all">
              <div className="flex items-center justify-between mb-5">
                <span className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/30">{p.num}</span>
                <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${p.bg}`}>
                  <p.icon size={15} className={p.color} />
                </div>
              </div>
              <h3 className="text-lg font-bold tracking-tight mb-2">{p.title}</h3>
              <p className="text-sm text-muted-foreground/70 leading-relaxed flex-1 mb-5">{p.desc}</p>

              <div className="pt-5 border-t border-border/30 flex items-end justify-between">
                <div>
                  <p className={`text-2xl font-black tracking-tight ${p.color}`}>{p.stat}</p>
                  <p className="text-[10px] text-muted-foreground/40">{p.statLabel}</p>
                </div>
                <p className="text-[10px] text-muted-foreground/30 text-right max-w-[90px]">{p.note}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-10">
          <Link to="/Analyzer">
            <button className="h-12 px-8 rounded-full bg-foreground text-background text-sm font-bold inline-flex items-center gap-2 hover:opacity-90 transition-opacity shadow-sm">
              See my savings <ArrowRight size={14} />
            </button>
          </Link>
        </div>

      </div>
    </section>
  );
}