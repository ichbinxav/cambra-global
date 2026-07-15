import { Star } from "lucide-react";
import Navbar from "@/components/landing/Navbar";
import InitialsAvatar from "@/components/shared/InitialsAvatar";
import { useTranslation } from "@/lib/i18n.jsx";

// ⚠️ ILLUSTRATIVE / PLACEHOLDER testimonials — invented names + quotes.
// Uses initials avatars (NOT photos) on purpose: a fake photo-realistic face
// + fake quote presented as a real customer is misleading advertising.
// REPLACE with real, consented customer quotes (and real photos) before launch.
const TESTIMONIALS = [
  {
    name: "Camille Laurent",
    company: "Maison Épice",
    role: "Founder",
    text: "We were paying 2.4% blended and thought that was just the cost of cards. CAMBRA showed us the processor margin was the only movable part — and how much we were leaving on the table.",
    rating: 5,
  },
  {
    name: "Théo Mercier",
    company: "Atelier Nord",
    role: "COO",
    text: "The 3-minute audit was more transparent about our card fees than our PSP had been in three years. We saw exactly where the money leaked.",
    rating: 5,
  },
  {
    name: "Sofia Ferran",
    company: "Vela Studio",
    role: "Founder",
    text: "Joining the collective got us to a rate we'd never have reached negotiating alone at our size. Brands moving as one — that's the whole point.",
    rating: 5,
  },
  {
    name: "Lucas Petit",
    company: "Brün Coffee",
    role: "Finance lead",
    text: "No retainer, no contract. They only got paid once our bank statements confirmed the savings. That alignment is rare.",
    rating: 5,
  },
  {
    name: "Inès Marchal",
    company: "Lume",
    role: "Founder",
    text: "CAMBRA benchmarked us against French brands our size — we were in the most expensive third. Seeing that in one number changed how we think about payments.",
    rating: 5,
  },
];

export default function Testimonials() {
  const { t } = useTranslation();
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
                {t("tst_hero_badge")}
              </span>
            </div>
            <h1 className="font-display text-[clamp(2.2rem,5.5vw,4rem)] font-black tracking-[-0.045em] leading-[0.92] mb-4 text-white">
              <span
                style={{
                  background: "linear-gradient(135deg, #ffffff 0%, #b8d8e0 55%, #22d3ee 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {t("tst_hero_h1")}
              </span>
            </h1>
            <p className="text-base text-white/60 max-w-xl mx-auto">
              {t("tst_hero_sub")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {TESTIMONIALS.map((tm, i) => (
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
                  {[...Array(tm.rating)].map((_, j) => (
                    <Star key={j} size={14} className="fill-cyan-300 text-cyan-300" />
                  ))}
                </div>

                <p className="text-sm text-white/80 mb-6 flex-1 leading-relaxed">"{tm.text}"</p>

                <div
                  className="flex items-center gap-3 pt-4"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <InitialsAvatar name={tm.name} size={40} />
                  <div>
                    <p className="text-sm font-semibold text-white">{tm.name}</p>
                    <p className="text-[11px] text-white/55">
                      {t("tst_role_at", { role: tm.role, company: tm.company })}
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