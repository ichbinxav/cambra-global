import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Quote, TrendingUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import InitialsAvatar from "@/components/shared/InitialsAvatar";
import SectionHeading from "@/components/landing/SectionHeading";

// ⚠️ ILLUSTRATIVE / PLACEHOLDER testimonials — invented names + quotes.
// Uses initials avatars (NOT photos) on purpose: a fake photo-realistic face
// + fake quote presented as a real customer is misleading advertising.
// REPLACE with real, consented customer quotes (and real photos) before launch.
const ITEMS = [
  {
    category: "Payments",
    vertical: "Maison Épice",
    quote: "We were paying 2.4% blended and thought that was just the cost of cards. CAMBRA showed us the processor margin was the only movable part — and how much we were leaving on the table.",
    name: "Camille Laurent",
    role: "Founder",
    revenue: "Maison Épice",
    before: "2.40%",
    after: "1.62%",
    savings: "€14K",
  },
  {
    category: "Payments",
    vertical: "Atelier Nord",
    quote: "The 3-minute audit was more transparent about our card fees than our PSP had been in three years. We saw exactly where the money leaked.",
    name: "Théo Mercier",
    role: "COO",
    revenue: "Atelier Nord",
    before: "2.15%",
    after: "1.48%",
    savings: "€11K",
  },
  {
    category: "Payments",
    vertical: "Vela Studio",
    quote: "Joining the collective got us to a rate we'd never have reached negotiating alone at our size. Brands moving as one — that's the whole point.",
    name: "Sofia Ferran",
    role: "Founder",
    revenue: "Vela Studio",
    before: "2.55%",
    after: "1.70%",
    savings: "€9K",
  },
  {
    category: "Payments",
    vertical: "Brün Coffee",
    quote: "No retainer, no contract. They only got paid once our bank statements confirmed the savings. That alignment is rare.",
    name: "Lucas Petit",
    role: "Finance lead",
    revenue: "Brün Coffee",
    before: "2.30%",
    after: "1.55%",
    savings: "€8K",
  },
  {
    category: "Payments",
    vertical: "Lume",
    quote: "CAMBRA benchmarked us against French brands our size — we were in the most expensive third. Seeing that in one number changed how we think about payments.",
    name: "Inès Marchal",
    role: "Founder",
    revenue: "Lume",
    before: "2.60%",
    after: "1.75%",
    savings: "€13K",
  },
];

export default function TestimonialsCarousel() {
  const [idx, setIdx] = useState(0);
  const total = ITEMS.length;
  const item = ITEMS[idx];

  const prev = () => setIdx((i) => (i - 1 + total) % total);
  const next = () => setIdx((i) => (i + 1) % total);

  return (
    <section id="testimonials" className="relative py-12 sm:py-16 overflow-hidden">
      <div className="relative max-w-2xl mx-auto px-6 sm:px-10">
        <SectionHeading eyebrow="Real findings" className="mb-8">
          What brands actually{" "}
          <span className="kw">recovered.</span>
        </SectionHeading>

        {/* Unified dark card — no split */}
        <AnimatePresence mode="wait">
          <motion.div
            key={idx}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="relative rounded-2xl overflow-hidden p-6 sm:p-7"
            style={{
              background: "linear-gradient(180deg, #0b1020 0%, #07090f 100%)",
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "0 20px 50px -20px rgba(0,0,0,0.5)",
            }}
          >
            {/* corner glow */}
            <div
              aria-hidden
              className="absolute pointer-events-none"
              style={{
                width: 300, height: 300, right: "-20%", top: "-30%",
                background: "radial-gradient(circle, rgba(139,123,255,0.18) 0%, transparent 70%)",
                filter: "blur(50px)",
              }}
            />

            {/* category */}
            <div className="relative flex items-center gap-2 mb-4">
              <Quote size={13} style={{ color: "#8B7BFF" }} />
              <span className="text-[9px] uppercase tracking-[0.22em] font-bold" style={{ color: "#8B7BFF" }}>
                {item.category}
              </span>
              <span className="text-white/30">·</span>
              <span className="text-[9px] uppercase tracking-[0.22em] font-bold text-white/55">
                {item.vertical}
              </span>
            </div>

            {/* quote */}
            <p
              className="relative text-white mb-5"
              style={{
                fontSize: "clamp(14px, 1.6vw, 17px)",
                lineHeight: 1.45,
                fontWeight: 500,
                letterSpacing: "-0.005em",
              }}
            >
              "{item.quote}"
            </p>

            {/* author */}
            <div className="relative flex items-center gap-2.5 mb-5">
              <InitialsAvatar name={item.name} size={36} />
              <div className="min-w-0">
                <p className="text-white text-[12px] font-bold tracking-tight truncate">
                  {item.name}
                </p>
                <p className="text-[10px] text-white/55 truncate">
                  {item.role} <span className="text-white/30">·</span> {item.revenue}
                </p>
              </div>
            </div>

            {/* divider */}
            <div className="relative my-5 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />

            {/* before / after / saved — all on dark */}
            <div className="relative grid grid-cols-3 items-center gap-3">
              <div className="text-center">
                <p className="text-[9px] uppercase tracking-[0.22em] font-bold text-white/40 mb-1">
                  Before
                </p>
                <p
                  className="font-black tabular-nums text-white/50"
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
                <p className="text-[9px] uppercase tracking-[0.22em] font-bold mb-1" style={{ color: "rgba(47,224,168,0.85)" }}>
                  After
                </p>
                <p
                  className="font-black tabular-nums"
                  style={{
                    color: "#2FE0A8",
                    fontSize: "clamp(16px, 2.2vw, 20px)",
                    letterSpacing: "-0.02em",
                    lineHeight: 1,
                  }}
                >
                  {item.after}
                </p>
              </div>
              <div className="text-center" style={{ borderLeft: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="inline-flex items-center gap-1 mb-1">
                  <TrendingUp size={9} style={{ color: "#2FE0A8" }} />
                  <p className="text-[9px] uppercase tracking-[0.22em] font-bold" style={{ color: "rgba(47,224,168,0.85)" }}>
                    Saved
                  </p>
                </div>
                <p
                  className="font-black tabular-nums"
                  style={{
                    fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                    fontSize: "clamp(20px, 2.8vw, 26px)",
                    letterSpacing: "-0.03em",
                    lineHeight: 0.95,
                    background:
                      "linear-gradient(135deg, #2FE0A8 0%, #0FA97A 100%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    filter: "drop-shadow(0 0 16px rgba(47,224,168,0.35))",
                  }}
                >
                  {item.savings}
                </p>
                <p className="text-[9px] text-white/40 mt-0.5">/year</p>
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
                  background: i === idx ? "var(--ink)" : "var(--linea)",
                }}
              />
            ))}
            <span className="ml-2 text-[10px] font-mono tabular-nums" style={{ color: "var(--gris-2)" }}>
              {String(idx + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={prev}
              aria-label="Previous"
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-black/5"
              style={{
                border: "1px solid var(--linea)",
                color: "var(--gris-1)",
              }}
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next"
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-black/5"
              style={{
                border: "1px solid var(--linea)",
                color: "var(--gris-1)",
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