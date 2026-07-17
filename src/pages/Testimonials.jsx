import { Star } from "lucide-react";
import { motion } from "framer-motion";
import PublicPageShell from "@/components/shared/PublicPageShell";
import PublicPageHero from "@/components/shared/PublicPageHero";
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
      <PublicPageHero
        eyebrow={t("tst_hero_badge")}
        title={t("tst_hero_h1")}
        subtitle={t("tst_hero_sub")}
      />

      <div className="relative pt-16 pb-20">
        <div className="max-w-6xl mx-auto px-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {TESTIMONIALS.map((tm, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: (i % 2) * 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="relative overflow-hidden p-7 flex flex-col transition hover:-translate-y-1 hover:shadow-lg"
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
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </PublicPageShell>
  );
}