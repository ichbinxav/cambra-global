import { useRef } from "react";
import { motion, useInView } from "framer-motion";

export default function RevealOnScroll({ children, delay = 0, direction = "up", className = "", once = true }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once, margin: "-60px" });

  const variants = {
    hidden: {
      opacity: 0,
      y: direction === "up" ? 32 : direction === "down" ? -32 : 0,
      x: direction === "left" ? 32 : direction === "right" ? -32 : 0,
    },
    visible: {
      opacity: 1, y: 0, x: 0,
      transition: { duration: 0.75, delay, ease: [0.22, 1, 0.36, 1] },
    },
  };

  return (
    <motion.div
      ref={ref}
      className={className}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
      variants={variants}
    >
      {children}
    </motion.div>
  );
}