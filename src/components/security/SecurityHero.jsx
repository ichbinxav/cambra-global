import React from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Lock, Scale } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";
import { BRAND_ASSETS } from "@/lib/brandAssets";

/**
 * SecurityHero — hero for /Security, styled like the landing hero.
 * Light paper canvas (inherited from PublicPageShell), a soft voltio spotlight,
 * a violet eyebrow pill, a headline with the .kw voltio gradient keyword and
 * trust chips. No dark terminal — same visual language as the landing. DA
 * tokens only.
 */
export default function SecurityHero() {
  const { t } = useTranslation();
  return (
    <section className="relative px-5 sm:px-8 pt-28 sm:pt-32 pb-4 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: .8, ease: [0.22, 1, 0.36, 1] }}
        className="section-ink relative max-w-[1400px] mx-auto overflow-hidden px-6 sm:px-12 lg:px-14 py-14 sm:py-20"
      >
        <div className="relative grid grid-cols-1 lg:grid-cols-[1.15fr_.85fr] gap-10 lg:gap-6 items-center">
          <div>
            <p className="text-[10px] font-bold tracking-[.24em] uppercase" style={{ color: "#AFA2FF" }}>{t("sec_eyebrow")}</p>
            <h1 className="mt-6 text-white" style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", fontSize: "clamp(42px,5.2vw,72px)", fontWeight: 900, letterSpacing: "-.05em", lineHeight: .98 }}>
              {t("sec_h1_pre")} <span className="kw">{t("sec_h1_kw")}</span> {t("sec_h1_post")}
            </h1>
            <p className="mt-7 max-w-2xl text-[15px] sm:text-[17px] leading-relaxed text-white/62">{t("sec_sub")}</p>

            <div className="mt-9 flex flex-wrap gap-2.5">
              {[
                { icon: Lock, k: "sec_chip_1" },
                { icon: ShieldCheck, k: "sec_chip_2" },
                { icon: Scale, k: "sec_chip_3" },
              ].map(({ icon: Icon, k }) => (
                <span key={k} className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-semibold text-white/78" style={{ background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.10)" }}>
                  <Icon size={12} style={{ color: "#AFA2FF" }} aria-hidden="true" />
                  {t(k)}
                </span>
              ))}
            </div>
          </div>

          <div className="relative flex justify-center">
            <div aria-hidden="true" className="absolute inset-[20%] rounded-full" style={{ background: "rgba(91,76,245,.28)", filter: "blur(80px)" }} />
            <img src={BRAND_ASSETS.vaultGlow} alt="" width={520} height={520} className="relative w-full max-w-[500px] h-auto select-none" style={{ maskImage: "radial-gradient(ellipse 74% 74% at 50% 42%,#000 48%,transparent 83%)", WebkitMaskImage: "radial-gradient(ellipse 74% 74% at 50% 42%,#000 48%,transparent 83%)" }} draggable={false} />
          </div>
        </div>
      </motion.div>
    </section>
  );
}
