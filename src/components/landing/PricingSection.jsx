import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export default function PricingSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section
      ref={ref}
      className="relative py-16 md:py-20 px-5 border-t border-border/40 bg-background overflow-hidden"
    >
      <div className="absolute inset-0 dot-grid opacity-20 pointer-events-none" />

      <div className="relative max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="inline-flex items-center gap-2 mb-5 px-2.5 py-1.5 rounded-full border border-border/60 bg-background/80 backdrop-blur-sm"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-cambra-mint" />
            <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-muted-foreground">
              Access & Recovery
            </span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="font-display text-[clamp(2rem,5vw,3.2rem)] font-black tracking-[-0.04em] leading-[1]"
          >
            Aligned with your <span className="text-saas-gradient">margin.</span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5 text-sm md:text-base text-foreground/65 max-w-xl mx-auto leading-relaxed"
          >
            Infrastructure intelligence is free for early operators. An optional recovery layer participates only in verified savings.
          </motion.p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-6 mb-12">
          {/* Intelligence Card */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            viewport={{ once: true, margin: "-100px" }}
            className="group relative rounded-2xl overflow-hidden border border-cambra-blue/40 bg-gradient-to-br from-cambra-blue/[0.08] via-card/80 to-card/95 backdrop-blur-md p-5 sm:p-8 hover:-translate-y-1 transition-transform duration-300"
          >
            <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="absolute inset-0 bg-gradient-to-br from-cambra-cyan/[0.08] to-transparent" />
              <div className="absolute top-0 right-0 w-96 h-96 rounded-full blur-3xl bg-ambient-mint opacity-15" />
            </div>
            
            <div className="relative text-left flex flex-col h-full">
              <div className="inline-flex items-center gap-2 mb-6 w-fit">
                <span className="h-1.5 w-1.5 rounded-full bg-cambra-mint" />
                <p className="text-[8px] font-bold tracking-[0.2em] uppercase text-muted-foreground/60 whitespace-nowrap">Infra Intelligence</p>
              </div>
              
              <p className="text-4xl md:text-5xl font-black tracking-tight mb-2 text-foreground leading-none">Free</p>
              <div className="flex items-baseline gap-2 mb-2 h-4">
                <span className="text-xs text-muted-foreground/60 line-through tabular-nums">€60/month</span>
              </div>
              <p className="text-sm text-muted-foreground/60 mb-8 min-h-[2.5rem]">For early operators</p>
              
              <ul className="space-y-3">
                <li className="flex items-start gap-2.5 text-xs text-foreground/70 font-medium">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cambra-mint shrink-0" />
                  <span>Infrastructure audit & scoring</span>
                </li>
                <li className="flex items-start gap-2.5 text-xs text-foreground/70 font-medium">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cambra-mint shrink-0" />
                  <span>Real network benchmarks</span>
                </li>
                <li className="flex items-start gap-2.5 text-xs text-foreground/70 font-medium">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cambra-mint shrink-0" />
                  <span>Dashboard & reporting</span>
                </li>
                <li className="flex items-start gap-2.5 text-xs text-foreground/70 font-medium">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cambra-mint shrink-0" />
                  <span>AI-powered recommendations</span>
                </li>
              </ul>
            </div>
          </motion.div>

          {/* Recovery Card */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            viewport={{ once: true, margin: "-100px" }}
            className="group relative rounded-2xl overflow-hidden border border-white/12 p-5 sm:p-8 hover:-translate-y-1 transition-transform duration-300"
            style={{
              background: "linear-gradient(135deg, rgba(31,78,216,0.24) 0%, rgba(44,167,193,0.12) 100%), linear-gradient(180deg, hsl(222 60% 8%) 0%, hsl(222 65% 5%) 100%)",
              boxShadow: "0 0 40px rgba(31,78,216,0.2), 0 1px 0 hsl(0 0% 100% / 0.08) inset, 0 24px 64px -28px rgba(0,0,0,0.6)"
            }}
          >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
              <motion.div
                className="absolute top-0 right-0 w-96 h-96 rounded-full blur-3xl"
                style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.40), transparent)" }}
                animate={{ opacity: [0.5, 0.8, 0.5] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
            
            <div className="relative text-left flex flex-col h-full">
              <div className="inline-flex items-center gap-2 mb-6 w-fit">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-cambra-cyan opacity-75" style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-cyan" />
                </span>
                <p className="text-[8px] font-bold tracking-[0.2em] uppercase text-white/50 whitespace-nowrap">Recovery Model</p>
              </div>
              
              <p className="text-4xl md:text-5xl font-black tracking-tight mb-2 leading-none">
                <span style={{
                  background: "linear-gradient(135deg, #ffffff 0%, #B8D8E0 55%, #2CA7C1 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text"
                }}>25%</span>
              </p>
              <div className="h-4 mb-2" />
              <p className="text-sm text-white/50 mb-8 min-h-[2.5rem]">Only on verified savings recovered</p>
              
              <ul className="space-y-3">
                <li className="flex items-start gap-2.5 text-xs text-white/70 font-medium">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cambra-cyan shrink-0" />
                  <span>Provider negotiation</span>
                </li>
                <li className="flex items-start gap-2.5 text-xs text-white/70 font-medium">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cambra-cyan shrink-0" />
                  <span>Savings verification</span>
                </li>
                <li className="flex items-start gap-2.5 text-xs text-white/70 font-medium">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cambra-cyan shrink-0" />
                  <span>Migration support</span>
                </li>
                <li className="flex items-start gap-2.5 text-xs text-white/70 font-medium">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cambra-cyan shrink-0" />
                  <span>We win when you do</span>
                </li>
              </ul>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="text-center"
        >
          <Link to="/Pricing">
            <button className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-full font-semibold text-sm bg-foreground text-background hover:opacity-90 transition">
              See full details <ArrowRight className="h-4 w-4" />
            </button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}