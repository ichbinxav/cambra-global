// EuroCountUp — Report v2, Pieza B.
//
// Counts a euro figure up 0 → value on mount (the hero is above the fold, so
// no scroll trigger — animate immediately). Respects prefers-reduced-motion.
// Pure presentation: the value comes from engine_result; this only animates it.

import { useEffect, useRef, useState } from "react";

export default function EuroCountUp({ value, duration = 1600, className = "", style = {} }) {
  const [n, setN] = useState(0);
  const rafRef = useRef(null);
  const target = Number(value);

  useEffect(() => {
    if (!isFinite(target)) return;
    const reduce = typeof window !== "undefined" &&
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setN(target); return; }
    const startTs = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - startTs) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(target * eased);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  const formatted = isFinite(target)
    ? "€" + Math.round(n).toLocaleString("en-US")
    : "—";

  return <span className={className} style={style}>{formatted}</span>;
}