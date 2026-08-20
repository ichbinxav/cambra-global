import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, CircleAlert, Globe2, Languages, Scale } from "lucide-react";
import { motion } from "framer-motion";
import SectionLabel from "@/components/shared/SectionLabel";
import JoinWaitlistButton from "@/components/landing/JoinWaitlistButton";
import { useTranslation } from "@/lib/i18n.jsx";
import { marketDisplayName, useMarket } from "@/lib/publicExperience.jsx";

export default function MarketAvailabilitySection() {
  const { locale, t } = useTranslation();
  const { marketCode, experience } = useMarket();
  const enabled = experience.analyzer.status === "ENABLED";
  const marketName = marketDisplayName(marketCode, locale);

  const rows = [
    { icon: Globe2, label: t("market_card_currency"), value: experience.currency },
    { icon: Languages, label: t("market_card_language"), value: t(`market_translation_${experience.translation.status.toLowerCase()}`) },
    { icon: Scale, label: t("market_card_legal"), value: t("market_legal_review") },
  ];

  return (
    <section id="market-availability" className="relative py-12 sm:py-16 px-5">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative max-w-6xl mx-auto overflow-hidden rounded-[28px] p-7 sm:p-10"
        style={{ background: "#fff", border: "1px solid rgba(91,76,245,.28)", boxShadow: "0 22px 70px -42px rgba(91,76,245,.45)" }}
      >
        <div className="grid lg:grid-cols-[1.25fr_.75fr] gap-9 items-center">
          <div>
            <SectionLabel>{t("market_section_eyebrow")}</SectionLabel>
            <h2 className="mt-5 font-black" style={{ color: "var(--ink)", fontFamily: "'Space Grotesk','Inter',sans-serif", fontSize: "clamp(34px,5vw,58px)", letterSpacing: "-.045em", lineHeight: 1 }}>
              {t("market_section_title", { market: marketName })}
            </h2>
            <p className="mt-5 max-w-2xl text-[14px] sm:text-[15px] leading-relaxed" style={{ color: "var(--gris-1)" }}>
              {enabled ? t("market_section_enabled") : t("market_section_limited")}
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              {enabled ? (
                <Link to={experience.analyzer.href} className="btn-primary inline-flex items-center gap-2">
                  {t("market_cta_analyze")} <ArrowRight size={15} />
                </Link>
              ) : (
                <JoinWaitlistButton
                  label={t("waitlist_cta")}
                  source="market_not_launch_waitlist"
                  context={{ market_code: marketCode }}
                />
              )}
              <span className="inline-flex items-center gap-2 text-[12px] font-semibold" style={{ color: enabled ? "var(--menta-dark)" : "#a15c00" }}>
                {enabled ? <CheckCircle2 size={15} /> : <CircleAlert size={15} />}
                {t(enabled ? "market_status_enabled" : "market_status_limited")}
              </span>
            </div>
          </div>
          <div className="space-y-2.5">
            {rows.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-3 rounded-2xl p-4" style={{ background: "rgba(91,76,245,.035)", border: "1px solid var(--linea)" }}>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl" style={{ color: "var(--voltio)", background: "rgba(91,76,245,.08)" }}><Icon size={16} /></span>
                <div><p className="text-[10px] uppercase tracking-[.18em] font-bold" style={{ color: "var(--gris-2)" }}>{label}</p><p className="mt-0.5 text-[13px] font-semibold" style={{ color: "var(--ink)" }}>{value}</p></div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </section>
  );
}
