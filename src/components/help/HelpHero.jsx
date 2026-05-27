import { motion } from "framer-motion";
import { Search, Command } from "lucide-react";

const PLACEHOLDERS = [
  "How does CAMBRA estimate savings?",
  "What is the Infrastructure Score?",
  "Can I upload invoices?",
  "How accurate are benchmark estimates?",
  "Do I need to switch providers?",
  "How does CAMBRA make money?",
];

export default function HelpHero({ onSearchOpen }) {
  return (
    <section className="relative pt-28 pb-16 px-5 overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 dot-grid opacity-50" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full blur-[120px] opacity-30 bg-ambient-lilac" />
        <div className="absolute top-20 right-[10%] w-[400px] h-[400px] rounded-full blur-[100px] opacity-20 bg-ambient-mint" />
      </div>

      <div className="relative max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 mb-7 px-3 py-1.5 rounded-full border border-border/50 bg-background/80 backdrop-blur-sm"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-cambra-mint animate-pulse" />
          <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground/70">
            Help Center · Infrastructure Intelligence
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="text-[clamp(2.5rem,6.5vw,5.5rem)] font-black tracking-[-0.045em] leading-[0.9] mb-5"
        >
          Questions, answers,{" "}
          <span className="text-saas-gradient inline-block">and operating insights.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-[clamp(1rem,1.6vw,1.2rem)] text-muted-foreground/70 max-w-2xl mx-auto leading-relaxed mb-10"
        >
          CAMBRA helps modern commerce brands analyze infrastructure costs, identify
          inefficiencies, benchmark performance, and unlock optimization opportunities
          across their operational stack.
        </motion.p>

        {/* Premium search bar */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="relative w-full max-w-2xl mx-auto"
        >
          <span aria-hidden className="absolute -inset-px rounded-2xl bg-saas-gradient opacity-20 group-hover:opacity-40 blur-md transition-opacity pointer-events-none" />
          <motion.button
            type="button"
            onClick={onSearchOpen}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.995 }}
            className="group relative w-full flex items-center gap-4 h-16 px-6 rounded-2xl border border-border/60 bg-card/95 backdrop-blur-xl shadow-xl text-left"
            aria-label="Open search"
          >
            <Search className="w-5 h-5 text-muted-foreground/50 shrink-0" />
            <RotatingPlaceholder placeholders={PLACEHOLDERS} />
            <span className="ml-auto hidden sm:inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border/60 bg-secondary/60 text-[10px] font-bold text-muted-foreground/70 shrink-0">
              <Command className="w-3 h-3" /> K
            </span>
          </motion.button>
        </motion.div>

        {/* Trending searches */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs"
        >
          <span className="text-muted-foreground/40 font-medium">Trending:</span>
          {["Infrastructure Score", "Stripe", "Benchmarks", "GDPR", "Success fee"].map((t) => (
            <button
              key={t}
              onClick={onSearchOpen}
              className="px-3 py-1 rounded-full border border-border/40 bg-background/60 text-muted-foreground/70 hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              {t}
            </button>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function RotatingPlaceholder({ placeholders }) {
  return (
    <div className="flex-1 min-w-0 overflow-hidden relative h-6">
      {placeholders.map((p, i) => (
        <motion.span
          key={i}
          className="absolute inset-0 text-sm text-muted-foreground/50 truncate"
          initial={{ y: 28, opacity: 0 }}
          animate={{
            y: [28, 0, 0, -28],
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: placeholders.length * 2.5,
            times: [0, 0.05, 0.18, 0.22],
            delay: i * 2.5,
            repeat: Infinity,
            repeatDelay: 0,
            ease: "easeInOut",
          }}
        >
          {p}
        </motion.span>
      ))}
    </div>
  );
}