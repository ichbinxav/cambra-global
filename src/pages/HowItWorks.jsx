import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Activity, BarChart3, Sparkles } from "lucide-react";
import PublicPageShell from "@/components/shared/PublicPageShell";
import PublicPageHero from "@/components/shared/PublicPageHero";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n.jsx";

// Shared paper card style — white, --linea border, radius 14, spec shadow.
const CARD_STYLE = {
  background: "#FFFFFF",
  border: "1px solid var(--linea)",
  borderRadius: 14,
  boxShadow: "0 8px 24px rgba(12,12,22,.06)",
};

export default function HowItWorks() {
  const { t } = useTranslation();
  const STEPS = [
    { n: "01", eyebrow: t("hiw_s1_eyebrow"), icon: Activity,  title: t("hiw_s1_title"), detail: t("hiw_s1_detail"), cta: { label: t("hiw_s1_cta"), href: "/Analyzer" } },
    { n: "02", eyebrow: t("hiw_s2_eyebrow"), icon: BarChart3, title: t("hiw_s2_title"), detail: t("hiw_s2_detail"), cta: { label: t("hiw_s2_cta"), href: "/Analyzer" } },
    { n: "03", eyebrow: t("hiw_s3_eyebrow"), icon: Sparkles,  title: t("hiw_s3_title"), detail: t("hiw_s3_detail"), cta: { label: t("hiw_s3_cta"), href: "/Pricing" } },
  ];
  return (
    <PublicPageShell>
      <PublicPageHero
        eyebrow={t("hiw_hero_badge")}
        title={t("hiw_hero_h1")}
        subtitle={t("hiw_hero_sub")}
      />

      <div className="relative pt-16 pb-20">
        <div className="max-w-6xl mx-auto px-5">

          {/* Steps — large cinematic, on white paper cards */}
          <div className="space-y-6">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.article
                  key={step.n}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.5, delay: i * 0.05 }}
                  className="p-8 sm:p-12"
                  style={CARD_STYLE}
                >
                  <div className="flex items-start justify-between gap-4 mb-8">
                    {/* Giant cinematic number — navy gradient on paper */}
                    <div
                      className="cambra-step-number-light"
                      style={{
                        fontSize: "clamp(4rem, 9vw, 6.5rem)",
                        lineHeight: 1,
                        background: "linear-gradient(180deg, #3A2BB0 0%, var(--voltio-2) 100%)",
                        WebkitBackgroundClip: "text",
                        backgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                      }}
                    >
                      {step.n}
                    </div>

                    {/* CTA row — aligned with number */}
                    <Link
                      to={step.cta.href}
                      className="group/cta inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full transition-all mt-1 flex-shrink-0"
                      style={{ background: "rgba(12,12,22,0.04)", border: "1px solid var(--linea)", position: "relative", zIndex: 20 }}
                    >
                      <span className="text-[9px] sm:text-[10px] font-bold tracking-[0.08em] uppercase whitespace-nowrap" style={{ color: "var(--ink)" }}>
                        {step.cta.label}
                      </span>
                      <span className="h-4 w-4 rounded-full flex items-center justify-center transition-transform group-hover/cta:translate-x-0.5" style={{ background: "var(--voltio)" }}>
                        <ArrowRight className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                      </span>
                    </Link>
                  </div>

                  <div>
                    <div className="min-w-0">
                      <div
                        className="inline-flex items-center gap-2 mb-3 px-2.5 py-1.5 rounded-full"
                        style={{ background: "rgba(12,12,22,0.04)", border: "1px solid var(--linea)" }}
                      >
                        <Icon size={11} style={{ color: "var(--voltio)" }} />
                        <span className="text-[10px] font-bold tracking-[0.22em] uppercase" style={{ color: "var(--gris-1)" }}>
                          {step.eyebrow}
                        </span>
                      </div>

                      <h2
                        className="font-display font-black mb-3"
                        style={{
                          color: "var(--ink)",
                          fontSize: "clamp(1.5rem, 4vw, 2.25rem)",
                          letterSpacing: "-0.035em",
                          lineHeight: 1,
                        }}
                      >
                        {step.title}
                      </h2>

                      <p className="text-sm sm:text-base leading-relaxed max-w-2xl" style={{ color: "var(--gris-1)" }}>
                        {step.detail}
                      </p>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </div>

          {/* CTA */}
          <div className="mt-16 text-center">
            <Link to="/Analyzer">
              <Button className="h-12 rounded-full px-8 text-sm font-bold gap-2 text-white hover:opacity-90" style={{ background: "var(--g-voltio)", boxShadow: "0 12px 32px -12px rgba(91,76,245,0.5)" }}>
                {t("hiw_cta_button")} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <p className="text-xs mt-4" style={{ color: "var(--gris-2)" }}>
              {t("hiw_cta_note")}
            </p>
          </div>

        </div>
      </div>
    </PublicPageShell>
  );
}
