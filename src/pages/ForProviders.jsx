// ForProviders v2 — provider program page. PAPER-FIRST (Chunk 1d).
//
// Two-tier model:
//   Nivel 1 · Listed → provider publishes public pricing → enters CAMBRA's
//     achievable benchmark (PaymentsRateTable, verified=true, source_url +
//     source_quote citable). Auditability rule non-negotiable.
//   Nivel 2 · Partner → provider offers an EXCLUSIVE rate for merchants
//     arriving via CAMBRA (better than public) + referral agreement. Shown
//     on /Results as a labeled "CAMBRA exclusive offer" — NEVER folded into
//     the public benchmark. Benchmark stays 100% public and auditable.
//
// This page has ZERO fabricated network figures (no "X merchants
// connected"). If we need social proof we say "founding cohort in progress".
//
// Visual language: paper canvas + white cards + one authorized ink block
// for the closing CTA (.section-ink). Mirrors the approved Landing.

import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, ShieldCheck, Mail } from "lucide-react";
import PublicPageShell from "@/components/shared/PublicPageShell";
import PublicPageHero from "@/components/shared/PublicPageHero";
import SectionLabel from "@/components/shared/SectionLabel";
import { useTranslation } from "@/lib/i18n.jsx";
import {
  buildListedTier, buildPartnerTier, buildGuardrails,
} from "@/components/providers/forProvidersContent";

// Tier + guardrail copy lives in @/components/providers/forProvidersContent.

// Shared paper card style — white, --linea border, radius 14, spec shadow.
const CARD_STYLE = {
  background: "#FFFFFF",
  border: "1px solid var(--linea)",
  borderRadius: 14,
  boxShadow: "0 8px 24px rgba(12,12,22,.06)",
};

