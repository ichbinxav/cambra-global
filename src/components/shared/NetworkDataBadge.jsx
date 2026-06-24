import { motion } from "framer-motion";
import { Database } from "lucide-react";

/**
 * NetworkDataBadge — Credibility signal showing data freshness.
 * Used in Hero terminal & Results header to transform "estimated" → "validated".
 */
export default function NetworkDataBadge({ tone = "dark", className = "" }) {
  const isDark = tone === "dark";

  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  const year = now.getFullYear();
  const stamp = `Q${quarter} ${year}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.6 }}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border ${
        isDark
          ? "border-white/12 bg-white/[0.04] text-white/65"
          : "border-border/60 bg-background/70 text-muted-foreground"
      } ${className}`}
    >
      <Database className="h-2.5 w-2.5 text-cambra-cyan" strokeWidth={2.2} />
      <span className="text-[9px] font-mono tracking-[0.15em] uppercase">
        Network benchmark · {stamp}
      </span>
      <span className="relative flex h-1 w-1 ml-0.5">
        <span
          className="absolute inline-flex h-full w-full rounded-full bg-cambra-mint opacity-75"
          style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }}
        />
        <span className="relative inline-flex h-1 w-1 rounded-full bg-cambra-mint" />
      </span>
    </motion.div>
  );
}