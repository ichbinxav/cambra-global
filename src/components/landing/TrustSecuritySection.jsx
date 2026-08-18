import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Lock, Eye, ShieldCheck, Boxes } from "lucide-react";
import { motion } from "framer-motion";
import { BRAND_ASSETS } from "@/lib/brandAssets";
import { useTranslation } from "@/lib/i18n.jsx";

/**
 * TrustSecuritySection — landing TRUST and SECURITY block (map v1.1).
 * Rendered as a .panel-dark (ink #0E0E1A + Aurora glow) between Founding 150
 * and the closing CTA. Copy is calibrated and must NOT be paraphrased. No
 * certifications are ever claimed. Uses only DA tokens (voltio/menta/gris/
 * linea) + .eyebrow + Space Grotesk / Inter hierarchy.
 */
/* I18N-GAP — copy lives in the i18n dictionary (trust_sec_*). */
const BULLETS = [
  { icon: Lock,        tKey: "trust_sec_b1_t", dKey: "trust_sec_b1_d" },
  { icon: Eye,         tKey: "trust_sec_b2_t", dKey: "trust_sec_b2_d" },
  { icon: ShieldCheck, tKey: "trust_sec_b3_t", dKey: "trust_sec_b3_d" },
  { icon: Boxes,       tKey: "trust_sec_b4_t", dKey: "trust_sec_b4_d" },
];

export default function TrustSecuritySection() {
  const { t } = useTranslation();
  return (
    <section className="relative py-12 sm:py-16 px-5">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative max-w-6xl mx-auto px-6 sm:px-12 py-14 sm:py-20 overflow-hidden"
        style={{
          background: "#0A0818",
          borderRadius: 24,
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Copy + bullets */}
          <div className="lg:col-span-7">
            <p className="eyebrow mb-5" style={{ color: "#ffffff" }}>{t("trust_sec_eyebrow")}</p>
            <h2
              style={{
                color: "#ffffff",
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "clamp(34px, 5vw, 56px)",
                fontWeight: 900,
                letterSpacing: "-0.045em",
                lineHeight: 1.02,
              }}
            >
              {t("trust_sec_h2_pre")}{" "}
              <span className="kw">{t("trust_sec_h2_kw")}</span>
            </h2>

            <div className="mt-9 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-7">
              {BULLETS.map((b) => {
                const Icon = b.icon;
                return (
                  <div key={b.tKey} className="flex items-start gap-3">
                    <span
                      className="inline-flex items-center justify-center h-9 w-9 rounded-lg shrink-0"
                      style={{
                        background: "rgba(139,123,255,0.12)",
                        border: "1px solid rgba(139,123,255,0.28)",
                        color: "var(--voltio-2)",
                      }}
                    >
                      <Icon size={16} strokeWidth={1.9} />
                    </span>
                    <div className="min-w-0">
                      <h3
                        className="mono-num text-[13px] font-semibold mb-1"
                        style={{ color: "#ffffff", letterSpacing: "-0.01em" }}
                      >
                        {t(b.tKey)}
                      </h3>
                      {/* Fix: --gris-1 (#585868) was unreadable on the #0A0818 panel. */}
                      <p className="text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.62)" }}>
                        {t(b.dKey)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-10">
              <Link
                to="/Security"
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold transition-colors"
                style={{ color: "var(--voltio-2)" }}
              >
                {t("trust_sec_link")}
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>

          {/* Vault render with its Aurora glow. The source image has a
              baked-in bounding box that shows against the ink panel — a radial
              mask fades its edges (especially the bottom) into the panel so
              there's no visible rectangle. */}
          <div className="relative lg:col-span-5 flex justify-center items-center">
            <img
              src={BRAND_ASSETS.vaultGlow}
              alt={t("trust_sec_vault_alt")}
              width={480}
              height={480}
              className="relative w-full max-w-[380px] h-auto select-none"
              draggable={false}
              style={{
                maskImage:
                  "radial-gradient(ellipse 70% 70% at 50% 40%, #000 48%, transparent 82%)",
                WebkitMaskImage:
                  "radial-gradient(ellipse 70% 70% at 50% 40%, #000 48%, transparent 82%)",
              }}
            />
          </div>
        </div>
      </motion.div>
    </section>
  );
}