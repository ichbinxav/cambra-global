import React from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import PublicPageShell from "@/components/shared/PublicPageShell";
import SectionLabel from "@/components/shared/SectionLabel";
import { useTranslation } from "@/lib/i18n.jsx";

/**
 * LegalPageLayout — paper-first shell for the array-of-sections legal pages
 * (Terms, Privacy). One badge + h1 + last-updated date + a list of
 * { title, content } blocks. Cookies has a table so it uses the shell directly.
 */
export default function LegalPageLayout({ badge, title, sections, lastUpdated, backLabel = "Back" }) {
  const { t } = useTranslation();
  return (
    <PublicPageShell>
      <div className="relative max-w-3xl mx-auto px-6 pt-24 pb-16">
        <Link to="/">
          <button
            className="mb-8 -ml-2 h-8 text-xs rounded-full px-3 inline-flex items-center transition-colors"
            style={{ color: "var(--gris-1)" }}
          >
            <ArrowLeft size={13} className="mr-1.5" /> {backLabel}
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
          {/* LEGAL-1 — the date is a CONSTANT passed from the legal content
              (real date of the last text edit). It was previously new Date(),
              which re-dated the policy every day — a policy whose date changes
              by itself attests nothing. */}
          {lastUpdated && (
            <p className="text-sm mb-6" style={{ color: "var(--gris-2)" }}>{lastUpdated}</p>
          )}

          <aside className="mb-8 rounded-2xl p-4 text-[12px] leading-relaxed" style={{ color: "var(--gris-1)", background: "rgba(91,76,245,.045)", border: "1px solid rgba(91,76,245,.18)" }}>
            <strong style={{ color: "var(--ink)" }}>{t("legal_review_badge")}</strong>{" "}{t("legal_review_notice")}
          </aside>

          <nav aria-label={t("legal_toc_label")} className="mb-12 rounded-2xl p-5" style={{ background: "#fff", border: "1px solid var(--linea)" }}>
            <p className="text-[10px] uppercase tracking-[.2em] font-bold mb-3" style={{ color: "var(--voltio)" }}>{t("legal_toc_label")}</p>
            <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
              {sections.map((section, i) => <li key={section.title}><a className="hover:underline" style={{ color: "var(--gris-1)" }} href={`#legal-section-${i + 1}`}>{section.title}</a></li>)}
            </ol>
          </nav>

          <div className="space-y-10 text-sm leading-relaxed" style={{ color: "var(--gris-1)" }}>
            {sections.map((section, i) => (
              <section id={`legal-section-${i + 1}`} key={i} className="pb-10 last:border-0 scroll-mt-24" style={{ borderBottom: "1px solid var(--linea)" }}>
                <h2 className="text-base font-bold mb-3" style={{ color: "var(--ink)" }}>{section.title}</h2>
                <p>{section.content}</p>
              </section>
            ))}
          </div>
        </motion.div>
        <style>{`@media print { header, footer { display:none !important; } main { background:#fff !important; } a { color:inherit !important; text-decoration:none !important; } }`}</style>
      </div>
    </PublicPageShell>
  );
}
