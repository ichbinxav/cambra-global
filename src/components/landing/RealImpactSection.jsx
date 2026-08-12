import React from "react";
import { motion } from "framer-motion";
import { ArrowRight, BadgeEuro, ChartNoAxesCombined, ShieldCheck } from "lucide-react";
import SectionLabel from "@/components/shared/SectionLabel";
import { useTranslation } from "@/lib/i18n.jsx";

const METRICS = [
  { label: "ri_volume_label", amount: 2_000_000 },
  { label: "ri_rate_label", rate: 2.3 },
  { label: "ri_recovery_label", amount: 27_600, accent: true },
  { label: "ri_keep_label", amount: 20_700, positive: true },
];

export default function RealImpactSection() {
  const { t, lang, locale, formatCurrency } = useTranslation();
  const formatRate = (value) => `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}${lang === "en" ? "%" : " %"}`;

  return (
    <section className="relative py-12 sm:py-16 overflow-hidden" aria-labelledby="report-preview-title">
      <div className="relative max-w-6xl mx-auto px-6 sm:px-10 grid grid-cols-1 lg:grid-cols-[.82fr_1.18fr] gap-10 lg:gap-16 items-center">
        <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: .7 }}>
          <div className="mb-5"><SectionLabel>{t("ri_eyebrow")}</SectionLabel></div>
          <h2 id="report-preview-title" style={{ color: "var(--ink)", fontFamily: "'Space Grotesk','Inter',sans-serif", fontSize: "clamp(40px,6vw,72px)", fontWeight: 900, letterSpacing: "-.045em", lineHeight: 1 }}>
            {t("ri_h2_pre")}<br /><span className="kw">{t("ri_h2_kw")}</span>
          </h2>
          <p className="mt-6 text-[15px] leading-relaxed max-w-xl" style={{ color: "var(--gris-1)" }}>{t("ri_sub_pre")}</p>
          <div className="mt-7 flex items-start gap-3 text-[12px] leading-relaxed max-w-lg" style={{ color: "var(--gris-1)" }}>
            <ShieldCheck size={17} className="mt-0.5 shrink-0" style={{ color: "var(--menta-dark)" }} aria-hidden="true" />
            <p>{t("ri_method_note")}</p>
          </div>
        </motion.div>

        <motion.article
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: .65 }}
          className="relative overflow-hidden rounded-[28px] p-5 sm:p-7"
          style={{ background: "linear-gradient(165deg,#171330 0%,#0A0818 80%)", border: "1px solid rgba(139,123,255,.35)", boxShadow: "0 35px 90px -45px rgba(91,76,245,.7)" }}
          aria-describedby="report-preview-disclaimer"
        >
          <div aria-hidden="true" className="absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(rgba(139,123,255,.32) 1px,transparent 1px)", backgroundSize: "24px 24px", maskImage: "linear-gradient(to bottom,#000,transparent 85%)" }} />

          <div className="relative flex items-start justify-between gap-4 border-b border-white/10 pb-5">
            <div>
              <p className="text-[9px] uppercase tracking-[.22em] font-bold text-white/40">CAMBRA</p>
              <h3 className="mt-1 text-[17px] font-bold text-white">{t("ri_report_title")}</h3>
            </div>
            <span className="rounded-full px-2.5 py-1 text-[9px] uppercase tracking-[.14em] font-bold" style={{ color: "#B9AEFF", background: "rgba(139,123,255,.12)", border: "1px solid rgba(139,123,255,.3)" }}>{t("ri_illustrative")}</span>
          </div>

          <dl className="relative mt-5 grid grid-cols-2 gap-3">
            {METRICS.map((metric) => (
              <div key={metric.label} className="rounded-2xl p-4" style={{ background: metric.positive ? "rgba(47,224,168,.09)" : "rgba(255,255,255,.045)", border: metric.positive ? "1px solid rgba(47,224,168,.25)" : "1px solid rgba(255,255,255,.08)" }}>
                <dt className="text-[10px] leading-snug text-white/48">{t(metric.label)}</dt>
                <dd className="mt-2 text-[clamp(20px,4vw,28px)] font-black tabular-nums" style={{ color: metric.positive ? "#2FE0A8" : metric.accent ? "#B9AEFF" : "#fff", fontFamily: "'Space Grotesk','Inter',sans-serif", letterSpacing: "-.035em" }}>{metric.amount != null ? formatCurrency(metric.amount) : formatRate(metric.rate)}</dd>
              </div>
            ))}
          </dl>

          <div className="relative mt-5 rounded-2xl p-4" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }}>
            <div className="flex items-center justify-between gap-4 text-[10px] text-white/55">
              <span>{t("ri_current_cost")}</span><strong className="text-white tabular-nums">{formatCurrency(46_000)}</strong>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full flex" role="img" aria-label={t("ri_bar_alt")}>
              <span className="h-full" style={{ width: "40%", background: "rgba(255,255,255,.18)" }} />
              <span className="h-full" style={{ width: "45%", background: "linear-gradient(90deg,#8B7BFF,#39C6F0)" }} />
              <span className="h-full" style={{ width: "15%", background: "#2FE0A8" }} />
            </div>
            <div className="mt-3 flex items-center gap-2 text-[11px] font-semibold" style={{ color: "#2FE0A8" }}>
              <BadgeEuro size={14} aria-hidden="true" />{t("ri_keep_explainer")}
              <ArrowRight size={13} aria-hidden="true" />
            </div>
          </div>

          <p id="report-preview-disclaimer" className="relative mt-5 text-[10.5px] leading-relaxed text-white/45">
            <ChartNoAxesCombined size={13} className="inline mr-1.5 -mt-0.5" aria-hidden="true" />
            {t("ri_disclaimer")}
          </p>
        </motion.article>
      </div>
    </section>
  );
}
