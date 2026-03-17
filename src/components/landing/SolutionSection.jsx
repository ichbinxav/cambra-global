import RevealOnScroll from "@/components/shared/RevealOnScroll";

const pillars = [
  {
    num: "01",
    title: "Identify overspend",
    desc: "The Analyzer maps your payments, shipping, and SaaS against network benchmarks to show you exactly where you're paying too much.",
  },
  {
    num: "02",
    title: "Unlock network rates",
    desc: "Access pre-negotiated infrastructure deals across payments, carriers, and tools — collectively secured for brands at any scale.",
  },
  {
    num: "03",
    title: "Improve over time",
    desc: "Track savings, benchmark performance, and continuously optimize your infrastructure as the network grows in leverage.",
  },
];

export default function SolutionSection() {
  return (
    <section id="how" className="py-28 px-5 border-t border-border/40 bg-secondary/20">
      <div className="max-w-6xl mx-auto">
        <RevealOnScroll>
          <div className="text-center mb-16">
            <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/60 mb-5 flex items-center justify-center gap-2">
              <span className="w-4 h-px bg-border inline-block" /> The solution
            </p>
            <h2 className="text-[clamp(2rem,5vw,4.5rem)] font-black tracking-[-0.04em] leading-[0.9]">
              Collective leverage.<br />Individual savings.
            </h2>
          </div>
        </RevealOnScroll>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {pillars.map((p, i) => (
            <RevealOnScroll key={i} delay={i * 0.08}>
              <div className="p-8 rounded-2xl bg-background border border-border/50 h-full">
                <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/40 mb-5">{p.num}</p>
                <div className="w-6 h-px bg-foreground/20 mb-5" />
                <h3 className="text-xl font-bold tracking-tight mb-3">{p.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}