function TierCard({ tier, accent, t }) {
  const isPartner = accent === "partner";
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden p-6 sm:p-8"
      style={{
        ...CARD_STYLE,
        border: isPartner ? "1px solid rgba(58,43,176,0.30)" : "1px solid var(--linea)",
        boxShadow: isPartner
          ? "0 8px 24px rgba(12,12,22,.06), 0 0 40px -18px rgba(58,43,176,0.22)"
          : "0 8px 24px rgba(12,12,22,.06)",
      }}
    >
      <div className="mb-5 flex items-center gap-2">
        <SectionLabel
          style={
            isPartner
              ? { background: "rgba(58,43,176,0.06)", color: "var(--voltio)", border: "1px solid rgba(58,43,176,0.20)" }
              : undefined
          }
        >
          {tier.eyebrow}
        </SectionLabel>
      </div>

      <h3
        className="mb-2"
        style={{
          color: "var(--ink)",
          fontFamily: "'Space Grotesk', 'Inter', sans-serif",
          fontSize: "clamp(28px, 3.5vw, 40px)",
          fontWeight: 900,
          letterSpacing: "-0.035em",
          lineHeight: 1.02,
        }}
      >
        {tier.title}
      </h3>
      <p className="text-[15px] font-semibold mb-4" style={{ color: "var(--ink)" }}>{tier.tagline}</p>
      <p className="text-[14px] leading-relaxed mb-8" style={{ color: "var(--gris-1)" }}>{tier.intro}</p>

      <div className="mb-8">
        <p className="text-[10px] font-bold tracking-[0.22em] uppercase mb-3" style={{ color: "var(--gris-2)" }}>
          {t("fp_bring")}
        </p>
        <ul className="space-y-3">
          {tier.requirements.map((r) => (
            <li key={r.title} className="flex gap-3">
              <div
                className="h-8 w-8 rounded-lg shrink-0 flex items-center justify-center"
                style={{ background: "rgba(12,12,22,0.04)", border: "1px solid var(--linea)" }}
              >
                <r.icon size={13} style={{ color: "var(--gris-1)" }} />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>{r.title}</p>
                <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--gris-1)" }}>{r.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mb-6">
        <p className="text-[10px] font-bold tracking-[0.22em] uppercase mb-3" style={{ color: "var(--gris-2)" }}>
          {t("fp_deliver")}
        </p>
        <ul className="space-y-3">
          {tier.benefits.map((b) => (
            <li key={b.title} className="flex gap-3">
              <div
                className="h-8 w-8 rounded-lg shrink-0 flex items-center justify-center"
                style={{
                  background: isPartner ? "rgba(58,43,176,0.06)" : "rgba(12,12,22,0.04)",
                  border: isPartner ? "1px solid rgba(58,43,176,0.20)" : "1px solid var(--linea)",
                }}
              >
                <b.icon size={13} style={{ color: isPartner ? "var(--voltio)" : "var(--gris-1)" }} />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>{b.title}</p>
                <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--gris-1)" }}>{b.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="pt-5 mt-2" style={{ borderTop: "1px solid var(--linea)" }}>
        <p className="text-[10px] font-bold tracking-[0.22em] uppercase mb-1" style={{ color: "var(--gris-2)" }}>
          {t("fp_commercial")}
        </p>
        <p className="text-[13px]" style={{ color: "var(--gris-1)" }}>{tier.cost}</p>
      </div>
    </motion.article>
  );
}

export default function ForProviders() {
  const { t } = useTranslation();
  const listedTier = buildListedTier(t);
  const partnerTier = buildPartnerTier(t);
  const guardrails = buildGuardrails(t);

  return (
    <PublicPageShell>
      <PublicPageHero
        eyebrow={t("fp_hero_eyebrow")}
        align="left"
        title={<>{t("fp_hero_title_l1")}<br /><span className="kw-c">{t("fp_hero_title_kw")}</span></>}
        subtitle={t("fp_hero_sub")}
      />

      <div className="relative max-w-5xl mx-auto px-6 pt-14 pb-20">
        <Link to="/">
          <button
            className="mb-10 -ml-2 h-8 text-xs rounded-full px-3 inline-flex items-center transition-colors"
            style={{ color: "var(--gris-1)" }}
          >
            <ArrowLeft size={13} className="mr-1.5" /> {t("fp_back")}
          </button>
        </Link>

        {/* Tier cards */}
        <section className="mb-16">
          <div className="mb-8">
            <p className="text-[10px] font-bold tracking-[0.22em] uppercase mb-2" style={{ color: "var(--gris-2)" }}>
              {t("fp_ways_label")}
            </p>
            <h2
              style={{
                color: "var(--ink)",
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "clamp(28px, 3.8vw, 44px)",
                fontWeight: 900,
                letterSpacing: "-0.035em",
                lineHeight: 1.02,
              }}
            >
              {t("fp_ways_title")}
            </h2>
            <p className="mt-3 text-[14px] max-w-2xl" style={{ color: "var(--gris-1)" }}>
              {t("fp_ways_sub")}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <TierCard tier={listedTier} accent="listed" t={t} />
            <TierCard tier={partnerTier} accent="partner" t={t} />
          </div>
        </section>

        {/* Guardrails */}
        <section className="mb-16">
          <div className="mb-6">
            <p className="text-[10px] font-bold tracking-[0.22em] uppercase mb-2" style={{ color: "var(--gris-2)" }}>
              {t("fp_guard_label")}
            </p>
            <h2
              style={{
                color: "var(--ink)",
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "clamp(24px, 3vw, 36px)",
                fontWeight: 900,
                letterSpacing: "-0.035em",
                lineHeight: 1.05,
              }}
            >
              {t("fp_guard_title")}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {guardrails.map((g, i) => (
              <motion.div
                key={g.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="p-5"
                style={CARD_STYLE}
              >
                <div className="mb-3 flex items-center gap-2">
                  <ShieldCheck size={14} style={{ color: "var(--voltio)" }} />
                  <span className="text-[10px] font-bold tracking-[0.22em] uppercase" style={{ color: "var(--gris-2)" }}>
                    {t("fp_rule", { n: i + 1 })}
                  </span>
                </div>
                <p className="text-[14px] font-semibold mb-2 leading-tight" style={{ color: "var(--ink)" }}>
                  {g.title}
                </p>
                <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--gris-1)" }}>{g.body}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* CTA — the ONE authorized ink block on this page. */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="section-ink p-6 sm:p-10 text-center"
        >
          <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-cyan-300/90 mb-3">
            {t("fp_cta_label")}
          </p>
          <h2
            className="text-white mb-3"
            style={{
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              fontSize: "clamp(26px, 3.5vw, 40px)",
              fontWeight: 900,
              letterSpacing: "-0.035em",
              lineHeight: 1.05,
            }}
          >
            {t("fp_cta_title")}
          </h2>
          <p className="text-[14px] text-white/60 mb-6 max-w-xl mx-auto leading-relaxed">
            {t("fp_cta_sub")}
          </p>
          <a
            href="mailto:contact@cambra.global?subject=Provider%20program%20%E2%80%94%20CAMBRA"
            className="inline-flex items-center gap-2 rounded-full bg-white text-black px-7 py-3.5 font-bold text-[14px] transition-shadow hover:shadow-xl"
            style={{
              boxShadow:
                "0 0 0 1px rgba(255,255,255,0.1), 0 20px 50px -20px rgba(34,211,238,0.55), 0 0 40px rgba(34,211,238,0.22)",
            }}
          >
            <Mail size={15} />
            contact@cambra.global
            <ArrowRight size={15} />
          </a>
          <p className="mt-5 text-[11px] text-white/35">
            {t("fp_cta_note")}
          </p>
        </motion.section>
      </div>
    </PublicPageShell>
  );
}