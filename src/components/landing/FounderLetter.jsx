import React from "react";
import { motion } from "framer-motion";
import { Building2, Quote, Rocket, Target } from "lucide-react";
import SectionLabel from "@/components/shared/SectionLabel";
import { useTranslation } from "@/lib/i18n.jsx";

/**
 * Founder letter — adapted to dark editorial theme.
 * Headline + two side-by-side cards (portrait | letter card).
 */
const FOUNDER_PHOTO =
  "https://media.base44.com/images/public/6a16288b833b3c26d7ac1fab/d863d71f2_0347F92E-E1B9-4977-A6B1-85897923556A.jpeg";

export default function FounderLetter() {
  const { t } = useTranslation();
  const metrics = [
    { icon: Building2, value: "10+", label: t("fl_metric_years") },
    { icon: Rocket, value: "1", label: t("fl_metric_mission") },
    { icon: Target, value: "100%", label: t("fl_metric_focus") },
  ];

  return (
    <section id="founder" className="relative scroll-mt-20 py-12 sm:py-16 overflow-hidden">
      <div aria-hidden className="absolute pointer-events-none" style={{ width: 760, height: 760, left: "48%", top: "50%", transform: "translate(-50%, -50%)", background: "radial-gradient(circle, rgba(91,76,245,.065) 0%, transparent 70%)", filter: "blur(90px)" }} />
      <div className="relative max-w-[1400px] mx-auto px-6 sm:px-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="grid grid-cols-1 lg:grid-cols-[.82fr_1.18fr] gap-8 lg:gap-12 items-stretch"
        >
          <div>
            <SectionLabel as="p">{t("fl_eyebrow")}</SectionLabel>
            <h2 className="mt-5 max-w-[570px]" style={{ color: "var(--ink)", fontFamily: "'Space Grotesk','Inter',sans-serif", fontSize: "clamp(40px,4.5vw,64px)", fontWeight: 900, letterSpacing: "-.05em", lineHeight: 1.01, textWrap: "balance" }}>
              {t("fl_h2_pre")} <span className="kw">{t("fl_h2_kw")}</span>
            </h2>
            <p className="mt-5 max-w-lg text-[14px] sm:text-[15px] leading-relaxed" style={{ color: "var(--gris-1)" }}>{t("fl_intro")}</p>

            <div className="relative mt-7 overflow-hidden rounded-[26px] min-h-[360px] sm:min-h-[430px]" style={{ background: "#06080F", border: "1px solid rgba(91,76,245,.10)" }}>
              <img src={FOUNDER_PHOTO} alt={t("fl_image_alt")} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 35%", filter: "contrast(1.02) saturate(.96)" }} />
              <div aria-hidden className="absolute inset-x-0 bottom-0 h-24" style={{ background: "linear-gradient(180deg,transparent,rgba(7,8,17,.18))" }} />
            </div>
          </div>

          <div className="flex h-full flex-col justify-end">
            <div className="relative overflow-hidden rounded-[28px] p-8 sm:p-10 lg:p-12 min-h-[390px] flex flex-col justify-between" style={{ background: "radial-gradient(120% 95% at 8% 0%,rgba(74,58,209,.34),transparent 54%),radial-gradient(110% 100% at 100% 100%,rgba(57,198,240,.13),transparent 60%),linear-gradient(180deg,#14112E 0%,#0A0818 100%)", border: "1px solid rgba(139,123,255,.20)" }}>
              <div aria-hidden className="absolute right-0 top-0 h-64 w-64" style={{ background: "radial-gradient(circle,rgba(139,123,255,.17),transparent 68%)", filter: "blur(36px)" }} />
              <div className="relative">
                <Quote size={42} className="mb-7" style={{ color: "var(--voltio-2)" }} strokeWidth={2.4} />
                <p className="text-white/95" style={{ fontSize: "clamp(20px,2.2vw,30px)", lineHeight: 1.42, fontWeight: 600, letterSpacing: "-.03em" }}>{t("fl_p1")}</p>
                <p className="kw mt-3" style={{ fontSize: "clamp(20px,2.2vw,30px)", lineHeight: 1.42, fontWeight: 800, letterSpacing: "-.03em" }}>{t("fl_p2")}</p>
              </div>
              <div className="relative mt-9 flex items-end justify-between gap-4 border-t border-white/10 pt-6">
                <div>
                  <p className="text-[14px] font-bold text-white">Xavier M. Contero</p>
                  <p className="mt-1 text-[12px] text-white/55">Founder &amp; CEO</p>
                </div>
                <span className="inline-flex items-center rounded-full border border-white/20 px-3.5 py-1.5 text-[9px] font-bold uppercase tracking-[.2em] text-white/70">{t("fl_role")}</span>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 overflow-hidden rounded-[24px]" style={{ background: "#FFFFFF", border: "1px solid rgba(91,76,245,.11)" }}>
              {metrics.map(({ icon: Icon, value, label }, index) => (
                <div key={label} className="relative px-3 py-6 text-center sm:px-5" style={{ borderLeft: index ? "1px solid rgba(91,76,245,.10)" : "none" }}>
                  <span className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-[14px]" style={{ color: "var(--voltio)", background: "rgba(91,76,245,.07)", border: "1px solid rgba(91,76,245,.10)" }}><Icon size={18} strokeWidth={1.8} /></span>
                  <p className="mt-3 font-black tabular-nums" style={{ color: "var(--voltio)", fontFamily: "'Space Grotesk','Inter',sans-serif", fontSize: "clamp(23px,2.3vw,32px)", letterSpacing: "-.045em" }}>{value}</p>
                  <p className="mx-auto mt-1 max-w-[150px] text-[10.5px] sm:text-[11.5px] leading-snug" style={{ color: "var(--gris-1)" }}>{label}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
