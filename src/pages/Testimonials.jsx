import { Star } from "lucide-react";
import Navbar from "@/components/landing/Navbar";

// PLACEHOLDER testimonials — replace with real customer quotes before public launch.
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
    text: "The audit surfaced a 0.4-point gap between our effective fee and the achievable floor. Once we saw the breakdown, negotiating with our PSP became a factual conversation, not a guessing game.",
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
    text: "The interchange and scheme fee decomposition is what sold us. Every other tool showed us a single 'effective rate'. CAMBRA showed us which layer was actually leaking margin.",
    rating: 5,
    avatar: "LM",
  },
];

export default function Testimonials() {
  return (
    <div
      className="relative min-h-screen font-inter overflow-hidden text-white"
      style={{
        background:
          "linear-gradient(180deg, #0a0a0a 0%, #0b0e1a 22%, #0a0d18 48%, #0b1020 72%, #08090f 100%)",
      }}
    >
      <Navbar />
      {/* Ambient backdrop */}
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
          <div className="text-center mb-14">
            <div
              className="inline-flex items-center gap-2 mb-6 px-2.5 py-1.5 rounded-full backdrop-blur-sm"
              style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
              <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-white/60">
                Testimonials · From real operators
              </span>
            </div>
            <h1 className="font-display text-[clamp(2.2rem,5.5vw,4rem)] font-black tracking-[-0.045em] leading-[0.92] mb-4 text-white">
              What brands say <br className="hidden sm:inline" /> about{" "}
              <span
                style={{
                  background: "linear-gradient(135deg, #60a5fa 0%, #22d3ee 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                CAMBRA.
              </span>
            </h1>
            <p className="text-base text-white/60 max-w-xl mx-auto">
              Real results from independent commerce brands across Europe.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {TESTIMONIALS.map((t, i) => (
              <div
                key={i}
                className="relative overflow-hidden rounded-[1.75rem] p-7 flex flex-col transition hover:-translate-y-0.5"
                style={{
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.03)",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                }}
              >
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(t.rating)].map((_, j) => (
                    <Star key={j} size={14} className="fill-cyan-300 text-cyan-300" />
                  ))}
                </div>

                <p className="text-sm text-white/80 mb-6 flex-1 leading-relaxed">"{t.text}"</p>

                <div
                  className="flex items-center gap-3 pt-4"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <div className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shrink-0 font-bold text-xs">
                    {t.avatar}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{t.name}</p>
                    <p className="text-[11px] text-white/55">
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