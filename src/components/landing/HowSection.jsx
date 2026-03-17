import RevealOnScroll from "@/components/shared/RevealOnScroll";

const steps = [
  { num: "01", title: "Join", desc: "Apply to join the network. Tell us about your brand, your channels, your infrastructure stack." },
  { num: "02", title: "Analyze", desc: "Run the Analyzer. We map your infrastructure and surface every inefficiency in minutes." },
  { num: "03", title: "Unlock", desc: "Access network rates, optimized infrastructure, and the collective economics of 1,000+ brands." },
  { num: "04", title: "Scale", desc: "Grow faster with lower costs, better margins, and the compounding power of a real network." },
];

export default function HowSection() {
  return (
    <section id="how" className="py-32 px-6 border-t border-border/40">
      <div className="max-w-5xl mx-auto">
        <RevealOnScroll>
          <p className="text-[10px] tracking-[0.35em] uppercase text-muted-foreground mb-5 text-center">How it works</p>
          <h2 className="text-[clamp(2.2rem,5vw,4.5rem)] font-bold tracking-[-0.03em] leading-[0.92] text-center mb-24">
            Four steps to<br />
            <span className="text-foreground/20">unlimited leverage.</span>
          </h2>
        </RevealOnScroll>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-6">
          {steps.map((step, i) => (
            <RevealOnScroll key={i} delay={i * 0.12}>
              <div className="group">
                <div className="mb-5 text-[10px] tracking-[0.25em] uppercase text-muted-foreground/50">{step.num}</div>
                <div className="h-px w-full bg-border mb-6 group-hover:bg-foreground transition-colors duration-700" />
                <h3 className="text-2xl font-bold tracking-tight mb-3">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}