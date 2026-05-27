import { Link } from "react-router-dom";
import { ArrowRight, Check, Activity } from "lucide-react";
import Navbar from "@/components/landing/Navbar";
import { Button } from "@/components/ui/button";

const PLANS = [
  {
    name: "Founding partner",
    price: "Free",
    desc: "For early operators — full access while we build the network",
    features: [
      "Complete infrastructure audit (8 layers)",
      "Network-benchmarked savings report",
      "Continuous infrastructure scoring",
      "Margin intelligence & Copilot",
      "Member directory & insights",
      "Priority onboarding",
    ],
    cta: "Run free audit",
    ctaHref: "/Analyzer",
    variant: "default",
    highlight: true,
  },
  {
    name: "Recovery",
    price: "Performance",
    desc: "When CAMBRA helps you recover margin — we share it",
    features: [
      "Everything in Founding partner",
      "Negotiated infrastructure terms",
      "Recovery verification & reporting",
      "No upfront fee — aligned incentives",
      "Cancel anytime, no lock-in",
    ],
    cta: "Talk to CAMBRA",
    ctaHref: "/Contact",
    variant: "outline",
  },
];

export default function Pricing() {
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
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 mb-6 px-2.5 py-1.5 rounded-full border border-border/60 bg-background/80 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-cambra-mint" />
              <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-muted-foreground">
                Pricing · Performance based
              </span>
            </div>

            <h1 className="font-display text-[clamp(2.2rem,5.5vw,4rem)] font-black tracking-[-0.045em] leading-[0.92] mb-5">
              Aligned <span className="text-saas-gradient">incentives.</span>
            </h1>
            <p className="text-base md:text-lg text-foreground/65 max-w-xl mx-auto leading-relaxed">
              Start free. CAMBRA only earns when you recover margin — never before.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto">
            {PLANS.map((plan, i) => (
              <div
                key={i}
                className={`cambra-card p-7 transition hover:-translate-y-0.5 ${plan.highlight ? "" : "cambra-card--soft"}`}
              >
                {plan.highlight && (
                  <div className="pointer-events-none absolute -top-24 -right-24 w-56 h-56 rounded-full blur-3xl bg-ambient-lilac opacity-[0.25]" />
                )}
                <div className="relative">
                  {plan.highlight && (
                    <div className="cc-pill mb-4">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-[#52EBA4] opacity-50" style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#52EBA4]" />
                      </span>
                      Recommended
                    </div>
                  )}
                  <h3 className="font-display text-2xl font-black tracking-[-0.03em] mb-1 text-white">{plan.name}</h3>
                  <p className="text-sm mb-6 text-white/60">{plan.desc}</p>
                  <div className="mb-8">
                    <span className="font-display text-4xl font-black tracking-tight text-white">{plan.price}</span>
                  </div>

                  <ul className="space-y-3 mb-8">
                    {plan.features.map((f, j) => (
                      <li key={j} className="flex items-start gap-3">
                        <Check className="w-4 h-4 shrink-0 mt-0.5 text-[#52EBA4]" />
                        <span className="text-sm text-white/80">{f}</span>
                      </li>
                    ))}
                  </ul>

                  <Link to={plan.ctaHref} className="w-full">
                    <Button
                      className={`w-full h-12 rounded-full font-bold gap-2 ${plan.highlight ? 'bg-white text-[#06080F] hover:bg-white/90' : 'bg-white/10 text-white hover:bg-white/15 border border-white/15'}`}
                    >
                      {plan.cta} <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16 relative overflow-hidden p-8 rounded-[1.75rem] border border-border/60 bg-card/95 backdrop-blur-md shadow-[0_14px_40px_rgba(0,0,0,0.05)]">
            <div className="pointer-events-none absolute -bottom-24 -left-24 w-56 h-56 rounded-full blur-3xl bg-ambient-mint opacity-[0.18]" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 mb-3 px-2 py-1 rounded-full border border-border/50 bg-background/70 backdrop-blur-sm">
                <Activity className="h-3 w-3 text-cambra-mint" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">FAQ</p>
              </div>
              <h3 className="font-display text-xl font-black tracking-[-0.03em] mb-5">Frequently asked questions</h3>
              <div className="space-y-4 text-sm">
                <div>
                  <p className="font-semibold mb-1">Is the audit really free?</p>
                  <p className="text-foreground/65">Yes — no credit card, no commitment. You get the full infrastructure audit and benchmarking report.</p>
                </div>
                <div>
                  <p className="font-semibold mb-1">When do I pay?</p>
                  <p className="text-foreground/65">Only on recovered margin. CAMBRA takes a share of the savings we help you unlock — never an upfront fee.</p>
                </div>
                <div>
                  <p className="font-semibold mb-1">Can I cancel anytime?</p>
                  <p className="text-foreground/65">Yes. No lock-in. Pause or terminate at any time from Account settings.</p>
                </div>
                <div>
                  <p className="font-semibold mb-1">Is my data confidential?</p>
                  <p className="text-foreground/65">Always. Data is encrypted, never sold, and only used to power your own intelligence. See Privacy Policy.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}