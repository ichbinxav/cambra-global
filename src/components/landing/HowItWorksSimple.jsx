import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowRight, Zap, Scan, GitCompare, TrendingUp } from "lucide-react";

/**
 * HowItWorksSimple — Hero-style section (light bg, like rest of landing),
 * with each step rendered as a navy cambra-card.
 */
const STEPS = [
  {
    n: "01",
    tag: "INGEST",
    title: "We scan your stack.",
    body: "Connect your tools or drop an invoice. We read every real cost across 8 layers — payments, shipping, SaaS, banking, FX, in-store, insurance, telecom.",
    meta: "8 cost layers · 15 min refresh",
    icon: Scan,
    accent: "#2CA7C1",
    cta: { label: "Connect your tools", href: "/ConnectTools" },
  },
  {
    n: "02",
    tag: "BENCHMARK",
    title: "We compare you to peers.",
    body: "Brands your size, in your country. Every line item, side by side. The drift you can't see alone becomes obvious.",
    meta: "Continuous · per-tier · per-region",
    icon: GitCompare,
    accent: "#1F4ED8",
    cta: { label: "Run the analyzer", href: "/Analyzer" },
  },
  {
    n: "03",
    tag: "RECOVER",
    title: "You take the margin back.",
    body: "We renegotiate or swap what's overpriced. You only pay if we save you money. No subscription. No retainer.",
    meta: "Success-fee only · aligned incentives",
    icon: TrendingUp,
    accent: "#8B5CF6",
    cta: { label: "See your savings", href: "/Dashboard" },
  },
];

export default function HowItWorksSimple() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section
      ref={ref}
      className="relative py-20 md:py-28 px-5 border-t border-border/40 bg-background overflow-hidden"
    >
      {/* Ambient (matches other landing sections) */}
      <div className="absolute inset-0 dot-grid opacity-20 pointer-events-none" />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/4 w-[36rem] h-[36rem] rounded-full blur-3xl bg-ambient-lilac opacity-[0.15]" />
        <div className="absolute bottom-0 -right-32 w-[32rem] h-[32rem] rounded-full blur-3xl bg-ambient-mint opacity-[0.12]" />
      </div>

      <div className="relative max-w-6xl mx-auto">
        {/* Header — matches MeetTheFounder / landing hero pattern */}
        <div className="mb-12 md:mb-16 max-w-4xl">
          <div className="flex items-center gap-2 mb-6 w-fit px-3 py-1.5 rounded-full border border-border/60 bg-background/70 backdrop-blur-sm">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cambra-cyan opacity-75" style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-cyan" />
            </span>
            <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground">How it works</span>
          </div>
          <h2 className="font-display text-[clamp(2.4rem,6vw,4.2rem)] font-black tracking-[-0.045em] leading-[0.92]">
            Three moves.<br />
            <span className="text-saas-gradient">Margin back on the table.</span>
          </h2>
          <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-xl leading-relaxed">
            No dashboards to learn. No long onboarding. We do the heavy work — you keep the margin.
          </p>
        </div>

        {/* Steps — grid of navy cards */}
        <div className="grid md:grid-cols-3 gap-5 md:gap-6">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 24 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.7, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                className="cambra-card p-7 md:p-8 flex flex-col"
              >
                {/* Header row: tag pill + icon */}
                <div className="flex items-center justify-between mb-6">
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-white/15 bg-white/[0.04] backdrop-blur-sm">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: s.accent }}
                    />
                    <span className="text-[10px] font-mono tracking-[0.22em] uppercase text-white/70">
                      {s.tag}
                    </span>
                  </div>
                  <div
                    className="h-9 w-9 rounded-xl flex items-center justify-center border border-white/10"
                    style={{ background: `${s.accent}1a` }}
                  >
                    <Icon className="h-4 w-4" style={{ color: s.accent }} />
                  </div>
                </div>

                {/* Oversized numeral */}
                <div
                  className="font-display text-[5.5rem] md:text-[6.5rem] font-black leading-[0.8] tracking-[-0.06em] tabular-nums select-none mb-4"
                  style={{
                    background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.15) 100%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  {s.n}
                </div>

                {/* Title */}
                <h3 className="font-display text-2xl md:text-[1.75rem] font-black tracking-[-0.03em] leading-[1.05] mb-3 text-white">
                  {s.title}
                </h3>

                {/* Body */}
                <p className="text-[14px] md:text-[15px] text-white/65 leading-[1.6] mb-6 flex-1">
                  {s.body}
                </p>

                {/* Meta */}
                <div className="inline-flex items-center gap-2 text-[10px] font-mono tracking-[0.2em] uppercase text-white/50 pt-4 border-t border-white/10">
                  <ArrowDownRight className="h-3 w-3" style={{ color: s.accent }} />
                  {s.meta}
                </div>

                {/* Step CTA */}
                <Link
                  to={s.cta.href}
                  className="group/cta mt-5 inline-flex items-center justify-between gap-2 px-4 py-3 rounded-full border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/25 transition-all backdrop-blur-sm"
                >
                  <span className="text-[13px] font-bold text-white tracking-tight">
                    {s.cta.label}
                  </span>
                  <span
                    className="h-7 w-7 rounded-full flex items-center justify-center transition-transform group-hover/cta:translate-x-0.5"
                    style={{ background: s.accent }}
                  >
                    <ArrowRight className="h-3.5 w-3.5 text-white" />
                  </span>
                </Link>
              </motion.div>
            );
          })}
        </div>

        {/* Bottom recovery chips */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-10 flex flex-wrap items-center gap-2"
        >
          <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground/60 mr-2">
            What you get →
          </span>
          {["Guaranteed infrastructure inefficiencies detected", "Business insights", "Zero upfront", "Success-fee only", "Live benchmarks", "Instant access"].map((chip) => (
            <span
              key={chip}
              className="px-3 py-1.5 text-[11px] font-medium rounded-full border border-border/60 bg-background/60 backdrop-blur-sm text-foreground/75"
            >
              {chip}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}