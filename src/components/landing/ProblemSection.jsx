import { CreditCard, Truck, Layers, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const PROBLEMS = [
  {
    icon: CreditCard,
    metric: "2.9%",
    label: "Avg. payment fee",
    benchmark: "Network: 1.4%",
    delta: "You overpay by 107%",
    annual: "€18K–€38K/yr lost",
    color: "text-blue-600",
    bg: "bg-blue-500/[0.05] border-blue-500/20",
    barColor: "#3b82f6",
    yours: 72, // % of bar (2.9/4 * 100)
    theirs: 35, // % of bar (1.4/4 * 100)
  },
  {
    icon: Truck,
    metric: "+23%",
    label: "Shipping overspend vs. enterprise",
    benchmark: "Volume-based gap",
    delta: "Pay enterprise prices without the scale",
    annual: "€12K–€24K/yr lost",
    color: "text-orange-500",
    bg: "bg-orange-500/[0.05] border-orange-500/20",
    barColor: "#f97316",
    yours: 85,
    theirs: 62,
  },
  {
    icon: Layers,
    metric: "€28K",
    label: "Avg. SaaS waste per year",
    benchmark: "Redundant & overpriced tools",
    delta: "30% of SaaS spend is recoverable",
    annual: "€8K–€28K/yr lost",
    color: "text-green-600",
    bg: "bg-green-500/[0.05] border-green-500/20",
    barColor: "#22c55e",
    yours: 78,
    theirs: 55,
  },
];

export default function ProblemSection() {
  return (
    <section className="py-24 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto">

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-16 items-start">

          {/* Left — headline */}
          <div className="lg:sticky lg:top-24">
            <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-5 flex items-center gap-2">
              <span className="w-4 h-px bg-border" /> The problem
            </p>
            <h2 className="text-[clamp(2.2rem,5vw,4rem)] font-black tracking-[-0.04em] leading-[0.88] mb-5">
              Independent brands<br />pay enterprise<br />prices — without<br />the leverage.
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-6 max-w-xs">
              Large retailers negotiate rates well below market. You pay full price for the same infrastructure.
            </p>

            {/* Total lost */}
            <div className="p-5 rounded-2xl border border-border/40 bg-card mb-6">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40 mb-1">Total average overspend</p>
              <p className="text-3xl font-black">€29,000<span className="text-base font-normal text-muted-foreground">/year</span></p>
              <p className="text-xs text-muted-foreground/50 mt-1">Across payments, shipping, and SaaS</p>
            </div>

            <Link to="/Analyzer">
              <button className="flex items-center gap-2 text-sm font-semibold hover:gap-3 transition-all">
                See my overspend <ArrowRight size={13} />
              </button>
            </Link>
          </div>

          {/* Right — visual comparison cards */}
          <div className="space-y-4">
            {PROBLEMS.map((item, i) => (
              <div key={i} className={`p-6 rounded-2xl border ${item.bg}`}>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${item.bg}`}>
                      <item.icon size={15} className={item.color} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground/50">{item.benchmark}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-2xl font-black tabular-nums ${item.color}`}>{item.metric}</p>
                    <p className={`text-[10px] font-semibold ${item.color} opacity-70`}>{item.annual}</p>
                  </div>
                </div>

                {/* Comparison bars */}
                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] text-muted-foreground/50">You</span>
                      <span className="text-[10px] font-semibold text-muted-foreground/70">{item.yours}% of max</span>
                    </div>
                    <div className="h-2 rounded-full bg-border/30 overflow-hidden">
                      <div className="h-full rounded-full opacity-70" style={{ width: `${item.yours}%`, background: item.barColor }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] text-muted-foreground/50">Network rate</span>
                      <span className="text-[10px] font-semibold text-green-600">{item.theirs}% of max</span>
                    </div>
                    <div className="h-2 rounded-full bg-border/30 overflow-hidden">
                      <div className="h-full rounded-full bg-green-500 opacity-70" style={{ width: `${item.theirs}%` }} />
                    </div>
                  </div>
                </div>

                <p className={`text-[11px] font-medium mt-3 ${item.color}`}>{item.delta}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}