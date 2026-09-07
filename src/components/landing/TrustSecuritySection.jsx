import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Lock, Eye, ShieldCheck, Boxes } from "lucide-react";
import { motion } from "framer-motion";
import { BRAND_ASSETS } from "@/lib/brandAssets";
import SectionLabel from "@/components/shared/SectionLabel";
import { useTranslation } from "@/lib/i18n.jsx";

/** Trust and security, presented as evidence rather than a dense dark panel. */
/* I18N-GAP — copy lives in the i18n dictionary (trust_sec_*). */
const BULLETS = [
  { icon: Eye,         tKey: "trust_sec_b1_t", dKey: "trust_sec_b1_d" },
  { icon: Lock,        tKey: "trust_sec_b2_t", dKey: "trust_sec_b2_d" },
  { icon: ShieldCheck, tKey: "trust_sec_b3_t", dKey: "trust_sec_b3_d" },
  { icon: Boxes,       tKey: "trust_sec_b4_t", dKey: "trust_sec_b4_d" },
];

export default function TrustSecuritySection() {
  const { t } = useTranslation();
  return (
    <section id="trust" className="relative scroll-mt-20 px-5 py-12 sm:py-16">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative max-w-[1400px] mx-auto overflow-hidden rounded-[32px] px-6 py-12 sm:px-10 sm:py-14 lg:px-14 lg:py-16"
        style={{
          background: "linear-gradient(145deg,rgba(255,255,255,.96),rgba(246,248,255,.92))",
          border: "1px solid rgba(91,76,245,.12)",
          boxShadow: "0 34px 90px -68px rgba(30,26,76,.46), inset 0 1px 0 rgba(255,255,255,.98)",
        }}
      >
        <div aria-hidden="true" className="absolute inset-0 opacity-60" style={{ backgroundImage: "radial-gradient(rgba(91,76,245,.10) .8px,transparent .8px)", backgroundSize: "26px 26px", maskImage: "radial-gradient(circle at 86% 22%,#000,transparent 62%)" }} />

        <div className="relative z-10 grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(360px,.72fr)] lg:gap-14 lg:items-end">
          <div>
            <SectionLabel as="p" className="mb-5">{t("trust_sec_eyebrow")}</SectionLabel>
            <h2
              style={{
                color: "var(--ink)",
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "clamp(38px, 3.7vw, 58px)",
                fontWeight: 900,
                letterSpacing: "-0.045em",
                lineHeight: 1.02,
              }}
            >
              {t("trust_sec_h2_pre")}{" "}
              <span className="kw">{t("trust_sec_h2_kw")}</span>
            </h2>
          </div>

          <div className="lg:pb-1">
            <p className="max-w-xl text-[14px] leading-relaxed sm:text-[15px]" style={{ color: "var(--gris-1)" }}>
              {t("trust_sec_b1_d")} {t("trust_sec_b4_d")}
            </p>
            <div className="mt-5">
              <Link
                to="/Security"
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold transition-colors"
                style={{ color: "var(--voltio)" }}
              >
                {t("trust_sec_link")}
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-8 grid grid-cols-1 items-center gap-7 lg:grid-cols-[minmax(420px,.92fr)_minmax(0,1.08fr)] lg:gap-12">
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex min-h-[330px] items-center justify-center sm:min-h-[430px]"
          >
            <div aria-hidden className="absolute h-[72%] w-[78%] rounded-full" style={{ background: "radial-gradient(circle,rgba(91,76,245,.13),rgba(57,198,240,.045) 42%,transparent 72%)", filter: "blur(38px)" }} />
            <img
              src={BRAND_ASSETS.securityVisual}
              alt={t("trust_sec_vault_alt")}
              width={1536}
              height={1152}
              loading="lazy"
              className="relative h-auto w-full max-w-[700px] select-none"
              draggable={false}
              style={{ filter: "saturate(.9) contrast(1.015) drop-shadow(0 28px 36px rgba(52,56,156,.12))" }}
            />
          </motion.div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {BULLETS.map((b, index) => {
              const Icon = b.icon;
              return (
                <motion.article
                  key={b.tKey}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-30px" }}
                  transition={{ duration: 0.5, delay: index * 0.06 }}
                  className="flex min-h-[150px] items-start gap-3 rounded-[20px] p-5"
                  style={{ background: "rgba(255,255,255,.84)", border: "1px solid rgba(20,18,50,.08)", boxShadow: "0 20px 44px -38px rgba(20,18,50,.42)" }}
                >
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]" style={{ background: "rgba(91,76,245,.08)", border: "1px solid rgba(91,76,245,.15)", color: "var(--voltio)" }}>
                    <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[9px] font-bold tracking-[.18em]" style={{ color: "var(--voltio)" }}>{String(index + 1).padStart(2, "0")}</p>
                    <h3 className="mt-1.5 text-[13.5px] font-bold leading-snug" style={{ color: "var(--ink)" }}>{t(b.tKey)}</h3>
                    <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: "var(--gris-1)" }}>{t(b.dKey)}</p>
                  </div>
                </motion.article>
              );
            })}
          </div>
        </div>
      </motion.div>
    </section>
  );
}
