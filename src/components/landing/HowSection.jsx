import RevealOnScroll from "@/components/shared/RevealOnScroll";
import SectionDivider from "@/components/shared/SectionDivider";

const steps = [
  {
    num: "01",
    title: "Join",
    desc: "Apply to join the network. Tell us about your brand, your channels, your stack."
  },
  {
    num: "02",
    title: "Connect",
    desc: "Run the Analyzer. We map your infrastructure and identify every inefficiency."
  },
  {
    num: "03",
    title: "Unlock",
    desc: "Access network rates, optimized infrastructure, and collective economics."
  },
  {
    num: "04",
    title: "Scale",
    desc: "Grow faster with lower costs, better margins, and the power of 1,000+ brands."
  }
];

export default function HowSection() {
  return (
    <section id="how" className="py-24 px-6">
      <SectionDivider />
      <div className="max-w-5xl mx-auto">
        <RevealOnScroll>
          <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-6 text-center">How it works</p>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tighter text-center mb-20">
            Four steps to<br />
            <span className="text-muted-foreground/40">unlimited leverage.</span>
          </h2>
        </RevealOnScroll>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {steps.map((step, i) => (
            <RevealOnScroll key={i} delay={i * 0.1}>
              <div className="group">
                <div className="mb-4 text-xs tracking-[0.2em] text-muted-foreground">{step.num}</div>
                <div className="h-px w-full bg-border mb-6 group-hover:bg-foreground transition-colors duration-500" />
                <h3 className="text-2xl font-semibold tracking-tight mb-3">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}