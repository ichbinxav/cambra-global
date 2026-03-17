import { Search, Zap, TrendingUp } from "lucide-react";

const pillars = [
  {
    num: "01",
    icon: Search,
    title: "Identify overspend",
    desc: "The Analyzer benchmarks your payments, shipping, and SaaS against real network data to show exactly where you're losing money.",
    stat: "2 min",
    statLabel: "to complete",
  },
  {
    num: "02",
    icon: Zap,
    title: "Unlock network rates",
    desc: "Access pre-negotiated deals across payments, carriers, and tools — collectively secured across the entire network at volume.",
    stat: "1.4%",
    statLabel: "payment rate",
  },
  {
    num: "03",
    icon: TrendingUp,
    title: "Improve over time",
    desc: "Track savings, benchmark performance, and continuously optimize your infrastructure as the network grows in leverage.",
    stat: "€29K",
    statLabel: "avg. saved/yr",
  },
];

export default function SolutionSection() {
  return (
    <section className="py-24 px-5 border-t border-border/40 bg-secondary/20">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/60 mb-5 flex items-center justify-center gap-2">
            <span className="w-4 h-px bg-border inline-block" /> The solution
          </p>
          <h2 className="text-[clamp(2rem,5vw,4.5rem)] font-black tracking-[-0.04em] leading-[0.9]">
            Collective leverage.<br />Individual savings.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {pillars.map((p, i) => (
            <div key={i} className="p-8 rounded-2xl bg-background border border-border/50 flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/40">{p.num}</p>
                <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center">
                  <p.icon size={15} className="text-muted-foreground/60" />
                </div>
              </div>
              <h3 className="text-xl font-bold tracking-tight mb-3">{p.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed flex-1">{p.desc}</p>
              <div className="mt-6 pt-5 border-t border-border/40 flex items-center gap-3">
                <span className="text-2xl font-black tracking-tight">{p.stat}</span>
                <span className="text-[11px] text-muted-foreground/50">{p.statLabel}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}