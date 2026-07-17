// InStoreUpsellStrip — the "we also cover your physical terminal" moment.
//
// Purpose: signal that CAMBRA's payment analysis covers BOTH online and
// in-store (TPV / TPE physical terminal) channels (M4-TPV Fase 2B).
//
// Design: a full WOW navy card on the paper canvas — bold headline, cyan
// halo, provider chips (SumUp, Stripe Terminal, Smile & Pay, Zettle +
// traditional bank TPVs) and a strong CTA. Same navy pill family as the
// rest of the landing dark cards, just slightly more translucent.
//
// Copy rule (payments-only R2 + M4-TPV): "in-store" is a CHANNEL of the
// same product, not a separate vertical. No pricing figure lives here —
// merchants get the real number from /Analyzer.

import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Store, ArrowRight, CreditCard } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";

const PROVIDERS = ["SumUp", "Stripe Terminal", "Smile & Pay", "Zettle", "Bank TPVs"];

export default function InStoreUpsellStrip() {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t("landing_upsell_in_store_title")}
      className="relative py-10 sm:py-14 px-4 sm:px-6"
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative mx-auto max-w-6xl rounded-[28px] overflow-hidden p-8 sm:p-12"
        style={{
          background:
            "linear-gradient(135deg, rgba(13,18,38,0.82) 0%, rgba(10,13,28,0.82) 55%, rgba(8,9,15,0.82) 100%)",
          border: "1px solid rgba(139,123,255,0.22)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          boxShadow:
            "0 40px 100px -40px rgba(0,0,0,0.55), 0 0 60px -20px rgba(91,76,245,0.35)",
        }}
      >
        {/* Cyan corner bloom */}
        <div
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            width: 420,
            height: 420,
            right: "-12%",
            top: "-40%",
            background:
              "radial-gradient(circle, rgba(139,123,255,0.30) 0%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />

        <div className="relative flex flex-col lg:flex-row items-start lg:items-center gap-8 lg:gap-12">
          {/* LEFT — icon + copy */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-5">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                style={{
                  background: "rgba(139,123,255,0.16)",
                  border: "1px solid rgba(139,123,255,0.38)",
                  boxShadow: "0 0 24px rgba(91,76,245,0.35)",
                }}
                aria-hidden="true"
              >
                <Store size={20} style={{ color: "#8B7BFF" }} />
              </div>
              <span className="text-[10px] uppercase tracking-[0.28em] font-bold" style={{ color: "rgba(139,123,255,0.95)" }}>
                {t("landing_upsell_in_store_eyebrow")}
              </span>
            </div>

            <h2
              className="text-white"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "clamp(28px, 4vw, 44px)",
                fontWeight: 900,
                letterSpacing: "-0.04em",
                lineHeight: 1.02,
              }}
            >
              {t("landing_upsell_in_store_title")}
            </h2>

            <p className="mt-4 text-[14px] sm:text-[15px] text-white/70 leading-relaxed max-w-xl">
              {t("landing_upsell_in_store_desc")}
            </p>

            {/* Provider chips */}
            <div className="mt-6 flex flex-wrap gap-2">
              {PROVIDERS.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold text-white/85"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                >
                  <CreditCard size={11} style={{ color: "rgba(139,123,255,0.85)" }} />
                  {p}
                </span>
              ))}
            </div>
          </div>

          {/* RIGHT — CTA */}
          <div className="shrink-0">
            <Link
              to="/Analyzer"
              className="inline-flex items-center justify-center gap-2 rounded-full px-7 py-4 text-[14px] font-bold transition-transform hover:-translate-y-0.5 whitespace-nowrap"
              style={{
                background: "#ffffff",
                color: "#0a0f1e",
                boxShadow:
                  "0 0 0 1px rgba(255,255,255,0.12), 0 20px 48px -18px rgba(91,76,245,0.6)",
              }}
            >
              {t("landing_upsell_in_store_cta")}
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </motion.div>
    </section>
  );
}