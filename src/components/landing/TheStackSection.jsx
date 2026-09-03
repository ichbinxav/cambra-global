import React from "react";
import { motion } from "framer-motion";
import { ChartNoAxesCombined, Database, PieChart, Target } from "lucide-react";
import SectionLabel from "@/components/shared/SectionLabel";
import { useTranslation } from "@/lib/i18n.jsx";

const LAYERS = [
  { icon: PieChart, title: "stack_c1_t", desc: "stack_c1_d", color: "#A678FF" },
  { icon: Database, title: "stack_c2_t", desc: "stack_c2_d", color: "#5E82FF" },
  { icon: ChartNoAxesCombined, title: "stack_c3_t", desc: "stack_c3_d", color: "#57D9F4" },
  { icon: Target, title: "stack_c4_t", desc: "stack_c4_d", color: "#91E56F" },
];

export default function TheStackSection() {
  const { t } = useTranslation();

  return (
    <section id="intelligence" className="relative scroll-mt-20 px-5 sm:px-8 py-12 sm:py-16 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
        className="relative max-w-[1500px] mx-auto overflow-hidden rounded-[32px] px-6 sm:px-10 lg:px-14 xl:px-16 py-12 sm:py-16"
        style={{ background: "#060711", border: "1px solid rgba(139,123,255,.16)" }}
      >
        <div aria-hidden="true" className="absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(rgba(139,123,255,.16) 1px,transparent 1px)", backgroundSize: "30px 30px", maskImage: "radial-gradient(ellipse 55% 75% at 88% 20%,#000,transparent 78%)" }} />

        <div className="relative">
          <SectionLabel as="p" tone="dark">{t("stack_eyebrow")}</SectionLabel>
          <h2 className="mt-5 max-w-[1280px] text-white" style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", fontSize: "clamp(38px,4.25vw,64px)", fontWeight: 900, letterSpacing: "-.05em", lineHeight: 1.01, textWrap: "pretty" }}>
            <span className="block">{t("stack_h2_pre")}</span>
            <span className="kw block">{t("stack_h2_kw")}</span>
          </h2>
          <p className="mt-5 max-w-[610px] text-[13.5px] sm:text-[14.5px] leading-relaxed" style={{ color: "rgba(255,255,255,.64)" }}>{t("prob_intro")}</p>
        </div>

        <div className="relative mt-8 sm:mt-10 grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(390px,.9fr)] gap-6 lg:gap-10 items-center">
          <div className="relative min-h-[380px] sm:min-h-[520px] lg:min-h-[640px] flex items-center justify-center overflow-visible">
            <div aria-hidden="true" className="absolute h-[56%] w-[62%] rounded-full" style={{ background: "rgba(45,82,255,.05)", filter: "blur(105px)" }} />
            <motion.img
              src="/images/cambra-intelligence-stack-v2.png"
              alt={`${t("stack_h2_pre")} ${t("stack_h2_kw")}`}
              width={1536}
              height={1024}
              loading="lazy"
              initial={{ opacity: 0, y: 22, scale: 0.98 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="relative h-auto w-[150%] max-w-none select-none sm:w-[138%] lg:w-[134%]"
              style={{ filter: "brightness(.78) saturate(.74) contrast(1.04)" }}
              draggable={false}
            />
          </div>

          <div className="relative">
            {LAYERS.map(({ icon: Icon, title, desc, color }, index) => (
              <motion.article
                key={title}
                initial={{ opacity: 0, x: 18 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.55, delay: index * 0.08 }}
                className="group relative grid grid-cols-[52px_1fr] gap-4 py-6 sm:py-7 first:pt-0 last:pb-0"
                style={{ borderTop: index ? "1px solid rgba(255,255,255,.09)" : "none" }}
              >
                <span aria-hidden="true" className="absolute -left-14 top-1/2 hidden h-px w-10 lg:block" style={{ background: `linear-gradient(90deg,transparent,${color})` }} />
                <span className="inline-flex h-[52px] w-[52px] items-center justify-center rounded-[15px] transition-transform duration-300 group-hover:-translate-y-0.5" style={{ color, border: `1px solid ${color}38`, background: `linear-gradient(145deg,${color}12,rgba(255,255,255,.015))`, boxShadow: `0 0 30px ${color}12, inset 0 1px 0 rgba(255,255,255,.04)` }}>
                  <Icon size={23} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[17px] sm:text-[18px] font-bold text-white tracking-[-.025em]">{t(title)}</h3>
                  <p className="mt-1.5 max-w-md text-[12.5px] sm:text-[13px] leading-relaxed text-white/55">{t(desc)}</p>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </motion.div>
    </section>
  );
}