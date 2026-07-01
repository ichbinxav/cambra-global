import Navbar from "@/components/landing/Navbar";
import AccessModelCards from "@/components/pricing/AccessModelCards";

const FAQ = [
  {
    q: "Is the infrastructure intelligence really free?",
    a: "Yes — no card, no commitment. Early founding brands get full access to the audit, benchmarks, scoring and dashboard at no cost.",
  },
  {
    q: "How does the recovery model work?",
    a: "When CAMBRA actively helps you recover verified margin, we participate in 25% of those savings. You keep the majority. No upfront fee, ever.",
  },
  {
    q: "What counts as 'verified savings'?",
    a: "Recovered margin that is measurable, attributable to CAMBRA's negotiation or migration support, and reconciled against your real provider statements.",
  },
  {
    q: "Can I stop at any time?",
    a: "Yes. No lock-in, no minimum duration. Pause or terminate from your account settings.",
  },
  {
    q: "Is my data confidential?",
    a: "Always. Read-only access, encrypted at rest and in transit, never sold, never shared. See our Privacy Policy.",
  },
];

export default function Pricing() {
  return (
    <div
      className="relative min-h-screen font-inter overflow-hidden text-white"
      style={{
        background:
          "linear-gradient(180deg, #0a0a0a 0%, #0b0e1a 22%, #0a0d18 48%, #0b1020 72%, #08090f 100%)",
      }}
    >
      <Navbar />

      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          opacity: 0.35,
          maskImage: "radial-gradient(ellipse 90% 80% at 50% 30%, #000 35%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 80% at 50% 30%, #000 35%, transparent 100%)",
        }}
      />

      <div className="relative pt-24 pb-20">
        <div className="max-w-6xl mx-auto px-5">
          <div className="text-center mb-14 md:mb-16">
            <div className="inline-flex items-center gap-2 mb-6 px-2.5 py-1.5 rounded-full border border-border/60 bg-background/80 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-cambra-mint" />
              <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-muted-foreground">
                The 2-step path · Aligned with your margin
              </span>
            </div>

            <h1 className="font-display text-[clamp(2.4rem,6vw,4.4rem)] font-black tracking-[-0.045em] leading-[0.92] mb-5">
              First analyze. <span className="text-saas-gradient">Then recover.</span>
            </h1>
            <p className="text-base md:text-lg text-foreground/65 max-w-2xl mx-auto leading-relaxed">
              Not two pricing tiers — two inevitable steps. Step 01 is the free audit. Step 02 is when we help you actually recover the margin we found.
            </p>
          </div>

          <AccessModelCards />

          <div className="mt-20 md:mt-24 max-w-3xl mx-auto">
            <div className="mb-8 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground/70 mb-3">
                Frequently asked
              </p>
              <h2 className="font-display text-2xl md:text-3xl font-black tracking-[-0.03em]">
                Clarity, not fine print.
              </h2>
            </div>

            <div className="divide-y divide-border/50 rounded-2xl border border-border/50 bg-card/70 backdrop-blur-sm overflow-hidden">
              {FAQ.map((item, i) => (
                <div key={i} className="px-6 py-5 sm:px-7 sm:py-6">
                  <p className="text-[15px] font-semibold tracking-tight text-foreground mb-1.5">
                    {item.q}
                  </p>
                  <p className="text-[13.5px] text-foreground/65 leading-relaxed">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}