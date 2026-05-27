import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Activity, Plug, BarChart3, Sparkles } from "lucide-react";
import Navbar from "@/components/landing/Navbar";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    n: "01",
    icon: Plug,
    title: "Connect your stack",
    detail: "Link payments, shipping, accounting and SaaS tools — or upload statements. Read-only, encrypted, never shared.",
    points: ["OAuth integrations", "PDF/CSV ingestion", "Manual fallback"],
    cta: { label: "Connect your tools", href: "/ConnectTools" },
  },
  {
    n: "02",
    icon: Activity,
    title: "We scan your infrastructure",
    detail: "CAMBRA maps your real rates, volumes and costs across 8 operational layers — automatically.",
    points: ["Effective payment rates", "Carrier benchmarks", "SaaS spend audit"],
    cta: { label: "Run the analyzer", href: "/Analyzer" },
  },
  {
    n: "03",
    icon: BarChart3,
    title: "Benchmark against the network",
    detail: "Your numbers are compared against operators of similar scale — surfacing exact savings opportunities.",
    points: ["Peer benchmarks", "Infrastructure score", "Margin leak alerts"],
    cta: { label: "See your score", href: "/Dashboard" },
  },
  {
    n: "04",
    icon: Sparkles,
    title: "Unlock your savings",
    detail: "Move into stronger commercial conditions through CAMBRA's network — performance-based, no upfront fee.",
    points: ["Negotiated terms", "Recovery verification", "Aligned incentives"],
    cta: { label: "Activate deals", href: "/Dashboard" },
  },
];

export default function HowItWorks() {
  return (
    <div className="relative min-h-screen bg-background font-inter overflow-hidden">
      <Navbar />

      {/* Ambient backdrop */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 dot-grid opacity-50" />
        <div className="absolute -top-32 left-1/4 w-[40rem] h-[40rem] rounded-full blur-3xl bg-ambient-lilac opacity-[0.20]" />
        <div className="absolute top-1/3 -right-32 w-[34rem] h-[34rem] rounded-full blur-3xl bg-ambient-mint opacity-[0.18]" />
      </div>

      <div className="relative pt-24 pb-20">
        <div className="max-w-6xl mx-auto px-5">

          {/* Hero */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 mb-6 px-2.5 py-1.5 rounded-full border border-border/60 bg-background/80 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-cambra-mint" />
              <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-muted-foreground">
                How it works · 4 steps
              </span>
            </div>

            <h1 className="font-display text-[clamp(2.4rem,6vw,4.4rem)] font-black tracking-[-0.045em] leading-[0.92] mb-5">
              From cost data to <span className="text-saas-gradient">recovered margin.</span>
            </h1>
            <p className="text-base md:text-lg text-foreground/65 max-w-2xl mx-auto leading-relaxed">
              A structured infrastructure audit — built for independent operators. No upfront fees, no lock-in.
            </p>
          </div>

          {/* Steps — large cinematic */}
          <div className="space-y-6">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.article
                  key={step.n}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.5, delay: i * 0.05 }}
                  className="cambra-card p-8 sm:p-10"
                >
                  {/* CTA row — pill anchored to the right */}
                  <div className="flex justify-end mb-4" style={{ position: 'relative', zIndex: 20 }}>
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

                  <div className="grid md:grid-cols-[auto_1fr] gap-6 sm:gap-10 items-end">
                    {/* Giant cinematic number */}
                    <div className="cambra-step-number">
                      {step.n}
                    </div>

                    {/* Content */}
                    <div className="min-w-0">
                      <div className="inline-flex items-center gap-2 mb-4 px-2.5 py-1.5 rounded-full border border-white/15 bg-white/[0.04] backdrop-blur-sm">
                        <Icon size={11} className="text-cambra-mint" />
                        <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-white/70">
                          Step {step.n}
                        </span>
                      </div>

                      <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-black tracking-[-0.035em] leading-[1] mb-4">
                        <span style={{ background: "linear-gradient(135deg, #ffffff 0%, #B8D8E0 55%, #2CA7C1 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                          {step.title}
                        </span>
                      </h2>

                      <p className="text-sm sm:text-base text-white/70 leading-relaxed mb-5 max-w-2xl">
                        {step.detail}
                      </p>

                      <div className="flex flex-wrap gap-2">
                        {step.points.map(p => (
                          <span key={p} className="text-[11px] font-semibold tracking-wide px-2.5 py-1 rounded-full border border-white/15 bg-white/[0.04] text-white/80">
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </div>

          {/* CTA */}
          <div className="mt-16 text-center">
            <Link to="/Analyzer">
              <Button className="h-12 rounded-full px-8 text-sm font-bold gap-2 bg-foreground text-background hover:opacity-90">
                Run your free audit <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <p className="text-xs text-muted-foreground mt-4">
              Free forever for early operators · No credit card required
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}