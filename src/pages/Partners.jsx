import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Handshake, TrendingUp, HeartHandshake, LifeBuoy, FileText, BadgeCheck, BookOpen, Briefcase, Store, Users, Search, ShieldCheck, Zap, Calculator, Rocket, Check, X } from "lucide-react";
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
const WHY_ICONS = [TrendingUp, HeartHandshake, LifeBuoy, FileText, BookOpen, BadgeCheck];
const WHY = [
  { titleKey: "pt_s4_b1_title", bodyKey: "pt_s4_b1_body" },
  { titleKey: "pt_s4_b2_title", bodyKey: "pt_s4_b2_body" },
  { titleKey: "pt_s4_b3_title", bodyKey: "pt_s4_b3_body" },
  { titleKey: "pt_s4_b4_title", bodyKey: "pt_s4_b4_body" },
  { titleKey: "pt_s4_b5_title", bodyKey: "pt_s4_b5_body" },
  { titleKey: "pt_s4_b6_title", bodyKey: "pt_s4_b6_body" },
];

const STEP_ICONS = [Handshake, Search, ShieldCheck, Zap];
const STEPS = [
  { titleKey: "pt_s5_step1", bodyKey: "pt_s5_step1_body" },
  { titleKey: "pt_s5_step2", bodyKey: "pt_s5_step2_body" },
  { titleKey: "pt_s5_step3", bodyKey: "pt_s5_step3_body" },
  { titleKey: "pt_s5_step4", bodyKey: "pt_s5_step4_body" },
];

const WHO_ICONS = [Briefcase, Store, Users, Calculator, Rocket];
const WHO_FOR = [
  { titleKey: "pt_s3_c1_title", bodyKey: "pt_s3_c1_body" },
  { titleKey: "pt_s3_c2_title", bodyKey: "pt_s3_c2_body" },
  { titleKey: "pt_s3_c3_title", bodyKey: "pt_s3_c3_body" },
  { titleKey: "pt_s3_c4_title", bodyKey: "pt_s3_c4_body" },
  { titleKey: "pt_s3_c5_title", bodyKey: "pt_s3_c5_body" },
];

// Definition principle cards — replace the old 25% / 24 / 0€ stats strip.
// These establish the non-commercial nature of the programme immediately.
const PRINCIPLE_ICONS = [ShieldCheck, Users, BadgeCheck];
const PRINCIPLES = [
  { titleKey: "pt_s2_p1_title", bodyKey: "pt_s2_p1_body" },
  { titleKey: "pt_s2_p2_title", bodyKey: "pt_s2_p2_body" },
  { titleKey: "pt_s2_p3_title", bodyKey: "pt_s2_p3_body" },
];

// "Simple by design" — the six things the programme is NOT.
const SIMPLE_ITEMS = ["pt_s6_p1", "pt_s6_p2", "pt_s6_p3", "pt_s6_p4", "pt_s6_p5", "pt_s6_p6"];

