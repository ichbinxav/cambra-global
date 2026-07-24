// LEGAL-1 (2026-07-24) — Cookie & storage policy, rebuilt from the
// code-verified inventory (src/docs/Decision_Log_LEGAL1.md, Fase 0).
// Renders one table per storage MECHANISM (cookies / localStorage /
// sessionStorage) — calling browser storage "cookies" is exactly the kind of
// imprecision this rewrite removes. Content is trilingual via per-language
// files; the "Last updated" date is a constant in the content, never new Date().
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import PublicPageShell from "@/components/shared/PublicPageShell";
import SectionLabel from "@/components/shared/SectionLabel";
import { useTranslation } from "@/lib/i18n.jsx";
import en from "@/content/legal/en/cookies";
import fr from "@/content/legal/fr/cookies";
import es from "@/content/legal/es/cookies";

const CONTENT = { en, fr, es };

function StorageTable({ table, columns }) {
  return (
    <section>
      <h2 className="text-base font-bold mb-1" style={{ color: "var(--ink)" }}>{table.heading}</h2>
      <p className="text-xs mb-3" style={{ color: "var(--gris-2)" }}>{table.note}</p>
      <div className="overflow-x-auto -mx-2 px-2">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--linea)", color: "var(--ink)" }}>
              <th className="text-left font-semibold py-2 pr-3">{columns.name}</th>
              <th className="text-left font-semibold py-2 pr-3">{columns.purpose}</th>
              <th className="text-left font-semibold py-2 pr-3">{columns.duration}</th>
              <th className="text-left font-semibold py-2">{columns.category}</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => (
              <tr key={r.name} style={{ borderBottom: "1px solid var(--linea)" }}>
                <td className="py-3 pr-3 font-mono align-top" style={{ color: "var(--ink)" }}>{r.name}</td>
                <td className="py-3 pr-3 align-top">{r.purpose}</td>
                <td className="py-3 pr-3 align-top whitespace-nowrap">{r.duration}</td>
                <td className="py-3 align-top whitespace-nowrap">{r.category}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Cookies() {
  const { lang } = useTranslation();
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
          <p className="text-sm mb-12" style={{ color: "var(--gris-2)" }}>{c.lastUpdated}</p>

          <div className="space-y-10 text-sm leading-relaxed" style={{ color: "var(--gris-1)" }}>
            {c.intro.map((s) => (
              <section key={s.title}>
                <h2 className="text-base font-bold mb-3" style={{ color: "var(--ink)" }}>{s.title}</h2>
                <p>{s.body}</p>
              </section>
            ))}

            {c.tables.map((table) => (
              <StorageTable key={table.heading} table={table} columns={c.columns} />
            ))}

            {c.after.map((s) => (
              <section key={s.title}>
                <h2 className="text-base font-bold mb-3" style={{ color: "var(--ink)" }}>{s.title}</h2>
                <p>{s.body}</p>
              </section>
            ))}
          </div>
        </motion.div>
      </div>
    </PublicPageShell>
  );
}