import RevealOnScroll from "@/components/shared/RevealOnScroll";
import SectionDivider from "@/components/shared/SectionDivider";

export default function ProblemSection() {
  return (
    <section className="py-24 px-6">
      <SectionDivider />
      <div className="max-w-4xl mx-auto text-center">
        <RevealOnScroll>
          <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-6">The Problem</p>
        </RevealOnScroll>
        <RevealOnScroll delay={0.1}>
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tighter leading-[0.95] mb-8">
            Independents operate
            <br />
            <span className="text-muted-foreground/40">with zero leverage.</span>
          </h2>
        </RevealOnScroll>
        <RevealOnScroll delay={0.2}>
          <p className="max-w-2xl mx-auto text-lg text-muted-foreground leading-relaxed">
            Enterprise brands negotiate better rates, access better infrastructure, and scale faster — 
            not because they're better, but because they're bigger. Independent brands pay the highest 
            fees, get the worst terms, and have no negotiating power.
          </p>
        </RevealOnScroll>

        <RevealOnScroll delay={0.3}>
          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              { stat: "2.9%", label: "Average payment fee for independents" },
              { stat: "40%", label: "More spent on shipping vs. enterprise" },
              { stat: "€12K+", label: "Annual overspend on SaaS tools" },
            ].map((item, i) => (
              <div key={i} className="p-8 rounded-2xl bg-secondary/50">
                <p className="text-3xl font-bold tracking-tight mb-2">{item.stat}</p>
                <p className="text-sm text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}