// Programme limits — what a Partner does / does not do.
const PARTNER_DO = ["pt_princ_a_1", "pt_princ_a_2", "pt_princ_a_3", "pt_princ_a_4", "pt_princ_a_5", "pt_princ_a_6", "pt_princ_a_7"];
const PARTNER_DONT = ["pt_princ_b_1", "pt_princ_b_2", "pt_princ_b_3", "pt_princ_b_4", "pt_princ_b_5", "pt_princ_b_6", "pt_princ_b_7"];

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

      {/* ── WHAT IS A PARTNER (definition + three principles) ── */}
      <section className="py-16 sm:py-20">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 text-center">
          <SectionLabel>{t("pt_s2_label")}</SectionLabel>
          <motion.h2
            {...fadeUp}
            className="font-display mt-4 text-2xl sm:text-3xl font-black tracking-[-0.03em]"
            style={{ color: "var(--ink)" }}
          >
            {t("pt_s2_title")}
          </motion.h2>
          <motion.p
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.08 }}
            className="mt-5 text-[15px] leading-relaxed"
            style={{ color: "var(--gris-1)" }}
          >
            {t("pt_s2_body")}
          </motion.p>
        </div>
        <div className="max-w-4xl mx-auto px-5 sm:px-8 mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PRINCIPLES.map((c, i) => {
            const Icon = PRINCIPLE_ICONS[i];
            return (
              <motion.div
                key={c.titleKey}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: 0.1 + i * 0.08 }}
                className="relative p-6 rounded-2xl text-center"
                style={{ background: "#fff", border: "1px solid var(--linea)", boxShadow: "0 8px 24px rgba(12,12,22,.06)" }}
              >
                <div className="w-12 h-12 mx-auto rounded-xl flex items-center justify-center mb-4"
                  style={{ background: "rgba(91,76,245,0.08)", border: "1px solid rgba(91,76,245,0.15)" }}>
                  <Icon className="h-5 w-5" style={{ color: "var(--voltio)" }} strokeWidth={2} />
                </div>
                <h3 className="font-display text-[15px] font-bold mb-2" style={{ color: "var(--ink)" }}>{t(c.titleKey)}</h3>
                <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--gris-1)" }}>{t(c.bodyKey)}</p>
              </motion.div>
            );
          })}
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
              {t("pt_s4_label")}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {WHY.map((c, i) => {
              const Icon = WHY_ICONS[i];
              return (
                <motion.div
                  key={c.titleKey}
                  {...fadeUp}
                  transition={{ ...fadeUp.transition, delay: 0.1 + i * 0.06 }}
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
                  {/* Icon with glow ring */}
                  <div className="relative w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110"
                    style={{
                      background: "linear-gradient(135deg, var(--voltio) 0%, var(--cian) 100%)",
                      boxShadow: "0 0 0 1px rgba(255,255,255,0.08), 0 10px 28px -8px rgba(91,76,245,.55), 0 0 36px rgba(91,76,245,.22)",
                    }}>
                    <Icon className="h-5 w-5 text-white" strokeWidth={2} />
                  </div>
                  <h3 className="relative font-display text-[15px] font-bold mb-2 text-white">{t(c.titleKey)}</h3>
                  <p className="relative text-[13px] leading-relaxed text-white/60">{t(c.bodyKey)}</p>
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

      {/* ── FOR YOUR CLIENTS (4-step flow) ── */}
      <section className="px-5 py-16 sm:py-20">
        <div className="max-w-5xl mx-auto">
          <div className="mb-12 text-center">
            <SectionLabel>{t("pt_s5_label")}</SectionLabel>
            <h2 className="font-display mt-4 text-2xl sm:text-3xl font-black tracking-[-0.03em] max-w-2xl mx-auto" style={{ color: "var(--ink)" }}>
              {t("pt_s5_title")}
            </h2>
          </div>
          <div className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {STEPS.map((s, i) => {
              const Icon = STEP_ICONS[i];
              return (
                <motion.div
                  key={s.titleKey}
                  {...fadeUp}
                  transition={{ ...fadeUp.transition, delay: i * 0.1 }}
                  className="relative p-6 rounded-2xl transition-all duration-300 hover:-translate-y-1"
                  style={{ background: "#fff", border: "1px solid var(--linea)", boxShadow: "0 8px 24px rgba(12,12,22,.06)" }}
                >
                  {/* Step number badge */}
                  <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black"
                    style={{ background: "linear-gradient(135deg, var(--voltio), var(--cian))", boxShadow: "0 4px 12px rgba(91,76,245,.4)" }}>
                    {i + 1}
                  </div>
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 mt-2"
                    style={{ background: "rgba(91,76,245,0.08)", border: "1px solid rgba(91,76,245,0.15)" }}>
                    <Icon className="h-5 w-5" style={{ color: "var(--voltio)" }} strokeWidth={2} />
                  </div>
                  <h3 className="font-display text-base font-bold mb-2" style={{ color: "var(--ink)" }}>{t(s.titleKey)}</h3>
                  <p className="text-[13px] leading-relaxed" style={{ color: "var(--gris-1)" }}>{t(s.bodyKey)}</p>
                </motion.div>
              );
            })}
          </div>
          <p className="mt-8 text-center text-sm italic" style={{ color: "var(--gris-1)" }}>
            {t("pt_s5_note")}
          </p>
        </div>
      </section>

      {/* ── SIMPLE BY DESIGN ── */}
      <section className="px-5 py-16 sm:py-20">
        <div className="max-w-4xl mx-auto">
          <div className="mb-10 text-center">
            <SectionLabel>{t("pt_s6_title")}</SectionLabel>
            <p className="mt-5 text-[15px] leading-relaxed max-w-2xl mx-auto" style={{ color: "var(--gris-1)" }}>
              {t("pt_s6_body")}
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {SIMPLE_ITEMS.map((key, i) => (
              <motion.div
                key={key}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: i * 0.05 }}
                className="flex items-center gap-3 p-4 rounded-xl"
                style={{ background: "#fff", border: "1px solid var(--linea)", boxShadow: "0 6px 18px rgba(12,12,22,.04)" }}
              >
                <span className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, var(--voltio), var(--cian))" }}>
                  <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                </span>
                <span className="text-[13px] font-semibold leading-tight" style={{ color: "var(--ink)" }}>{t(key)}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PROGRAMME LIMITS (do / don't) ── */}
      <section className="px-5 pb-16 sm:pb-20">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8 text-center">
            <SectionLabel>{t("pt_princ_title")}</SectionLabel>
            <p className="mt-5 text-[14px] leading-relaxed max-w-2xl mx-auto" style={{ color: "var(--gris-1)" }}>
              {t("pt_princ_intro")}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* What a Partner does */}
            <motion.div
              {...fadeUp}
              className="p-6 rounded-2xl"
              style={{ background: "#fff", border: "1px solid var(--linea)", boxShadow: "0 8px 24px rgba(12,12,22,.06)" }}
            >
              <div className="flex items-center gap-2 mb-4">
                <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "rgba(47,224,168,0.12)" }}>
                  <Check className="h-4 w-4" style={{ color: "var(--menta-dark)" }} strokeWidth={3} />
                </span>
                <h3 className="font-display text-base font-bold" style={{ color: "var(--ink)" }}>{t("pt_princ_a_title")}</h3>
              </div>
              <ul className="space-y-2.5">
                {PARTNER_DO.map((key) => (
                  <li key={key} className="flex gap-2.5 text-[13px] leading-relaxed" style={{ color: "var(--gris-1)" }}>
                    <Check className="shrink-0 h-4 w-4 mt-0.5" style={{ color: "var(--menta-dark)" }} strokeWidth={2.5} />
                    <span>{t(key)}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
            {/* What a Partner does NOT do */}
            <motion.div
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.08 }}
              className="p-6 rounded-2xl"
              style={{ background: "#fff", border: "1px solid var(--linea)", boxShadow: "0 8px 24px rgba(12,12,22,.06)" }}
            >
              <div className="flex items-center gap-2 mb-4">
                <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "rgba(244,91,105,0.10)" }}>
                  <X className="h-4 w-4" style={{ color: "var(--coral)" }} strokeWidth={3} />
                </span>
                <h3 className="font-display text-base font-bold" style={{ color: "var(--ink)" }}>{t("pt_princ_b_title")}</h3>
              </div>
              <ul className="space-y-2.5">
                {PARTNER_DONT.map((key) => (
                  <li key={key} className="flex gap-2.5 text-[13px] leading-relaxed" style={{ color: "var(--gris-1)" }}>
                    <X className="shrink-0 h-4 w-4 mt-0.5" style={{ color: "var(--coral)" }} strokeWidth={2.5} />
                    <span>{t(key)}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── APPLICATION (dark block so glass form is readable) ── */}
      <section id="apply" className="scroll-mt-20 px-5 pb-20 sm:pb-24">
        <div className="section-ink px-6 sm:px-12 py-14 sm:py-16 max-w-2xl mx-auto">
          <div className="mb-8 text-center">
            <motion.p {...fadeUp} className="text-[11px] font-bold tracking-[0.24em] uppercase mb-4" style={{ color: "#7DE3FF" }}>
              {t("pt_s7_label")}
            </motion.p>
            <motion.h2 {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.06 }} className="text-white font-display text-2xl sm:text-3xl font-black tracking-[-0.03em]">
              {t("pt_s7_title")}
            </motion.h2>
            <p className="mt-4 text-[15px] leading-relaxed text-white/60">
              {t("pt_s7_body")}
            </p>
          </div>
          <PartnerApplicationForm />
        </div>
      </section>
    </PublicPageShell>
  );
}