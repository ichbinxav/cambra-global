import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { TrendingDown, Truck, Layers, AlertTriangle } from "lucide-react";

/**
 * Problem section — reinvented.
 * Visual concept: a live "money leak" counter (€ ticking up every second),
 * paired with a clean breakdown ledger underneath.
 * Feels like a financial command-center, not stacked marketing cards.
 */

const TOTAL_LOST_YEAR = 16200;            // €/yr aggregate
const LOST_PER_SECOND = TOTAL_LOST_YEAR / (365 * 24 * 3600); // ≈ 0.000514 €/s
const STARTING_OFFSET = 3120;             // demo: simulate as if running since Jan 1

const LEAKS = [
  {
    icon: TrendingDown,
    category: "Payments",
    amount: 8400,
    you: "2.6%",
    network: "1.6%",
    delta: "−38%",
    note: "Optimised rate for your volume is 1.4–1.8%.",
  },
  {
    icon: Truck,
    category: "Shipping",
    amount: 4200,
    you: "€8.40",
    network: "€6.20",
    delta: "−26%",
    note: "Carriers charge brands without collective leverage 15–30% more.",
  },
  {
    icon: Layers,
    category: "SaaS & Tools",
    amount: 3600,
    you: "22 tools",
    network: "14 tools",
    delta: "−36%",
    note: "Avg. independent brand pays for 4–6 overlapping tools.",
  },
];

function formatEUR(n) {
  return `€${Math.floor(n).toLocaleString("en-US")}`;
}

function LiveCounter() {
  const [val, setVal] = useState(STARTING_OFFSET);
  const ref = useRef(null);
  const startRef = useRef(0);

  useEffect(() => {
    let raf;
    let last = performance.now();
    startRef.current = last;
    const tick = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      setVal((v) => v + LOST_PER_SECOND * dt * 60); // accelerated 60x for visible drama
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] font-bold text-red-300">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-400" />
          </span>
          Live · money leaving right now
        </span>
      </div>

      <div className="flex items-baseline gap-3 flex-wrap">
        <span
          className="font-black tabular-nums"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(56px, 11vw, 128px)",
            letterSpacing: "-0.06em",
            lineHeight: 0.9,
            background:
              "linear-gradient(180deg, #ffffff 0%, #fca5a5 55%, #ef4444 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 0 38px rgba(239,68,68,0.55))",
          }}
        >
          −{formatEUR(val)}
        </span>
        <span className="text-[12px] uppercase tracking-[0.22em] font-bold text-white/50 pb-2">
          lost · YTD · avg brand
        </span>
      </div>

      <p className="mt-3 text-[13px] sm:text-[14px] text-white/55 max-w-md leading-relaxed">
        While you scroll, the average independent brand is bleeding{" "}
        <span className="text-red-300 font-bold">
          €{(LOST_PER_SECOND * 60 * 60).toFixed(2)}
        </span>{" "}
        an hour into invisible overpayment.
      </p>
    </div>
  );
}

