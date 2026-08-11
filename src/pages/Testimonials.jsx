import { ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import PublicPageShell from "@/components/shared/PublicPageShell";
import PublicPageHero from "@/components/shared/PublicPageHero";
import { useTranslation } from "@/lib/i18n.jsx";

const PROOF_STANDARDS = [1, 2, 3, 4, 5];

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
        <div className="max-w-5xl mx-auto px-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {PROOF_STANDARDS.map((number, index) => (
              <motion.article
                key={number}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: (index % 2) * 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="relative overflow-hidden p-7 transition hover:-translate-y-1 hover:shadow-lg"
                style={{ background: "#FFFFFF", border: "1px solid var(--linea)", borderRadius: 14, boxShadow: "0 8px 24px rgba(12,12,22,.06)" }}
              >
                <ShieldCheck size={22} className="mb-5" style={{ color: "var(--voltio)" }} aria-hidden />
                <h2 className="text-base font-semibold mb-3" style={{ color: "var(--ink)" }}>
                  {t(`tst_proof_title${number}`)}
                </h2>
                <p className="text-sm leading-relaxed" style={{ color: "var(--gris-1)" }}>
                  {t(`tst_q${number}`)}
                </p>
              </motion.article>
            ))}
          </div>
        </div>
      </div>
    </PublicPageShell>
  );
}
