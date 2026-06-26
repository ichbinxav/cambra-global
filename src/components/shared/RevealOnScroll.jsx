import { useEffect, useRef, useState } from "react";

/* IntersectionObserver-based reveal — no framer-motion.
   Keeps the same API: { children, delay, direction, className, once }. */
export default function RevealOnScroll({
  children,
  delay = 0,
  direction = "up",
  className = "",
  once = true,
}) {
  const ref = useRef(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    if (typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          if (once) obs.disconnect();
        } else if (!once) {
          setRevealed(false);
        }
      },
      { rootMargin: "-60px" }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [once]);

  const offset = 24;
  const translate = revealed
    ? "translate3d(0,0,0)"
    : direction === "up"
    ? `translate3d(0,${offset}px,0)`
    : direction === "down"
    ? `translate3d(0,-${offset}px,0)`
    : direction === "left"
    ? `translate3d(${offset}px,0,0)`
    : direction === "right"
    ? `translate3d(-${offset}px,0,0)`
    : "translate3d(0,0,0)";

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: revealed ? 1 : 0,
        transform: translate,
        transition: `opacity 0.6s ease ${delay}s, transform 0.6s ease ${delay}s`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}