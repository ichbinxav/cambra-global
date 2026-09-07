import { motion } from "framer-motion";
import { ArrowRight, Lock, Scale, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "@/lib/i18n.jsx";
import { BRAND_ASSETS } from "@/lib/brandAssets";
import SectionLabel from "@/components/shared/SectionLabel";

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
    <section className="cambra-public-hero pb-8">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
        className="cambra-public-container grid items-center gap-12 lg:grid-cols-[1fr_1.03fr]"
      >
        <div className="max-w-[680px]">
          <SectionLabel>{t("sec_eyebrow")}</SectionLabel>
          <h1 className="cambra-public-title mt-7">
            {t("trust_sec_h2_pre")}<br />
            <span className="kw">{t("trust_sec_h2_kw")}</span>
          </h1>
          <p className="cambra-public-lead mt-7 max-w-[650px]">{t("sec_sub")}</p>

          <div className="mt-8 flex flex-wrap gap-2.5">
            {[
              { icon: Lock, k: "sec_chip_1" },
              { icon: ShieldCheck, k: "sec_chip_2" },
              { icon: Scale, k: "sec_chip_3" },
            ].map(({ icon: Icon, k }) => (
              <span key={k} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#DDE0EA] bg-white/80 px-3.5 text-[11px] font-bold text-[#39435F] shadow-[0_12px_28px_-24px_rgba(26,35,65,.7)]">
                <Icon size={14} className="text-[#5B4CF5]" aria-hidden="true" />
                {t(k)}
              </span>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link to="/ConnectTools" className="btn-primary inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl px-6 text-[13px] font-bold text-white">
              {t("sec_cta_analyze")} <ArrowRight size={15} />
            </Link>
            <Link to="/Privacy" className="inline-flex min-h-[52px] items-center justify-center px-3 text-[13px] font-bold text-[#4433E8]">
              {t("trust_sec_link")} <ArrowRight className="ml-2" size={14} />
            </Link>
          </div>
        </div>

        <div className="cambra-security-visual-panel cambra-dark-panel" aria-label={t("trust_sec_vault_alt")}>
          <div aria-hidden="true" className="absolute inset-[16%] rounded-full bg-[#5B4CF5]/20 blur-[80px]" />
          <img
            src={BRAND_ASSETS.securityShield}
            alt=""
            width={1448}
            height={1086}
            className="relative z-10 h-auto w-full select-none object-contain"
            draggable={false}
          />
          <p className="relative z-10 mt-2 text-center text-[13px] font-semibold tracking-[.01em] text-white/74">
            {t("trust_sec_b1_t")} · {t("trust_sec_b2_t")}
          </p>
        </div>
      </motion.div>
    </section>
  );
}
