import { useEffect, useState, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X, ArrowRight, TrendingUp, Sparkles } from "lucide-react";
import { getAllFAQs, TRENDING_SEARCHES, CATEGORIES } from "@/lib/helpCenterData";

export default function HelpSearch({ open, onClose }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);
  const allFaqs = useMemo(() => getAllFAQs(), []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) onClose();
      }
      if (e.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return allFaqs
      .filter((f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, allFaqs]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-background/70 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="fixed top-[10vh] left-1/2 -translate-x-1/2 z-[101] w-[92vw] max-w-2xl"
          >
            <div className="relative rounded-2xl border border-border/60 bg-card/98 backdrop-blur-2xl shadow-2xl overflow-hidden">
              {/* Glow ring */}
              <div className="absolute -inset-px rounded-2xl bg-saas-gradient opacity-15 blur-md pointer-events-none" />

              <div className="relative">
                {/* Search input */}
                <div className="flex items-center gap-3 px-5 h-16 border-b border-border/40">
                  <Search className="w-5 h-5 text-muted-foreground/50 shrink-0" />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ask anything about CAMBRA infrastructure intelligence…"
                    className="flex-1 bg-transparent border-0 outline-none text-base text-foreground placeholder:text-muted-foreground/40"
                  />
                  <button
                    onClick={onClose}
                    className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground/50 hover:text-foreground transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Results / Empty state */}
                <div className="max-h-[60vh] overflow-y-auto">
                  {!query.trim() ? (
                    <div className="p-5 space-y-5">
                      <div>
                        <p className="flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground/50 mb-3">
                          <TrendingUp className="w-3 h-3" /> Trending searches
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {TRENDING_SEARCHES.map((t) => (
                            <button
                              key={t}
                              onClick={() => setQuery(t)}
                              className="px-3 py-1.5 rounded-full border border-border/50 bg-background/60 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground/50 mb-3">
                          <Sparkles className="w-3 h-3" /> Browse categories
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {CATEGORIES.slice(0, 8).map((c) => (
                            <Link
                              key={c.slug}
                              to={`/Help/${c.slug}`}
                              onClick={onClose}
                              className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border/40 bg-background/60 hover:bg-secondary hover:border-foreground/20 text-sm transition-all group"
                            >
                              <span className="font-semibold truncate">{c.title}</span>
                              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : results.length === 0 ? (
                    <div className="p-10 text-center">
                      <p className="text-sm text-muted-foreground/60 mb-1">
                        No results for "<span className="font-semibold text-foreground">{query}</span>"
                      </p>
                      <p className="text-xs text-muted-foreground/40">
                        Try a different keyword, or{" "}
                        <Link to="/Contact" onClick={onClose} className="underline hover:text-foreground">
                          contact CAMBRA
                        </Link>
                        .
                      </p>
                    </div>
                  ) : (
                    <div className="p-2">
                      {results.map((r) => (
                        <Link
                          key={r.id}
                          to={`/Help/${r.category}#${r.id}`}
                          onClick={onClose}
                          className="block p-3 rounded-lg hover:bg-secondary transition-colors group"
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-7 h-7 rounded-md bg-secondary group-hover:bg-background flex items-center justify-center shrink-0 mt-0.5 transition-colors">
                              <Search className="w-3 h-3 text-muted-foreground/60" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold mb-0.5">
                                <Highlight text={r.q} term={query} />
                              </p>
                              <p className="text-[11px] text-muted-foreground/60 line-clamp-1">
                                <Highlight text={r.a} term={query} />
                              </p>
                              <p className="text-[10px] text-muted-foreground/40 mt-1 uppercase tracking-wider font-bold">
                                {r.groupTitle}
                              </p>
                            </div>
                            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-foreground transition-colors shrink-0 mt-1" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-5 h-10 border-t border-border/40 bg-secondary/40 text-[10px] text-muted-foreground/50">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 rounded border border-border/60 bg-background font-bold">↵</kbd>
                      open
                    </span>
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 rounded border border-border/60 bg-background font-bold">esc</kbd>
                      close
                    </span>
                  </div>
                  <span>Powered by CAMBRA Intelligence</span>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Highlight({ text, term }) {
  if (!term.trim()) return text;
  const re = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
  const parts = String(text).split(re);
  return parts.map((p, i) =>
    re.test(p) ? (
      <mark key={i} className="bg-cambra-mint/20 text-foreground rounded px-0.5 font-semibold">
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}