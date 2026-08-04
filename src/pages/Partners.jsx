import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Handshake, TrendingUp, Sparkles, Briefcase, Store, Users } from "lucide-react";
import PublicPageShell from "@/components/shared/PublicPageShell";
import PublicPageHero from "@/components/shared/PublicPageHero";
import SectionLabel from "@/components/shared/SectionLabel";
import PartnerApplicationForm from "@/components/partners/PartnerApplicationForm";
import { useTranslation } from "@/lib/i18n.jsx";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
};

// ── Dark glass card for the "Why partner" section ──
const WHY_ICONS = [Handshake, TrendingUp, Sparkles];
const WHY = [
  { titleKey: "pt_s2_p1_title", bodyKey: "pt_s2_p1_body" },
  { titleKey: "pt_s4_b1_title", bodyKey: "pt_s4_b1_body" },
  { titleKey: "pt_s4_b4_title", bodyKey: "pt_s4_b4_body" },
];

const WHO_ICONS = [Briefcase, Store, Users];
const WHO_FOR = [
  { titleKey: "pt_s3_c1_title", bodyKey: "pt_s3_c1_body" },
  { titleKey: "pt_s3_c2_title", bodyKey: "pt_s3_c2_body" },
  { titleKey: "pt_s3_c3_title", bodyKey: "pt_s3_c3_body" },
];

const STATS = [
  { value: "25%", labelKey: "pt_stat_fee" },
  { value: "24", labelKey: "pt_stat_months" },
  { value: "0€", labelKey: "pt_stat_upfront" },
];

