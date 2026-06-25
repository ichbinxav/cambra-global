import { Link } from "react-router-dom";
import { ArrowRight, Activity, Plug, BarChart3, Sparkles } from "lucide-react";
import MarketingPageShell from "@/components/landing/MarketingPageShell";
import CambraCTA, { CambraTrustRow } from "@/components/shared/CambraCTA";

const STEPS = [
  {
    n: "01",
    eyebrow: "ingest",
    icon: Plug,
    title: "Connect your stack",
    detail: "Link Payments, Logistics & Commerce SaaS tools — or upload statements. Read-only, encrypted, never shared.",
    cta: { label: "Connect your tools", href: "/ConnectTools" },
  },
  {
    n: "02",
    eyebrow: "analyze",
    icon: Activity,
    title: "We scan your infrastructure",
    detail: "CAMBRA maps your real rates, volumes and costs across 3 operational pillars — automatically.",
    cta: { label: "Run the analyzer", href: "/Analyzer" },
  },
  {
    n: "03",
    eyebrow: "compare",
    icon: BarChart3,
    title: "Benchmark against the network",
    detail: "Your numbers are compared against operators of similar scale — surfacing exact savings opportunities.",
    cta: { label: "See your score", href: "/Dashboard" },
  },
  {
    n: "04",
    eyebrow: "save",
    icon: Sparkles,
    title: "Activate better terms",
    detail: "Move into stronger commercial conditions through CAMBRA's network — performance-based, no upfront fee.",
    cta: { label: "Unlock your savings", href: "/Dashboard" },
  },
];

export default function HowItWorks() {
  return (
    <MarketingPageShell
      eyebrow="How it works · 4 steps"
      title="From cost data to"
      titleAccent="recovered margin."
      subtitle="A structured infrastructure audit — built for independent operators. No upfront fees, no lock-in."
    >
      <div className="space-y-5">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <article
              key={step.n}
              className="relative overflow-hidden p-8 sm:p-12 rounded-2xl animate-fade-up"
              style={{
                animationDelay: `${i * 80}ms`,
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {/* Giant step number watermark */}
              <span
                aria-hidden
                className="absolute -top-6 right-6 select-none"
                style={{
                  fontSize: "clamp(96px, 14vw, 180px)",
                  fontWeight: 900,
                  letterSpacing: "-0.05em",
                  lineHeight: 1,
                  background:
                    "linear-gradient(180deg, rgba(96,165,250,0.18), rgba(255,255,255,0.02) 70%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                }}
              >
                {step.n}
              </span>

              <div className="relative max-w-2xl">
                <div
                  className="inline-flex items-center gap-2 mb-4 px-2.5 py-1.5 rounded-full"
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.04)",
                  }}
                >
                  <Icon size={11} className="text-cyan-300" />
                  <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-white/70">
                    {step.eyebrow}
                  </span>
                </div>

                <h2
                  className="mb-4"
                  style={{
                    fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                    fontSize: "clamp(28px, 4vw, 44px)",
                    fontWeight: 900,
                    letterSpacing: "-0.035em",
                    lineHeight: 1,
                    background:
                      "linear-gradient(135deg, #ffffff 0%, #b8d8e0 55%, #22d3ee 100%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  {step.title}
                </h2>

                <p className="text-[14px] sm:text-[15px] leading-relaxed mb-6" style={{ color: "rgba(255,255,255,0.65)" }}>
                  {step.detail}
                </p>

                <Link
                  to={step.cta.href}
                  className="inline-flex items-center gap-1.5 text-[12px] font-bold tracking-[0.08em] uppercase text-cyan-300 hover:text-cyan-200 transition-colors"
                >
                  {step.cta.label} <ArrowRight size={12} />
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-16 flex flex-col items-center gap-4">
        <CambraCTA intent="audit" size="lg" />
        <CambraTrustRow align="center" />
      </div>
    </MarketingPageShell>
  );
}