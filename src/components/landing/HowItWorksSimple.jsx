import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Activity, Plug, BarChart3, Sparkles } from "lucide-react";

/**
 * HowItWorksSimple — Landing version. Mirrors the 4 steps shown on /HowItWorks
 * with the same content, CTA pills and visual style.
 */
const STEPS = [
  {
    n: "01",
    eyebrow: "ingest",
    icon: Plug,
    title: "Connect your stack",
    detail: "Link payments, shipping, accounting and SaaS tools — or upload statements. Read-only, encrypted, never shared.",
    points: ["OAuth integrations", "PDF/CSV ingestion", "Manual fallback"],
    cta: { label: "Connect your tools", href: "/ConnectTools" },
  },
  {
    n: "02",
    eyebrow: "analyze",
    icon: Activity,
    title: "We scan your infrastructure",
    detail: "CAMBRA maps your real rates, volumes and costs across 8 operational layers — automatically.",
    points: ["Effective payment rates", "Carrier benchmarks", "SaaS spend audit"],
    cta: { label: "Run the analyzer", href: "/Analyzer" },
  },
  {
    n: "03",
    eyebrow: "compare",
    icon: BarChart3,
    title: "Benchmark against the network",
    detail: "Your numbers are compared against operators of similar scale — surfacing exact savings opportunities.",
    points: ["Peer benchmarks", "Infrastructure score", "Margin leak alerts"],
    cta: { label: "See your score", href: "/Dashboard" },
  },
  {
    n: "04",
    eyebrow: "save",
    icon: Sparkles,
    title: "Activate better terms",
    detail: "Move into stronger commercial conditions through CAMBRA's network — performance-based, no upfront fee.",
    points: ["Negotiated terms", "Recovery verification", "Aligned incentives"],
    cta: { label: "Unlock your savings", href: "/Dashboard" },
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
        {/* Header */}
        <div className="mb-12 md:mb-16 max-w-4xl">
          <div className="flex items-center gap-2 mb-6 w-fit px-3 py-1.5 rounded-full border border-border/60 bg-background/70 backdrop-blur-sm">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cambra-cyan opacity-75" style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-cyan" />
            </span>
            <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground">How it works · 4 steps</span>
          </div>
          <h2 className="font-display text-[clamp(2.4rem,6vw,4.2rem)] font-black tracking-[-0.045em] leading-[0.92]">
            From cost data to<br />
            <span className="text-saas-gradient">recovered margin.</span>
          </h2>
          <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-xl leading-relaxed">
            No dashboards to learn. No long onboarding. We do the heavy work — you keep the margin.
          </p>
        </div>

        {/* Steps — large cinematic, same as /HowItWorks */}
        <div className="space-y-6">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.article
                key={step.n}
                initial={{ opacity: 0, y: 16 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: i * 0.05 }}
                className="cambra-card p-6 sm:p-8"
              >
                {/* CTA row — pill anchored to the right */}
                <div className="flex justify-end mb-3" style={{ position: 'relative', zIndex: 20 }}>
                  <Link
                    to={step.cta.href}
                    className="group/cta inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full border border-white/20 bg-cambra-navy-deep/80 hover:bg-cambra-navy-deep hover:border-white/40 transition-all backdrop-blur-md"
                  >
                    <span className="text-[9px] sm:text-[10px] font-bold text-white tracking-[0.08em] uppercase whitespace-nowrap">
                      {step.cta.label}
                    </span>
                    <span className="h-4 w-4 rounded-full flex items-center justify-center bg-cambra-mint transition-transform group-hover/cta:translate-x-0.5">
                      <ArrowRight className="h-2.5 w-2.5 text-cambra-navy-deep" strokeWidth={3} />
                    </span>
                  </Link>
                </div>

                <div>
                  {/* Giant cinematic number — on top */}
                  <div className="cambra-step-number mb-3">
                    {step.n}
                  </div>

                  {/* Content */}
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-2 mb-3 px-2.5 py-1.5 rounded-full border border-white/15 bg-white/[0.04] backdrop-blur-sm">
                      <Icon size={11} className="text-cambra-mint" />
                      <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-white/70">
                        {step.eyebrow}
                      </span>
                    </div>

                    <h3 className="font-display text-2xl sm:text-3xl md:text-4xl font-black tracking-[-0.035em] leading-[1] mb-3">
                      <span style={{ background: "linear-gradient(135deg, #ffffff 0%, #B8D8E0 55%, #2CA7C1 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                        {step.title}
                      </span>
                    </h3>

                    <p className="text-sm sm:text-base text-white/70 leading-relaxed max-w-2xl">
                      {step.detail}
                    </p>
                  </div>
                </div>
              </motion.article>
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