import React from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import PublicPageShell from "@/components/shared/PublicPageShell";
import SectionLabel from "@/components/shared/SectionLabel";

/**
 * LegalPageLayout — paper-first shell for the array-of-sections legal pages
 * (Terms, Privacy). One badge + h1 + last-updated date + a list of
 * { title, content } blocks. Cookies has a table so it uses the shell directly.
 */
export default function LegalPageLayout({ badge, title, sections }) {
  return (
    <PublicPageShell>
      <div className="relative max-w-3xl mx-auto px-6 pt-24 pb-16">
        <Link to="/">
          <button
            className="mb-8 -ml-2 h-8 text-xs rounded-full px-3 inline-flex items-center transition-colors"
            style={{ color: "var(--gris-1)" }}
          >
            <ArrowLeft size={13} className="mr-1.5" /> Back
          </button>
        </Link>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-5">
            <SectionLabel>{badge}</SectionLabel>
          </div>
          <h1
            className="font-display font-black mb-3"
            style={{
              color: "var(--ink)",
              fontSize: "clamp(2.2rem,5.5vw,4rem)",
              letterSpacing: "-0.045em",
              lineHeight: 0.9,
            }}
          >
            {title}
          </h1>
          <p className="text-sm mb-14" style={{ color: "var(--gris-2)" }}>
            Last updated: {new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}
          </p>

          <div className="space-y-10 text-sm leading-relaxed" style={{ color: "var(--gris-1)" }}>
            {sections.map((section, i) => (
              <div key={i} className="pb-10 last:border-0" style={{ borderBottom: "1px solid var(--linea)" }}>
                <h2 className="text-base font-bold mb-3" style={{ color: "var(--ink)" }}>{section.title}</h2>
                <p>{section.content}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </PublicPageShell>
  );
}