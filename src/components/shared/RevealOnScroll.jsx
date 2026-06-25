import { useRef, useState, useEffect } from "react";
import { motion, useInView } from "framer-motion";

export default function RevealOnScroll({
  children,
  delay = 0,
  direction = "up",
  className = "",
  once = true,
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once, margin: "-60px" });
  const [forceVisible, setForceVisible] = useState(false);

  // Safari/iOS fallback: if IntersectionObserver never fires for an element
  // that mounts already inside the viewport (common on authenticated routes),
  // force visibility after a short delay so content can never get stuck at opacity:0.
  useEffect(() => {
    const timer = setTimeout(() => setForceVisible(true), 200);
    return () => clearTimeout(timer);
  }, []);

  const show = inView || forceVisible;

  const variants = {
    hidden: {
      opacity: 0,
      y: direction === "up" ? 32 : direction === "down" ? -32 : 0,
      x: direction === "left" ? 32 : direction === "right" ? -32 : 0,
    },
    visible: {
      opacity: 1,
      y: 0,
      x: 0,
      transition: { duration: 0.75, delay, ease: [0.22, 1, 0.36, 1] },
    },
  };

  return (
    <motion.div
      ref={ref}
      className={className}
      initial="hidden"
      animate={show ? "visible" : "hidden"}
      variants={variants}
    >
      {children}
    </motion.div>
  );
}