import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, TrendingUp, Zap, Lock, Sparkles } from "lucide-react";
import PublicPageShell from "@/components/shared/PublicPageShell";
import PublicPageHero from "@/components/shared/PublicPageHero";
import SectionLabel from "@/components/shared/SectionLabel";
import SectionHeading from "@/components/landing/SectionHeading";
import PricingDual from "@/components/landing/PricingDual";
import { useTranslation } from "@/lib/i18n.jsx";

// Split heading — "you keep the margin." in the voltio gradient, per language.
const PRC_SPLIT_TITLE = {
  en: <>You <span className="kw">keep the margin.</span> We take a share.</>,
  fr: <>Vous <span className="kw">gardez la marge.</span> Nous en prenons une part.</>,
  es: <>Tú te quedas <span className="kw">el margen.</span> Nosotros una parte.</>,
};

const FAQ = [
  { q: "prc_faq_q1", a: "prc_faq_a1" },
  { q: "prc_faq_q2", a: "prc_faq_a2" },
  { q: "prc_faq_q3", a: "prc_faq_a3" },
  { q: "prc_faq_q4", a: "prc_faq_a4" },
  { q: "prc_faq_q5", a: "prc_faq_a5" },
  { q: "prc_faq_q6", a: "prc_faq_a6" },
];

const TRUST_POINTS = [
  { icon: ShieldCheck, key: "prc_trust_1" },
  { icon: Lock, key: "prc_trust_2" },
  { icon: Zap, key: "prc_trust_3" },
  { icon: TrendingUp, key: "prc_trust_4" },
];

// Shared paper card style — white, --linea border, radius 14, spec shadow.
const CARD_STYLE = {
  background: "#FFFFFF",
  border: "1px solid var(--linea)",
  borderRadius: 14,
  boxShadow: "0 8px 24px rgba(12,12,22,.06)",
};

