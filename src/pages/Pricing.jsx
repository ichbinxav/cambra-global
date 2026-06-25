import MarketingPageShell from "@/components/landing/MarketingPageShell";
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
    <MarketingPageShell
      eyebrow="The 2-step path · Aligned with your margin"
      title="First analyze."
      titleAccent="Then recover."
      subtitle="Not two pricing tiers — two inevitable steps. Step 01 is the free audit. Step 02 is when we help you actually recover the margin we found."
    >
      <AccessModelCards />

      <div className="mt-20 md:mt-24 max-w-3xl mx-auto">
        <div className="mb-8 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] mb-3" style={{ color: "rgba(255,255,255,0.5)" }}>
            Frequently asked
          </p>
          <h2 className="text-white" style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.05 }}>
            Clarity, not fine print.
          </h2>
        </div>

        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          {FAQ.map((item, i) => (
            <div
              key={i}
              className="px-6 py-5 sm:px-7 sm:py-6"
              style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.06)" }}
            >
              <p className="text-[15px] font-semibold tracking-tight text-white mb-1.5">{item.q}</p>
              <p className="text-[13.5px] leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
                {item.a}
              </p>
            </div>
          ))}
        </div>
      </div>
    </MarketingPageShell>
  );
}