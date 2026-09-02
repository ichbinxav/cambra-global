import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, Handshake, TrendingUp, HeartHandshake, LifeBuoy, FileText,
  BadgeCheck, BookOpen, Briefcase, Store, Users, Search, ShieldCheck, Zap,
  Calculator, Rocket, Check, X,
} from "lucide-react";
import PublicPageShell from "@/components/shared/PublicPageShell";
import PublicPageHero from "@/components/shared/PublicPageHero";
import PartnerApplicationForm from "@/components/partners/PartnerApplicationForm";
import { useTranslation } from "@/lib/i18n.jsx";

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
};

// ── Data ──
const PRINCIPLE_ICONS = [ShieldCheck, Users, BadgeCheck];
const PRINCIPLES = [
  { titleKey: "pt_s2_p1_title", bodyKey: "pt_s2_p1_body" },
  { titleKey: "pt_s2_p2_title", bodyKey: "pt_s2_p2_body" },
  { titleKey: "pt_s2_p3_title", bodyKey: "pt_s2_p3_body" },
];

const WHY_ICONS = [TrendingUp, HeartHandshake, LifeBuoy, FileText, BookOpen, BadgeCheck];
const WHY = [
  { titleKey: "pt_s4_b1_title", bodyKey: "pt_s4_b1_body" },
  { titleKey: "pt_s4_b2_title", bodyKey: "pt_s4_b2_body" },
  { titleKey: "pt_s4_b3_title", bodyKey: "pt_s4_b3_body" },
  { titleKey: "pt_s4_b4_title", bodyKey: "pt_s4_b4_body" },
  { titleKey: "pt_s4_b5_title", bodyKey: "pt_s4_b5_body" },
  { titleKey: "pt_s4_b6_title", bodyKey: "pt_s4_b6_body" },
];

const WHO_ICONS = [Briefcase, Store, Users, Calculator, Rocket];
const WHO_FOR = [
  { titleKey: "pt_s3_c1_title", bodyKey: "pt_s3_c1_body" },
  { titleKey: "pt_s3_c2_title", bodyKey: "pt_s3_c2_body" },
  { titleKey: "pt_s3_c3_title", bodyKey: "pt_s3_c3_body" },
  { titleKey: "pt_s3_c4_title", bodyKey: "pt_s3_c4_body" },
  { titleKey: "pt_s3_c5_title", bodyKey: "pt_s3_c5_body" },
];

const STEP_ICONS = [Handshake, Search, ShieldCheck, Zap];
const STEPS = [
  { titleKey: "pt_s5_step1", bodyKey: "pt_s5_step1_body" },
  { titleKey: "pt_s5_step2", bodyKey: "pt_s5_step2_body" },
  { titleKey: "pt_s5_step3", bodyKey: "pt_s5_step3_body" },
  { titleKey: "pt_s5_step4", bodyKey: "pt_s5_step4_body" },
];

const SIMPLE_ITEMS = ["pt_s6_p1", "pt_s6_p2", "pt_s6_p3", "pt_s6_p4", "pt_s6_p5", "pt_s6_p6"];
const PARTNER_DO = ["pt_princ_a_1", "pt_princ_a_2", "pt_princ_a_3", "pt_princ_a_4", "pt_princ_a_5", "pt_princ_a_6", "pt_princ_a_7"];
const PARTNER_DONT = ["pt_princ_b_1", "pt_princ_b_2", "pt_princ_b_3", "pt_princ_b_4", "pt_princ_b_5", "pt_princ_b_6", "pt_princ_b_7"];

