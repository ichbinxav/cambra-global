import RevealOnScroll from "@/components/shared/RevealOnScroll";

const stats = [
  { stat: "2.9%", label: "Avg. payment fee for independents", note: "Enterprise pays 1.4%" },
  { stat: "40%", label: "More spent on shipping vs. enterprise", note: "No collective leverage" },
  { stat: "€18K+", label: "Annual SaaS overspend per brand", note: "Redundant tools stack" },
];

export default function ProblemSection() {
  return (
    <section className="py-32 px-6 border-t border-border/40">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <RevealOnScroll>
              <p className="text-[10px] tracking-[0.35em] uppercase text-muted-foreground mb-5">The Problem</p>
            </RevealOnScroll>
            <RevealOnScroll delay={0.1}>
              <h2 className="text-[clamp(2.2rem,5vw,4.5rem)] font-bold tracking-[-0.03em] leading-[0.92] mb-7">
                Independents operate
                <br />
                <span className="text-foreground/20">with zero leverage.</span>
              </h2>
            </RevealOnScroll>
            <RevealOnScroll delay={0.2}>
              <p className="text-muted-foreground leading-relaxed text-lg max-w-md">
                Enterprise brands negotiate better rates, access better infrastructure, and scale faster — not because they're better, but because they're bigger. Independent brands pay the highest fees, get the worst terms, and have no negotiating power.
              </p>
            </RevealOnScroll>
          </div>

          <div className="space-y-4">
            {stats.map((item, i) => (
              <RevealOnScroll key={i} delay={0.1 + i * 0.1} direction="left">
                <div className="group p-7 rounded-2xl border border-border/60 bg-card/50 hover:border-foreground/10 hover:bg-card transition-all">
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-4xl font-bold tracking-tight">{item.stat}</p>
                    <span className="text-[10px] tracking-[0.1em] uppercase text-muted-foreground/60 bg-secondary px-2 py-1 rounded-full mt-1">{item.note}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                </div>
              </RevealOnScroll>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}