// DPA-1 (2026-08-16) — Annex III of the DPA: the sub-processor list.
// Table content, so it uses PublicPageShell directly (same reasoning and the
// same visual grammar as Cookies.jsx, which also renders tables).
//
// The page carries its own lastUpdated date because the DPA's 30-day
// sub-processor change notice (§7.2) is measured from it.
import React from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import PublicPageShell from "@/components/shared/PublicPageShell";
import SectionLabel from "@/components/shared/SectionLabel";
import { useTranslation } from "@/lib/i18n.jsx";
import en from "@/content/legal/en/subprocessors";
import fr from "@/content/legal/fr/subprocessors";
import es from "@/content/legal/es/subprocessors";

const CONTENT = { en, fr, es };

function SubprocessorTable({ table, columns }) {
  return (
    <section>
      <h2 className="text-base font-bold mb-1" style={{ color: "var(--ink)" }}>{table.heading}</h2>
      <p className="text-xs mb-3" style={{ color: "var(--gris-2)" }}>{table.note}</p>
      <div className="overflow-x-auto -mx-2 px-2">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--linea)", color: "var(--ink)" }}>
              <th className="text-left font-semibold py-2 pr-3">{columns.name}</th>
              <th className="text-left font-semibold py-2 pr-3">{columns.country}</th>
              <th className="text-left font-semibold py-2 pr-3">{columns.service}</th>
              <th className="text-left font-semibold py-2 pr-3">{columns.transfer}</th>
              <th className="text-left font-semibold py-2">{columns.status}</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => (
              <tr key={r.name} style={{ borderBottom: "1px solid var(--linea)" }}>
                <td className="py-3 pr-3 font-semibold align-top" style={{ color: "var(--ink)" }}>{r.name}</td>
                <td className="py-3 pr-3 align-top">{r.country}</td>
                <td className="py-3 pr-3 align-top">{r.service}</td>
                <td className="py-3 pr-3 align-top">{r.transfer}</td>
                <td className="py-3 align-top">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Subprocessors() {
  const { lang, t } = useTranslation();
  const c = CONTENT[lang] || CONTENT.en;

  return (
    <PublicPageShell>
      <div className="relative max-w-3xl mx-auto px-6 pt-24 pb-16">
        <Link to="/">
          <button
            className="mb-8 -ml-2 h-8 text-xs rounded-full px-3 inline-flex items-center transition-colors"
            style={{ color: "var(--gris-1)" }}
          >
            <ArrowLeft size={13} className="mr-1.5" /> {c.back}
          </button>
        </Link>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-5">
            <SectionLabel>{c.badge}</SectionLabel>
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
            {c.title}
          </h1>
          <p className="text-sm mb-6" style={{ color: "var(--gris-2)" }}>{c.lastUpdated}</p>

          {/* Same review-status notice the shared legal layout shows on every
              other legal page — this page is built on the shell directly, so
              it renders it explicitly rather than silently dropping it. */}
          <aside className="mb-8 rounded-2xl p-4 text-[12px] leading-relaxed" style={{ color: "var(--gris-1)", background: "rgba(91,76,245,.045)", border: "1px solid rgba(91,76,245,.18)" }}>
            <strong style={{ color: "var(--ink)" }}>{t("legal_review_badge")}</strong>{" "}{t("legal_review_notice")}
          </aside>

          <div className="space-y-10 text-sm leading-relaxed" style={{ color: "var(--gris-1)" }}>
            {c.intro.map((block) => (
              <section key={block.title}>
                <h2 className="text-base font-bold mb-3" style={{ color: "var(--ink)" }}>{block.title}</h2>
                <p>{block.body}</p>
              </section>
            ))}

            {c.tables.map((table) => (
              <SubprocessorTable key={table.heading} table={table} columns={c.columns} />
            ))}

            {c.outro.map((block) => (
              <section key={block.title}>
                <h2 className="text-base font-bold mb-3" style={{ color: "var(--ink)" }}>{block.title}</h2>
                <p>{block.body}</p>
              </section>
            ))}
          </div>

          <nav className="mt-10 text-[13px]">
            <Link to="/Dpa" className="underline" style={{ color: "var(--voltio)" }}>{t("footer_dpa")}</Link>
          </nav>
        </motion.div>
        <style>{`@media print { header, footer { display:none !important; } main { background:#fff !important; } a { color:inherit !important; text-decoration:none !important; } }`}</style>
      </div>
    </PublicPageShell>
  );
}
