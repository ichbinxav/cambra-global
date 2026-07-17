import { useEffect, useState } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import PublicPageShell from "@/components/shared/PublicPageShell";
import FAQAccordion from "@/components/help/FAQAccordion";
import HelpSearch from "@/components/help/HelpSearch";
import HelpCTA from "@/components/help/HelpCTA";
import { CATEGORIES, getCategory, getFAQsByCategory } from "@/lib/helpCenterData";

export default function HelpCategory() {
  const { slug } = useParams();
  const [searchOpen, setSearchOpen] = useState(false);
  const category = getCategory(slug);
  const groups = getFAQsByCategory(slug);

  useEffect(() => {
    const hash = window.location.hash?.slice(1);
    if (hash) {
      // Wait a tick for FAQs to render then scroll to anchor
      setTimeout(() => {
        const el = document.getElementById(hash);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        else window.scrollTo(0, 0);
      }, 100);
    } else {
      window.scrollTo(0, 0);
    }
  }, [slug]);

  if (!category) return <Navigate to="/Help" replace />;

  // M4-TPV Fase 3 iter 2 — also filter `hidden` categories out of related,
  // so a visitor on /Help/payments doesn't get "Shipping & Logistics" as a
  // suggested next topic when the category itself is hidden from the grid.
  const relatedCategories = CATEGORIES
    .filter((c) => c.slug !== slug && !c.hidden)
    .slice(0, 4);

  return (
    <PublicPageShell>
      {/* Hero */}
      <section className="relative pt-28 pb-12 px-5 overflow-hidden">
        <div
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            width: 800, height: 400, left: "50%", top: 0, transform: "translateX(-50%)",
            background: `radial-gradient(closest-side, ${category.accent}22, transparent)`,
            filter: "blur(110px)",
          }}
        />

        <div className="relative max-w-3xl mx-auto">
          <Link
            to="/Help"
            className="inline-flex items-center gap-1.5 text-xs transition-colors mb-6"
            style={{ color: "var(--gris-1)" }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Help Center
          </Link>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div
              className="inline-flex items-center gap-2 mb-5 px-3 py-1 rounded-full border text-[10px] font-bold tracking-[0.2em] uppercase"
              style={{
                color: category.accent,
                borderColor: `${category.accent}40`,
                background: `${category.accent}0F`,
              }}
            >
              {category.title}
            </div>
            <h1 className="text-[clamp(2rem,5vw,4rem)] font-black tracking-[-0.04em] leading-[0.92] mb-4" style={{ color: "var(--ink)" }}>
              {category.title}
            </h1>
            <p className="text-base max-w-2xl leading-relaxed" style={{ color: "var(--gris-1)" }}>
              {category.description}
            </p>
          </motion.div>

          <button
            onClick={() => setSearchOpen(true)}
            className="mt-7 inline-flex items-center gap-2 h-10 px-4 rounded-full transition-colors text-sm"
            style={{ border: "1px solid var(--linea)", background: "#fff" }}
          >
            <Search className="w-3.5 h-3.5" style={{ color: "var(--gris-2)" }} />
            <span style={{ color: "var(--gris-2)" }}>Search the knowledge base…</span>
            <kbd className="ml-2 hidden sm:inline-flex items-center gap-0.5 h-5 px-1.5 rounded border text-[9px] font-bold" style={{ borderColor: "var(--linea)", background: "rgba(12,12,22,0.04)", color: "var(--gris-1)" }}>
              ⌘K
            </kbd>
          </button>
        </div>
      </section>

      {/* FAQs */}
      <section className="px-5 pb-16">
        <div className="max-w-3xl mx-auto space-y-12">
          {groups.map((g, gi) => (
            <div key={gi}>
              <h2 className="text-xl font-black tracking-tight mb-5" style={{ color: "var(--ink)" }}>{g.title}</h2>
              <FAQAccordion items={g.items} categorySlug={slug} />
            </div>
          ))}

          {groups.length === 0 && (
            <div className="text-center py-16 rounded-2xl" style={{ border: "1px dashed var(--linea)", background: "rgba(12,12,22,0.02)" }}>
              <p className="text-sm mb-2" style={{ color: "var(--gris-1)" }}>
                Articles for this category are coming soon.
              </p>
              <p className="text-xs mb-4" style={{ color: "var(--gris-2)" }}>
                In the meantime, browse other topics or reach out directly.
              </p>
              <Link
                to="/Contact"
                className="inline-flex items-center gap-1.5 text-xs font-bold hover:underline"
                style={{ color: "var(--ink)" }}
              >
                Talk to CAMBRA <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Related */}
      <section className="px-5 pb-12">
        <div className="max-w-3xl mx-auto">
          <p className="text-[10px] font-bold tracking-[0.25em] uppercase mb-4" style={{ color: "var(--gris-2)" }}>
            Related topics
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {relatedCategories.map((c) => (
              <Link
                key={c.slug}
                to={`/Help/${c.slug}`}
                className="group flex items-center justify-between p-4 rounded-xl transition-all hover:-translate-y-0.5"
                style={{ border: "1px solid var(--linea)", background: "#fff", boxShadow: "0 4px 20px rgba(12,12,22,0.04)" }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold tracking-tight" style={{ color: "var(--ink)" }}>{c.title}</p>
                  <p className="text-[11px] truncate" style={{ color: "var(--gris-1)" }}>
                    {c.description}
                  </p>
                </div>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-all shrink-0" style={{ color: "var(--gris-2)" }} />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <HelpCTA />
      <HelpSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </PublicPageShell>
  );
}