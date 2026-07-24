import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Eye, Database, Layers, Lock, Scale, Power } from "lucide-react";
import { motion } from "framer-motion";
import PublicPageShell from "@/components/shared/PublicPageShell";
import SecurityHero from "@/components/security/SecurityHero";
import SecurityBlock from "@/components/security/SecurityBlock";
import CanCannotTable from "@/components/security/CanCannotTable";
import { useTranslation } from "@/lib/i18n.jsx";

/**
 * /Security — public page. The honest answer to "what can CAMBRA see, and what
 * can it do?". Copy is calibrated and must NOT be paraphrased. No certifications
 * are ever claimed. Uses the shared PublicPageShell (paper canvas + violet dot
 * mesh, identical to the landing) with a cybersecurity scanline hero and
 * glowing dark glass blocks floating on top. DA tokens only.
 */
const CONTACT_EMAIL = "support@cambra.global";

export default function Security() {
  const { t } = useTranslation();
  // sec_b5_body carries an {email} interpolation slot; split around it so the
  // address stays a live mailto link (plain t() interpolation would flatten it).
  const b5Parts = t("sec_b5_body").split("{email}");
  return (
    <PublicPageShell>
      <SecurityHero />

      <div className="max-w-4xl mx-auto px-5 pb-8 space-y-6 sm:space-y-8 mt-12 sm:mt-16">
        {/* BLOCK 1 — What we can and cannot do */}
        <SecurityBlock
          index="01"
          icon={Eye}
          accent="voltio"
          title={t("sec_b1_h2")}
        >
          <p>{t("sec_b1_body")}</p>
          <CanCannotTable />
        </SecurityBlock>

        {/* BLOCK 2 — What data we actually use */}
        <SecurityBlock
          index="02"
          icon={Database}
          accent="voltio"
          title={t("sec_b2_h2")}
        >
          <p>{t("sec_b2_body")}</p>
        </SecurityBlock>

        {/* BLOCK 3 — Isolation */}
        <SecurityBlock
          index="03"
          icon={Layers}
          accent="voltio"
          title={t("sec_b3_h2")}
        >
          <p>{t("sec_b3_body")}</p>
        </SecurityBlock>

        {/* BLOCK 4 — Encryption & infrastructure */}
        <SecurityBlock
          index="04"
          icon={Lock}
          accent="voltio"
          title={t("sec_b4_h2")}
        >
          <p>{t("sec_b4_body")}</p>
        </SecurityBlock>

        {/* BLOCK 5 — GDPR */}
        <SecurityBlock
          index="05"
          icon={Scale}
          accent="voltio"
          title={t("sec_b5_h2")}
        >
          <p>
            {b5Parts[0]}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#5B4CF5", fontWeight: 600 }}>
              {CONTACT_EMAIL}
            </a>
            {b5Parts[1]}
          </p>
        </SecurityBlock>

        {/* BLOCK 6 — Disconnect anytime */}
        <SecurityBlock
          index="06"
          icon={Power}
          accent="coral"
          title={t("sec_b6_h2")}
        >
          <p>{t("sec_b6_body")}</p>
        </SecurityBlock>

        {/* CLOSING */}
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="text-center pt-8 pb-4"
        >
          <h2
            style={{
              color: "var(--ink)",
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              fontSize: "clamp(28px, 4vw, 44px)",
              fontWeight: 900,
              letterSpacing: "-0.04em",
              lineHeight: 1.02,
            }}
          >
            {t("sec_close_h2")}
          </h2>
          <p className="mt-5 max-w-xl mx-auto text-[15px] leading-relaxed" style={{ color: "var(--gris-1)" }}>
            {t("sec_close_body")}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/Analyzer"
              className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 font-medium text-[14px] text-white transition-transform hover:-translate-y-0.5"
              style={{ background: "var(--g-voltio)", boxShadow: "0 12px 32px -12px rgba(91,76,245,0.5)" }}
            >
              {t("sec_cta_analyze")}
              <ArrowRight size={16} />
            </Link>
            <Link
              to="/Contact"
              className="inline-flex items-center gap-1.5 rounded-full px-7 py-3.5 text-[14px] font-medium transition-colors"
              style={{ border: "1px solid var(--linea)", color: "var(--gris-1)", background: "#fff" }}
            >
              {t("sec_cta_contact")}
              <ArrowRight size={14} />
            </Link>
          </div>
        </motion.section>
      </div>
    </PublicPageShell>
  );
}