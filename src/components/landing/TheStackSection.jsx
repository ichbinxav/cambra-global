import React from "react";
import { motion } from "framer-motion";
import SectionLabel from "@/components/shared/SectionLabel";
import SectionHeading from "@/components/landing/SectionHeading";
import { useTranslation } from "@/lib/i18n.jsx";

/**
 * The Stack — "Your entire payments stack. One analysis."
 * Light section. Image on the left (asset arrives in Chunk 3 — empty
 * placeholder, no border), four callouts on the right. Stacks on mobile.
 */
export default function TheStackSection() {
  const { t } = useTranslation();
  const CALLOUTS = [
    { title: t("stack_c1_t"), desc: t("stack_c1_d"), dot: "#7C3AED" },
    { title: t("stack_c2_t"), desc: t("stack_c2_d"), dot: "#3B82F6" },
    { title: t("stack_c3_t"), desc: t("stack_c3_d"), dot: "#22C1E0" },
    { title: t("stack_c4_t"), desc: t("stack_c4_d"), dot: "#2FE0A8" },
  ];
  return (
    <section className="relative py-12 sm:py-16 overflow-hidden">
      <div className="relative max-w-6xl mx-auto px-6 sm:px-10">
        <div className="text-center mb-12">
          <div className="flex justify-center mb-5">
            <SectionLabel>{t("stack_eyebrow")}</SectionLabel>
          </div>
          <SectionHeading>
            {t("stack_h2_pre")}
            <br />
            <span className="kw">{t("stack_h2_kw")}</span>
          </SectionHeading>
        </div>

        {/* The 4-layer glass illustration already contains dashed lines ending
            in a colored dot per layer. We overlay each callout next to its dot.
            The wrapper is centered; a right padding reserves room for the
            callout column so nothing overflows. On mobile the callouts stack. */}
        <div className="relative mx-auto lg:pr-[280px]" style={{ maxWidth: 940 }}>
          {/* On mobile the baked-in dashed lines + dots on the right of the
              image point at nothing (the callouts move to a list below), so
              they read as broken/dangling. We clip the right portion of the
              image on mobile (showing only the clean layer stack) and center
              it; on lg+ the full image with its dashed lines is shown so the
              overlaid callout labels line up with each dot. */}
          <div className="overflow-hidden lg:overflow-visible">
            <motion.img
              src="https://media.base44.com/images/public/6a16288b833b3c26d7ac1fab/20ff08204_stack-callouts-alpha2x.webp"
              alt="Online payments, in-store terminals, contracts and benchmark — one stack, one analysis"
              width={1100}
              height={800}
              loading="lazy"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="relative h-auto select-none w-[150%] max-w-none -ml-[8%] lg:w-full lg:ml-0"
              style={{ filter: "contrast(1.12) saturate(1.15) brightness(0.97)" }}
              draggable={false}
            />
          </div>

          {/* DESKTOP — callout labels overlaid next to each colored dot.
              The dots sit at roughly 24% / 41% / 58% / 75% of the image height,
              inside the padded area so they never clip the container. */}
          <div className="hidden lg:block">
            {CALLOUTS.map((c, i) => {
              const tops = ["24%", "41%", "58%", "75%"];
              return (
                <motion.div
                  key={c.title}
                  initial={{ opacity: 0, x: 12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute right-0"
                  style={{ top: tops[i], transform: "translateY(-50%)", width: 260 }}
                >
                  <h3
                    style={{
                      color: "var(--ink)",
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 600,
                      fontSize: "16px",
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
                      fontSize: "13px",
                      lineHeight: 1.5,
                    }}
                  >
                    {c.desc}
                  </p>
                </motion.div>
              );
            })}
          </div>

          {/* MOBILE — simple stacked list with a colored dot per item. */}
          <div className="lg:hidden mt-8 space-y-5">
            {CALLOUTS.map((c) => (
              <div key={c.title} className="flex gap-3">
                <span
                  className="mt-1.5 inline-block h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ background: c.dot }}
                  aria-hidden
                />
                <div>
                  <h3
                    style={{
                      color: "var(--ink)",
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 600,
                      fontSize: "16px",
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
                      fontSize: "13px",
                      lineHeight: 1.5,
                    }}
                  >
                    {c.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}