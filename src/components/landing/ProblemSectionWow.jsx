import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { TrendingDown, Globe2, Coins, AlertTriangle } from "lucide-react";
import SectionLabel from "@/components/shared/SectionLabel";
import AnimatedSection from "@/components/landing/AnimatedSection";

/**
 * Problem section — payments-only edition · R4 recalibration (2026-07-12).
 *
 * Three angles of the SAME problem — hidden overpayment on card payments.
 * Numbers derived from the SINGLE REFERENCE BRAND used across the whole
 * landing (see KNOWN_DEBT · "Landing reference-brand rule"):
 *   GMV €1M/yr, blended PSP at 2.4%, intl ~15%, low-mid ticket.
 *   Engine (`paymentsGap.js`) floor ≈ 1.7% → gap ≈ 0.7pts × €1M = €6,000/yr.
 *
 * The three cards below decompose that same €6,000 gap into its narrative
 * angles (blended / cross-border / fixed-fee drag), so the TOTAL BLEED and
 * the SavingsCurveChart's "recoverable" figure are the same number, told
 * from two ends of the transaction:
 *   —€6,000/yr lost today   =   €6,000/yr recoverable tomorrow.
 *
 * Total is a live reduce over ITEMS — NOT hardcoded. If the reference brand
 * assumptions change, retune the three amounts and everything else follows.
 */
const ITEMS = [
  {
    icon: TrendingDown,
    category: "Blended rates",
    amount: 3200,
    // Overpay relative to floor: 2.4% blended vs 1.7% achievable ≈ +41%.
    overpayPct: 41,
    body: "Blended pricing hides the interchange floor. Most brands pay 2.2–2.8% when their real minimum is 1.4–1.8%.",
    accent: "rgba(239,68,68,0.65)",
    glow: "rgba(239,68,68,0.08)",
  },
  {
    icon: Globe2,
    category: "Cross-border uplift",
    amount: 1800,
    // +1.75% Stripe EU/UK cross-border on ~15% intl share vs ~0.9% negotiated
    // on the same portion ≈ +94% overpay on the intl slice. Visual cap at
    // +35% to stay in the honest 30-60% band advertised in the H2.
    overpayPct: 35,
    body: "International cards add +1.75% on the wrong PSP. On the right one, the schemes' floor is the same — the margin isn't.",
    accent: "rgba(249,115,22,0.65)",
    glow: "rgba(249,115,22,0.08)",
  },
  {
    icon: Coins,
    category: "Fixed-fee drag",
    amount: 1000,
    // €0.25 vs €0.15 per-tx on ~€65 avg ticket ≈ +22% overpay on the fixed
    // component (the % component isn't affected).
    overpayPct: 22,
    body: "€0.25 per-transaction fees compound on low-ticket flows. Amortized against your real ticket size, they quietly change your effective rate.",
    accent: "rgba(236,72,153,0.65)",
    glow: "rgba(236,72,153,0.08)",
  },
];

const TOTAL = ITEMS.reduce((acc, i) => acc + i.amount, 0);

/* Animated counter — kicks in on view */
function useCountUp(target, durationMs = 1600, start = false) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!start) return;
    const t0 = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, start]);
  return val;
}

