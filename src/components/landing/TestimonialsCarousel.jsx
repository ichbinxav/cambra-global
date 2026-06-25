import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Quote } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const ITEMS = [
  {
    category: "Payments",
    vertical: "Activewear brand",
    quote: "Renegotiated our PSP in a week. 0.6pp shaved off — pure margin we never knew we had.",
    name: "Julien Laurent",
    role: "Founder",
    revenue: "€2.1M revenue",
    photo: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&crop=faces",
    before: "2.9%",
    after: "2.3%",
    savings: "€42K",
  },
  {
    category: "Shipping",
    vertical: "DTC home goods",
    quote: "CAMBRA found 18% inflation in our shipping contract. Switched carriers in two weeks.",
    name: "Marta Ruiz",
    role: "COO",
    revenue: "€4.5M revenue",
    photo: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=faces",
    before: "€8.90",
    after: "€6.40",
    savings: "€38K",
  },
  {
    category: "SaaS",
    vertical: "Beauty brand",
    quote: "We were paying for 8 tools doing the same job. CAMBRA cleaned the stack in a single call.",
    name: "Antoine Schmidt",
    role: "CFO",
    revenue: "€3.8M revenue",
    photo: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=faces",
    before: "24 tools",
    after: "13 tools",
    savings: "€29K",
  },
];

export default function TestimonialsCarousel() {
  const [idx, setIdx] = useState(0);
  const total = ITEMS.length;
  const item = ITEMS[idx];

  const prev = () => setIdx((i) => (i - 1 + total) % total);
  const next = () => setIdx((i) => (i + 1) % total);

  return (
    <section id="testimonials" className="relative py-16 sm:py-20 overflow-hidden">
      <div className="relative max-w-2xl mx-auto px-6 sm:px-10">
        {/* eyebrow */}
        <div className="text-center mb-4">
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1"
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
          className="text-white text-center mb-8"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(28px, 4.2vw, 44px)",
            fontWeight: 900,
            letterSpacing: "-0.04em",
            lineHeight: 1.05,
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
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl overflow-hidden"
            style={{
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "0 20px 50px -20px rgba(0,0,0,0.5)",
            }}
          >
            {/* dark top */}
            <div
              className="p-5 sm:p-6"
              style={{
                background: "linear-gradient(180deg, #0b1020 0%, #07090f 100%)",
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Quote size={13} style={{ color: "#22d3ee" }} />
                <span className="text-[9px] uppercase tracking-[0.22em] font-bold text-cyan-300">
                  {item.category}
                </span>
                <span className="text-white/30">·</span>
                <span className="text-[9px] uppercase tracking-[0.22em] font-bold text-white/55">
                  {item.vertical}
                </span>
              </div>

              <p
                className="text-white mb-4"
                style={{
                  fontSize: "clamp(14px, 1.5vw, 16px)",
                  lineHeight: 1.45,
                  fontWeight: 500,
                  letterSpacing: "-0.005em",
                }}
              >
                "{item.quote}"
              </p>

              <div className="flex items-center gap-2.5">
                <img
                  src={item.photo}
                  alt={item.name}
                  className="w-9 h-9 rounded-full object-cover shrink-0"
                  style={{
                    border: "1px solid rgba(255,255,255,0.15)",
                  }}
                />
                <div className="min-w-0">
                  <p className="text-white text-[12px] font-bold tracking-tight truncate">
                    {item.name}
                  </p>
                  <p className="text-[10px] text-white/55 truncate">
                    {item.role} <span className="text-white/30">·</span> {item.revenue}
                  </p>
                </div>
              </div>
            </div>

            {/* light bottom — before / after / savings */}
            <div
              className="p-5 sm:p-6"
              style={{
                background: "linear-gradient(180deg, #f1f5fb 0%, #e8eef7 100%)",
              }}
            >
              <div className="grid grid-cols-3 items-center gap-3">
                <div className="text-center">
                  <p className="text-[9px] uppercase tracking-[0.22em] font-bold text-slate-500 mb-1">
                    Before
                  </p>
                  <p
                    className="font-black tabular-nums text-slate-400"
                    style={{
                      fontSize: "clamp(16px, 2.2vw, 20px)",
                      letterSpacing: "-0.02em",
                      lineHeight: 1,
                      textDecoration: "line-through",
                    }}
                  >
                    {item.before}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[9px] uppercase tracking-[0.22em] font-bold text-cyan-600 mb-1">
                    After
                  </p>
                  <p
                    className="font-black tabular-nums"
                    style={{
                      fontSize: "clamp(16px, 2.2vw, 20px)",
                      letterSpacing: "-0.02em",
                      lineHeight: 1,
                      color: "#0284c7",
                    }}
                  >
                    {item.after}
                  </p>
                </div>
                <div className="text-center" style={{ borderLeft: "1px solid rgba(15,23,42,0.10)" }}>
                  <p className="text-[9px] uppercase tracking-[0.22em] font-bold text-cyan-600 mb-1">
                    Saved
                  </p>
                  <p
                    className="font-black tabular-nums"
                    style={{
                      fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                      fontSize: "clamp(20px, 2.8vw, 26px)",
                      letterSpacing: "-0.03em",
                      lineHeight: 0.95,
                      background:
                        "linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    {item.savings}
                  </p>
                  <p className="text-[9px] text-slate-500 mt-0.5">/year</p>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Controls */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {ITEMS.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                aria-label={`Go to testimonial ${i + 1}`}
                className="transition-all rounded-full"
                style={{
                  width: i === idx ? 20 : 5,
                  height: 5,
                  background: i === idx ? "#ffffff" : "rgba(255,255,255,0.25)",
                }}
              />
            ))}
            <span className="ml-2 text-[10px] font-mono text-white/35 tabular-nums">
              {String(idx + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={prev}
              aria-label="Previous"
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
              style={{
                border: "1px solid rgba(255,255,255,0.18)",
                color: "rgba(255,255,255,0.85)",
              }}
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next"
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
              style={{
                border: "1px solid rgba(255,255,255,0.18)",
                color: "rgba(255,255,255,0.85)",
              }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}