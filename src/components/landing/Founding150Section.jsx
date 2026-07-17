import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import SectionLabel from "@/components/shared/SectionLabel";

/**
 * Founding 150 — dedicated section. Light background. Copy on the left,
 * lateral image slot on the right (asset arrives in Chunk 3).
 */
export default function Founding150Section() {
  return (
    <section className="relative py-12 sm:py-16 overflow-hidden">
      {/* voltio wash */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 700, height: 700, right: "-8%", top: "10%",
          background: "radial-gradient(circle, rgba(91,76,245,0.06) 0%, transparent 70%)",
          filter: "blur(90px)",
        }}
      />

      <div className="relative max-w-3xl mx-auto px-6 sm:px-10 text-center">
        {/* copy */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="mb-5">
            <SectionLabel>Founding 150</SectionLabel>
          </div>
          <h2
            style={{
              color: "var(--ink)",
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              fontSize: "clamp(40px, 6vw, 68px)",
              fontWeight: 900,
              letterSpacing: "-0.045em",
              lineHeight: 1.0,
            }}
          >
            150 brands. Free forever.
            <br />
            <span className="kw">One dataset.</span>
          </h2>

          <p className="mt-6 text-[15px] sm:text-[16px] leading-relaxed max-w-xl mx-auto" style={{ color: "var(--gris-1)" }}>
            We're selecting 150 independent brands (€200k–€2M in annual sales)
            to build Europe's first database of what payments really cost.
            In exchange: full analysis and ongoing monitoring, free, forever.
          </p>

          <div className="mt-8">
            <Link to="/Analyzer" className="btn-primary inline-flex items-center gap-2">
              Claim my spot
              <ArrowRight size={16} />
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}