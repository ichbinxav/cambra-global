import React from "react";
import { motion } from "framer-motion";
import SectionLabel from "@/components/shared/SectionLabel";
import SavingsCurveChart from "@/components/landing/SavingsCurveChart";

/**
 * Real Impact — promotes the existing "≈ 7% of annual profit" microcopy to
 * a headline. Reuses the untouched SavingsCurveChart (its curve, target,
 * stats, disclaimers and methodology note are NOT modified here).
 */
export default function RealImpactSection() {
  return (
    <section className="relative py-12 sm:py-16 overflow-hidden">
      {/* soft mint wash */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 700, height: 700, left: "50%", top: "8%", transform: "translateX(-50%)",
          background: "radial-gradient(circle, rgba(15,169,122,0.06) 0%, transparent 70%)",
          filter: "blur(90px)",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-6 sm:px-10 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        {/* LEFT — headline + sub */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="mb-5">
            <SectionLabel>Real impact</SectionLabel>
          </div>
          <h2
            style={{
              color: "var(--ink)",
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              fontSize: "clamp(44px, 7vw, 80px)",
              fontWeight: 900,
              letterSpacing: "-0.045em",
              lineHeight: 1.0,
            }}
          >
            That gap is
            <br />
            <span className="kw-m whitespace-nowrap">+7% net profit.</span>
          </h2>

          <p className="mt-6 text-[15px] sm:text-[16px] leading-relaxed max-w-xl" style={{ color: "var(--gris-1)" }}>
            One real brand, €1M in annual sales: paying an effective 2.21% per
            transaction when 1.47% was achievable. A{" "}
            <span className="kw-c">0.74-point</span> gap — €7,400 a year,
            ≈€15,000 over 24 months. Recovered, that's about 7% more net profit.
            Same sales. Same team.
          </p>
        </motion.div>

        {/* RIGHT — existing chart, logic untouched */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="relative p-6 sm:p-8 overflow-hidden"
          style={{
            background: "#fff",
            border: "1px solid var(--linea)",
            borderRadius: 26,
            boxShadow: "0 4px 20px rgba(12,12,22,0.04)",
          }}
        >
          <SavingsCurveChart />
        </motion.div>
      </div>
    </section>
  );
}