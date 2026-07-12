import { useEffect, useState } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import Navbar from "@/components/landing/Navbar";
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
    <div
      className="min-h-screen font-inter text-white"
      style={{
        background:
          "linear-gradient(180deg, #0a0a0a 0%, #0b0e1a 22%, #0a0d18 48%, #0b1020 72%, #08090f 100%)",
      }}
    >
      <Navbar />

      {/* Hero */}
      <section className="relative pt-28 pb-12 px-5 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full blur-[120px] opacity-20"
            style={{ background: `radial-gradient(closest-side, ${category.accent}, transparent)` }}
          />
        </div>

        <div className="relative max-w-3xl mx-auto">
          <Link
            to="/Help"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-foreground transition-colors mb-6"
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
                background: `${category.accent}08`,
              }}
            >
              {category.title}
            </div>
            <h1 className="text-[clamp(2rem,5vw,4rem)] font-black tracking-[-0.04em] leading-[0.92] mb-4">
              {category.title}
            </h1>
            <p className="text-base text-muted-foreground/70 max-w-2xl leading-relaxed">
              {category.description}
            </p>
          </motion.div>

          <button
            onClick={() => setSearchOpen(true)}
            className="mt-7 inline-flex items-center gap-2 h-10 px-4 rounded-full border border-border/60 bg-card hover:border-foreground/30 transition-colors text-sm"
          >
            <Search className="w-3.5 h-3.5 text-muted-foreground/60" />
            <span className="text-muted-foreground/60">Search the knowledge base…</span>
            <kbd className="ml-2 hidden sm:inline-flex items-center gap-0.5 h-5 px-1.5 rounded border border-border/60 bg-secondary text-[9px] font-bold text-muted-foreground/70">
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
              <h2 className="text-xl font-black tracking-tight mb-5">{g.title}</h2>
              <FAQAccordion items={g.items} categorySlug={slug} />
            </div>
          ))}

          {groups.length === 0 && (
            <div className="text-center py-16 rounded-2xl border border-dashed border-border/50 bg-secondary/30">
              <p className="text-sm text-muted-foreground/60 mb-2">
                Articles for this category are coming soon.
              </p>
              <p className="text-xs text-muted-foreground/40 mb-4">
                In the meantime, browse other topics or reach out directly.
              </p>
              <Link
                to="/Contact"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-foreground hover:underline"
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
          <p className="text-[10px] font-bold tracking-[0.25em] uppercase text-muted-foreground/50 mb-4">
            Related topics
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {relatedCategories.map((c) => (
              <Link
                key={c.slug}
                to={`/Help/${c.slug}`}
                className="group flex items-center justify-between p-4 rounded-xl border border-border/40 bg-card hover:border-foreground/30 transition-all"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold tracking-tight">{c.title}</p>
                  <p className="text-[11px] text-muted-foreground/60 truncate">
                    {c.description}
                  </p>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <HelpCTA />
      <HelpSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}