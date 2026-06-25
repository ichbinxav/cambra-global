import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Quote } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const ITEMS = [
  {
    category: "Payments",
    vertical: "Activewear brand",
    quote: "Renegotiated our PSP in a week. 0.6pp shaved off — pure margin we never knew we had.",
    initials: "JL",
    role: "Founder",
    revenue: "€2.1M revenue",
    before: "2.9%",
    after: "2.3%",
    savings: "€42K",
    period: "/year",
  },
  {
    category: "Shipping",
    vertical: "DTC home goods",
    quote: "CAMBRA found 18% inflation in our shipping contract. Switched carriers in two weeks. No drama.",
    initials: "MR",
    role: "COO",
    revenue: "€4.5M revenue",
    before: "€8.90",
    after: "€6.40",
    savings: "€38K",
    period: "/year",
  },
  {
    category: "SaaS",
    vertical: "Beauty brand",
    quote: "We were paying for 8 tools doing the same job. CAMBRA cleaned the stack in a single call.",
    initials: "AS",
    role: "CFO",
    revenue: "€3.8M revenue",
    before: "24 tools",
    after: "13 tools",
    savings: "€29K",
    period: "/year",
  },
];

export default function TestimonialsCarousel() {
  const [idx, setIdx] = useState(0);
  const total = ITEMS.length;
  const item = ITEMS[idx];

  const prev = () => setIdx((i) => (i - 1 + total) % total);
  const next = () => setIdx((i) => (i + 1) % total);

  return (
    <section id="testimonials" className="relative py-24 sm:py-32 overflow-hidden">
      <div className="relative max-w-3xl mx-auto px-6 sm:px-10">
        {/* eyebrow */}
        <div className="text-center mb-6">
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
            </span>
            <span className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/70">
              Real findings
            </span>
          </span>
        </div>

        <h2
          className="text-white text-center mb-12"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(36px, 5.5vw, 64px)",
            fontWeight: 900,
            letterSpacing: "-0.04em",
            lineHeight: 1.02,
          }}
        >
          What brands actually{" "}
          <span
            style={{
              background: "linear-gradient(135deg, #60a5fa 0%, #22d3ee 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            recovered.
          </span>
        </h2>

        {/* Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={idx}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl overflow-hidden"
            style={{
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "0 30px 80px -30px rgba(0,0,0,0.6)",
            }}
          >
            {/* dark top */}
            <div
              className="p-6 sm:p-8"
              style={{
                background: "linear-gradient(180deg, #0b1020 0%, #07090f 100%)",
              }}
            >
              <div className="flex items-center gap-2 mb-5">
                <Quote size={16} style={{ color: "#22d3ee" }} />
                <span className="text-[10px] uppercase tracking-[0.24em] font-bold text-cyan-300">
                  {item.category}
                </span>
                <span className="text-white/30">·</span>
                <span className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/55">
                  {item.vertical}
                </span>
              </div>

              <p
                className="text-white mb-6"
                style={{
                  fontSize: "clamp(17px, 2vw, 22px)",
                  lineHeight: 1.45,
                  fontWeight: 500,
                  letterSpacing: "-0.01em",
                }}
              >
                "{item.quote}"
              </p>

              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white/85"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.15)",
                  }}
                >
                  {item.initials}
                </div>
                <p className="text-[12px] text-white/65">
                  <span className="font-bold text-white/85">{item.role}</span>
                  <span className="mx-2 text-white/30">·</span>
                  {item.revenue}
                </p>
              </div>
            </div>

            {/* light bottom — before / after / savings */}
            <div
              className="p-6 sm:p-8"
              style={{
                background: "linear-gradient(180deg, #f1f5fb 0%, #e8eef7 100%)",
              }}
            >
              <div className="grid grid-cols-2 items-center gap-6">
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-[0.24em] font-bold text-slate-500 mb-2">
                    Before
                  </p>
                  <p
                    className="font-black tabular-nums text-slate-400"
                    style={{
                      fontSize: "clamp(28px, 4vw, 36px)",
                      letterSpacing: "-0.03em",
                      lineHeight: 1,
                      textDecoration: "line-through",
                      textDecorationThickness: "2px",
                    }}
                  >
                    {item.before}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-[0.24em] font-bold text-cyan-600 mb-2">
                    After
                  </p>
                  <p
                    className="font-black tabular-nums"
                    style={{
                      fontSize: "clamp(28px, 4vw, 36px)",
                      letterSpacing: "-0.03em",
                      lineHeight: 1,
                      color: "#0284c7",
                    }}
                  >
                    {item.after}
                  </p>
                </div>
              </div>

              <div
                className="my-6"
                style={{ borderTop: "1px solid rgba(15,23,42,0.10)" }}
              />

              <div className="text-center">
                <p className="text-[10px] uppercase tracking-[0.24em] font-bold text-cyan-600 mb-2">
                  ⤳ Annual savings
                </p>
                <p
                  className="font-black tabular-nums"
                  style={{
                    fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                    fontSize: "clamp(44px, 6vw, 60px)",
                    letterSpacing: "-0.04em",
                    lineHeight: 0.95,
                    background:
                      "linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  {item.savings}
                  <span className="text-[14px] font-bold text-slate-500 ml-1">
                    {item.period}
                  </span>
                </p>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Controls */}
        <div className="mt-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {ITEMS.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                aria-label={`Go to testimonial ${i + 1}`}
                className="transition-all rounded-full"
                style={{
                  width: i === idx ? 24 : 6,
                  height: 6,
                  background: i === idx ? "#ffffff" : "rgba(255,255,255,0.25)",
                }}
              />
            ))}
            <span className="ml-3 text-[11px] font-mono text-white/35 tabular-nums">
              {String(idx + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={prev}
              aria-label="Previous"
              className="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
              style={{
                border: "1px solid rgba(255,255,255,0.18)",
                color: "rgba(255,255,255,0.85)",
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next"
              className="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
              style={{
                border: "1px solid rgba(255,255,255,0.18)",
                color: "rgba(255,255,255,0.85)",
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}