import { motion } from "framer-motion";

export default function NodeSymbol({ size = 24, className = "", animate = false, glow = false }) {
  const Component = animate ? motion.span : "span";
  const props = animate ? {
    animate: { rotate: [0, 90, 180, 270, 360] },
    transition: { duration: 12, repeat: Infinity, ease: "linear" }
  } : {};

  return (
    <Component
      className={`inline-flex items-center justify-center select-none ${className}`}
      style={{ fontSize: size, lineHeight: 1 }}
      {...props}
    >
      <span className={`${glow ? "drop-shadow-[0_0_8px_rgba(30,41,59,0.3)]" : ""}`}>
        ✱
      </span>
    </Component>
  );
}