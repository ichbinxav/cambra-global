import React from "react";
import { motion } from "framer-motion";

/**
 * Founder letter — editorial "open letter" redesign.
 * Large serif-feel quote, vertical layout with photo as portrait medallion,
 * cinematic dark surface with corner ornaments and signature flourish.
 */
const FOUNDER_PHOTO =
  "https://media.base44.com/images/public/6a16288b833b3c26d7ac1fab/d863d71f2_0347F92E-E1B9-4977-A6B1-85897923556A.jpeg";

export default function FounderLetter() {
  return (
    <section className="relative py-20 sm:py-28 overflow-hidden">
      {/* ambient cyan halo */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 700, height: 700, left: "50%", top: "30%", transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(34,211,238,0.07) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />

      <div className="relative max-w-3xl mx-auto px-6 sm:px-10">
        {/* Eyebrow */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
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
              An open letter
            </span>
          </span>
        </motion.div>

        {/* THE LETTER — single editorial surface */}
        <motion.article
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="relative rounded-3xl overflow-hidden"
          style={{
            background:
              "linear-gradient(180deg, #0d1224 0%, #060810 100%)",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow:
              "0 40px 100px -30px rgba(0,0,0,0.7), 0 0 60px -20px rgba(34,211,238,0.12)",
          }}
        >
          {/* corner ornaments — minimalist editorial brackets */}
          <span
            aria-hidden
            className="absolute top-5 left-5 w-6 h-6"
            style={{
              borderTop: "1px solid rgba(34,211,238,0.5)",
              borderLeft: "1px solid rgba(34,211,238,0.5)",
            }}
          />
          <span
            aria-hidden
            className="absolute top-5 right-5 w-6 h-6"
            style={{
              borderTop: "1px solid rgba(34,211,238,0.5)",
              borderRight: "1px solid rgba(34,211,238,0.5)",
            }}
          />
          <span
            aria-hidden
            className="absolute bottom-5 left-5 w-6 h-6"
            style={{
              borderBottom: "1px solid rgba(34,211,238,0.5)",
              borderLeft: "1px solid rgba(34,211,238,0.5)",
            }}
          />
          <span
            aria-hidden
            className="absolute bottom-5 right-5 w-6 h-6"
            style={{
              borderBottom: "1px solid rgba(34,211,238,0.5)",
              borderRight: "1px solid rgba(34,211,238,0.5)",
            }}
          />

          {/* watermark "C" */}
          <span
            aria-hidden
            className="absolute select-none pointer-events-none"
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 360,
              fontWeight: 900,
              letterSpacing: "-0.08em",
              lineHeight: 1,
              right: "-3rem",
              bottom: "-6rem",
              color: "rgba(255,255,255,0.025)",
            }}
          >
            C
          </span>

          <div className="relative px-7 sm:px-14 py-14 sm:py-20 text-center">
            {/* Portrait medallion */}
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="relative mx-auto mb-10"
              style={{ width: 96, height: 96 }}
            >
              {/* glow ring */}
              <div
                aria-hidden
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    "conic-gradient(from 180deg, rgba(34,211,238,0.6), rgba(96,165,250,0.4), rgba(34,211,238,0.6))",
                  padding: 2,
                  filter: "blur(0.5px)",
                }}
              />
              <div
                className="relative rounded-full overflow-hidden"
                style={{
                  width: 96, height: 96,
                  margin: 2,
                  width: "calc(100% - 4px)",
                  height: "calc(100% - 4px)",
                  border: "1px solid rgba(0,0,0,0.4)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                }}
              >
                <img
                  src={FOUNDER_PHOTO}
                  alt="Xavier M. Contero"
                  className="w-full h-full object-cover"
                  style={{ filter: "grayscale(80%) contrast(1.08)" }}
                />
              </div>
            </motion.div>

            {/* Opening dash — editorial flourish */}
            <div
              aria-hidden
              className="mx-auto mb-8"
              style={{
                width: 40,
                height: 1,
                background: "linear-gradient(90deg, transparent, rgba(34,211,238,0.7), transparent)",
              }}
            />

            {/* The letter body — large, intimate, serif-feel */}
            <p
              className="text-white/95 mx-auto"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "clamp(20px, 2.6vw, 28px)",
                lineHeight: 1.45,
                letterSpacing: "-0.02em",
                fontWeight: 400,
                maxWidth: 580,
              }}
            >
              After years inside global companies, I realised independent brands were operating without the infrastructure they deserved.
            </p>

            <p
              className="mt-6 mx-auto"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "clamp(18px, 2.2vw, 24px)",
                lineHeight: 1.5,
                letterSpacing: "-0.015em",
                fontWeight: 400,
                maxWidth: 540,
                background:
                  "linear-gradient(135deg, #ffffff 0%, #b8d8e0 50%, #22d3ee 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              That's why I started CAMBRA.
            </p>

            {/* Closing dash */}
            <div
              aria-hidden
              className="mx-auto my-10"
              style={{
                width: 40,
                height: 1,
                background: "linear-gradient(90deg, transparent, rgba(34,211,238,0.7), transparent)",
              }}
            />

            {/* Signature flourish — handwritten feel */}
            <p
              className="mb-2"
              style={{
                fontFamily: "'Brush Script MT', 'Lucida Handwriting', cursive",
                fontSize: "clamp(28px, 3.5vw, 36px)",
                color: "rgba(34,211,238,0.85)",
                letterSpacing: "0.01em",
                lineHeight: 1,
                transform: "rotate(-2deg)",
                display: "inline-block",
              }}
            >
              Xavier
            </p>

            <div className="mt-3 flex items-center justify-center gap-2">
              <p className="text-white text-[12px] font-bold tracking-tight">
                Xavier M. Contero
              </p>
              <span className="text-white/30">·</span>
              <p
                className="text-[9px] uppercase font-bold text-white/55"
                style={{ letterSpacing: "0.22em" }}
              >
                Founder · Paris
              </p>
            </div>
          </div>
        </motion.article>
      </div>
    </section>
  );
}