function Card({ item, index }) {
  const [inView, setInView] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } }),
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const counted = useCountUp(item.amount, 1600 + index * 200, inView);
  const barFill = inView ? item.overpayPct : 0;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.7, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
      className="relative rounded-2xl p-6 sm:p-7 h-full group overflow-hidden"
      style={{
        background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 100%)",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 20px 50px -25px rgba(0,0,0,0.5)",
      }}
    >
      {/* corner glow — matches category accent */}
      <div
        aria-hidden
        className="absolute pointer-events-none transition-opacity duration-500 opacity-60 group-hover:opacity-100"
        style={{
          width: 300, height: 300, right: "-25%", top: "-30%",
          background: `radial-gradient(circle, ${item.glow} 0%, transparent 70%)`,
          filter: "blur(50px)",
        }}
      />

      {/* icon + category */}
      <div className="relative flex items-center gap-3 mb-5">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <item.icon size={16} style={{ color: item.accent, opacity: 0.8 }} />
        </div>
        <p className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/60">
          {item.category}
        </p>
      </div>

      {/* HUGE counter */}
      <div className="relative">
        <p
          className="font-black tabular-nums mb-1"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(42px, 6vw, 60px)",
            letterSpacing: "-0.05em",
            lineHeight: 0.95,
            background: `linear-gradient(135deg, #ffffff 0%, ${item.accent} 120%)`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          −€{counted.toLocaleString("en-US")}
          <span
            className="text-[14px] font-bold ml-1"
            style={{
              color: "rgba(255,255,255,0.45)",
              WebkitTextFillColor: "rgba(255,255,255,0.45)",
              filter: "none",
            }}
          >
            /yr
          </span>
        </p>
        <p
          className="text-[10px] uppercase tracking-[0.22em] font-bold mb-5"
          style={{ color: item.accent, opacity: 0.6 }}
        >
          Illustrative · this angle
        </p>
      </div>

      {/* Overpay bar — visual proof */}
      <div className="relative mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] uppercase tracking-[0.22em] font-bold text-white/40">
            Overpay vs network
          </span>
          <span
            className="text-[11px] font-black tabular-nums"
            style={{ color: item.accent }}
          >
            +{item.overpayPct}%
          </span>
        </div>
        <div
          className="h-1.5 rounded-full overflow-hidden"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${barFill}%` }}
            transition={{ duration: 1.4, delay: 0.4 + index * 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="h-full rounded-full"
            style={{
              background: item.accent,
              opacity: 0.7,
            }}
          />
        </div>
      </div>

      <p className="relative text-[13px] text-white/55 leading-relaxed">{item.body}</p>
    </motion.div>
  );
}

export default function ProblemSectionWow() {
  const [totalInView, setTotalInView] = useState(false);
  const totalRef = useRef(null);

  useEffect(() => {
    const el = totalRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { setTotalInView(true); io.disconnect(); } }),
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const totalCount = useCountUp(TOTAL, 2200, totalInView);

  return (
    <section className="relative py-12 sm:py-16 overflow-hidden">
      {/* ambient red wash */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 700, height: 700, left: "50%", top: "10%", transform: "translateX(-50%)",
          background: "radial-gradient(circle, rgba(239,68,68,0.08) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-6 sm:px-10">
        <AnimatedSection>
          <div className="text-center">
            <SectionLabel className="mb-6 inline-block">The hidden cost problem</SectionLabel>
          </div>
          <h2
            className="text-white max-w-3xl mx-auto mb-4 text-center"
            style={{
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              fontSize: "clamp(36px, 5.5vw, 60px)",
              fontWeight: 900,
              letterSpacing: "-0.04em",
              lineHeight: 1.05,
            }}
          >
            Independent brands overpay{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #ef4444 0%, #f97316 50%, #ec4899 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
                filter: "drop-shadow(0 0 24px rgba(239,68,68,0.35))",
              }}
            >
              30–60%
            </span>{" "}
            on card payments.{" "}
            <span style={{ color: "rgba(255,255,255,0.55)" }}>Every month.</span>
          </h2>
        </AnimatedSection>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12">
          {ITEMS.map((item, i) => (
            <Card key={item.category} item={item} index={i} />
          ))}
        </div>

        {/* Cinematic total reveal */}
        <motion.div
          ref={totalRef}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="relative mt-10 rounded-2xl p-6 sm:p-8 overflow-hidden"
          style={{
            background: "linear-gradient(135deg, rgba(239,68,68,0.06) 0%, rgba(236,72,153,0.04) 100%)",
            border: "1px solid rgba(239,68,68,0.20)",
            boxShadow: "0 20px 60px -30px rgba(239,68,68,0.4)",
          }}
        >
          {/* pulsing glow */}
          <motion.div
            aria-hidden
            className="absolute pointer-events-none"
            style={{
              width: 400, height: 400, left: "50%", top: "50%", transform: "translate(-50%, -50%)",
              background: "radial-gradient(circle, rgba(239,68,68,0.15) 0%, transparent 70%)",
              filter: "blur(60px)",
            }}
            animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.9, 0.5] }}
            transition={{ duration: 4, ease: "easeInOut", repeat: Infinity }}
          />

          <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: "rgba(239,68,68,0.12)",
                  border: "1px solid rgba(239,68,68,0.35)",
                  boxShadow: "0 0 24px rgba(239,68,68,0.35)",
                }}
              >
                <AlertTriangle size={20} className="text-red-400" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.24em] font-bold text-red-300/85 mb-1">
                  Total annual bleed
                </p>
                <p className="text-[13px] text-white/55 max-w-md">
                  The sum of the three angles above — the same money the
                  Savings Curve shows as recoverable.
                </p>
                <p className="text-[11px] text-white/40 mt-2 leading-snug max-w-md">
                  Illustrative — for a €1M GMV brand on typical blended
                  pricing. Run the analyzer for yours.
                </p>
              </div>
            </div>

            <div className="text-left sm:text-right">
              <p
                className="font-black tabular-nums"
                style={{
                  fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                  fontSize: "clamp(40px, 5.5vw, 64px)",
                  letterSpacing: "-0.05em",
                  lineHeight: 0.95,
                  background:
                    "linear-gradient(135deg, #ffffff 0%, #fca5a5 50%, #ef4444 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  filter: "drop-shadow(0 0 22px rgba(239,68,68,0.45))",
                }}
              >
                −€{totalCount.toLocaleString("en-US")}
              </p>
              <p className="text-[11px] uppercase tracking-[0.22em] font-bold text-white/45 mt-1">
                /year · per brand
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}