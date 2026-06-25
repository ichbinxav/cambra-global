import { useEffect, useState, useRef } from "react";

/**
 * AnimatedCounter — counts from 0 to `value` once it enters the viewport.
 * No framer-motion dependency: uses IntersectionObserver + requestAnimationFrame.
 *
 * Props:
 *   - value (number)              the target number
 *   - prefix (string)             e.g. "€"
 *   - suffix (string)             e.g. "/yr"
 *   - duration (seconds)          animation length (default 2)
 *   - decimals (int)              decimal places (default 0)
 *   - locale (string)             Intl locale for number formatting (default "en-IE")
 *   - format (fn)                 optional custom formatter (number) => string,
 *                                 overrides prefix/suffix/decimals/locale
 */
export default function AnimatedCounter({
  value,
  prefix = "",
  suffix = "",
  duration = 2,
  decimals = 0,
  locale = "en-IE",
  format = null,
}) {
  const [count, setCount] = useState(0);
  const [inView, setInView] = useState(false);
  const ref = useRef(null);

  // Visibility detection — with Safari/iOS fallback timer so we never stay invisible.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { setInView(true); io.disconnect(); }
      }),
      { threshold: 0.25 }
    );
    io.observe(el);
    // Safari/iOS fallback: force visible after 300ms if observer never fires.
    const fallback = setTimeout(() => setInView(true), 250);
    return () => { io.disconnect(); clearTimeout(fallback); };
  }, []);

  // Count up
  useEffect(() => {
    if (!inView) return;
    const end = Number(value) || 0;
    if (end === 0) { setCount(0); return; }
    const start = performance.now();
    const ms = Math.max(0.1, duration) * 1000;
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setCount(end * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setCount(end);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, inView]);

  const formatted = format
    ? format(count)
    : (() => {
        try {
          return new Intl.NumberFormat(locale, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          }).format(count);
        } catch {
          return count.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        }
      })();

  // Always render visible — the count-up animates the NUMBER itself,
  // not the span's opacity. This prevents Safari/iOS from leaving the
  // counter invisible if the IntersectionObserver never fires.
  return (
    <span ref={ref} className="inline-block">
      {prefix}{formatted}{suffix}
    </span>
  );
}