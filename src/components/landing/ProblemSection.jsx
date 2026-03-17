import { CreditCard, Truck, Layers } from "lucide-react";

const stats = [
  {
    icon: CreditCard,
    value: "2.9%",
    label: "Average payment fee",
    note: "Network benchmark: 1.4%",
    delta: "−52% with THE NoDE",
    color: "text-blue-600",
  },
  {
    icon: Truck,
    value: "+23%",
    label: "Shipping overspend vs. enterprise",
    note: "Volume-based rate gap",
    delta: "Close the gap now",
    color: "text-orange-500",
  },
  {
    icon: Layers,
    value: "€28K",
    label: "Avg. SaaS waste per year",
    note: "Redundant & overpriced tools",
    delta: "Group licenses available",
    color: "text-green-600",
  },
];

export default function ProblemSection() {
  return (
    <section className="py-24 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-16 items-center">

          <div>
            <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/60 mb-5 flex items-center gap-2">
              <span className="w-4 h-px bg-border inline-block" /> The problem
            </p>
            <h2 className="text-[clamp(2rem,4.5vw,3.75rem)] font-black tracking-[-0.04em] leading-[0.9] mb-6">
              Independent brands<br />
              pay enterprise prices<br />
              without the leverage.
            </h2>
            <p className="text-muted-foreground leading-relaxed text-base max-w-sm">
              While large retailers negotiate rates well below market, independent brands pay full retail — or more — for the exact same infrastructure.
            </p>
          </div>

          <div className="space-y-3">
            {stats.map((stat, i) => (
              <div key={i} className="p-6 rounded-2xl border border-border/50 bg-card flex items-center gap-5">
                <div className={`w-10 h-10 rounded-xl border border-border/50 flex items-center justify-center shrink-0 ${stat.color} bg-current/5`}
                  style={{ background: "hsl(var(--secondary))" }}>
                  <stat.icon size={16} className={stat.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{stat.label}</p>
                  <p className="text-[11px] text-muted-foreground/50">{stat.note}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl font-black tracking-tight tabular-nums">{stat.value}</p>
                  <p className={`text-[10px] font-semibold mt-0.5 ${stat.color}`}>{stat.delta}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}