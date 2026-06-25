import { Star } from "lucide-react";
import MarketingPageShell from "@/components/landing/MarketingPageShell";

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
    <MarketingPageShell
      eyebrow="Testimonials · From real operators"
      title="What brands say about"
      titleAccent="CAMBRA."
      subtitle="Real results from independent commerce brands across Europe."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {TESTIMONIALS.map((t, i) => (
          <div
            key={i}
            className="relative overflow-hidden rounded-2xl p-7 flex flex-col transition-transform hover:-translate-y-1 animate-fade-up"
            style={{
              animationDelay: `${i * 80}ms`,
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="flex items-center gap-1 mb-4">
              {[...Array(t.rating)].map((_, j) => (
                <Star key={j} size={14} className="text-cyan-300" fill="currentColor" />
              ))}
            </div>

            <p className="text-[14px] mb-6 flex-1 leading-relaxed" style={{ color: "rgba(255,255,255,0.78)" }}>
              "{t.text}"
            </p>

            <div
              className="flex items-center gap-3 pt-4"
              style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-xs text-[#06080F]"
                style={{ background: "#ffffff" }}
              >
                {t.avatar}
              </div>
              <div>
                <p className="text-[13px] font-semibold text-white">{t.name}</p>
                <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                  {t.role} at {t.company}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </MarketingPageShell>
  );
}