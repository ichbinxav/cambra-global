const testimonials = [
  {
    quote: "Discovered we were overpaying on Stripe by 1.4%. After switching to the network rate, we recovered €38,000 in the first year alone.",
    name: "Founder",
    company: "Contemporary skincare brand",
    saving: "€38K",
    savingNote: "recovered year 1",
    category: "Payments",
    color: "text-blue-600",
    bg: "bg-blue-500/[0.04] border-blue-500/15",
  },
  {
    quote: "The Analyzer identified €24,000 in hidden infrastructure costs we hadn't tracked. Changed how we think about our entire P&L.",
    name: "CEO",
    company: "Premium activewear brand",
    saving: "€24K",
    savingNote: "hidden costs surfaced",
    category: "Infrastructure",
    color: "text-orange-500",
    bg: "bg-orange-500/[0.04] border-orange-500/15",
  },
  {
    quote: "Repriced our full shipping structure through the network. We save €19,000 a year now. It genuinely took one afternoon.",
    name: "Operations Director",
    company: "Design-led home fragrance",
    saving: "€19K",
    savingNote: "per year on shipping",
    category: "Shipping",
    color: "text-green-600",
    bg: "bg-green-500/[0.04] border-green-500/15",
  },
];

export default function TestimonialsSection() {
  return (
    <section className="py-24 px-5 border-t border-border/40 bg-secondary/20">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/60 mb-5 flex items-center justify-center gap-2">
            <span className="w-4 h-px bg-border inline-block" /> Results
          </p>
          <h2 className="text-[clamp(2rem,5vw,4rem)] font-black tracking-[-0.04em] leading-[0.9]">
            Brands are saving real money.
          </h2>
          <p className="mt-4 text-muted-foreground text-base max-w-md mx-auto">
            Independent commerce brands across Europe using THE NoDE network.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {testimonials.map((t, i) => (
            <div key={i} className={`p-7 rounded-2xl border bg-background h-full flex flex-col`}>
              {/* Saving highlight */}
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border mb-5 w-fit ${t.bg}`}>
                <span className={`text-sm font-black ${t.color}`}>{t.saving}</span>
                <span className="text-[10px] text-muted-foreground/60">{t.savingNote}</span>
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed flex-1 mb-6">"{t.quote}"</p>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold">{t.name}</p>
                  <p className="text-[11px] text-muted-foreground/50">{t.company}</p>
                </div>
                <span className={`text-[10px] font-semibold uppercase tracking-[0.15em] px-2 py-1 rounded-full bg-secondary ${t.color}`}>
                  {t.category}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Trust bar */}
        <div className="mt-10 pt-10 border-t border-border/40 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { value: "15+", label: "Countries active" },
            { value: "€18K–72K", label: "Savings range per brand" },
            { value: "1.4%", label: "Network payment rate" },
            { value: "−18%", label: "Avg. shipping reduction" },
          ].map((s, i) => (
            <div key={i}>
              <p className="text-2xl font-black tracking-tight">{s.value}</p>
              <p className="text-[11px] text-muted-foreground/50 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}