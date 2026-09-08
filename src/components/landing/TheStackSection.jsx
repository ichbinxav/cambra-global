import React from "react";
import { motion } from "framer-motion";
import { ChartNoAxesCombined, Database, PieChart, Target } from "lucide-react";
import SectionLabel from "@/components/shared/SectionLabel";
import { useTranslation } from "@/lib/i18n.jsx";
import { BRAND_ASSETS } from "@/lib/brandAssets";

const LAYERS = [
  { icon: PieChart, title: "stack_c1_t", desc: "prob_c1_body", color: "#A678FF" },
  { icon: Database, title: "stack_c2_t", desc: "stack_c2_d", color: "#5E82FF" },
  { icon: ChartNoAxesCombined, title: "stack_c3_t", desc: "prob_c2_body", color: "#57D9F4" },
  { icon: Target, title: "stack_c4_t", desc: "prob_c3_body", color: "#91E56F" },
];

export default function TheStackSection() {
  const { t } = useTranslation();

  return (
    <section id="intelligence" className="relative scroll-mt-20 py-12 sm:py-16 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
        className="cambra-public-container relative overflow-hidden rounded-[32px] px-6 sm:px-10 lg:px-14 xl:px-16 py-12 sm:py-16"
        style={{ background: "#060711", border: "1px solid rgba(139,123,255,.16)" }}
      >
        <div aria-hidden="true" className="absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(rgba(139,123,255,.16) 1px,transparent 1px)", backgroundSize: "30px 30px", maskImage: "radial-gradient(ellipse 55% 75% at 88% 20%,#000,transparent 78%)" }} />

        <div className="relative grid grid-cols-1 lg:grid-cols-[minmax(0,1.18fr)_minmax(300px,.82fr)] gap-7 lg:gap-14 items-end">
          <div>
            <SectionLabel as="p" tone="dark">{t("stack_eyebrow")}</SectionLabel>
            <h2 className="mt-5 max-w-[780px] text-white" style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", fontSize: "clamp(38px,3.6vw,58px)", fontWeight: 900, letterSpacing: "-.05em", lineHeight: 1.01, textWrap: "balance" }}>
              {t("stack_h2_pre")}<br /><span className="kw">{t("stack_h2_kw")}</span>
            </h2>
          </div>
          <p className="max-w-[440px] text-[13.5px] sm:text-[14.5px] leading-relaxed lg:justify-self-end" style={{ color: "rgba(255,255,255,.67)" }}>
            {t("prob_intro")}
          </p>
        </div>

        <div className="relative mt-10 sm:mt-12 grid grid-cols-1 lg:grid-cols-[minmax(340px,.84fr)_minmax(0,1.16fr)] gap-8 lg:gap-16 items-center">
          <div className="relative flex h-[460px] sm:h-[580px] lg:h-[650px] items-center justify-center overflow-hidden" aria-hidden="true">
            <div className="absolute h-[60%] w-[72%] rounded-full" style={{ background: "radial-gradient(circle,rgba(62,93,255,.13),transparent 72%)", filter: "blur(74px)" }} />
            <motion.img
              src={BRAND_ASSETS.intelligenceStack}
              alt=""
              width={1024}
              height={1536}
              loading="lazy"
              initial={{ opacity: 0, scale: 0.96 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
              className="relative h-full w-full select-none object-contain"
              style={{ filter: "saturate(.74) brightness(.88) contrast(.98)" }}
              draggable={false}
            />
          </div>

          <div className="relative overflow-hidden rounded-[26px] border border-white/[.09] px-5 sm:px-7" style={{ background: "rgba(255,255,255,.024)" }}>
            {LAYERS.map(({ icon: Icon, title, desc, color }, index) => (
              <motion.article
                key={title}
                initial={{ opacity: 0, x: 18 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.55, delay: index * 0.08 }}
                className="group relative grid min-h-[122px] grid-cols-[52px_1fr] items-center gap-4 py-5 sm:py-6"
                style={{ borderTop: index ? "1px solid rgba(255,255,255,.09)" : "none" }}
              >
                <span className="inline-flex h-[52px] w-[52px] items-center justify-center rounded-[15px] transition-transform duration-300 group-hover:-translate-y-0.5" style={{ color, border: `1px solid ${color}38`, background: `linear-gradient(145deg,${color}12,rgba(255,255,255,.015))`, boxShadow: `0 0 30px ${color}12, inset 0 1px 0 rgba(255,255,255,.04)` }}>
                  <Icon size={23} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="text-[9px] font-bold tracking-[.18em]" style={{ color }}>{String(index + 1).padStart(2, "0")}</span>
                    <h3 className="text-[17px] sm:text-[18px] font-bold text-white tracking-[-.025em]">{t(title)}</h3>
                  </div>
                  <p className="mt-1.5 max-w-xl text-[12.5px] sm:text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,.58)" }}>{t(desc)}</p>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </motion.div>
    </section>
  );
}
