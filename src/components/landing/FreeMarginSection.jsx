import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, TrendingUp, Check } from "lucide-react";
import SectionLabel from "@/components/shared/SectionLabel";
import AnimatedSection from "@/components/landing/AnimatedSection";

/**
 * FreeMarginSection
 *
 * Explains CAMBRA's dual value model on the landing page:
 *   - SaaS savings = FREE MARGIN. Yours to keep. 0% fee. Ever.
 *   - Payments & Shipping = we recover for you, 25% of verified savings over
 *     24 months. Conditional — no savings, no fee.
 *
 * Why this exists as its own section:
 *   Users need to understand the pricing model BEFORE they read "how it
 *   works". The dual-column layout makes the asymmetry legible in one
 *   glance: one side literally free, other side risk-free.
 *
 * No new business logic. Pure marketing / positioning copy — the fee
 * numbers here are the same ones already framed in PricingDual and the
 * FAQ (25% · 24 months · verified · conditional). Copy in one language
 * (EN) on purpose, consistent with the rest of the landing.
 */
export default function FreeMarginSection() {
  return (
    <section id="model" className="relative py-12 sm:py-16 overflow-hidden">
      {/* Ambient dual glow — emerald on left, cyan on right */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 640, height: 640, left: "-8%", top: "20%",
          background: "radial-gradient(circle, rgba(52,211,153,0.10) 0%, transparent 70%)",
          filter: "blur(90px)",
        }}
      />
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 640, height: 640, right: "-8%", top: "20%",
          background: "radial-gradient(circle, rgba(34,211,238,0.12) 0%, transparent 70%)",
          filter: "blur(90px)",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-6 sm:px-10">
        <AnimatedSection>
          <div className="text-center mb-10">
            <SectionLabel className="mb-4 inline-block">The model</SectionLabel>
            <h2 className="text-white max-w-3xl mx-auto" style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.05 }}>
              Half your savings are{" "}
              <span
                style={{
                  background: "linear-gradient(135deg, #6ee7b7 0%, #34d399 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                yours to keep, free.
              </span>{" "}
              The other half, we recover for you.
            </h2>
            <p className="mt-4 text-white/60 text-[14px] max-w-2xl mx-auto leading-relaxed">
              We only charge when we do the negotiation and recovery — and only on savings verified against your real data.
            </p>
          </div>
        </AnimatedSection>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {/* LEFT — FREE MARGIN (SaaS) */}
          <AnimatedSection delay={0.15}>
            <motion.div
              whileHover={{ y: -3 }}
              transition={{ duration: 0.3 }}
              className="relative h-full p-6 sm:p-7 rounded-2xl overflow-hidden"
              style={{
                background:
                  "linear-gradient(180deg, rgba(52,211,153,0.06) 0%, rgba(255,255,255,0.02) 100%)",
                border: "1px solid rgba(52,211,153,0.18)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
              }}
            >
              <div
                className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 mb-4 text-[10px] uppercase tracking-[0.22em] font-bold"
                style={{
                  background: "rgba(52,211,153,0.12)",
                  border: "1px solid rgba(52,211,153,0.30)",
                  color: "#6ee7b7",
                }}
              >
                <Sparkles size={11} />
                Free margin
              </div>

              <h3 className="text-white font-black tracking-tight leading-[1.05]" style={{ fontSize: "clamp(22px, 2.6vw, 30px)" }}>
                SaaS savings.
                <br />
                <span style={{ color: "#6ee7b7" }}>Yours. 0% fee.</span>
              </h3>

              <p className="mt-3 text-white/65 text-[13px] leading-relaxed">
                We audit your software stack, find the duplicates, the wrong tiers, the tools you forgot about. Every euro we surface, you keep.
              </p>

              <ul className="mt-5 space-y-2">
                {[
                  "Full SaaS audit — free during early access",
                  "Concrete cancel & downgrade list",
                  "No fee, ever, on this margin",
                  "Our way of proving we save you money before you trust us",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5 text-[13px] text-white/80">
                    <Check size={13} className="mt-0.5 shrink-0" style={{ color: "#34d399" }} strokeWidth={3} />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>

              <div
                className="mt-6 pt-4 flex items-end justify-between gap-4"
                style={{ borderTop: "1px solid rgba(52,211,153,0.15)" }}
              >
                <div>
                  <div className="text-[9px] uppercase tracking-[0.22em] font-bold text-white/40 mb-1">
                    You keep
                  </div>
                  <div
                    className="font-black tabular-nums"
                    style={{
                      fontSize: 32,
                      lineHeight: 1,
                      background: "linear-gradient(135deg, #ffffff 0%, #6ee7b7 100%)",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    100%
                  </div>
                </div>
                <div className="text-right text-[10px] text-white/40 max-w-[10rem] leading-snug">
                  Zero fee on SaaS savings. Ever.
                </div>
              </div>
            </motion.div>
          </AnimatedSection>

          {/* RIGHT — RECOVERY (Payments + Shipping) */}
          <AnimatedSection delay={0.28}>
            <motion.div
              whileHover={{ y: -3 }}
              transition={{ duration: 0.3 }}
              className="relative h-full p-6 sm:p-7 rounded-2xl overflow-hidden"
              style={{
                background:
                  "linear-gradient(180deg, rgba(34,211,238,0.06) 0%, rgba(255,255,255,0.02) 100%)",
                border: "1px solid rgba(34,211,238,0.20)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
              }}
            >
              <div
                className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 mb-4 text-[10px] uppercase tracking-[0.22em] font-bold"
                style={{
                  background: "rgba(34,211,238,0.12)",
                  border: "1px solid rgba(34,211,238,0.35)",
                  color: "#67e8f9",
                }}
              >
                <TrendingUp size={11} />
                Recovery
              </div>

              <h3 className="text-white font-black tracking-tight leading-[1.05]" style={{ fontSize: "clamp(22px, 2.6vw, 30px)" }}>
                Payments & shipping.
                <br />
                <span style={{ color: "#67e8f9" }}>We recover. You share.</span>
              </h3>

              <p className="mt-3 text-white/65 text-[13px] leading-relaxed">
                We negotiate with your processors and carriers using the network's collective volume. You pay 25% of what we recover — verified against your real data. No savings, no fee.
              </p>

              <ul className="mt-5 space-y-2">
                {[
                  "We negotiate the contracts — you sign nothing you don't approve",
                  "25% of savings we verify against your provider data",
                  "Fee runs for 24 months from recovery — then 100% is yours forever",
                  "No savings, no fee. Zero risk to you.",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5 text-[13px] text-white/80">
                    <Check size={13} className="mt-0.5 shrink-0" style={{ color: "#22d3ee" }} strokeWidth={3} />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>

              <div
                className="mt-6 pt-4 flex items-end justify-between gap-4"
                style={{ borderTop: "1px solid rgba(34,211,238,0.15)" }}
              >
                <div>
                  <div className="text-[9px] uppercase tracking-[0.22em] font-bold text-white/40 mb-1">
                    You keep
                  </div>
                  <div
                    className="font-black tabular-nums"
                    style={{
                      fontSize: 32,
                      lineHeight: 1,
                      background: "linear-gradient(135deg, #ffffff 0%, #67e8f9 100%)",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    75%
                  </div>
                </div>
                <div className="text-right text-[10px] text-white/40 max-w-[10rem] leading-snug">
                  Of verified savings, for 24 months. Then 100%.
                </div>
              </div>
            </motion.div>
          </AnimatedSection>
        </div>

        {/* Footer CTA row */}
        <AnimatedSection delay={0.4}>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 text-center">
            <p className="text-white/50 text-[12px] max-w-md">
              Zero upfront. Zero subscription. You only pay when we've recovered margin against your real numbers.
            </p>
            <Link
              to="/Analyzer"
              className="inline-flex items-center gap-2 rounded-full bg-white text-black px-5 py-2.5 font-bold text-[12px] transition-transform hover:scale-[1.02] whitespace-nowrap"
              style={{
                boxShadow:
                  "0 0 0 1px rgba(255,255,255,0.1), 0 12px 32px -12px rgba(34,211,238,0.55)",
              }}
            >
              See what you're overpaying
              <ArrowRight size={13} />
            </Link>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}