function SplitVisual() {
  const { t, lang } = useTranslation();
  return (
    <div className="relative max-w-4xl mx-auto mb-16 sm:mb-20">
      <div className="mb-8">
        <SectionHeading eyebrow={t("prc_split_eyebrow")}>
          {PRC_SPLIT_TITLE[lang] || PRC_SPLIT_TITLE.en}
        </SectionHeading>
      </div>

      <div className="relative overflow-hidden" style={CARD_STYLE}>
        {/* 75 / 25 visual bar */}
        <div className="p-8 sm:p-10">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] font-bold mb-1" style={{ color: "var(--menta-dark)" }}>
                {t("prc_you_keep")}
              </p>
              {/* What the merchant KEEPS is the positive outcome → menta-dark (AA on paper). */}
              <p
                className="tabular-nums font-black"
                style={{
                  fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                  fontSize: "clamp(48px, 7vw, 84px)",
                  letterSpacing: "-0.05em",
                  lineHeight: 0.9,
                  color: "var(--menta-dark)",
                }}
              >
                75%
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.22em] font-bold mb-1" style={{ color: "var(--gris-2)" }}>
                {t("prc_cambra")}
              </p>
              <p
                className="tabular-nums font-black"
                style={{
                  fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                  fontSize: "clamp(32px, 4.5vw, 48px)",
                  letterSpacing: "-0.05em",
                  lineHeight: 0.9,
                  color: "var(--gris-1)",
                }}
              >
                25%
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-2.5 rounded-full overflow-hidden mb-6" style={{ background: "rgba(12,12,22,0.06)" }}>
            <div className="h-full flex">
              <div style={{ width: "75%", background: "var(--g-menta)" }} />
              <div style={{ width: "25%", background: "rgba(12,12,22,0.12)" }} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6" style={{ borderTop: "1px solid var(--linea)" }}>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] font-bold mb-1.5" style={{ color: "var(--gris-2)" }}>
                {t("prc_duration_label")}
              </p>
              <p className="text-[14px] font-semibold" style={{ color: "var(--ink)" }}>{t("prc_duration_val")}</p>
              <p className="text-[11.5px] mt-0.5" style={{ color: "var(--gris-1)" }}>
                {t("prc_duration_note")}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] font-bold mb-1.5" style={{ color: "var(--gris-2)" }}>
                {t("prc_atbench_label")}
              </p>
              <p className="text-[14px] font-semibold" style={{ color: "var(--ink)" }}>{t("prc_atbench_val")}</p>
              <p className="text-[11.5px] mt-0.5" style={{ color: "var(--gris-1)" }}>
                {t("prc_atbench_note")}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] font-bold mb-1.5" style={{ color: "var(--gris-2)" }}>
                {t("prc_nosav_label")}
              </p>
              <p className="text-[14px] font-semibold" style={{ color: "var(--ink)" }}>{t("prc_nosav_val")}</p>
              <p className="text-[11.5px] mt-0.5" style={{ color: "var(--gris-1)" }}>
                {t("prc_nosav_note")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const PRC_HERO_TITLE = {
  en: <>First <span className="kw">analyze.</span> Then <span className="kw">recover.</span></>,
  fr: <>D'abord <span className="kw">analyser.</span> Ensuite <span className="kw">récupérer.</span></>,
  es: <>Primero <span className="kw">analiza.</span> Luego <span className="kw">recupera.</span></>,
};

export default function Pricing() {
  const { t, lang } = useTranslation();
  return (
    <PublicPageShell>
      <PublicPageHero
        eyebrow={t("prc_hero_badge")}
        title={PRC_HERO_TITLE[lang] || PRC_HERO_TITLE.en}
        subtitle={t("prc_hero_sub")}
      >
        {/* CTA */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
          <Link to="/Analyzer" className="btn-primary inline-flex items-center gap-2">
            {t("prc_cta_primary")}
            <ArrowRight size={14} />
          </Link>
          <Link
            to="/HowItWorks"
            className="inline-flex items-center rounded-full px-7 py-3.5 text-[13px] font-medium transition-colors text-white/80 hover:text-white"
            style={{ border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)" }}
          >
            {t("prc_cta_secondary")}
          </Link>
        </div>

        {/* Trust bar */}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-[12px] text-white/60">
          {TRUST_POINTS.map(({ icon: Icon, key }) => (
            <span key={key} className="inline-flex items-center gap-1.5">
              <Icon size={13} style={{ color: "#7DE3FF" }} />
              {t(key)}
            </span>
          ))}
        </div>
      </PublicPageHero>

      <div className="relative pt-16 pb-20">
        <div className="max-w-6xl mx-auto px-5">
          {/* Split visual */}
          <SplitVisual />

          {/* Pricing dual — the two steps (shared landing component) */}
          <PricingDual />

          {/* Reassurance banner — voltio-tinted paper card */}
          <div
            className="mt-16 mb-16 max-w-3xl mx-auto rounded-2xl p-6 sm:p-8 relative overflow-hidden"
            style={{
              border: "1px solid rgba(58,43,176,0.20)",
              background: "linear-gradient(135deg, rgba(58,43,176,0.05) 0%, rgba(57,198,240,0.03) 100%)",
              boxShadow: "0 8px 24px rgba(12,12,22,.06)",
            }}
          >
            <div className="relative flex items-start gap-4">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(58,43,176,0.08)", border: "1px solid rgba(58,43,176,0.25)" }}
              >
                <Sparkles size={18} style={{ color: "var(--voltio)" }} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] font-bold mb-1.5" style={{ color: "var(--voltio)" }}>
                  {t("prc_promise_eyebrow")}
                </p>
                <p className="text-[14.5px] leading-relaxed" style={{ color: "var(--gris-1)" }}>
                  {t("prc_promise_text")}
                </p>
              </div>
            </div>
          </div>

          {/* FAQ */}
          <div className="mt-8 md:mt-12 max-w-3xl mx-auto">
            <div className="mb-8 text-center">
              <div className="flex justify-center mb-3">
                <SectionLabel>{t("prc_faq_eyebrow")}</SectionLabel>
              </div>
              <h2
                style={{
                  color: "var(--ink)",
                  fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                  fontSize: "clamp(28px, 4vw, 40px)",
                  fontWeight: 900,
                  letterSpacing: "-0.035em",
                  lineHeight: 1.05,
                }}
              >
                {t("prc_faq_h2")}
              </h2>
            </div>

            <div className="rounded-2xl overflow-hidden" style={CARD_STYLE}>
              {FAQ.map((item, i) => (
                <div
                  key={i}
                  className="px-6 py-5 sm:px-7 sm:py-6 transition-colors"
                  style={{ borderTop: i === 0 ? "none" : "1px solid var(--linea)" }}
                >
                  <p className="text-[15px] font-semibold tracking-tight mb-1.5" style={{ color: "var(--ink)" }}>
                    {t(item.q)}
                  </p>
                  <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--gris-1)" }}>
                    {t(item.a)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Final CTA */}
          <div className="mt-16 text-center">
            <Link to="/Analyzer" className="btn-primary inline-flex items-center gap-2">
              {t("prc_final_cta")}
              <ArrowRight size={16} />
            </Link>
            <p className="mt-4 text-[12px]" style={{ color: "var(--gris-2)" }}>
              {t("prc_final_note")}
            </p>
          </div>
        </div>
      </div>
    </PublicPageShell>
  );
}