import { Star } from "lucide-react";
import PublicPageShell from "@/components/shared/PublicPageShell";
import SectionLabel from "@/components/shared/SectionLabel";
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
    <PublicPageShell>
      <div className="relative pt-24 pb-20">
        <div className="max-w-6xl mx-auto px-5">
          <div className="text-center mb-14">
            <div className="flex justify-center mb-6">
              <SectionLabel>{t("tst_hero_badge")}</SectionLabel>
            </div>
            <h1
              className="font-display font-black mb-4"
              style={{
                color: "var(--ink)",
                fontSize: "clamp(2.2rem,5.5vw,4rem)",
                letterSpacing: "-0.045em",
                lineHeight: 0.92,
              }}
            >
              {t("tst_hero_h1")}
            </h1>
            <p className="text-base max-w-xl mx-auto" style={{ color: "var(--gris-1)" }}>
              {t("tst_hero_sub")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {TESTIMONIALS.map((tm, i) => (
              <div
                key={i}
                className="relative overflow-hidden p-7 flex flex-col transition hover:-translate-y-0.5"
                style={{
                  background: "#FFFFFF",
                  border: "1px solid var(--linea)",
                  borderRadius: 14,
                  boxShadow: "0 8px 24px rgba(12,12,22,.06)",
                }}
              >
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(tm.rating)].map((_, j) => (
                    <Star key={j} size={14} style={{ fill: "var(--voltio)", color: "var(--voltio)" }} />
                  ))}
                </div>

                <p className="text-sm mb-6 flex-1 leading-relaxed" style={{ color: "var(--gris-1)" }}>"{tm.text}"</p>

                <div className="flex items-center gap-3 pt-4" style={{ borderTop: "1px solid var(--linea)" }}>
                  <InitialsAvatar name={tm.name} size={40} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{tm.name}</p>
                    <p className="text-[11px]" style={{ color: "var(--gris-2)" }}>
                      {t("tst_role_at", { role: tm.role, company: tm.company })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PublicPageShell>
  );
}