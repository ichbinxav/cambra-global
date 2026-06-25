import React from "react";
import { motion } from "framer-motion";
import { TrendingDown, Truck, Layers, ArrowDownRight } from "lucide-react";
import SectionLabel from "@/components/shared/SectionLabel";
import AnimatedSection from "@/components/landing/AnimatedSection";

/**
 * Problem section — cinematic WOW redesign.
 * - Massive red gradient figures
 * - Animated downward arrows
 * - "Lost on average" emphasis
 * - Visible total bleed at the bottom
 */
const ITEMS = [
  {
    icon: TrendingDown,
    category: "Payments",
    amount: "€8,400",
    period: "/year",
    body: "Most brands pay 2.2–2.8% in payment fees. The optimised rate for your volume is often 1.4–1.8%.",
    you: "2.6%",
    network: "1.6%",
    label: "Avg. fee",
  },
  {
    icon: Truck,
    category: "Shipping",
    amount: "€4,200",
    period: "/year",
    body: "Carriers charge 15–30% more to brands without collective negotiating power.",
    you: "€8.40",
    network: "€6.20",
    label: "Per shipment",
  },
  {
    icon: Layers,
    category: "SaaS & Tools",
    amount: "€3,600",
    period: "/year",
    body: "The average independent brand pays for 4–6 overlapping or underused software tools.",
    you: "22 tools",
    network: "14 tools",
    label: "Stack size",
  },
];

function ProblemCard({ item, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.7, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -6 }}
      className="relative group overflow-hidden rounded-2xl p-7 sm:p-8"
      style={{
        background:
          "linear-gradient(180deg, rgba(239,68,68,0.04) 0%, rgba(255,255,255,0.02) 60%, rgba(255,255,255,0.01) 100%)",
        border: "1px solid rgba(239,68,68,0.15)",
      }}
    >
      {/* glow halo */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 100% 0%, rgba(239,68,68,0.20), transparent 55%)",
        }}
      />
      {/* diagonal downward streak */}
      <motion.div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          right: -40,
          top: -40,
          width: 200,
          height: 200,
          background:
            "linear-gradient(135deg, rgba(239,68,68,0.18), transparent 60%)",
          filter: "blur(40px)",
        }}
        animate={{ opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* header */}
      <div className="relative flex items-start justify-between mb-6">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center"
          style={{
            background: "rgba(239,68,68,0.10)",
            border: "1px solid rgba(239,68,68,0.30)",
            boxShadow: "0 0 24px rgba(239,68,68,0.20)",
          }}
        >
          <item.icon size={18} className="text-red-300" />
        </div>
        <motion.div
          animate={{ y: [0, 4, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        >
          <ArrowDownRight size={20} className="text-red-400/60" />
        </motion.div>
      </div>

      {/* category */}
      <p
        className="relative text-[10px] uppercase tracking-[0.24em] font-bold mb-3"
        style={{ color: "rgba(255,255,255,0.55)" }}
      >
        {item.category}
      </p>

      {/* MASSIVE LOST FIGURE */}
      <div className="relative flex items-baseline gap-1 mb-4">
        <span
          className="font-black tabular-nums"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(40px, 5.5vw, 64px)",
            letterSpacing: "-0.05em",
            lineHeight: 0.95,
            background:
              "linear-gradient(180deg, #fca5a5 0%, #ef4444 60%, #b91c1c 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 0 28px rgba(239,68,68,0.45))",
          }}
        >
          −{item.amount}
        </span>
        <span className="text-[14px] font-bold text-red-300/80">{item.period}</span>
      </div>

      <p
        className="relative text-[10px] uppercase tracking-[0.22em] font-bold mb-5"
        style={{ color: "rgba(239,68,68,0.85)" }}
      >
        Lost on average
      </p>

      <p
        className="relative text-[13px] mb-5"
        style={{ color: "rgba(255,255,255,0.55)", lineHeight: 1.55 }}
      >
        {item.body}
      </p>

      {/* mini comparison row */}
      <div
        className="relative rounded-lg p-3 grid grid-cols-3 items-center"
        style={{
          background: "rgba(255,255,255,0.025)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div>
          <p className="text-[8px] uppercase tracking-[0.22em] font-bold text-white/40 mb-1">You</p>
          <p className="text-[14px] font-black tabular-nums text-red-300">{item.you}</p>
        </div>
        <div className="text-center text-[9px] uppercase tracking-[0.18em] font-bold text-white/35">
          vs
        </div>
        <div className="text-right">
          <p className="text-[8px] uppercase tracking-[0.22em] font-bold text-white/40 mb-1">Network</p>
          <p className="text-[14px] font-black tabular-nums text-cyan-300">{item.network}</p>
        </div>
      </div>
      <p className="relative text-[9px] uppercase tracking-[0.22em] font-bold text-white/30 mt-2 text-center">
        {item.label}
      </p>
    </motion.div>
  );
}

export default function ProblemSectionWow() {
  return (
    <section className="relative py-24 sm:py-32 overflow-hidden">
      {/* ambient red wash */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 700, height: 700, left: "10%", top: "20%",
          background: "radial-gradient(circle, rgba(239,68,68,0.12) 0%, transparent 70%)",
          filter: "blur(90px)",
        }}
      />
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 600, height: 600, right: "-5%", bottom: "10%",
          background: "radial-gradient(circle, rgba(239,68,68,0.08) 0%, transparent 70%)",
          filter: "blur(90px)",
        }}
      />

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
                background:
                  "linear-gradient(135deg, #fca5a5 0%, #ef4444 70%, #b91c1c 100%)",
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
            <ProblemCard key={item.category} item={item} index={i} />
          ))}
        </div>

        {/* TOTAL BLEED bar — the wow finisher */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="relative mt-12 rounded-2xl overflow-hidden p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
          style={{
            background:
              "linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba(127,29,29,0.20) 100%)",
            border: "1px solid rgba(239,68,68,0.30)",
            boxShadow: "0 30px 80px -30px rgba(239,68,68,0.35)",
          }}
        >
          <div className="relative flex-1">
            <p className="text-[10px] uppercase tracking-[0.24em] font-bold text-red-300/80 mb-2">
              Total bleed · 12 months
            </p>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span
                className="font-black tabular-nums"
                style={{
                  fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                  fontSize: "clamp(44px, 7vw, 80px)",
                  letterSpacing: "-0.05em",
                  lineHeight: 0.95,
                  background:
                    "linear-gradient(180deg, #ffffff 0%, #fca5a5 60%, #ef4444 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  filter: "drop-shadow(0 0 28px rgba(239,68,68,0.45))",
                }}
              >
                €16,200
              </span>
              <span className="text-[13px] uppercase tracking-[0.2em] font-bold text-white/55">
                /year lost
              </span>
            </div>
          </div>
          <div
            className="text-[12px] sm:text-right text-white/65 max-w-xs leading-relaxed"
          >
            That's a hire you can't make, a campaign you can't run, a category you can't launch.
          </div>
        </motion.div>
      </div>
    </section>
  );
}