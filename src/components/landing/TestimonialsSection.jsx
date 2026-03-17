import RevealOnScroll from "@/components/shared/RevealOnScroll";

const testimonials = [
  {
    quote: "Discovered we were overpaying on Stripe by 1.4%. After switching to THE NoDE network rate, we recovered €38,000 in the first year.",
    name: "Founder",
    company: "Contemporary skincare brand",
    saving: "€38K saved",
    category: "Payments",
  },
  {
    quote: "The Analyzer identified €24,000 in hidden infrastructure costs we hadn't even tracked. Changed how we think about our P&L.",
    name: "CEO",
    company: "Premium activewear brand",
    saving: "€24K identified",
    category: "Infrastructure",
  },
  {
    quote: "Repriced our full shipping structure through the network. We save €19,000 a year now. It took one afternoon.",
    name: "Operations Director",
    company: "Design-led home fragrance",
    saving: "€19K/yr shipping",
    category: "Shipping",
  },
];

export default function TestimonialsSection() {
  return (
    <section className="py-28 px-5 border-t border-border/40 bg-secondary/20">
      <div className="max-w-6xl mx-auto">
        <RevealOnScroll>
          <div className="text-center mb-16">
            <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/60 mb-5 flex items-center justify-center gap-2">
              <span className="w-4 h-px bg-border inline-block" /> Results
            </p>
            <h2 className="text-[clamp(2rem,5vw,4rem)] font-black tracking-[-0.04em] leading-[0.9]">
              Brands are saving real money.
            </h2>
          </div>
        </RevealOnScroll>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {testimonials.map((t, i) => (
            <RevealOnScroll key={i} delay={i * 0.07}>
              <div className="p-7 rounded-2xl border border-border/50 bg-background h-full flex flex-col">
                <div className="mb-5">
                  <span className="text-2xl font-black text-foreground">{t.saving}</span>
                  <span className="ml-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 px-2 py-0.5 bg-secondary rounded-full">{t.category}</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed flex-1 mb-6">"{t.quote}"</p>
                <div>
                  <p className="text-xs font-semibold">{t.name}</p>
                  <p className="text-[11px] text-muted-foreground/50">{t.company}</p>
                </div>
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}