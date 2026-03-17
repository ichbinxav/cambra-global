import RevealOnScroll from "@/components/shared/RevealOnScroll";
import { motion } from "framer-motion";

const testimonials = [
  {
    quote: "This changed how we understand our business. We had no idea how much leverage we were leaving on the table.",
    author: "Founder",
    company: "Fashion Brand · Berlin",
    size: "€2.4M ARR",
  },
  {
    quote: "We discovered costs we weren't seeing. THE NoDE gave us the benchmarks we needed to negotiate properly.",
    author: "DTC Operator",
    company: "Beauty Brand · Amsterdam",
    size: "€1.1M ARR",
  },
  {
    quote: "The infrastructure layer we didn't know we needed. It's becoming essential for how we think about scaling.",
    author: "Co-Founder",
    company: "Wellness Brand · London",
    size: "€4.8M ARR",
  },
];

export default function TestimonialsSection() {
  return (
    <section className="py-36 px-6 border-t border-border/40">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-16 items-start">
          <div className="lg:sticky lg:top-24">
            <RevealOnScroll>
              <span className="inline-flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-muted-foreground/60 mb-7">
                <span className="w-4 h-px bg-border inline-block" /> Members
              </span>
              <h2 className="text-[clamp(2.4rem,5vw,4.5rem)] font-black tracking-[-0.04em] leading-[0.88]">
                Built for brands that
                <br />
                <span className="text-foreground/20">think differently.</span>
              </h2>
            </RevealOnScroll>
          </div>

          <div className="space-y-4">
            {testimonials.map((t, i) => (
              <RevealOnScroll key={i} delay={i * 0.1}>
                <motion.div
                  className="group p-8 rounded-2xl border border-border/50 bg-card/40 hover:bg-card hover:border-border transition-all"
                  whileHover={{ x: 4 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                >
                  <div className="flex items-start justify-between gap-4 mb-6">
                    <span className="text-3xl text-muted-foreground/20 font-serif leading-none">"</span>
                    <span className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground/40 bg-secondary/60 px-2.5 py-1 rounded-full">{t.size}</span>
                  </div>
                  <blockquote className="text-[1.08rem] leading-relaxed tracking-[-0.01em] font-medium mb-6">
                    {t.quote}
                  </blockquote>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold">
                      {t.author[0]}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{t.author}</p>
                      <p className="text-xs text-muted-foreground">{t.company}</p>
                    </div>
                  </div>
                </motion.div>
              </RevealOnScroll>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}