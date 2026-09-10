import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, BadgeEuro, ChartNoAxesCombined, ShieldCheck } from "lucide-react";
import SectionLabel from "@/components/shared/SectionLabel";
import { BRAND_ASSETS } from "@/lib/brandAssets";
import { useTranslation } from "@/lib/i18n.jsx";

const METRICS = [
  { label: "ri_volume_label", amount: 5_000_000 },
  { label: "ri_rate_label", rate: 2.7 },
  { label: "pdf_achievable_rate", rate: 1.7 },
  { label: "ri_recovery_label", amount: 50_000, suffixKey: "rpt_per_year" },
];

export default function RealImpactSection({ embedded = false }) {
  const { t, lang, locale, formatCurrency } = useTranslation();
  const formatRate = (value) => `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}${lang === "en" ? "%" : " %"}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
      className={`${embedded ? "mt-6" : "my-12"} relative overflow-hidden rounded-[32px]`}
      style={{
        background: "linear-gradient(135deg,rgba(255,255,255,.96),rgba(242,245,255,.93) 54%,rgba(237,249,255,.9))",
        border: "1px solid rgba(91,76,245,.16)",
        boxShadow: "0 34px 90px -64px rgba(35,31,94,.62)",
      }}
      aria-labelledby="impact-example-title"
    >
      <div aria-hidden className="absolute inset-0 opacity-55" style={{ backgroundImage: "radial-gradient(rgba(91,76,245,.12) .8px,transparent .8px)", backgroundSize: "25px 25px", maskImage: "radial-gradient(circle at 22% 20%,#000,transparent 66%)" }} />

      <div className="relative grid grid-cols-1 items-stretch lg:grid-cols-[minmax(360px,.9fr)_minmax(0,1.1fr)]">
        <div className="relative flex min-h-[420px] items-center justify-center overflow-hidden p-5 sm:min-h-[520px] sm:p-8 lg:min-h-[610px] lg:p-10">
          <div aria-hidden className="absolute h-[72%] w-[72%] rounded-full" style={{ background: "radial-gradient(circle,rgba(91,76,245,.16),rgba(57,198,240,.06) 46%,transparent 72%)", filter: "blur(40px)" }} />
          <motion.img
            src={BRAND_ASSETS.impactExample}
            alt={t("ri_report_title")}
            width={1254}
            height={1254}
            loading="lazy"
            initial={{ opacity: 0, scale: 0.97, rotate: -1 }}
            whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.82, ease: [0.22, 1, 0.36, 1] }}
            className="relative h-auto w-full max-w-[610px] select-none"
            draggable={false}
            style={{
              mixBlendMode: "multiply",
              filter: "saturate(.97) contrast(1.01) drop-shadow(0 28px 40px rgba(74,63,190,.14))",
              maskImage: "radial-gradient(circle at 50% 48%,#000 62%,transparent 96%)",
              WebkitMaskImage: "radial-gradient(circle at 50% 48%,#000 62%,transparent 96%)",
            }}
          />
        </div>

        <div className="relative flex flex-col justify-center border-t border-[#E2E4F2] p-6 sm:p-9 lg:border-l lg:border-t-0 lg:p-12 xl:p-14">
          <SectionLabel as="p">{t("ri_eyebrow")}</SectionLabel>
          <h2 id="impact-example-title" className="mt-5 max-w-[660px]" style={{ color: "var(--ink)", fontSize: "clamp(34px,3.4vw,54px)", fontWeight: 900, letterSpacing: "-.048em", lineHeight: 1.01, textWrap: "balance" }}>
            {t("ri_h2_pre")}<br /><span className="kw">{t("ri_h2_kw")}</span>
          </h2>
          <p className="mt-5 max-w-[620px] text-[13.5px] leading-relaxed sm:text-[14.5px]" style={{ color: "var(--gris-1)" }}>{t("ri_sub_pre")}</p>

          <dl className="mt-7 grid grid-cols-2 overflow-hidden rounded-[22px] border border-[#DDE0EE] bg-white/75">
            {METRICS.map((metric, index) => (
              <div key={metric.label} className="min-h-[112px] p-4 sm:p-5" style={{ borderLeft: index % 2 ? "1px solid #E2E4F0" : "none", borderTop: index > 1 ? "1px solid #E2E4F0" : "none" }}>
                <dt className="text-[9px] font-bold uppercase leading-snug tracking-[.14em]" style={{ color: "var(--gris-1)" }}>{t(metric.label)}</dt>
                <dd className="mt-2 text-[clamp(22px,3vw,31px)] font-black tabular-nums tracking-[-.04em]" style={{ color: index === 3 ? "var(--voltio)" : "var(--ink)" }}>
                  {metric.amount != null ? formatCurrency(metric.amount) : formatRate(metric.rate)}
                  {metric.suffixKey && <span className="ml-1 text-[11px] font-semibold tracking-normal" style={{ color: "var(--gris-1)" }}>{t(metric.suffixKey)}</span>}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 overflow-hidden rounded-[22px] border border-[#252345]" style={{ background: "linear-gradient(135deg,#181539,#0A0D1B 72%,#071725)" }}>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 py-5 sm:px-6">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[.16em] text-white/45">{t("ri_recovery_label")} · {t("pd_t2_suffix")}</p>
                <p className="mt-1 text-[26px] font-black tabular-nums tracking-[-.04em] text-white">{formatCurrency(100_000)}</p>
              </div>
              <ArrowRight size={18} className="text-white/25" aria-hidden="true" />
              <div className="text-right">
                <p className="text-[9px] font-bold uppercase tracking-[.16em]" style={{ color: "#65E3BC" }}>{t("ri_keep_label")}</p>
                <p className="mt-1 text-[26px] font-black tabular-nums tracking-[-.04em]" style={{ color: "#65E3BC" }}>{formatCurrency(75_000)}</p>
              </div>
            </div>
            <div className="grid grid-cols-[3fr_1fr] gap-1 px-5 pb-5 sm:px-6">
              <span className="h-2 rounded-full bg-[#65E3BC]" />
              <span className="h-2 rounded-full bg-[#8B7BFF]" />
              <span className="text-[9px] font-semibold text-white/48">75%</span>
              <span className="text-right text-[9px] font-semibold text-white/48">CAMBRA 25%</span>
            </div>
          </div>

          <div className="mt-5 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <p className="flex max-w-[470px] items-start gap-2 text-[11px] leading-relaxed" style={{ color: "var(--gris-1)" }}>
              <ShieldCheck size={15} className="mt-0.5 shrink-0" style={{ color: "var(--menta-dark)" }} aria-hidden="true" />
              {t("ri_method_note")}
            </p>
            <Link to="/Analyzer" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-5 text-[12px] font-bold text-white" style={{ background: "var(--g-voltio)", boxShadow: "0 14px 30px -18px rgba(91,76,245,.72)" }}>
              <BadgeEuro size={15} aria-hidden="true" /> {t("hero_cta_primary")} <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>

          <p className="mt-4 flex items-center gap-2 text-[10px] leading-relaxed" style={{ color: "var(--gris-2)" }}>
            <ChartNoAxesCombined size={13} aria-hidden="true" /> {t("ri_illustrative")}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