// ── Systematic section header: mono index + tracked label + heading + intro ──
function SectionHead({ index, label, title, intro = null, dark = false }) {
  return (
    <div className="mb-10 sm:mb-12">
      <div className="flex items-center gap-3 mb-4">
        <span
          className="mono-num text-[12px] font-semibold tracking-[0.16em]"
          style={{ color: dark ? "#7DE3FF" : "var(--voltio)" }}
        >
          {index}
        </span>
        <span
          className="h-px w-8"
          style={{ background: dark ? "rgba(125,227,255,0.35)" : "rgba(91,76,245,0.35)" }}
        />
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.2em]"
          style={{ color: dark ? "rgba(255,255,255,0.55)" : "var(--gris-1)" }}
        >
          {label}
        </span>
      </div>
      <motion.h2
        {...fadeUp}
        className="font-display text-2xl sm:text-[2rem] font-black tracking-[-0.03em] leading-[1.05]"
        style={{ color: dark ? "#ffffff" : "var(--ink)" }}
      >
        {title}
      </motion.h2>
      {intro && (
        <motion.p
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.06 }}
          className="mt-4 text-[15px] leading-relaxed max-w-2xl"
          style={{ color: dark ? "rgba(255,255,255,0.58)" : "var(--gris-1)" }}
        >
          {intro}
        </motion.p>
      )}
    </div>
  );
}

// ── Unified light card ──
function LightCard({ icon: Icon, title, body, index }) {
  return (
    <motion.div
      {...fadeUp}
      transition={{ ...fadeUp.transition, delay: (index || 0) * 0.06 }}
      className="group relative h-full p-6 rounded-xl transition-all duration-300 hover:-translate-y-1"
      style={{ background: "#fff", border: "1px solid var(--linea)", boxShadow: "0 1px 2px rgba(12,12,22,0.04)" }}
    >
      <span
        aria-hidden
        className="absolute bottom-0 left-0 h-[2px] w-0 group-hover:w-full transition-all duration-400"
        style={{ background: "linear-gradient(90deg, var(--voltio), var(--cian))" }}
      />
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center mb-4 transition-colors duration-300"
        style={{ background: "rgba(91,76,245,0.07)", border: "1px solid rgba(91,76,245,0.14)" }}
      >
        <Icon className="h-[18px] w-[18px]" style={{ color: "var(--voltio)" }} strokeWidth={2} />
      </div>
      <h3 className="font-display text-[15px] font-bold mb-1.5 leading-tight" style={{ color: "var(--ink)" }}>{title}</h3>
      <p className="text-[13px] leading-relaxed" style={{ color: "var(--gris-1)" }}>{body}</p>
    </motion.div>
  );
}

