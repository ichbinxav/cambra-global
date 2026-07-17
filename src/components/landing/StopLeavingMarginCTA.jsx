import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import JoinWaitlistButton from "@/components/landing/JoinWaitlistButton";
import { BRAND_ASSETS } from "@/lib/brandAssets";

/**
 * Final CTA block — the WOW closer.
 * Cinematic finale: large frosted cube on the left, headline + CTAs
 * right-aligned, and a giant ghosted C-mark filling the whole pill as the
 * background brand mark.
 */
export default function StopLeavingMarginCTA() {
  return (
    <section className="relative py-16 sm:py-20 px-4 sm:px-6">
     {/* Dark closer pill — this section is a full-bleed cinematic dark block,
         so it renders as its own navy card on the paper canvas. */}
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
        animate={{ scale: [1, 1.08, 1], opacity: [0.55, 0.8, 0.55] }}
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
        animate={{ scale: [1.05, 1, 1.05], opacity: [0.45, 0.7, 0.45] }}
        transition={{ duration: 8, ease: "easeInOut", repeat: Infinity, delay: 1.5 }}
      />

      {/* Giant C logo — fills the whole pill as a ghosted background mark,
          replacing the old "CAMBRA" wordmark watermark. Transparent PNG. */}
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
        style={{ opacity: 0.14 }}
      >
        <img
          src={BRAND_ASSETS.cMarkBig}
          alt=""
          className="h-[135%] w-auto max-w-none select-none"
          draggable={false}
        />
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

      <div className="relative max-w-6xl mx-auto px-6 sm:px-10 grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-10 lg:gap-16 items-center">
        {/* LEFT — frosted cube, large, floating */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="flex justify-center lg:justify-start order-2 lg:order-1"
        >
          <img
            src={BRAND_ASSETS.cubeFrosted}
            alt=""
            width={520}
            height={520}
            loading="lazy"
            className="hero-stack w-[80%] max-w-[520px] lg:w-[520px] h-auto select-none drop-shadow-2xl"
            draggable={false}
          />
        </motion.div>

        {/* RIGHT — copy + CTAs, right-aligned on desktop */}
        <div className="text-center lg:text-right order-1 lg:order-2">
          {/* Eyebrow */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mb-10 flex justify-center lg:justify-end"
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
            className="text-white"
            style={{
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              fontSize: "clamp(48px, 8vw, 104px)",
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
            className="mt-10 text-[17px] sm:text-[20px] text-white/65 lg:ml-auto"
            style={{ lineHeight: 1.55, maxWidth: 620 }}
          >
            Turn operating costs into recovered margin.
            <br />
            <span className="text-white">Verified. Immediate. Aligned incentives.</span>
          </motion.p>

          {/* CTAs — premium dual */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="mt-12 flex flex-col sm:flex-row gap-3 max-w-lg lg:ml-auto items-stretch justify-center lg:justify-end"
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
            className="mt-10 flex flex-wrap justify-center lg:justify-end items-center gap-x-5 gap-y-2.5 text-[11px] uppercase tracking-[0.24em] font-bold"
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