import { useEffect, useState, useRef } from "react";
import { motion, useInView } from "framer-motion";

export default function AnimatedCounter({ value, prefix = "", suffix = "", duration = 2, decimals = 0 }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView || !value) return;
    let start = 0;
    const end = Number(value) || 0;
    if (end === 0) return;
    const totalFrames = duration * 60;
    let frame = 0;
    const timer = setInterval(() => {
      frame++;
      // Ease out cubic
      const progress = 1 - Math.pow(1 - frame / totalFrames, 3);
      start = end * progress;
      if (frame >= totalFrames) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(start);
      }
    }, 1000 / 60);
    return () => clearInterval(timer);
  }, [value, duration, inView]);

  const formatted = count.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return (
    <motion.span
      ref={ref}
      initial={{ opacity: 0 }}
      animate={inView ? { opacity: 1 } : {}}
      transition={{ duration: 0.3 }}
    >
      {prefix}{formatted}{suffix}
    </motion.span>
  );
}