function LeakRow({ leak, index, total }) {
  const widthPct = (leak.amount / total) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.6, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
      className="relative group py-5 sm:py-6"
      style={{ borderTop: index === 0 ? "none" : "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="grid grid-cols-12 gap-4 items-center">
        {/* icon + category */}
        <div className="col-span-12 sm:col-span-4 flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
            }}
          >
            <leak.icon size={16} className="text-red-300" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.22em] font-bold text-white/55 mb-1">
              {leak.category}
            </p>
            <p className="text-[12px] text-white/45 leading-tight truncate">{leak.note}</p>
          </div>
        </div>

        {/* comparison */}
        <div className="col-span-7 sm:col-span-5">
          <div className="flex items-center gap-2 sm:gap-3 mb-1.5">
            <div className="flex items-baseline gap-1">
              <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-white/35">You</span>
              <span className="text-[14px] font-black tabular-nums text-red-300">{leak.you}</span>
            </div>
            <span className="text-[9px] text-white/30 font-mono">→</span>
            <div className="flex items-baseline gap-1">
              <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-white/35">Network</span>
              <span className="text-[14px] font-black tabular-nums text-cyan-300">{leak.network}</span>
            </div>
            <span
              className="ml-auto inline-flex items-center text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded"
              style={{
                background: "rgba(239,68,68,0.10)",
                color: "rgb(252,165,165)",
                border: "1px solid rgba(239,68,68,0.25)",
              }}
            >
              {leak.delta}
            </span>
          </div>

          {/* bleed bar */}
          <div
            className="relative h-1.5 rounded-full overflow-hidden"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <motion.div
              initial={{ width: 0 }}
              whileInView={{ width: `${widthPct}%` }}
              viewport={{ once: true }}
              transition={{ duration: 1.2, delay: 0.2 + index * 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-y-0 left-0"
              style={{
                background: "linear-gradient(90deg, #ef4444 0%, #b91c1c 100%)",
                boxShadow: "0 0 12px rgba(239,68,68,0.55)",
              }}
            />
          </div>
        </div>

        {/* amount */}
        <div className="col-span-5 sm:col-span-3 text-right">
          <p
            className="font-black tabular-nums"
            style={{
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              fontSize: "clamp(20px, 2.6vw, 28px)",
              letterSpacing: "-0.03em",
              lineHeight: 1,
              color: "#fca5a5",
            }}
          >
            −€{leak.amount.toLocaleString("en-US")}
          </p>
          <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-red-300/60 mt-1">
            /year
          </p>
        </div>
      </div>
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
          width: 800, height: 800, left: "50%", top: "10%",
          transform: "translateX(-50%)",
          background: "radial-gradient(circle, rgba(239,68,68,0.14) 0%, transparent 65%)",
          filter: "blur(100px)",
        }}
      />

      <div className="relative max-w-5xl mx-auto px-6 sm:px-10">
        {/* eyebrow */}
        <div className="mb-6">
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
            style={{
              border: "1px solid rgba(239,68,68,0.25)",
              background: "rgba(239,68,68,0.06)",
            }}
          >
            <AlertTriangle size={11} className="text-red-300" />
            <span className="text-[10px] uppercase tracking-[0.24em] font-bold text-red-300">
              The hidden cost problem
            </span>
          </span>
        </div>

        {/* Headline */}
        <h2
          className="text-white max-w-3xl mb-14 sm:mb-16"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(36px, 5.5vw, 64px)",
            fontWeight: 900,
            letterSpacing: "-0.04em",
            lineHeight: 1.02,
          }}
        >
          Every minute you scroll,{" "}
          <span
            style={{
              background: "linear-gradient(135deg, #fca5a5 0%, #ef4444 70%, #b91c1c 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            money is leaking
          </span>{" "}
          <span style={{ color: "rgba(255,255,255,0.55)" }}>from your business.</span>
        </h2>

        {/* MAIN PANEL — live counter + ledger */}
        <div
          className="relative rounded-3xl overflow-hidden p-6 sm:p-10"
          style={{
            background:
              "linear-gradient(180deg, rgba(20,8,8,0.85) 0%, rgba(8,5,5,0.95) 100%)",
            border: "1px solid rgba(239,68,68,0.22)",
            boxShadow:
              "0 40px 100px -30px rgba(0,0,0,0.7), 0 0 80px -30px rgba(239,68,68,0.25)",
          }}
        >
          {/* grid pattern */}
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                "linear-gradient(rgba(239,68,68,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(239,68,68,0.05) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
              maskImage:
                "radial-gradient(ellipse 90% 70% at 50% 50%, #000 30%, transparent 80%)",
              WebkitMaskImage:
                "radial-gradient(ellipse 90% 70% at 50% 50%, #000 30%, transparent 80%)",
              opacity: 0.5,
            }}
          />
          {/* corner glow */}
          <div
            aria-hidden
            className="absolute pointer-events-none"
            style={{
              width: 500, height: 500, right: "-20%", top: "-30%",
              background: "radial-gradient(circle, rgba(239,68,68,0.22) 0%, transparent 70%)",
              filter: "blur(60px)",
            }}
          />

          {/* live counter */}
          <div className="relative">
            <LiveCounter />
          </div>

          {/* divider */}
          <div className="relative my-8 sm:my-10 flex items-center gap-3">
            <div className="flex-1" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }} />
            <span className="text-[9px] uppercase tracking-[0.28em] font-bold text-white/35">
              Breakdown · Where the leak comes from
            </span>
            <div className="flex-1" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }} />
          </div>

          {/* ledger */}
          <div className="relative">
            {LEAKS.map((leak, i) => (
              <LeakRow key={leak.category} leak={leak} index={i} total={TOTAL_LOST_YEAR} />
            ))}
          </div>

          {/* footer total */}
          <div
            className="relative mt-8 pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            style={{ borderTop: "1px solid rgba(239,68,68,0.20)" }}
          >
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/45 mb-1">
                Total annual bleed
              </p>
              <p className="text-[12px] text-white/55 max-w-sm">
                A hire you can't make. A campaign you can't run. A category you can't launch.
              </p>
            </div>
            <div className="text-right">
              <span
                className="font-black tabular-nums"
                style={{
                  fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                  fontSize: "clamp(36px, 5vw, 56px)",
                  letterSpacing: "-0.05em",
                  lineHeight: 0.95,
                  background:
                    "linear-gradient(180deg, #ffffff 0%, #fca5a5 60%, #ef4444 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  filter: "drop-shadow(0 0 24px rgba(239,68,68,0.45))",
                }}
              >
                −€{TOTAL_LOST_YEAR.toLocaleString("en-US")}
              </span>
              <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-red-300/70 mt-1">
                /year · per brand
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}