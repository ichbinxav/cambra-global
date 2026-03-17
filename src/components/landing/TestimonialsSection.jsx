import RevealOnScroll from "@/components/shared/RevealOnScroll";

const testimonials = [
  {
    quote: "This changed how we think about our business. We had no idea how much leverage we were leaving on the table.",
    author: "Founder",
    company: "Fashion Brand · Berlin",
  },
  {
    quote: "We realized we were massively overpaying on payments alone. THE Node gave us the numbers we needed.",
    author: "DTC Operator",
    company: "Beauty Brand · Amsterdam",
  },
  {
    quote: "The infrastructure layer we didn't know we needed. Essential for any serious independent brand.",
    author: "Co-Founder",
    company: "Wellness Brand · London",
  },
];

export default function TestimonialsSection() {
  return (
    <section className="py-32 px-6 border-t border-border/40">
      <div className="max-w-5xl mx-auto">
        <RevealOnScroll>
          <p className="text-[10px] tracking-[0.35em] uppercase text-muted-foreground mb-5 text-center">What members say</p>
          <h2 className="text-[clamp(2rem,4vw,3.5rem)] font-bold tracking-[-0.03em] leading-[0.92] text-center mb-20">
            Built for brands that
            <br />
            <span className="text-foreground/20">think differently.</span>
          </h2>
        </RevealOnScroll>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((t, i) => (
            <RevealOnScroll key={i} delay={i * 0.1}>
              <div className="flex flex-col h-full p-8 rounded-2xl border border-border/60 bg-card/40 hover:bg-card hover:border-foreground/10 transition-all">
                <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground/40 mb-5">✱ Member</p>
                <blockquote className="text-[1.05rem] leading-relaxed tracking-tight font-medium mb-8 flex-1">
                  "{t.quote}"
                </blockquote>
                <div>
                  <p className="text-sm font-semibold">{t.author}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t.company}</p>
                </div>
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}