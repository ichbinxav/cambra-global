import React from "react";
import { motion } from "framer-motion";
import { TrendingDown, Truck, Layers } from "lucide-react";
import SectionLabel from "@/components/shared/SectionLabel";
import AnimatedSection from "@/components/landing/AnimatedSection";

/**
 * Problem section — simplified, calmer.
 * 3 clean cards (no aggressive red), restrained typography, focused message.
 */
const ITEMS = [
  {
    icon: TrendingDown,
    category: "Payments",
    amount: "€8,400",
    body: "Most brands pay 2.2–2.8% in fees. Optimised rate for your volume: 1.4–1.8%.",
  },
  {
    icon: Truck,
    category: "Shipping",
    amount: "€4,200",
    body: "Carriers charge brands without collective leverage 15–30% more.",
  },
  {
    icon: Layers,
    category: "SaaS & Tools",
    amount: "€3,600",
    body: "Avg. independent brand pays for 4–6 overlapping or underused tools.",
  },
];

function Card({ item, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.6, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
      className="relative rounded-2xl p-7 h-full"
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center mb-5"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.10)",
        }}
      >
        <item.icon size={16} className="text-white/75" />
      </div>

      <p className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/50 mb-3">
        {item.category}
      </p>

      <p
        className="font-black tabular-nums mb-2 text-white"
        style={{
          fontFamily: "'Space Grotesk', 'Inter', sans-serif",
          fontSize: "clamp(32px, 4vw, 44px)",
          letterSpacing: "-0.04em",
          lineHeight: 1,
        }}
      >
        −{item.amount}
        <span className="text-[13px] font-bold text-white/45 ml-1">/yr</span>
      </p>

      <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/40 mb-4">
        Lost on average
      </p>

      <p className="text-[13px] text-white/55 leading-relaxed">{item.body}</p>
    </motion.div>
  );
}

export default function ProblemSectionWow() {
  return (
    <section className="relative py-24 sm:py-32 overflow-hidden">
      <div className="relative max-w-6xl mx-auto px-6 sm:px-10">
        <AnimatedSection>
          <SectionLabel className="mb-6">The hidden cost problem</SectionLabel>
          <h2
            className="text-white max-w-3xl mb-4"
            style={{
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              fontSize: "clamp(36px, 5.5vw, 64px)",
              fontWeight: 900,
              letterSpacing: "-0.04em",
              lineHeight: 1.02,
            }}
          >
            Independent brands overpay by{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #60a5fa 0%, #22d3ee 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              20–40%
            </span>{" "}
            on infrastructure.{" "}
            <span style={{ color: "rgba(255,255,255,0.55)" }}>Every month.</span>
          </h2>
        </AnimatedSection>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12">
          {ITEMS.map((item, i) => (
            <Card key={item.category} item={item} index={i} />
          ))}
        </div>

        {/* Quiet total line */}
        <div
          className="mt-10 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
          style={{
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <p className="text-[12px] text-white/55 max-w-md">
            That's <span className="text-white font-bold">€16,200/year</span> the average independent brand
            loses to invisible infrastructure overpayment.
          </p>
          <span className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/40">
            Total annual bleed
          </span>
        </div>
      </div>
    </section>
  );
}