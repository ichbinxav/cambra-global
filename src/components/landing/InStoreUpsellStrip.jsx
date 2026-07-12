// InStoreUpsellStrip — narrow banner under the Hero's Savings Curve.
//
// Purpose: signal that CAMBRA's payment analysis covers BOTH online and
// in-store (TPV / physical terminal) channels, aligned with the M4-TPV
// Fase 2B rollout. The strip is intentionally SMALL and single-line on
// desktop — it's a positioning cue, not a new hero.
//
// Design: matches the landing glass-panel language (translucent navy +
// cyan halo + white/60 body), same visual family as PricingDual and
// ProblemSectionWow so it inserts without a visual seam.
//
// Copy rule (payments-only R2 + M4-TPV): "in-store" is called out as a
// CHANNEL of the same product, not a separate vertical. The provider list
// is verbatim from the M4-Fase-2A seed (SumUp, Stripe Terminal, Smile&Pay,
// Zettle) plus the fallback bucket ("traditional bank TPVs") so a merchant
// on BNP/CA/SG sees themselves covered too. No pricing figure lives here —
// the seed's ticket-dependent floor (SumUp beats Stripe Terminal below €25,
// Stripe Terminal beats SumUp above €25) is too nuanced for a hero strip,
// and misleading if simplified. Merchants get the real number from
// /Analyzer.

import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Store, ArrowRight } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";

export default function InStoreUpsellStrip() {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t("landing_upsell_in_store_title")}
      className="relative py-8 sm:py-10"
    >
      <div className="max-w-5xl mx-auto px-6 sm:px-10">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl px-5 py-4 sm:px-7 sm:py-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6"
          style={{
            background:
              "linear-gradient(135deg, rgba(34,211,238,0.05) 0%, rgba(59,130,246,0.04) 100%)",
            border: "1px solid rgba(34,211,238,0.20)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            boxShadow: "0 0 32px rgba(34,211,238,0.10)",
          }}
        >
          {/* Icon + label */}
          <div className="flex items-center gap-3 shrink-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: "rgba(34,211,238,0.12)",
                border: "1px solid rgba(34,211,238,0.30)",
              }}
              aria-hidden="true"
            >
              <Store size={16} className="text-cyan-300" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-cyan-300/80">
                {t("landing_upsell_in_store_eyebrow")}
              </p>
              <p className="text-[14px] font-bold text-white leading-tight mt-0.5">
                {t("landing_upsell_in_store_title")}
              </p>
            </div>
          </div>

          {/* Body copy — provider list */}
          <p className="text-[12.5px] text-white/60 leading-relaxed flex-1">
            {t("landing_upsell_in_store_desc")}
          </p>

          {/* CTA */}
          <Link
            to="/Analyzer"
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-bold text-white/85 hover:text-white transition-colors shrink-0 whitespace-nowrap"
            style={{
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.04)",
            }}
          >
            {t("landing_upsell_in_store_cta")}
            <ArrowRight size={12} />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}