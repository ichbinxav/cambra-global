import React from "react";
import { motion } from "framer-motion";
import { FileSearch, Scale, Radar, ShieldCheck } from "lucide-react";
import AnimatedSection from "@/components/landing/AnimatedSection";
import SectionHeading from "@/components/landing/SectionHeading";
import { useTranslation } from "@/lib/i18n.jsx";

const CARD_KEYS = [
  { icon: FileSearch, title: "prob_c1_cat", body: "prob_c1_body", status: "prob_c1_status", color: "#8B7BFF" },
  { icon: Scale, title: "prob_c2_cat", body: "prob_c2_body", status: "prob_c2_status", color: "#39C6F0" },
  { icon: Radar, title: "prob_c3_cat", body: "prob_c3_body", status: "prob_c3_status", color: "#2FE0A8" },
];

export default function ProblemSectionWow() {
  const { t } = useTranslation();
  return (
    <section className="relative py-12 sm:py-16 overflow-hidden">
      <div aria-hidden className="absolute pointer-events-none" style={{ width: 700, height: 700, left: "50%", top: "5%", transform: "translateX(-50%)", background: "radial-gradient(circle, rgba(91,76,245,.08) 0%, transparent 70%)", filter: "blur(80px)" }} />
      <div className="relative max-w-7xl mx-auto px-6 sm:px-10">
        <AnimatedSection className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-end">
          <div className="lg:col-span-7">
            <SectionHeading eyebrow={t("prob_eyebrow")} align="left">
              {t("prob_h2_pre")} <span className="kw">{t("prob_h2_kw")}</span>
            </SectionHeading>
          </div>
          <p className="lg:col-span-5 text-center lg:text-justify text-[14px] sm:text-[15px] leading-relaxed" style={{ color: "var(--gris-1)" }}>
            <strong className="block mb-2" style={{ color: "var(--ink)" }}>{t("prob_h2_post")}</strong>
            {t("prob_intro")}
          </p>
        </AnimatedSection>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12">
          {CARD_KEYS.map((card, index) => {
            const Icon = card.icon;
            return (
              <motion.article
                key={card.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: .65, delay: index * .1, ease: [0.22, 1, 0.36, 1] }}
                className="relative rounded-2xl p-6 sm:p-7 overflow-hidden"
                style={{ background: "linear-gradient(180deg,#14112e 0%,#0a0818 100%)", border: "1px solid rgba(255,255,255,.10)" }}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: `${card.color}18`, border: `1px solid ${card.color}55`, color: card.color }}><Icon size={18} /></span>
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] uppercase tracking-[.16em] font-bold" style={{ color: card.color, background: `${card.color}12`, border: `1px solid ${card.color}35` }}><ShieldCheck size={11} />{t(card.status)}</span>
                </div>
                <h3 className="mt-6 text-[20px] font-bold text-white" style={{ letterSpacing: "-.025em" }}>{t(card.title)}</h3>
                <p className="mt-3 text-[13px] leading-relaxed text-white/55">{t(card.body)}</p>
              </motion.article>
            );
          })}
        </div>

        <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mt-6 rounded-2xl px-6 py-5 sm:flex items-center justify-between gap-6" style={{ background: "#fff", border: "1px solid rgba(91,76,245,.24)" }}>
          <div><p className="text-[10px] uppercase tracking-[.2em] font-bold" style={{ color: "var(--voltio)" }}>{t("prob_total_label")}</p><p className="mt-1 text-[14px] font-semibold" style={{ color: "var(--ink)" }}>{t("prob_total_line1")}</p></div>
          <p className="mt-3 sm:mt-0 max-w-xl text-[12px] leading-relaxed sm:text-right" style={{ color: "var(--gris-1)" }}>{t("prob_total_note")}</p>
        </motion.div>
      </div>
    </section>
  );
}