export default function Partners() {
  const { t } = useTranslation();

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
        tone="dark"
      >
        <div className="flex flex-col sm:flex-row items-center gap-3 justify-center">
          <button onClick={scrollToApply} className="btn-base btn-primary-inverse btn-lg">
            {t("pt_hero_cta")} <ArrowRight className="h-4 w-4" />
          </button>
          <Link to="/how-it-works" className="btn-base btn-secondary-dark btn-lg">
            {t("pt_hero_cta2")}
          </Link>
        </div>
      </PublicPageHero>

      {/* ── 01 · THE PARTNER ROLE ── */}
      <section className="py-16 sm:py-24">
        <div className="max-w-5xl mx-auto px-5 sm:px-8">
          <SectionHead
            index="01"
            label={t("pt_s2_label")}
            title={t("pt_s2_title")}
            intro={t("pt_s2_body")}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {PRINCIPLES.map((c, i) => (
              <LightCard
                key={c.titleKey}
                index={i}
                icon={PRINCIPLE_ICONS[i]}
                title={t(c.titleKey)}
                body={t(c.bodyKey)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── 02 · WHAT YOU GAIN (dark) ── */}
      <section className="px-5 py-20 sm:py-24">
        <div className="section-ink px-6 sm:px-12 py-14 sm:py-20 max-w-5xl mx-auto">
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <span className="mono-num text-[12px] font-semibold tracking-[0.16em]" style={{ color: "#7DE3FF" }}>02</span>
              <span className="h-px w-8" style={{ background: "rgba(125,227,255,0.35)" }} />
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.55)" }}>{t("pt_s4_label")}</span>
            </div>
            <motion.h2
              {...fadeUp}
              className="font-display text-2xl sm:text-[2rem] font-black tracking-[-0.03em] leading-[1.05] text-white"
            >
              {t("pt_s4_title")}
            </motion.h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px rounded-xl overflow-hidden"
            style={{ background: "rgba(255,255,255,0.08)" }}>
            {WHY.map((c, i) => {
              const Icon = WHY_ICONS[i];
              return (
                <motion.div
                  key={c.titleKey}
                  {...fadeUp}
                  transition={{ ...fadeUp.transition, delay: i * 0.05 }}
                  className="group relative p-6 transition-colors duration-300 hover:bg-white/[0.03]"
                  style={{ background: "rgba(255,255,255,0.015)" }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}>
                      <Icon className="h-[17px] w-[17px]" strokeWidth={2} style={{ color: "rgba(255,255,255,0.85)" }} />
                    </div>
                    <span className="mono-num text-[11px] font-semibold" style={{ color: "rgba(255,255,255,0.35)" }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="font-display text-[14.5px] font-bold mb-1.5 text-white leading-tight">{t(c.titleKey)}</h3>
                  <p className="text-[12.5px] leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>{t(c.bodyKey)}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 03 · WHO IT'S FOR ── */}
      <section className="py-16 sm:py-24">
        <div className="max-w-5xl mx-auto px-5 sm:px-8">
          <SectionHead
            index="03"
            label={t("pt_s3_label")}
            title={t("pt_s3_title")}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {WHO_FOR.map((c, i) => (
              <LightCard
                key={c.titleKey}
                index={i}
                icon={WHO_ICONS[i]}
                title={t(c.titleKey)}
                body={t(c.bodyKey)}
              />
            ))}
          </div>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-2.5 text-center">
            <p className="text-[13px]" style={{ color: "var(--gris-1)" }}>{t("pt_s3_provider_note")}</p>
            <Link to="/ForProviders" className="inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: "var(--voltio)" }}>
              {t("pt_s3_provider_cta")} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── 04 · HOW IT WORKS ── */}
      <section className="px-5 py-16 sm:py-24">
        <div className="max-w-5xl mx-auto">
          <SectionHead
            index="04"
            label={t("pt_s5_label")}
            title={t("pt_s5_title")}
          />
          <div className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STEPS.map((s, i) => {
              const Icon = STEP_ICONS[i];
              return (
                <motion.div
                  key={s.titleKey}
                  {...fadeUp}
                  transition={{ ...fadeUp.transition, delay: i * 0.08 }}
                  className="group relative p-6 pt-7 rounded-xl transition-all duration-300 hover:-translate-y-1"
                  style={{ background: "#fff", border: "1px solid var(--linea)", boxShadow: "0 1px 2px rgba(12,12,22,0.04)" }}
                >
                  {/* Oversized mono index — sharp, systematic */}
                  <span
                    aria-hidden
                    className="absolute top-3 right-4 mono-num font-black leading-none select-none transition-colors duration-300"
                    style={{ fontSize: "2rem", color: "rgba(91,76,245,0.10)", letterSpacing: "-0.04em" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
                    style={{ background: "linear-gradient(135deg, var(--voltio), var(--cian))" }}
                  >
                    <Icon className="h-[18px] w-[18px] text-white" strokeWidth={2} />
                  </div>
                  <h3 className="font-display text-[15px] font-bold mb-1.5 leading-tight" style={{ color: "var(--ink)" }}>{t(s.titleKey)}</h3>
                  <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--gris-1)" }}>{t(s.bodyKey)}</p>
                </motion.div>
              );
            })}
          </div>
          <p className="mt-8 text-center text-[13px] italic" style={{ color: "var(--gris-2)" }}>
            {t("pt_s5_note")}
          </p>
        </div>
      </section>

      {/* ── 05 · THE BOUNDARIES (promises + role) ── */}
      <section className="px-5 py-16 sm:py-24">
        <div className="max-w-5xl mx-auto">
          <SectionHead
            index="05"
            label={t("pt_princ_title")}
            title={t("pt_s6_title")}
            intro={t("pt_s6_body")}
          />

          {/* Promise chips — sleek, not another card grid */}
          <div className="flex flex-wrap justify-center gap-2.5 mb-12">
            {SIMPLE_ITEMS.map((key, i) => (
              <motion.span
                key={key}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: i * 0.04 }}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full"
                style={{ background: "#fff", border: "1px solid var(--linea)" }}
              >
                <Check className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--menta-dark)" }} strokeWidth={3} />
                <span className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>{t(key)}</span>
              </motion.span>
            ))}
          </div>

          {/* Do / Don't — two sharp panels with colored accent */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <motion.div
              {...fadeUp}
              className="relative rounded-xl overflow-hidden"
              style={{ background: "#fff", border: "1px solid var(--linea)" }}
            >
              <span aria-hidden className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: "var(--menta)" }} />
              <div className="p-6">
                <div className="flex items-center gap-2.5 mb-4">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(47,224,168,0.10)" }}>
                    <Check className="h-4 w-4" style={{ color: "var(--menta-dark)" }} strokeWidth={3} />
                  </span>
                  <h3 className="font-display text-[15px] font-bold" style={{ color: "var(--ink)" }}>{t("pt_princ_a_title")}</h3>
                </div>
                <ul className="space-y-2">
                  {PARTNER_DO.map((key) => (
                    <li key={key} className="flex gap-2.5 text-[13px] leading-relaxed" style={{ color: "var(--gris-1)" }}>
                      <Check className="shrink-0 h-4 w-4 mt-px" style={{ color: "var(--menta-dark)" }} strokeWidth={2.5} />
                      <span>{t(key)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>

            <motion.div
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.07 }}
              className="relative rounded-xl overflow-hidden"
              style={{ background: "#fff", border: "1px solid var(--linea)" }}
            >
              <span aria-hidden className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: "var(--coral)" }} />
              <div className="p-6">
                <div className="flex items-center gap-2.5 mb-4">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(244,91,105,0.09)" }}>
                    <X className="h-4 w-4" style={{ color: "var(--coral)" }} strokeWidth={3} />
                  </span>
                  <h3 className="font-display text-[15px] font-bold" style={{ color: "var(--ink)" }}>{t("pt_princ_b_title")}</h3>
                </div>
                <ul className="space-y-2">
                  {PARTNER_DONT.map((key) => (
                    <li key={key} className="flex gap-2.5 text-[13px] leading-relaxed" style={{ color: "var(--gris-1)" }}>
                      <X className="shrink-0 h-4 w-4 mt-px" style={{ color: "var(--coral)" }} strokeWidth={2.5} />
                      <span>{t(key)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── 06 · APPLY ── */}
      <section id="apply" className="scroll-mt-20 px-5 pb-20 sm:pb-28">
        <div className="section-ink px-6 sm:px-12 py-14 sm:py-16 max-w-2xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <span className="mono-num text-[12px] font-semibold tracking-[0.16em]" style={{ color: "#7DE3FF" }}>06</span>
              <span className="h-px w-8" style={{ background: "rgba(125,227,255,0.35)" }} />
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.55)" }}>{t("pt_s7_label")}</span>
            </div>
            <motion.h2
              {...fadeUp}
              className="font-display text-2xl sm:text-[2rem] font-black tracking-[-0.03em] leading-[1.05] text-white"
            >
              {t("pt_s7_title")}
            </motion.h2>
            <motion.p
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.06 }}
              className="mt-4 text-[15px] leading-relaxed" style={{ color: "rgba(255,255,255,0.58)" }}
            >
              {t("pt_s7_body")}
            </motion.p>
          </div>
          <PartnerApplicationForm />
        </div>
      </section>
    </PublicPageShell>
  );
}
