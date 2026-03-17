import RevealOnScroll from "@/components/shared/RevealOnScroll";
import { motion } from "framer-motion";

const stats = [
  { stat: "2.9%", note: "avg. payment fee", sub: "Enterprise pays 1.4%", accent: true },
  { stat: "40%", note: "shipping overspend", sub: "vs. enterprise contracts", accent: false },
  { stat: "€18K+", note: "annual SaaS waste", sub: "per mid-size brand", accent: false },
];

export default function ProblemSection() {
  return (
    <section className="py-36 px-6 border-t border-border/40 overflow-hidden">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-20 items-center">

          {/* Left */}
          <div>
            <RevealOnScroll>
              <span className="inline-flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-muted-foreground/60 mb-7">
                <span className="w-4 h-px bg-border inline-block" /> The Problem
              </span>
            </RevealOnScroll>
            <RevealOnScroll delay={0.1}>
              <h2 className="text-[clamp(2.4rem,5.5vw,5rem)] font-black tracking-[-0.04em] leading-[0.88] mb-8">
                Independents operate
                <br />
                <span className="text-foreground/20">with zero</span>
                <br />
                <span className="text-foreground/20">leverage.</span>
              </h2>
            </RevealOnScroll>
            <RevealOnScroll delay={0.2}>
              <p className="text-muted-foreground leading-relaxed text-[1.05rem] max-w-md">
                Enterprise brands negotiate better rates, access better infrastructure, and scale faster — not because they're better built, but because they're bigger. Independent brands pay the highest fees, get the worst terms, and have no collective power.
              </p>
            </RevealOnScroll>
          </div>

          {/* Right: stats */}
          <div className="space-y-3">
            {stats.map((item, i) => (
              <RevealOnScroll key={i} delay={0.12 + i * 0.1} direction="left">
                <motion.div
                  className={`group p-8 rounded-2xl border transition-all duration-300 ${
                    item.accent
                      ? "border-blue-500/20 bg-blue-500/[0.03] hover:bg-blue-500/[0.06]"
                      : "border-border/50 bg-card/60 hover:bg-card hover:border-border"
                  }`}
                  whileHover={{ x: 4 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className={`text-5xl font-black tracking-tight mb-1 ${item.accent ? "text-node-blue" : ""}`}>
                        {item.stat}
                      </p>
                      <p className="text-sm font-medium text-foreground/70">{item.note}</p>
                    </div>
                    <span className="text-[10px] tracking-[0.1em] uppercase text-muted-foreground/50 bg-secondary/80 px-2.5 py-1 rounded-full mt-1 whitespace-nowrap shrink-0">
                      {item.sub}
                    </span>
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