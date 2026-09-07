import React from "react";
import { Building2, PanelsTopLeft, ShoppingBag, Store } from "lucide-react";
import { motion } from "framer-motion";
import AnimatedSection from "@/components/landing/AnimatedSection";
import SectionHeading from "@/components/landing/SectionHeading";
import { useTranslation } from "@/lib/i18n.jsx";

const AUDIENCES = [
  { icon: ShoppingBag, title: "analyzer_channel_online", body: "az_ch_online_sub", accent: "#795FFF" },
  { icon: Store, title: "az_tpv_label", body: "az_ch_instore_sub", accent: "#4D7CFF" },
  { icon: PanelsTopLeft, title: "ac_chip_impact_complete", body: "stack_c1_d", accent: "#31BEE7" },
  { icon: Building2, title: "landing_audience_other", body: "cta_final_sub1", accent: "#28B98B" },
];

export default function AudienceSection() {
  const { t } = useTranslation();

  return (
    <section id="audience" className="relative scroll-mt-20 overflow-hidden py-12 sm:py-16">
      <div className="relative mx-auto max-w-[1400px] px-6 sm:px-10">
        <AnimatedSection className="grid grid-cols-1 items-end gap-6 lg:grid-cols-[minmax(0,.9fr)_minmax(360px,.72fr)] lg:gap-14">
          <SectionHeading eyebrow={t("pt_s3_label")} align="left">
            {t("hero_audience")}
          </SectionHeading>
          <p className="max-w-xl text-[14px] leading-relaxed sm:text-[15px] lg:justify-self-end" style={{ color: "var(--gris-1)" }}>
            {t("hero_sub")}
          </p>
        </AnimatedSection>

        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {AUDIENCES.map(({ icon: Icon, title, body, accent }, index) => (
            <motion.article
              key={title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.58, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
              className="group relative min-h-[210px] overflow-hidden rounded-[24px] p-6 sm:p-7"
              style={{
                background: "rgba(255,255,255,.88)",
                border: "1px solid rgba(91,76,245,.12)",
                boxShadow: "0 24px 60px -48px rgba(16,14,48,.52)",
              }}
            >
              <div aria-hidden className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg,transparent,${accent},transparent)` }} />
              <span
                className="inline-flex h-12 w-12 items-center justify-center rounded-[15px] transition-transform duration-300 group-hover:-translate-y-0.5"
                style={{ color: accent, background: `linear-gradient(145deg,${accent}18,#fff)`, border: `1px solid ${accent}35` }}
              >
                <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <p className="mt-8 text-[9px] font-bold tracking-[.2em]" style={{ color: accent }}>
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-2 text-[18px] font-bold leading-snug tracking-[-.025em]" style={{ color: "var(--ink)" }}>
                {t(title)}
              </h3>
              <p className="mt-2.5 text-[12.5px] leading-relaxed" style={{ color: "var(--gris-1)" }}>
                {t(body)}
              </p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
