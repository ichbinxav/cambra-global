import React from "react";
import { motion } from "framer-motion";
import SectionLabel from "@/components/shared/SectionLabel";
import SectionHeading from "@/components/landing/SectionHeading";
import { BRAND_ASSETS } from "@/lib/brandAssets";

/**
 * The Stack — "Your entire payments stack. One analysis."
 * Light section. Image on the left (asset arrives in Chunk 3 — empty
 * placeholder, no border), four callouts on the right. Stacks on mobile.
 */
const CALLOUTS = [
  {
    title: "Online payments",
    desc: "Stripe, Mollie, PayPal… what each sale really costs you.",
  },
  {
    title: "In-store terminals",
    desc: "The quiet leak in your physical channel.",
  },
  {
    title: "Contracts",
    desc: "What you signed vs. what brands your size actually pay.",
  },
  {
    title: "Benchmark (base layer)",
    desc: "Real costs from real brands. Not the price list.",
  },
];

export default function TheStackSection() {
  return (
    <section className="relative py-12 sm:py-16 overflow-hidden">
      <div className="relative max-w-6xl mx-auto px-6 sm:px-10">
        <div className="text-center mb-12">
          <div className="flex justify-center mb-5">
            <SectionLabel>What we analyze</SectionLabel>
          </div>
          <SectionHeading>
            Your entire payments stack.
            <br />
            <span className="kw">One analysis.</span>
          </SectionHeading>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          {/* LEFT — frosted stack. Same icon as the hero (deliberate: the
              icon appears in the hero, then gets explained here). No float
              animation here, so the two placements read differently. */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            id="stack-slot"
            className="relative w-full mx-auto flex justify-center"
            style={{ maxWidth: 560 }}
          >
            {/* soft clearing in the dot mesh behind the 3D object */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{ background: "radial-gradient(55% 55% at 50% 50%, #FAFAFC 35%, rgba(250,250,252,0) 75%)" }}
            />
            <img
              src={BRAND_ASSETS.stackFrosted}
              alt="Online payments, in-store terminals, contracts and benchmark — one stack"
              width={560}
              height={560}
              loading="lazy"
              className="relative w-full max-w-[560px] h-auto select-none"
              draggable={false}
            />
          </motion.div>

          {/* RIGHT — callouts */}
          <div className="space-y-7">
            {CALLOUTS.map((c, i) => (
              <motion.div
                key={c.title}
                initial={{ opacity: 0, x: 16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
              >
                <h3
                  style={{
                    color: "var(--ink)",
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 600,
                    fontSize: "17px",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {c.title}
                </h3>
                <p
                  className="mt-1"
                  style={{
                    color: "var(--gris-1)",
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 400,
                    fontSize: "14px",
                    lineHeight: 1.55,
                  }}
                >
                  {c.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}