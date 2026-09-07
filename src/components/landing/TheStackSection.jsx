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

        <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-end">
          <div className="lg:col-span-8">
            <SectionLabel as="p" tone="dark">{t("stack_eyebrow")}</SectionLabel>
            <h2 className="mt-5 max-w-[920px] text-white" style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", fontSize: "clamp(38px,4.25vw,64px)", fontWeight: 900, letterSpacing: "-.05em", lineHeight: 1.01, textWrap: "balance" }}>
              {t("stack_h2_pre")} <span className="kw">{t("stack_h2_kw")}</span>
            </h2>
          </div>
          <p className="lg:col-span-4 text-[13.5px] sm:text-[14.5px] leading-relaxed lg:text-justify" style={{ color: "rgba(255,255,255,.67)" }}>
            {t("stack_c1_d")} {t("stack_c3_d")}
          </p>
        </div>

        <div className="relative mt-9 sm:mt-12 grid grid-cols-1 lg:grid-cols-[minmax(0,.9fr)_minmax(420px,1.1fr)] gap-8 lg:gap-14 items-center">
          <div className="relative min-h-[420px] sm:min-h-[500px] flex items-center justify-center overflow-hidden lg:overflow-visible" aria-hidden="true">
            <div className="absolute h-[68%] w-[68%] rounded-full" style={{ background: "radial-gradient(circle,rgba(69,75,255,.16),transparent 70%)", filter: "blur(64px)" }} />
            <div className="relative h-[420px] w-full max-w-[620px] sm:h-[500px]">
              {LAYERS.map(({ icon: Icon, color }, index) => (
                <motion.div
                  key={color}
                  initial={{ opacity: 0, y: 22 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.45, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute left-1/2 flex h-[128px] w-[76%] items-center justify-center rounded-[30px]"
                  style={{
                    top: `${index * 96 + 16}px`,
                    zIndex: 10 - index,
                    color,
                    background: `linear-gradient(145deg,${color}20,rgba(9,12,28,.96) 58%,${color}0D)`,
                    border: `1px solid ${color}88`,
                    boxShadow: `0 24px 46px -32px ${color}, inset 0 1px 0 rgba(255,255,255,.12)`,
                    transform: "translateX(-50%) perspective(900px) rotateX(56deg) rotateZ(-2deg)",
                    transformOrigin: "50% 50%",
                  }}
                >
                  <Icon size={34} strokeWidth={1.45} />
                </motion.div>
              ))}
            </div>
          </div>

          <div className="relative rounded-[26px] border border-white/[.08] px-5 sm:px-7" style={{ background: "rgba(255,255,255,.018)" }}>
            {LAYERS.map(({ icon: Icon, title, desc, color }, index) => (
              <motion.article
                key={title}
                initial={{ opacity: 0, x: 18 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.55, delay: index * 0.08 }}
                className="group relative grid grid-cols-[52px_1fr] gap-4 py-6 sm:py-7"
                style={{ borderTop: index ? "1px solid rgba(255,255,255,.09)" : "none" }}
              >
                <span aria-hidden="true" className="absolute -left-[84px] top-1/2 hidden h-px w-[70px] lg:block" style={{ background: `linear-gradient(90deg,transparent,${color})` }} />
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
