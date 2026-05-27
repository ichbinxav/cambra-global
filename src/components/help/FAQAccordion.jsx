import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, ThumbsUp, ThumbsDown } from "lucide-react";

export default function FAQAccordion({ items, defaultOpenIndex = -1, categorySlug = "" }) {
  const [openIdx, setOpenIdx] = useState(defaultOpenIndex);

  // Auto-open FAQ matching URL hash (deep-link from search)
  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash?.slice(1) : "";
    if (!hash || !categorySlug) return;
    const match = hash.match(new RegExp(`^${categorySlug}-(\\d+)$`));
    if (match) {
      const idx = parseInt(match[1], 10);
      if (idx >= 0 && idx < items.length) setOpenIdx(idx);
    }
  }, [categorySlug, items.length]);

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const id = `${categorySlug}-${i}`;
        const open = openIdx === i;
        return (
          <motion.div
            key={i}
            id={id}
            layout
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className={`rounded-xl border transition-colors ${open ? "border-foreground/30 bg-card" : "border-border/40 bg-card/60 hover:border-foreground/15"}`}
          >
            <button
              onClick={() => setOpenIdx(open ? -1 : i)}
              className="w-full flex items-center justify-between gap-4 p-5 text-left"
            >
              <span className="text-[15px] font-bold tracking-tight pr-4">
                {item.q}
              </span>
              <motion.div
                animate={{ rotate: open ? 45 : 0 }}
                transition={{ duration: 0.2 }}
                className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${open ? "bg-foreground text-background" : "bg-secondary text-muted-foreground/60"}`}
              >
                <Plus className="w-3.5 h-3.5" />
              </motion.div>
            </button>

            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="px-5 pb-5">
                    <div className="pl-0 pr-8">
                      <p className="text-sm text-muted-foreground leading-[1.7]">
                        {item.a}
                      </p>
                      <div className="mt-5 flex items-center justify-between pt-4 border-t border-border/40">
                        <p className="text-[11px] text-muted-foreground/50">
                          Was this helpful?
                        </p>
                        <div className="flex items-center gap-1.5">
                          <FeedbackButton icon={ThumbsUp} label="Yes" />
                          <FeedbackButton icon={ThumbsDown} label="No" />
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}

function FeedbackButton({ icon: Icon, label }) {
  const [clicked, setClicked] = useState(false);
  return (
    <button
      onClick={() => setClicked(true)}
      className={`flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11px] font-semibold transition-colors ${clicked ? "border-foreground bg-foreground text-background" : "border-border/50 text-muted-foreground hover:border-foreground/30 hover:text-foreground"}`}
    >
      <Icon className="w-3 h-3" />
      {clicked ? "Thanks" : label}
    </button>
  );
}