export default function Partners() {
  const { t, lang } = useTranslation();

  useEffect(() => {
    document.title = t("pt_meta_title");
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", t("pt_meta_description"));
    return () => {
      document.title = "CAMBRA — Card payment cost audit for independent brands";
      if (meta) meta.setAttribute("content", "Find out how much you overpay for card payments, online and in-store. CAMBRA compares your effective rate against European payment benchmarks and recovers the negotiable margin. Free analysis — you only pay on verified savings.");
    };
  }, [lang, t]);

  const scrollToApply = () => {
    const el = document.getElementById("apply");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <PublicPageShell>
      {/* ── HERO ── */}
      <PublicPageHero
        eyebrow={t("pt_eyebrow")}
        title={<>{t("pt_hero_title")}</>}
        subtitle={t("pt_hero_sub")}
      >
        <div className="flex flex-col sm:flex-row items-center gap-3 justify-center">
          <button onClick={scrollToApply} className="btn-base btn-primary-inverse btn-lg">
            {t("pt_hero_cta")} <ArrowRight className="h-4 w-4" />
          </button>
          <Link to="/HowItWorks" className="btn-base btn-secondary-dark btn-lg">
            {t("pt_hero_cta2")}
          </Link>
        </div>
      </PublicPageHero>

      {/* ── STATS STRIP ── */}
      <section className="px-5 -mt-4 sm:-mt-6 relative z-10">
        <div className="max-w-3xl mx-auto grid grid-cols-3 gap-3">
          {STATS.map((s, i) => (
            <motion.div
              key={s.labelKey}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="text-center p-4 rounded-2xl"
              style={{ background: "#fff", border: "1px solid var(--linea)", boxShadow: "0 12px 32px rgba(12,12,22,.06)" }}
            >
              <p className="font-display text-2xl sm:text-3xl font-black tracking-[-0.03em]" style={{ color: "var(--voltio)" }}>
                {s.value}
              </p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--gris-2)" }}>
                {t(s.labelKey)}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── WHY PARTNER (dark premium) ── */}
      <section className="px-5 py-20 sm:py-24">
        <div className="section-ink px-6 sm:px-12 py-14 sm:py-20 max-w-5xl mx-auto">
          <div className="mb-12 text-center">
            <motion.p
              {...fadeUp}
              className="text-[11px] font-bold tracking-[0.24em] uppercase mb-4"
              style={{ color: "#7DE3FF" }}
            >
              {t("pt_s2_label")}
            </motion.p>
            <motion.h2
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.06 }}
              className="text-white"
              style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(1.8rem, 4vw, 2.8rem)", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.05 }}
            >
              {t("pt_s4_title")}
            </motion.h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {WHY.map((c, i) => {
              const Icon = WHY_ICONS[i];
              return (
                <motion.div
                  key={c.titleKey}
                  {...fadeUp}
                  transition={{ ...fadeUp.transition, delay: 0.1 + i * 0.08 }}
                  className="group relative overflow-hidden rounded-2xl p-7 transition-all duration-300 hover:-translate-y-1"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                  }}
                >
                  {/* Top gradient accent line */}
                  <span
                    aria-hidden
                    className="absolute top-0 left-0 right-0 h-[3px] opacity-70 group-hover:opacity-100 transition-opacity duration-300"
                    style={{ background: "linear-gradient(90deg, var(--voltio), var(--cian))" }}
                  />
                  {/* Giant faded index watermark */}
                  <span
                    aria-hidden
                    className="absolute -bottom-4 -right-2 font-display font-black select-none pointer-events-none"
                    style={{
                      fontSize: "6.5rem",
                      lineHeight: 1,
                      color: "rgba(255,255,255,0.05)",
                    }}
                  >
                    0{i + 1}
                  </span>
                  {/* Icon with glow ring */}
                  <div className="relative w-14 h-14 rounded-2xl flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110"
                    style={{
                      background: "linear-gradient(135deg, var(--voltio) 0%, var(--cian) 100%)",
                      boxShadow: "0 0 0 1px rgba(255,255,255,0.08), 0 12px 32px -8px rgba(91,76,245,.55), 0 0 40px rgba(91,76,245,.25)",
                    }}>
                    <Icon className="h-6 w-6 text-white" strokeWidth={2} />
                  </div>
                  <h3 className="relative font-display text-lg font-bold mb-2.5"
                    style={{
                      background: "linear-gradient(135deg, #ffffff 0%, #B8D8E0 100%)",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}>
                    {t(c.titleKey)}
                  </h3>
                  <p className="relative text-[13.5px] leading-relaxed text-white/65">{t(c.bodyKey)}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── WHO CAN BECOME A PARTNER (light premium) ── */}
      <section className="py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-5 sm:px-8">
          <div className="mb-12 text-center">
            <SectionLabel>{t("pt_s3_label")}</SectionLabel>
            <h2 className="font-display mt-4 text-2xl sm:text-3xl font-black tracking-[-0.03em] max-w-2xl mx-auto" style={{ color: "var(--ink)" }}>
              {t("pt_s3_title")}
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {WHO_FOR.map((c, i) => {
              const Icon = WHO_ICONS[i];
              return (
                <motion.div
                  key={c.titleKey}
                  {...fadeUp}
                  transition={{ ...fadeUp.transition, delay: i * 0.08 }}
                  className="group relative overflow-hidden p-7 rounded-2xl transition-all duration-300 hover:-translate-y-1.5"
                  style={{ background: "#fff", border: "1px solid var(--linea)", boxShadow: "0 8px 24px rgba(12,12,22,.06)" }}
                >
                  {/* Soft gradient glow on hover */}
                  <span
                    aria-hidden
                    className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                    style={{ background: "radial-gradient(closest-side, rgba(91,76,245,0.18), transparent 70%)", filter: "blur(12px)" }}
                  />
                  {/* Gradient icon block */}
                  <div className="relative w-14 h-14 rounded-2xl flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
                    style={{
                      background: "linear-gradient(135deg, var(--voltio) 0%, var(--cian) 100%)",
                      boxShadow: "0 8px 20px -6px rgba(91,76,245,.4)",
                    }}>
                    <Icon className="h-6 w-6 text-white" strokeWidth={2} />
                  </div>
                  <h3 className="relative font-display text-lg font-bold mb-2.5" style={{ color: "var(--ink)" }}>{t(c.titleKey)}</h3>
                  <p className="relative text-[13.5px] leading-relaxed" style={{ color: "var(--gris-1)" }}>{t(c.bodyKey)}</p>
                  {/* Bottom accent bar — reveals on hover */}
                  <span
                    aria-hidden
                    className="absolute bottom-0 left-0 h-[3px] w-0 group-hover:w-full transition-all duration-400"
                    style={{ background: "linear-gradient(90deg, var(--voltio), var(--cian))" }}
                  />
                </motion.div>
              );
            })}
          </div>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 text-center">
            <p className="text-sm" style={{ color: "var(--gris-1)" }}>{t("pt_s3_provider_note")}</p>
            <Link to="/ForProviders" className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--voltio)" }}>
              {t("pt_s3_provider_cta")} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── APPLICATION ── */}
      <section id="apply" className="scroll-mt-20 pb-20 sm:pb-24">
        <div className="max-w-2xl mx-auto px-5 sm:px-8">
          <div className="mb-8 text-center">
            <SectionLabel>{t("pt_s7_label")}</SectionLabel>
            <h2 className="font-display mt-4 text-2xl sm:text-3xl font-black tracking-[-0.03em]" style={{ color: "var(--ink)" }}>
              {t("pt_s7_title")}
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed" style={{ color: "var(--gris-1)" }}>
              {t("pt_s7_body")}
            </p>
          </div>
          <PartnerApplicationForm />
        </div>
      </section>
    </PublicPageShell>
  );
}