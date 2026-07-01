import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowDown } from "lucide-react";

export default function PricingSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section
      ref={ref}
      className="relative py-12 md:py-16 px-5 border-t border-border/40 bg-background overflow-hidden"
    >
      <div className="absolute inset-0 dot-grid opacity-20 pointer-events-none" />

      <div className="relative max-w-5xl mx-auto">
        {/* HEADER */}
        <div className="text-center mb-12">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="inline-flex items-center justify-center gap-2 mb-6 px-3 py-1.5 rounded-full border border-border/60 bg-background/70 backdrop-blur-sm"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cambra-cyan opacity-75" style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-cyan" />
            </span>
            <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground">
              The 2-step path · Economic alignment
            </span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="font-display text-[clamp(2rem,5vw,3.2rem)] font-black tracking-[-0.04em] leading-[1]"
          >
            First analyze. <span className="text-saas-gradient">Then recover.</span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5 text-sm md:text-base text-foreground/65 max-w-xl mx-auto leading-relaxed"
          >
            Not a SaaS plan — two inevitable steps. You see the leaks first. We help you recover them after. We only earn when you do.
          </motion.p>
        </div>

        {/* TWO-STEP FLOW */}
        <div className="relative grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 sm:gap-4 md:gap-3 items-stretch mb-10">
          {/* ─── STEP 01 — ANALYZE (light) ─── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            viewport={{ once: true, margin: "-100px" }}
            className="group relative rounded-2xl overflow-hidden border border-cambra-blue/30 bg-gradient-to-br from-cambra-blue/[0.06] via-card/80 to-card/95 backdrop-blur-md p-5 sm:p-7 flex flex-col"
          >
            <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="absolute top-0 right-0 w-96 h-96 rounded-full blur-3xl bg-ambient-mint opacity-15" />
            </div>

            <div className="relative flex flex-col h-full">
              {/* Step header */}
              <div className="flex items-start justify-between mb-5">
                <div className="inline-flex items-center gap-2 px-2 py-1 rounded-full border border-cambra-blue/30 bg-cambra-blue/[0.08]">
                  <span className="text-[9px] font-mono tracking-[0.2em] uppercase text-cambra-blue font-bold">Step 01</span>
                </div>
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground/60 whitespace-nowrap">Analyze</span>
              </div>

              <h3 className="font-display text-2xl sm:text-3xl font-black tracking-[-0.03em] leading-[1] mb-2 text-foreground">
                See the leaks.
              </h3>
              <p className="text-[13px] text-foreground/65 mb-5 leading-relaxed">
                Run the audit. Get your score and recoverable margin — completely free.
              </p>

              {/* Price */}
              <div className="mb-5 pb-5 border-b border-border/40">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-4xl md:text-5xl font-black tracking-tight text-foreground leading-none">Free</span>
                  <span className="text-xs text-muted-foreground/60 line-through tabular-nums">€60/mo</span>
                </div>
                <p className="text-[11px] text-muted-foreground/60">For early operators</p>
              </div>

              <ul className="space-y-2.5 mb-6">
                {[
                  "Infrastructure audit & scoring",
                  "Real network benchmarks",
                  "Dashboard & reporting",
                  "AI-powered recommendations",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[12.5px] text-foreground/75">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-cambra-blue shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto">
                <Link to="/Analyzer">
                  <button className="w-full h-10 rounded-full font-bold text-xs bg-foreground text-background hover:opacity-90 transition flex items-center justify-center gap-1.5">
                    Run free audit <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </Link>
              </div>
            </div>
          </motion.div>

          {/* ─── CONNECTOR ARROW ─── */}
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
            viewport={{ once: true, margin: "-100px" }}
            className="flex md:flex-col items-center justify-center gap-2 py-2 md:py-0 md:px-1"
          >
            <div className="md:hidden flex flex-col items-center gap-1.5">
              <span className="text-[8px] font-mono tracking-[0.2em] uppercase text-muted-foreground/40">then</span>
              <div className="h-9 w-9 rounded-full bg-foreground flex items-center justify-center shadow-lg">
                <ArrowDown className="h-4 w-4 text-background" strokeWidth={2.5} />
              </div>
            </div>
            <div className="hidden md:flex flex-col items-center gap-2">
              <span className="text-[8px] font-mono tracking-[0.2em] uppercase text-muted-foreground/40 rotate-0">then</span>
              <div className="h-10 w-10 rounded-full bg-foreground flex items-center justify-center shadow-lg">
                <ArrowRight className="h-4 w-4 text-background" strokeWidth={2.5} />
              </div>
            </div>
          </motion.div>

          {/* ─── STEP 02 — RECOVER (navy) ─── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            viewport={{ once: true, margin: "-100px" }}
            className="group relative rounded-2xl overflow-hidden border border-cambra-cyan/25 p-5 sm:p-7 flex flex-col md:scale-[1.02] md:-translate-y-1"
            style={{
              background: "linear-gradient(135deg, rgba(31,78,216,0.28) 0%, rgba(44,167,193,0.16) 100%), linear-gradient(180deg, hsl(222 60% 8%) 0%, hsl(222 65% 5%) 100%)",
              boxShadow: "0 0 60px rgba(44,167,193,0.32), 0 0 0 1px rgba(44,167,193,0.15), 0 1px 0 hsl(0 0% 100% / 0.10) inset, 0 32px 80px -28px rgba(0,0,0,0.7)"
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

            <div className="relative flex flex-col h-full">
              {/* Step header */}
              <div className="flex items-start justify-between mb-5">
                <div className="inline-flex items-center gap-2 px-2 py-1 rounded-full border border-cambra-cyan/40 bg-cambra-cyan/[0.12]">
                  <span className="relative flex h-1 w-1">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-cambra-cyan opacity-75" style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
                    <span className="relative inline-flex h-1 w-1 rounded-full bg-cambra-cyan" />
                  </span>
                  <span className="text-[9px] font-mono tracking-[0.2em] uppercase text-cambra-cyan font-bold">Step 02 · Where value lives</span>
                </div>
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/50 whitespace-nowrap">Recover</span>
              </div>

              <h3 className="font-display text-2xl sm:text-3xl font-black tracking-[-0.03em] leading-[1] mb-2">
                <span style={{
                  background: "linear-gradient(135deg, #ffffff 0%, #B8D8E0 55%, #2CA7C1 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text"
                }}>
                  Fix them.
                </span>
              </h3>
              <p className="text-[13px] text-white/65 mb-5 leading-relaxed">
                We negotiate, migrate and verify. You keep the majority of recovered margin.
              </p>

              {/* Price */}
              <div className="mb-5 pb-5 border-b border-white/10">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-4xl md:text-5xl font-black tracking-tight leading-none tabular-nums"
                    style={{
                      background: "linear-gradient(135deg, #ffffff 0%, #B8D8E0 55%, #2CA7C1 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text"
                    }}>
                    25%
                  </span>
                  <span className="text-xs text-white/55">of verified savings</span>
                </div>
                <p className="text-[11px] text-white/45">No upfront. Only on real recovery.</p>
              </div>

              <ul className="space-y-2.5 mb-6">
                {[
                  "Provider negotiation",
                  "Savings verification",
                  "Migration support",
                  "We win when you do",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[12.5px] text-white/75">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-cambra-cyan shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto">
                <Link to="/Pricing">
                  <button className="w-full h-10 rounded-full font-bold text-xs bg-white text-[#06080F] hover:bg-white/90 transition flex items-center justify-center gap-1.5">
                    How it works <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </Link>
              </div>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="text-center"
        >
          <p className="text-[11px] font-mono tracking-wider text-muted-foreground/60">
            Step 01 is always free · Step 02 only when we actually recover for you
          </p>
        </motion.div>
      </div>
    </section>
  );
}