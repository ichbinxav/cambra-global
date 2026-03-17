import { TrendingUp, BarChart2, Network, Zap, Clock, Focus } from "lucide-react";

const BENEFITS = [
  {
    icon: TrendingUp,
    title: "Reduce your costs instantly",
    body: "Access pre-negotiated rates across payments, shipping, and SaaS. Stop overpaying for infrastructure you rely on every day.",
  },
  {
    icon: BarChart2,
    title: "Increase your margins",
    body: "Every % saved goes directly to your bottom line. No revenue growth needed — just smarter economics.",
  },
  {
    icon: BarChart2,
    title: "Benchmark like top operators",
    body: "See how your costs compare to similar brands. Understand where you're inefficient and where to optimize.",
    iconOverride: "benchmark",
  },
  {
    icon: Network,
    title: "Access network-level deals",
    body: "Benefit from collective scale. What large companies negotiate, you now access instantly.",
  },
  {
    icon: Clock,
    title: "Save time and complexity",
    body: "No need to negotiate contracts, compare providers, or audit costs. We centralize your entire infrastructure layer.",
  },
  {
    icon: Focus,
    title: "Stay focused on your core business",
    body: "Spend less time on operations, more time on brand, product, and growth. THE NoDE handles the backend.",
  },
];

const ICONS = {
  benchmark: ({ size, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
};

const PROOF = [
  { value: "€18K–€72K", label: "unlocked per year" },
  { value: "−52%", label: "on payments" },
  { value: "−18%", label: "on shipping" },
  { value: "−30%", label: "on SaaS tools" },
];

export default function BenefitsSection() {
  return (
    <section className="py-28 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="max-w-2xl mb-16">
          <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-5 flex items-center gap-2">
            <span className="w-4 h-px bg-border" /> Why brands join
          </p>
          <h2 className="text-[clamp(2.4rem,6vw,5rem)] font-black tracking-[-0.05em] leading-[0.87] mb-5">
            The economic advantage<br />of THE NoDE.
          </h2>
          <p className="text-muted-foreground text-lg leading-relaxed">
            We turn your infrastructure into a competitive advantage.
          </p>
        </div>

        {/* Benefits grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border/30 rounded-2xl overflow-hidden border border-border/30 mb-16">
          {BENEFITS.map((b, i) => {
            const IconComp = b.iconOverride ? ICONS[b.iconOverride] : b.icon;
            return (
              <div key={i} className="bg-background p-8 flex flex-col gap-4">
                <div className="w-9 h-9 rounded-xl bg-secondary border border-border/50 flex items-center justify-center shrink-0">
                  <IconComp size={15} className="text-muted-foreground/60" />
                </div>
                <div>
                  <h3 className="text-base font-bold tracking-tight mb-2">{b.title}</h3>
                  <p className="text-sm text-muted-foreground/70 leading-relaxed">{b.body}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Editorial block */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-12 items-center mb-16 py-14 border-y border-border/40">
          <div>
            <h3 className="text-[clamp(1.8rem,4vw,3rem)] font-black tracking-[-0.04em] leading-[0.9]">
              This is not a tool.<br />It's your economic layer.
            </h3>
          </div>
          <div className="space-y-4 text-muted-foreground text-base leading-relaxed">
            <p>You don't need more tools. You need better economics.</p>
            <p>THE NoDE connects your business to a network designed to optimize how you spend, scale, and operate — so your infrastructure works for you, not against you.</p>
          </div>
        </div>

        {/* Proof strip */}
        <div>
          <p className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground/35 text-center mb-6">
            Average impact across network members
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/30 rounded-2xl overflow-hidden border border-border/30">
            {PROOF.map((p, i) => (
              <div key={i} className="bg-card px-6 py-7 text-center">
                <p className="text-3xl font-black tracking-tight mb-1">{p.value}</p>
                <p className="text-[11px] text-muted-foreground/50">{p.label}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}