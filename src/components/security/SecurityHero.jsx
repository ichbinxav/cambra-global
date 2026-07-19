import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Lock, Terminal } from "lucide-react";

/**
 * SecurityHero — cybersecurity-flavored hero for /Security.
 * Dark "ink" surface with an animated scanline, a live grid, a terminal-style
 * status line that types itself out, and a shielded headline. DA tokens only
 * (+ the same glass rgba surfaces used across the system).
 */
const TERMINAL_LINES = [
  "$ cambra --scope payments --mode read-only",
  "  ✓ oauth grant     : read:transactions",
  "  ✗ write access    : denied by provider",
  "  ✓ card data       : never leaves your PSP",
  "  ✓ isolation       : per-tenant, db-enforced",
  "  → status          : you are in control",
];

function TerminalWindow() {
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    if (visibleLines >= TERMINAL_LINES.length) return;
    const t = setTimeout(() => setVisibleLines((n) => n + 1), 420);
    return () => clearTimeout(t);
  }, [visibleLines]);

  return (
    <div
      className="rounded-2xl overflow-hidden mx-auto max-w-lg text-left"
      style={{
        background: "rgba(6,6,14,0.72)",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 24px 60px -30px rgba(0,0,0,0.8), 0 0 0 1px rgba(47,224,168,0.06)",
        backdropFilter: "blur(8px)",
      }}
    >
      {/* Title bar */}
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#F45B69" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#FF8A6B" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#2FE0A8" }} />
        <span className="ml-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.4)" }}>
          <Terminal size={11} /> access-audit
        </span>
      </div>
      {/* Body */}
      <div className="px-4 py-4 font-mono text-[12px] sm:text-[13px] leading-[1.9]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        {TERMINAL_LINES.slice(0, visibleLines).map((line, i) => {
          const ok = line.includes("✓") || line.includes("→");
          const no = line.includes("✗");
          const cmd = line.startsWith("$");
          const color = cmd
            ? "#7DE3FF"
            : no
            ? "#FF8A6B"
            : ok
            ? "#2FE0A8"
            : "rgba(255,255,255,0.7)";
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              style={{ color }}
              className="whitespace-pre"
            >
              {line}
            </motion.div>
          );
        })}
        {visibleLines >= TERMINAL_LINES.length && (
          <span
            className="inline-block w-2 h-4 align-middle animate-pulse"
            style={{ background: "#2FE0A8" }}
          />
        )}
      </div>
    </div>
  );
}

export default function SecurityHero() {
  return (
    <div className="px-5 pt-28 sm:pt-32">
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="section-ink relative px-6 sm:px-12 py-16 sm:py-24 text-center overflow-hidden"
      >
        {/* Animated horizontal scanline */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 h-24 z-0"
          style={{
            background:
              "linear-gradient(180deg, transparent, rgba(47,224,168,0.12), transparent)",
          }}
          initial={{ top: "-10%" }}
          animate={{ top: ["-10%", "110%"] }}
          transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
        />

        {/* Shield eyebrow */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="relative z-10 inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-6"
          style={{
            background: "rgba(47,224,168,0.08)",
            border: "1px solid rgba(47,224,168,0.28)",
          }}
        >
          <ShieldCheck size={13} style={{ color: "#2FE0A8" }} />
          <span className="text-[11px] font-bold tracking-[0.24em] uppercase" style={{ color: "#7DE3FF" }}>
            Security
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 text-white"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(2.6rem, 6.5vw, 5.2rem)",
            fontWeight: 900,
            letterSpacing: "-0.05em",
            lineHeight: 0.94,
          }}
        >
          Built so we{" "}
          <span
            style={{
              background: "linear-gradient(120deg,#2FE0A8 0%,#7DE3FF 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            can't
          </span>{" "}
          hurt you.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.28 }}
          className="relative z-10 mt-6 text-[15px] sm:text-[17px] leading-relaxed text-white/60 max-w-2xl mx-auto"
        >
          The honest answer to the question every founder should ask before connecting anything:
          "what exactly can CAMBRA see, and what can it do?"
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4 }}
          className="relative z-10 mt-10"
        >
          <TerminalWindow />
        </motion.div>

        {/* Trust chips */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.7 }}
          className="relative z-10 mt-10 flex flex-wrap items-center justify-center gap-2.5"
        >
          {[
            { icon: Lock, label: "Read-only OAuth" },
            { icon: ShieldCheck, label: "Encrypted end-to-end" },
            { icon: Terminal, label: "GDPR · France" },
          ].map(({ icon: Icon, label }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-semibold"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.10)",
                color: "rgba(255,255,255,0.75)",
              }}
            >
              <Icon size={12} style={{ color: "#2FE0A8" }} />
              {label}
            </span>
          ))}
        </motion.div>
      </motion.section>
    </div>
  );
}