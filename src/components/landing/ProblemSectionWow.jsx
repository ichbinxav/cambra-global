import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { TrendingDown, Truck, Layers, AlertTriangle, ArrowRight } from "lucide-react";
import SectionLabel from "@/components/shared/SectionLabel";
import AnimatedSection from "@/components/landing/AnimatedSection";

/**
 * Problem section — WOW edition.
 * Animated counters, overpay bars, glow accents, cinematic total reveal.
 */
const ITEMS = [
  {
    icon: TrendingDown,
    category: "Payments",
    amount: 8400,
    overpayPct: 35, // % over the optimal rate
    body: "Most brands pay 2.2–2.8% in fees. Optimised rate for your volume: 1.4–1.8%.",
    accent: "rgba(239,68,68,0.65)",
    glow: "rgba(239,68,68,0.08)",
  },
  {
    icon: Truck,
    category: "Shipping",
    amount: 4200,
    overpayPct: 22,
    body: "Carriers charge brands without collective leverage 15–30% more.",
    accent: "rgba(249,115,22,0.65)",
    glow: "rgba(249,115,22,0.08)",
  },
  {
    icon: Layers,
    category: "SaaS & Tools",
    amount: 3600,
    overpayPct: 28,
    body: "Avg. independent brand pays for 4–6 overlapping or underused tools.",
    accent: "rgba(236,72,153,0.65)",
    glow: "rgba(236,72,153,0.08)",
    // Only the SaaS card gets a CTA: SaaS savings are a pure win for the brand
    // (free margin, 0% fee) — worth surfacing an entry point right here.
    cta: {
      label: "Reclaim your SaaS margin",
      href: "/Analyzer",
    },
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
          Lost on average
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

      {item.cta && (
        <Link
          to={item.cta.href}
          className="relative mt-5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-white/80 hover:text-white transition-colors group/cta"
        >
          <span
            className="pb-0.5"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.25)" }}
          >
            {item.cta.label}
          </span>
          <ArrowRight size={12} className="transition-transform group-hover/cta:translate-x-0.5" />
        </Link>
      )}
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
                background: "linear-gradient(135deg, #ef4444 0%, #f97316 50%, #ec4899 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
                filter: "drop-shadow(0 0 24px rgba(239,68,68,0.35))",
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
                  The average independent brand loses this to invisible infrastructure overpayment.
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