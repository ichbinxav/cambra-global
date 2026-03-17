import RevealOnScroll from "@/components/shared/RevealOnScroll";
import { motion } from "framer-motion";

const steps = [
  { num: "01", title: "Join", desc: "Apply to join the network. Tell us about your brand, channels, and infrastructure stack. Takes 2 minutes." },
  { num: "02", title: "Analyze", desc: "Run the Analyzer. We map every inefficiency across payments, shipping, and SaaS — and benchmark it against the network." },
  { num: "03", title: "Unlock", desc: "Access network rates, optimized infrastructure, and collective economics previously reserved for enterprise brands." },
  { num: "04", title: "Scale", desc: "Grow faster with lower costs, better margins, and the compounding power of 1,000+ coordinated independent brands." },
];

export default function HowSection() {
  return (
    <section id="how" className="py-36 px-6 border-t border-border/40">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-16 items-start">
          <div>
            <RevealOnScroll>
              <span className="inline-flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-muted-foreground/60 mb-7">
                <span className="w-4 h-px bg-border inline-block" /> Process
              </span>
              <h2 className="text-[clamp(2.4rem,5.5vw,5rem)] font-black tracking-[-0.04em] leading-[0.88]">
                Four steps to<br />
                <span className="text-foreground/20">unlimited</span><br />
                <span className="text-foreground/20">leverage.</span>
              </h2>
            </RevealOnScroll>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border/30 rounded-2xl overflow-hidden">
            {steps.map((step, i) => (
              <RevealOnScroll key={i} delay={i * 0.08}>
                <motion.div
                  className="group p-8 bg-background hover:bg-secondary/30 transition-all duration-300 h-full"
                  whileHover={{ y: -2 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                >
                  <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/40 mb-6">{step.num}</p>
                  <div className="h-px w-8 bg-border mb-6 group-hover:w-full group-hover:bg-foreground/20 transition-all duration-500" />
                  <h3 className="text-2xl font-bold tracking-tight mb-3">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                </motion.div>
              </RevealOnScroll>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}