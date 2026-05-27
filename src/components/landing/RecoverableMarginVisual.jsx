import { motion, useInView, AnimatePresence } from "framer-motion";
import { useRef, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CreditCard, Truck, Layers, Sparkles, TrendingUp } from "lucide-react";

const ITEMS = [
  { id: "payments", label: "Payments", value: 11400, Icon: CreditCard, detail: "PSP fees +0.3pp above peer median" },
  { id: "shipping", label: "Shipping", value: 6900,  Icon: Truck,      detail: "+€0.40 / parcel vs peer" },
  { id: "saas",     label: "SaaS",     value: 8200,  Icon: Layers,     detail: "Duplicate subscriptions detected" },
];
const TOTAL = ITEMS.reduce((s, i) => s + i.value, 0);

/* Smooth animated counter with easing */
function Counter({ to, duration = 1400, start = false }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!start) return;
    let raf, t0;
    const step = (t) => {
      if (!t0) t0 = t;
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 4); // ease-out quartic
      setV(Math.round(to * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, duration, start]);
  return <>{v.toLocaleString("en-US")}</>;
}

/* Slot-machine style rolling digit counter for total */
function RollingCounter({ to, duration = 2400, start = false }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!start) return;
    let raf, t0;
    const step = (t) => {
      if (!t0) t0 = t;
      const p = Math.min(1, (t - t0) / duration);
      // Smooth elastic-style ease
      const eased = p < 0.5
        ? 4 * p * p * p
        : 1 - Math.pow(-2 * p + 2, 3) / 2;
      setV(Math.round(to * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, duration, start]);

  const str = v.toLocaleString("en-US");
  return (
    <span className="inline-flex">
      {str.split("").map((ch, i) => (
        <span key={`${i}-${ch}`} className="relative inline-block" style={{ minWidth: ch === "," ? "0.3em" : "0.6em" }}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={ch + i}
              initial={{ y: "60%", opacity: 0, filter: "blur(4px)" }}
              animate={{ y: "0%", opacity: 1, filter: "blur(0px)" }}
              exit={{ y: "-60%", opacity: 0, filter: "blur(4px)" }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="inline-block"
            >
              {ch}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}

export default function RecoverableMarginVisual() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [pulseIdx, setPulseIdx] = useState(-1);
  const [totalStarted, setTotalStarted] = useState(false);

  // Sequential pulse highlight on items
  useEffect(() => {
    if (!inView) return;
    let idx = 0;
    const interval = setInterval(() => {
      setPulseIdx(idx % ITEMS.length);
      idx++;
    }, 900);
    // Start total counter after items have rolled
    const totalTimer = setTimeout(() => setTotalStarted(true), 800);
    return () => {
      clearInterval(interval);
      clearTimeout(totalTimer);
    };
  }, [inView]);

  return (
    <section
      ref={ref}
      className="relative py-16 md:py-24 px-5 border-t border-border/40 bg-background overflow-hidden"
    >
      <div className="absolute inset-0 dot-grid opacity-20 pointer-events-none" />
      <div className="pointer-events-none absolute -top-32 left-1/3 w-[34rem] h-[34rem] rounded-full blur-3xl bg-ambient-lilac opacity-[0.14]" />

      <div className="relative max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10 md:mb-14">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 mb-5"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cambra-cyan opacity-75" style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-cyan" />
            </span>
            <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground">
              Potential recoverable margin
            </span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="font-display text-[clamp(2rem,5vw,3.4rem)] font-black tracking-[-0.04em] leading-[1]"
          >
            Where your margin <span className="text-saas-gradient">leaks.</span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.12 }}
            className="mt-4 text-sm md:text-base text-foreground/65 max-w-md mx-auto leading-relaxed"
          >
            A typical operator your size carries this much recoverable margin — hidden across three layers.
          </motion.p>
        </div>

        {/* Money visual */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="relative rounded-3xl overflow-hidden border border-white/10 p-5 sm:p-8 md:p-10"
          style={{
            background:
              "radial-gradient(120% 80% at 0% 0%, rgba(31,78,216,0.22) 0%, transparent 55%), radial-gradient(100% 100% at 100% 100%, rgba(44,167,193,0.18) 0%, transparent 60%), linear-gradient(180deg, hsl(222 60% 7%) 0%, hsl(222 65% 4%) 100%)",
            boxShadow:
              "0 1px 0 hsl(0 0% 100% / 0.06) inset, 0 30px 80px -28px rgba(0,0,0,0.7)",
          }}
        >
          {/* Animated grid */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.5]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
              maskImage: "radial-gradient(ellipse 90% 90% at 50% 0%, #000 30%, transparent 75%)",
              WebkitMaskImage: "radial-gradient(ellipse 90% 90% at 50% 0%, #000 30%, transparent 75%)",
            }}
          />

          {/* Floating ambient glows */}
          <motion.div
            className="pointer-events-none absolute -top-32 -right-24 w-96 h-96 rounded-full blur-[100px]"
            style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.40), transparent)" }}
            animate={{ opacity: [0.4, 0.7, 0.4], scale: [1, 1.15, 1] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="pointer-events-none absolute -bottom-32 -left-24 w-80 h-80 rounded-full blur-[100px]"
            style={{ background: "radial-gradient(closest-side, rgba(31,78,216,0.40), transparent)" }}
            animate={{ opacity: [0.3, 0.6, 0.3], scale: [1.1, 1, 1.1] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          />

          {/* Scan line */}
          <motion.div
            className="pointer-events-none absolute left-0 right-0 h-px z-[1]"
            style={{ background: "linear-gradient(90deg, transparent, rgba(44,167,193,0.5), transparent)" }}
            animate={{ y: ["-5%", "105%"] }}
            transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
          />

          <div className="relative grid md:grid-cols-3 gap-3 sm:gap-4 mb-6 md:mb-8 z-10">
            {ITEMS.map((it, i) => {
              const isPulsing = pulseIdx === i;
              return (
                <motion.div
                  key={it.id}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
                  transition={{ duration: 0.6, delay: 0.25 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                  className="relative rounded-2xl border bg-white/[0.03] backdrop-blur-sm p-4 sm:p-5 overflow-hidden"
                  style={{
                    borderColor: isPulsing ? "rgba(44,167,193,0.45)" : "rgba(255,255,255,0.1)",
                    transition: "border-color 600ms ease",
                  }}
                >
                  {/* Pulse halo */}
                  <AnimatePresence>
                    {isPulsing && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.1 }}
                        transition={{ duration: 0.5 }}
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          background: "radial-gradient(closest-side at 80% 20%, rgba(44,167,193,0.18), transparent 70%)",
                        }}
                      />
                    )}
                  </AnimatePresence>

                  <div className="relative flex items-center gap-2 mb-3">
                    <motion.div
                      className="h-7 w-7 rounded-lg flex items-center justify-center bg-white/[0.05] border border-white/10"
                      animate={isPulsing ? { scale: [1, 1.12, 1] } : {}}
                      transition={{ duration: 0.6 }}
                    >
                      <it.Icon className="h-3.5 w-3.5 text-cambra-cyan" strokeWidth={2} />
                    </motion.div>
                    <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/55">
                      {it.label}
                    </span>
                  </div>
                  <div className="relative flex items-baseline gap-1 mb-1.5">
                    <span className="text-2xl sm:text-3xl font-black tabular-nums text-white tracking-tight">
                      €<Counter to={it.value} duration={1300 + i * 200} start={inView} />
                    </span>
                    <span className="text-[10px] font-mono text-white/40">/yr</span>
                  </div>
                  <p className="relative text-[11px] text-white/55 leading-snug">{it.detail}</p>
                </motion.div>
              );
            })}
          </div>

          {/* Total */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.7 }}
            className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pt-6 border-t border-white/10 z-10"
          >
            {/* Subtle pulse glow behind total number */}
            <motion.div
              className="pointer-events-none absolute -left-6 -bottom-4 w-72 h-32 rounded-full blur-3xl"
              style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.4), transparent)" }}
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />

            <div className="relative">
              <div className="flex items-center gap-1.5 mb-2">
                <TrendingUp className="h-3 w-3 text-cambra-cyan" strokeWidth={2.5} />
                <div className="text-[10px] font-bold tracking-[0.22em] uppercase text-white/55">
                  Total annual savings
                </div>
              </div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span
                  className="font-display text-[clamp(2.8rem,7vw,4.4rem)] font-black tracking-[-0.045em] leading-none tabular-nums relative"
                  style={{
                    background: "linear-gradient(135deg, #ffffff 0%, #B8D8E0 55%, #2CA7C1 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                    filter: "drop-shadow(0 0 24px rgba(44,167,193,0.35))",
                  }}
                >
                  €<RollingCounter to={TOTAL} duration={2400} start={totalStarted} />
                </span>
                <span className="text-xs font-mono text-white/40">/ year · estimate</span>
              </div>
            </div>

            <Link to="/Analyzer" className="shrink-0 relative">
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                className="relative h-11 px-5 rounded-full bg-white text-[#06080F] text-sm font-bold inline-flex items-center justify-center gap-2 hover:bg-white/95 transition overflow-hidden"
              >
                {/* Shimmer sweep */}
                <motion.span
                  aria-hidden
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: "linear-gradient(110deg, transparent 35%, rgba(44,167,193,0.35) 50%, transparent 65%)" }}
                  animate={{ x: ["-100%", "100%"] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.2 }}
                />
                <Sparkles className="relative h-3.5 w-3.5" />
                <span className="relative">See your number</span>
                <ArrowRight className="relative h-4 w-4" />
              </motion.button>
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}