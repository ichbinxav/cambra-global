import React from "react";
import { motion } from "framer-motion";
import { Quote } from "lucide-react";

/**
 * Founder letter — adapted to dark editorial theme.
 * Headline + two side-by-side cards (portrait | letter card).
 */
const FOUNDER_PHOTO =
  "https://media.base44.com/images/public/6a16288b833b3c26d7ac1fab/d863d71f2_0347F92E-E1B9-4977-A6B1-85897923556A.jpeg";

export default function FounderLetter() {
  return (
    <section className="relative py-20 sm:py-28 overflow-hidden">
      {/* ambient halo */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 700, height: 700, left: "50%", top: "50%", transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(34,211,238,0.05) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />

      <div className="relative max-w-4xl mx-auto px-6 sm:px-10">
        {/* Eyebrow pill */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex justify-center mb-6"
        >
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
            <span className="text-[10px] uppercase tracking-[0.28em] font-bold text-white/70">
              Meet the founder
            </span>
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="text-center text-white mb-12 sm:mb-16"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(36px, 5.5vw, 60px)",
            fontWeight: 900,
            letterSpacing: "-0.04em",
            lineHeight: 1.05,
          }}
        >
          A note from{" "}
          <span
            style={{
              background: "linear-gradient(135deg, #60a5fa 0%, #22d3ee 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            the founder
          </span>
          <span className="text-white">.</span>
        </motion.h2>

        {/* Two columns */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          {/* LEFT — portrait card */}
          <div
            className="relative rounded-2xl overflow-hidden min-h-[280px] sm:min-h-[340px]"
            style={{
              background: "#06080F",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <img
              src={FOUNDER_PHOTO}
              alt="Xavier M. Contero — Founder of CAMBRA"
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                filter: "grayscale(70%) contrast(1.08) brightness(0.92)",
              }}
            />
          </div>

          {/* RIGHT — letter card */}
          <div
            className="relative rounded-2xl overflow-hidden p-6 sm:p-7 flex flex-col"
            style={{
              background: "linear-gradient(180deg, #0d1224 0%, #060810 100%)",
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "0 30px 60px -30px rgba(0,0,0,0.6)",
            }}
          >
            {/* corner halo */}
            <div
              aria-hidden
              className="absolute pointer-events-none"
              style={{
                width: 260, height: 260, right: "-30%", top: "-30%",
                background: "radial-gradient(circle, rgba(34,211,238,0.18) 0%, transparent 70%)",
                filter: "blur(50px)",
              }}
            />

            <div className="relative">
              <Quote
                size={28}
                className="text-cyan-400 mb-4"
                strokeWidth={2.5}
              />

              <p
                className="text-white/95"
                style={{
                  fontSize: 15,
                  lineHeight: 1.55,
                  fontWeight: 500,
                  letterSpacing: "-0.01em",
                }}
              >
                After years inside global companies, I realized independent brands were operating without the infrastructure they deserved.
              </p>

              <p
                className="mt-3"
                style={{
                  fontSize: 15,
                  lineHeight: 1.55,
                  fontWeight: 500,
                  letterSpacing: "-0.01em",
                  background:
                    "linear-gradient(135deg, #ffffff 0%, #b8d8e0 50%, #22d3ee 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                That's why I started CAMBRA.
              </p>

              <div className="flex-1" />

              <div
                className="mt-8 pt-5 flex items-center justify-between"
                style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
              >
                <p className="text-white text-[13px] font-bold tracking-tight">
                  Xavier M. Contero
                </p>
                <span
                  className="inline-flex items-center rounded-full px-3 py-1"
                  style={{
                    border: "1px solid rgba(255,255,255,0.20)",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.24em",
                    color: "rgba(255,255,255,0.75)",
                    textTransform: "uppercase",
                  }}
                >
                  Founder
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}