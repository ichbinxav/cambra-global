import React from "react";
import { motion } from "framer-motion";

/**
 * Founder letter — clean two-column layout, no signature.
 * Left: portrait. Right: the letter. Equal weight.
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
          width: 700, height: 700, left: "50%", top: "40%", transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />

      <div className="relative max-w-5xl mx-auto px-6 sm:px-10">
        {/* Eyebrow */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-10 sm:mb-14"
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
              From the founder
            </span>
          </span>
        </motion.div>

        {/* Two equal columns */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="relative rounded-3xl overflow-hidden grid grid-cols-1 md:grid-cols-2"
          style={{
            background: "linear-gradient(180deg, #0d1224 0%, #060810 100%)",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 40px 100px -30px rgba(0,0,0,0.7)",
          }}
        >
          {/* LEFT — portrait */}
          <div
            className="relative min-h-[320px] md:min-h-[440px]"
            style={{ background: "#06080F" }}
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

          {/* RIGHT — the letter */}
          <div className="relative p-8 sm:p-12 flex flex-col justify-center">
            <p
              className="text-white/95"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "clamp(18px, 2.1vw, 22px)",
                lineHeight: 1.55,
                letterSpacing: "-0.015em",
                fontWeight: 400,
              }}
            >
              After years inside global companies, I realised independent brands were operating without the infrastructure they deserved.
            </p>

            <p
              className="mt-5"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "clamp(18px, 2.1vw, 22px)",
                lineHeight: 1.55,
                letterSpacing: "-0.015em",
                fontWeight: 500,
                background:
                  "linear-gradient(135deg, #ffffff 0%, #b8d8e0 50%, #22d3ee 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              That's why I started CAMBRA.
            </p>

            <div
              className="mt-8 mb-5"
              style={{
                height: 1,
                background: "linear-gradient(90deg, rgba(255,255,255,0.18), transparent)",
                width: 80,
              }}
            />

            <p className="text-white text-[13px] font-bold tracking-tight">
              Xavier M. Contero
            </p>
            <p
              className="text-[9px] uppercase font-bold text-white/50 mt-1"
              style={{ letterSpacing: "0.24em" }}
            >
              Founder · CAMBRA · Paris
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}