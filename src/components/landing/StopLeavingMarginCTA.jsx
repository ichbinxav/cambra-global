import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import JoinWaitlistButton from "@/components/landing/JoinWaitlistButton";

/**
 * Final CTA block — the WOW closer.
 * Cinematic finale: massive typography, pulsing halo, hairline dividers,
 * proof-driven trust row, and premium dual-CTA.
 */
export default function StopLeavingMarginCTA() {
  return (
    <section className="relative py-24 sm:py-36 overflow-hidden">
      {/* Pulsing multi-layer ambient halo — the heartbeat of the closing */}
      <motion.div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 1100,
          height: 900,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle, rgba(34,211,238,0.22) 0%, transparent 65%)",
          filter: "blur(120px)",
        }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 6, ease: "easeInOut", repeat: Infinity }}
      />
      <motion.div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 700,
          height: 700,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle, rgba(59,130,246,0.18) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
        animate={{ scale: [1.05, 1, 1.05], opacity: [0.6, 0.9, 0.6] }}
        transition={{ duration: 8, ease: "easeInOut", repeat: Infinity, delay: 1.5 }}
      />

      {/* Watermark "CAMBRA" — massive, ghosted */}
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
        style={{ opacity: 0.055 }}
      >
        <span
          className="font-black"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(180px, 28vw, 440px)",
            letterSpacing: "-0.07em",
            lineHeight: 0.85,
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0) 85%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          CAMBRA
        </span>
      </div>

      {/* Top hairline — cinematic frame */}
      <div
        aria-hidden
        className="absolute top-0 left-1/2 -translate-x-1/2 h-px"
        style={{
          width: "min(720px, 80%)",
          background:
            "linear-gradient(90deg, transparent 0%, rgba(34,211,238,0.5) 50%, transparent 100%)",
        }}
      />

      <div className="relative max-w-4xl mx-auto px-6 sm:px-10 text-center">
        {/* Eyebrow */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-10 flex justify-center"
        >
          <span
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 backdrop-blur-md"
            style={{
              border: "1px solid rgba(34,211,238,0.30)",
              background: "rgba(34,211,238,0.06)",
              boxShadow: "0 0 32px rgba(34,211,238,0.20)",
            }}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
            </span>
            <span className="text-[11px] uppercase tracking-[0.28em] font-bold text-white/85">
              The final call
            </span>
          </span>
        </motion.div>

        {/* MASSIVE headline — the closing statement */}
        <motion.h2
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="text-white mx-auto"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(52px, 10vw, 128px)",
            fontWeight: 900,
            letterSpacing: "-0.055em",
            lineHeight: 0.9,
            textShadow: "0 0 80px rgba(34,211,238,0.25)",
          }}
        >
          Stop leaving
          <br />
          <span
            style={{
              background:
                "linear-gradient(135deg, #ffffff 0%, #b8d8e0 45%, #39C6F0 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 0 40px rgba(34,211,238,0.4))",
            }}
          >
            margin on the table.
          </span>
        </motion.h2>

        {/* Supporting line */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.15 }}
          className="mt-10 mx-auto text-[17px] sm:text-[20px] text-white/65"
          style={{ lineHeight: 1.55, maxWidth: 620 }}
        >
          Turn operating costs into recovered margin.{" "}
          <span className="text-white">Verified. Immediate. Aligned incentives.</span>
        </motion.p>

        {/* CTAs — premium dual */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="mt-12 flex flex-col sm:flex-row gap-3 max-w-lg mx-auto items-stretch justify-center"
        >
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }} className="flex-1">
            <Link
              to="/Analyzer"
              className="group relative w-full inline-flex items-center justify-center gap-3 rounded-full font-bold text-[15px] overflow-hidden"
              style={{
                background: "#ffffff",
                color: "#0a0f1e",
                padding: "20px 32px",
                boxShadow:
                  "0 0 0 1px rgba(255,255,255,0.15), 0 28px 70px -20px rgba(34,211,238,0.65), 0 0 60px rgba(34,211,238,0.28)",
              }}
            >
              {/* Shimmer sweep */}
              <motion.span
                aria-hidden
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(110deg, transparent 35%, rgba(34,211,238,0.20) 50%, transparent 65%)",
                }}
                animate={{ x: ["-100%", "100%"] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.4 }}
              />
              <Sparkles size={16} className="relative text-blue-600" />
              <span className="relative">Run free audit</span>
              <ArrowRight size={16} className="relative transition-transform group-hover:translate-x-0.5" />
            </Link>
          </motion.div>

          <div className="flex-1">
            <JoinWaitlistButton variant="ghost" label="Join to recover" fullWidth />
          </div>
        </motion.div>

        {/* Trust row — proof-first */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="mt-10 flex flex-wrap justify-center items-center gap-x-5 gap-y-2.5 text-[11px] uppercase tracking-[0.24em] font-bold"
          style={{ color: "rgba(255,255,255,0.50)" }}
        >
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck size={12} className="text-cyan-300/85" />
            3 minutes
          </span>
          <span className="text-cyan-400/60">•</span>
          <span>No credit card</span>
          <span className="text-cyan-400/60">•</span>
          <span>No contract</span>
          <span className="text-cyan-400/60">•</span>
          <span className="text-white/80">Pay only if we save you money</span>
        </motion.div>
      </div>

      {/* Bottom hairline — cinematic frame closer */}
      <div
        aria-hidden
        className="absolute bottom-0 left-1/2 -translate-x-1/2 h-px"
        style={{
          width: "min(720px, 80%)",
          background:
            "linear-gradient(90deg, transparent 0%, rgba(34,211,238,0.5) 50%, transparent 100%)",
        }}
      />
    </section>
  );
}