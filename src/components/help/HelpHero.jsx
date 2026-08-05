import { motion } from "framer-motion";
import { Search, Command } from "lucide-react";
import SectionLabel from "@/components/shared/SectionLabel";
import { getHeroPlaceholders, getHeroTrending, helpUi } from "@/lib/helpCenterData";
import { useTranslation } from "@/lib/i18n.jsx";

export default function HelpHero({ onSearchOpen }) {
  const { lang } = useTranslation();
  const placeholders = getHeroPlaceholders(lang);
  const trending = getHeroTrending(lang);

  return (
    <section className="relative pt-28 pb-16 px-5 overflow-hidden">
      {/* soft voltio wash */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 800, height: 480, left: "50%", top: 0, transform: "translateX(-50%)",
          background: "radial-gradient(circle, rgba(91,76,245,0.07) 0%, transparent 70%)",
          filter: "blur(90px)",
        }}
      />

      <div className="relative max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex mb-7"
        >
          <SectionLabel>{helpUi(lang, "heroBadge")}</SectionLabel>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="text-[clamp(2.5rem,6.5vw,5.5rem)] font-black tracking-[-0.045em] leading-[0.9] mb-5"
          style={{ color: "var(--ink)" }}
        >
          {helpUi(lang, "heroTitleA")}{" "}
          <span className="kw">{helpUi(lang, "heroTitleB")}</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-[clamp(1rem,1.6vw,1.2rem)] max-w-2xl mx-auto leading-relaxed mb-10"
          style={{ color: "var(--gris-1)" }}
        >
          {helpUi(lang, "heroSubtitle")}
        </motion.p>

        {/* Search bar — paper card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="group relative w-full max-w-2xl mx-auto"
        >
          <motion.button
            type="button"
            onClick={onSearchOpen}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.995 }}
            className="relative w-full flex items-center gap-4 h-16 px-6 rounded-2xl text-left transition-colors"
            style={{
              border: "1px solid var(--linea)",
              background: "#fff",
              boxShadow: "0 12px 40px -18px rgba(12,12,22,0.15)",
            }}
            aria-label={helpUi(lang, "openSearch")}
          >
            <Search className="w-5 h-5 shrink-0" style={{ color: "var(--gris-2)" }} />
            <RotatingPlaceholder placeholders={placeholders} />
            <span
              className="ml-auto hidden sm:inline-flex items-center gap-1 h-7 px-2 rounded-md text-[10px] font-bold shrink-0"
              style={{ border: "1px solid var(--linea)", background: "rgba(12,12,22,0.04)", color: "var(--gris-1)" }}
            >
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
          <span className="font-medium" style={{ color: "var(--gris-2)" }}>{helpUi(lang, "trendingLabelHero")}</span>
          {trending.map((t) => (
            <button
              key={t}
              onClick={onSearchOpen}
              className="px-3 py-1 rounded-full transition-colors"
              style={{ border: "1px solid var(--linea)", background: "#fff", color: "var(--gris-1)" }}
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
          className="absolute inset-0 text-sm truncate"
          style={{ color: "var(--gris-2)" }}
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