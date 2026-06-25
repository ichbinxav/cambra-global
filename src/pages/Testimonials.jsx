import { Star } from "lucide-react";
import Navbar from "@/components/landing/Navbar";

const TESTIMONIALS = [
  {
    name: "Emma Rossi",
    company: "Fashion Brand",
    role: "Founder",
    text: "CAMBRA found €29K in annual savings in less than 3 minutes. We're now negotiating better terms with our payment provider.",
    rating: 5,
    avatar: "ER",
  },
  {
    name: "Marco Blanc",
    company: "Beauty E-commerce",
    role: "Operations Lead",
    text: "The infrastructure audit was eye-opening. We had no idea we were overpaying on SaaS by 40%. Already cut costs by €8K/month.",
    rating: 5,
    avatar: "MB",
  },
  {
    name: "Sophie Delacroix",
    company: "Lifestyle Retailer",
    role: "CEO",
    text: "Finally, benchmarking that actually means something. Not generic — specific to our size, geography, and channel mix. Highly recommend.",
    rating: 5,
    avatar: "SD",
  },
  {
    name: "Luca Moretti",
    company: "Food & Beverage",
    role: "CFO",
    text: "The deal negotiation support is incredible. CAMBRA's network leverage got us shipping rates we could never negotiate alone.",
    rating: 5,
    avatar: "LM",
  },
];

export default function Testimonials() {
  return (
    <div className="relative min-h-screen bg-background font-inter overflow-hidden">
      <Navbar />
      {/* Ambient backdrop */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 dot-grid opacity-50" />
        <div className="absolute -top-32 left-1/4 w-[40rem] h-[40rem] rounded-full blur-3xl bg-ambient-lilac opacity-[0.20]" />
        <div className="absolute top-1/3 -right-32 w-[34rem] h-[34rem] rounded-full blur-3xl bg-ambient-mint opacity-[0.16]" />
      </div>

      <div className="relative pt-24 pb-20">
        <div className="max-w-6xl mx-auto px-5">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 mb-6 px-2.5 py-1.5 rounded-full border border-border/60 bg-background/80 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-cambra-mint" />
              <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-muted-foreground">
                Testimonials · From real operators
              </span>
            </div>
            <h1 className="font-display text-[clamp(2.2rem,5.5vw,4rem)] font-black tracking-[-0.045em] leading-[0.92] mb-4">
              What brands say <br className="hidden sm:inline" /> about <span className="text-saas-gradient">CAMBRA.</span>
            </h1>
            <p className="text-base text-foreground/65 max-w-xl mx-auto">
              Real results from independent commerce brands across Europe.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {TESTIMONIALS.map((t, i) => (
              <div
                key={i}
                className="relative overflow-hidden rounded-[1.75rem] border border-border/60 bg-card/95 backdrop-blur-sm p-7 flex flex-col shadow-[0_14px_40px_rgba(0,0,0,0.05)] hover:-translate-y-0.5 hover:shadow-[0_22px_60px_rgba(0,0,0,0.09)] hover:border-foreground/30 transition"
              >
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(t.rating)].map((_, j) => (
                    <Star key={j} size={14} className="fill-chart-3 text-chart-3" />
                  ))}
                </div>

                <p className="text-sm text-foreground/80 mb-6 flex-1 leading-relaxed">"{t.text}"</p>

                <div className="flex items-center gap-3 pt-4 border-t border-border/40">
                  <div className="w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center shrink-0 font-bold text-xs">
                    {t.avatar}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{t.name}</p>
                    <p className="text-[11px] text-foreground/60">
                      {t.role} at {t.company}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}