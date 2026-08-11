import React from "react";
import { motion } from "framer-motion";
import { BadgeEuro, Building2, ChartNoAxesCombined, MapPinned } from "lucide-react";
import SectionLabel from "@/components/shared/SectionLabel";
import { useTranslation } from "@/lib/i18n.jsx";

const LAYERS = [
  { icon: MapPinned, title: "ri_layer_market_t", body: "ri_layer_market_d" },
  { icon: Building2, title: "ri_layer_provider_t", body: "ri_layer_provider_d" },
  { icon: BadgeEuro, title: "ri_layer_rate_t", body: "ri_layer_rate_d" },
  { icon: ChartNoAxesCombined, title: "ri_layer_opportunity_t", body: "ri_layer_opportunity_d" },
];

export default function RealImpactSection() {
  const { t } = useTranslation();
  return (
    <section className="relative py-12 sm:py-16 overflow-hidden">
      <div className="relative max-w-6xl mx-auto px-6 sm:px-10 grid grid-cols-1 lg:grid-cols-[.9fr_1.1fr] gap-10 lg:gap-16 items-center">
        <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: .7 }}>
          <div className="mb-5"><SectionLabel>{t("ri_eyebrow")}</SectionLabel></div>
          <h2 style={{ color: "var(--ink)", fontFamily: "'Space Grotesk','Inter',sans-serif", fontSize: "clamp(40px,6vw,72px)", fontWeight: 900, letterSpacing: "-.045em", lineHeight: 1 }}>
            {t("ri_h2_pre")}<br /><span className="kw">{t("ri_h2_kw")}</span>
          </h2>
          <p className="mt-6 text-[15px] leading-relaxed max-w-xl" style={{ color: "var(--gris-1)" }}>{t("ri_sub_pre")}</p>
          <div className="mt-7 flex flex-wrap gap-2">
            {["estimated", "provisional", "verified"].map((state) => <span key={state} className="rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[.16em] font-bold" style={{ color: "var(--voltio)", background: "rgba(91,76,245,.07)", border: "1px solid rgba(91,76,245,.2)" }}>{t(`ri_state_${state}`)}</span>)}
          </div>
        </motion.div>

        <div className="grid sm:grid-cols-2 gap-3">
          {LAYERS.map(({ icon: Icon, title, body }, index) => (
            <motion.article key={title} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: .55, delay: index * .08 }} className="rounded-2xl p-5" style={{ background: "#fff", border: "1px solid var(--linea)", boxShadow: "0 12px 35px -30px rgba(12,12,22,.3)" }}>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl" style={{ color: "var(--voltio)", background: "rgba(91,76,245,.07)" }}><Icon size={16} /></span>
              <h3 className="mt-4 text-[15px] font-bold" style={{ color: "var(--ink)" }}>{t(title)}</h3>
              <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: "var(--gris-1)" }}>{t(body)}</p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
