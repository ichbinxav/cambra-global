import { motion } from "framer-motion";

/**
 * Cinematic ambient background used across the public landing.
 * Decorative only. pointer-events-none. Sits below all content.
 */
export default function AuroraBackground({ intensity = 1 }) {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
      <motion.div
        className="absolute -inset-[20%]"
        style={{
          background:
            "conic-gradient(from 120deg at 50% 50%, rgba(59,130,246,0.18), rgba(44,167,193,0.12), rgba(99,91,255,0.10), rgba(59,130,246,0.18))",
          filter: "blur(80px)",
          opacity: 0.55 * intensity,
        }}
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 80, ease: "linear", repeat: Infinity }}
      />

      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage:
            "radial-gradient(ellipse 100% 80% at 50% 30%, #000 30%, transparent 85%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 100% 80% at 50% 30%, #000 30%, transparent 85%)",
        }}
      />

      <motion.div
        className="absolute -top-40 -left-40 rounded-full"
        style={{
          width: 520,
          height: 520,
          background:
            "radial-gradient(circle, rgba(59,130,246,0.35) 0%, transparent 65%)",
          filter: "blur(40px)",
        }}
        animate={{ scale: [1, 1.12, 1], opacity: [0.55, 0.85, 0.55] }}
        transition={{ duration: 9, ease: "easeInOut", repeat: Infinity }}
      />

      <motion.div
        className="absolute -bottom-40 -right-40 rounded-full"
        style={{
          width: 560,
          height: 560,
          background:
            "radial-gradient(circle, rgba(44,167,193,0.32) 0%, transparent 65%)",
          filter: "blur(40px)",
        }}
        animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 11, ease: "easeInOut", repeat: Infinity, delay: 2 }}
      />

      <motion.div
        className="absolute top-0 bottom-0 w-px"
        style={{
          background:
            "linear-gradient(180deg, transparent, rgba(96,165,250,0.45), transparent)",
          boxShadow: "0 0 24px rgba(96,165,250,0.45)",
        }}
        initial={{ left: "0%" }}
        animate={{ left: ["0%", "100%"] }}
        transition={{ duration: 14, ease: "linear", repeat: Infinity }}
      />

      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.8) 1px, transparent 1px)",
          backgroundSize: "3px 3px",
        }}
      />
    </div>
  );
}