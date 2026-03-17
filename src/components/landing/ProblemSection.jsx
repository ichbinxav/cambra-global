import RevealOnScroll from "@/components/shared/RevealOnScroll";

const stats = [
  { value: "2.9%", label: "Average payment fee paid", note: "Network benchmark: 1.4%" },
  { value: "23%", label: "Shipping overspend vs. enterprise", note: "Volume-based rate gap" },
  { value: "€28K", label: "Avg. SaaS waste per year", note: "Redundant & overpriced tools" },
];

export default function ProblemSection() {
  return (
    <section className="py-28 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          <RevealOnScroll>
            <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/60 mb-5 flex items-center gap-2">
              <span className="w-4 h-px bg-border inline-block" /> The problem
            </p>
            <h2 className="text-[clamp(2rem,5vw,4rem)] font-black tracking-[-0.04em] leading-[0.9] mb-6">
              Independent brands<br />
              pay enterprise prices<br />
              without the leverage.
            </h2>
            <p className="text-muted-foreground leading-relaxed text-base max-w-sm">
              While large brands negotiate rates well below market, independent brands pay full price — or more — for the same infrastructure.
            </p>
          </RevealOnScroll>

          <div className="space-y-3">
            {stats.map((stat, i) => (
              <RevealOnScroll key={i} delay={i * 0.07}>
                <div className="p-6 rounded-2xl border border-border/50 bg-card/70 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium mb-1">{stat.label}</p>
                    <p className="text-[11px] text-muted-foreground/50">{stat.note}</p>
                  </div>
                  <div className="text-3xl font-black tracking-tight text-foreground shrink-0">{stat.value}</div>
                </div>
              </RevealOnScroll>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}