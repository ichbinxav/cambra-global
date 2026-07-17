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
    <section className="relative py-16 sm:py-20 px-4 sm:px-6">
     {/* Dark closer pill — this section is a full-bleed cinematic dark block,
         so it renders as its own navy card on the paper canvas. Navy matches
         the exact gradient used by every other dark pill on the page. */}
     <div
       className="relative mx-auto max-w-6xl rounded-[32px] overflow-hidden py-24 sm:py-32"
       style={{
         background: "linear-gradient(180deg, #14112e 0%, #0e0b22 55%, #0a0818 100%)",
         border: "1px solid rgba(255,255,255,0.08)",
         boxShadow: "0 40px 100px -40px rgba(0,0,0,0.6), 0 16px 50px -22px rgba(91,76,245,0.3)",
       }}
     >
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
            "radial-gradient(circle, rgba(91,76,245,0.24) 0%, transparent 65%)",
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
            "radial-gradient(circle, rgba(139,123,255,0.18) 0%, transparent 70%)",
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
            "linear-gradient(90deg, transparent 0%, rgba(139,123,255,0.5) 50%, transparent 100%)",
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
              border: "1px solid rgba(139,123,255,0.32)",
              background: "rgba(139,123,255,0.08)",
              boxShadow: "0 0 32px rgba(91,76,245,0.22)",
            }}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: "#8B7BFF" }} />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: "#8B7BFF" }} />
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
            letterSpacing: "-0.05em",
            lineHeight: 0.9,
            textShadow: "0 0 80px rgba(91,76,245,0.25)",
          }}
        >
          Stop leaving
          <br />
          {/* Keyword highlight → violet→cyan gradient (reference style). */}
          <span className="kw">margin on the table.</span>
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
          <div className="flex-1">
            <Link
              to="/Analyzer"
              className="group w-full inline-flex items-center justify-center gap-3 rounded-full font-medium text-[15px] transition-colors hover:bg-[#4A3AD1]"
              style={{
                background: "#3A2BB0",
                color: "#ffffff",
                padding: "20px 32px",
              }}
            >
              <Sparkles size={16} style={{ color: "#ffffff" }} />
              <span>Run free audit</span>
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

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
            <ShieldCheck size={12} style={{ color: "rgba(139,123,255,0.9)" }} />
            3 minutes
          </span>
          <span style={{ color: "rgba(139,123,255,0.6)" }}>•</span>
          <span>No credit card</span>
          <span style={{ color: "rgba(139,123,255,0.6)" }}>•</span>
          <span>No contract</span>
          <span style={{ color: "rgba(139,123,255,0.6)" }}>•</span>
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
            "linear-gradient(90deg, transparent 0%, rgba(139,123,255,0.5) 50%, transparent 100%)",
        }}
      />
     </div>
    </section>
  );
}