import React from "react";
import { motion } from "framer-motion";
import { Quote } from "lucide-react";
import SectionHeading from "@/components/landing/SectionHeading";

/**
 * Founder letter — adapted to dark editorial theme.
 * Headline + two side-by-side cards (portrait | letter card).
 */
const FOUNDER_PHOTO =
  "https://media.base44.com/images/public/6a16288b833b3c26d7ac1fab/d863d71f2_0347F92E-E1B9-4977-A6B1-85897923556A.jpeg";

export default function FounderLetter() {
  return (
    <section className="relative py-12 sm:py-16 overflow-hidden">
      {/* ambient halo */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 700, height: 700, left: "50%", top: "50%", transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(91,76,245,0.06) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />

      <div className="relative max-w-4xl mx-auto px-6 sm:px-10">
        {/* Header — unified */}
        <SectionHeading eyebrow="Meet the founder" className="mb-12 sm:mb-16">
          A note from
          <br />
          <span className="kw">the founder.</span>
        </SectionHeading>

        {/* Two columns */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="grid grid-cols-2 gap-3 sm:gap-4"
        >
          {/* LEFT — portrait card */}
          <div
            className="relative rounded-2xl overflow-hidden min-h-[220px] sm:min-h-[340px]"
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
            className="relative rounded-2xl overflow-hidden p-4 sm:p-7 flex flex-col"
            style={{
              background:
                "radial-gradient(120% 90% at 8% 0%, rgba(74,58,209,0.30) 0%, transparent 55%), radial-gradient(110% 100% at 100% 100%, rgba(57,198,240,0.16) 0%, transparent 60%), linear-gradient(180deg, #14112e 0%, #0e0b22 55%, #0a0818 100%)",
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
                background: "radial-gradient(circle, rgba(139,123,255,0.20) 0%, transparent 70%)",
                filter: "blur(50px)",
              }}
            />

            <div className="relative">
              <Quote
                size={28}
                className="mb-4"
                style={{ color: "var(--voltio-2)" }}
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
                    "linear-gradient(135deg, var(--voltio-2) 0%, var(--voltio) 100%)",
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