import { motion, useInView, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { ArrowDownRight, Zap } from "lucide-react";

/**
 * HowItWorksSimple — editorial, tense, alive.
 * Dark surface, oversized numerals, asymmetric rows, scroll-linked spine.
 */
const STEPS = [
  {
    n: "01",
    tag: "INGEST",
    title: "We scan your stack.",
    body: "Connect your tools or drop an invoice. We read every real cost across 8 layers — payments, shipping, SaaS, banking, FX, in-store, insurance, telecom.",
    meta: "8 cost layers · 15 min refresh",
  },
  {
    n: "02",
    tag: "BENCHMARK",
    title: "We compare you to peers.",
    body: "Brands your size, in your country. Every line item, side by side. The drift you can't see alone becomes obvious.",
    meta: "Continuous · per-tier · per-region",
  },
  {
    n: "03",
    tag: "RECOVER",
    title: "You take the margin back.",
    body: "We renegotiate or swap what's overpriced. You only pay if we save you money. No subscription. No retainer.",
    meta: "Success-fee only · aligned incentives",
  },
];

export default function HowItWorksSimple() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.8", "end 0.2"] });
  const spineHeight = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  return (
    <section ref={ref} className="relative py-28 md:py-36 px-5 bg-neon-1 text-neon-9 overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/3 -left-32 w-[40rem] h-[40rem] rounded-full blur-[140px] opacity-40"
          style={{ background: "radial-gradient(circle, rgba(31,78,216,0.35), transparent 60%)" }}
        />
        <div
          className="absolute bottom-0 -right-32 w-[36rem] h-[36rem] rounded-full blur-[140px] opacity-30"
          style={{ background: "radial-gradient(circle, rgba(44,167,193,0.3), transparent 60%)" }}
        />
        <div className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
      </div>

      <div className="relative max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-16 md:mb-24 max-w-3xl">
          <div className="inline-flex items-center gap-2 mb-6 px-2.5 py-1.5 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-sm">
            <Zap className="h-3 w-3 text-cambra-mint" />
            <span className="text-[10px] font-mono tracking-[0.22em] uppercase text-white/60">
              How it works
            </span>
          </div>
          <h2 className="font-display text-[clamp(2rem,5.5vw,4.2rem)] font-black tracking-[-0.05em] leading-[0.88]">
            Three moves.<br />
            <span className="text-saas-gradient">Margin back on the table.</span>
          </h2>
          <p className="mt-6 text-base md:text-lg text-white/55 max-w-xl leading-relaxed">
            No dashboards to learn. No long onboarding. We do the heavy work — you keep the margin.
          </p>
        </div>

        {/* Steps — asymmetric rows with animated spine */}
        <div className="relative">
          {/* Vertical spine (desktop) */}
          <div className="absolute left-[80px] top-0 bottom-0 w-px hidden md:block">
            <div className="absolute inset-0 bg-white/10" />
            <motion.div
              className="absolute top-0 left-0 right-0 bg-gradient-to-b from-cambra-mint via-cambra-lilac to-transparent"
              style={{ height: spineHeight }}
            />
          </div>

          {STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: i * 0.15, ease: [0.22, 1, 0.36, 1] }}
              className="relative group"
            >
              {/* Connector dot on spine */}
              <div className="absolute left-[80px] top-12 -translate-x-1/2 hidden md:block z-10">
                <div className="relative h-3 w-3">
                  <div className="absolute inset-0 rounded-full bg-neon-1 border border-white/30" />
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{ background: i === 0 ? "#2CA7C1" : i === 1 ? "#1F4ED8" : "#8B5CF6" }}
                    animate={{ scale: [1, 1.6, 1], opacity: [0.4, 0, 0.4] }}
                    transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.4 }}
                  />
                  <div
                    className="absolute inset-[3px] rounded-full"
                    style={{ background: i === 0 ? "#2CA7C1" : i === 1 ? "#1F4ED8" : "#8B5CF6" }}
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-[160px_1fr] gap-6 md:gap-12 py-10 md:py-16 border-b border-white/[0.06] last:border-0">
                {/* Oversized numeral */}
                <div className="relative">
                  <div className="flex md:block items-baseline gap-4">
                    <div
                      className="font-display text-[6rem] md:text-[8rem] font-black leading-[0.8] tracking-[-0.06em] tabular-nums select-none"
                      style={{
                        background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.15) 100%)",
                        WebkitBackgroundClip: "text",
                        backgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                      }}
                    >
                      {s.n}
                    </div>
                    <span className="md:hidden text-[10px] font-mono tracking-[0.25em] text-white/40">
                      {s.tag}
                    </span>
                  </div>
                  <span className="hidden md:inline-block mt-2 text-[10px] font-mono tracking-[0.25em] text-white/40">
                    {s.tag}
                  </span>
                </div>

                {/* Content */}
                <div className="relative">
                  <h3 className="font-display text-[clamp(1.5rem,3vw,2.4rem)] font-black tracking-[-0.03em] leading-[1] mb-4 text-white group-hover:translate-x-1 transition-transform duration-500">
                    {s.title}
                  </h3>
                  <p className="text-[15px] md:text-base text-white/65 leading-[1.6] max-w-xl mb-5">
                    {s.body}
                  </p>
                  <div className="inline-flex items-center gap-2 text-[10px] font-mono tracking-[0.2em] uppercase text-white/45">
                    <ArrowDownRight className="h-3 w-3 text-cambra-mint" />
                    {s.meta}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bottom recovery chips */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-20 flex flex-wrap items-center gap-2"
        >
          <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-white/35 mr-2">
            What you get →
          </span>
          {["€15K–120K / yr", "Zero upfront", "Success-fee only", "Live benchmarks", "Instant access"].map((chip) => (
            <span
              key={chip}
              className="px-3 py-1.5 text-[11px] font-medium rounded-full border border-white/15 bg-white/[0.04] backdrop-blur-sm text-white/80"
            >
              {chip}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}