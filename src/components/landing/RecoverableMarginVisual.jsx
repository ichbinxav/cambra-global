import { motion, useInView } from "framer-motion";
import { useRef, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CreditCard, Truck, Layers, Sparkles, TrendingUp, Warehouse, Globe, Smartphone } from "lucide-react";

const ITEMS = [
  {
    id: "payments",
    label: "Payments",
    value: 11400,
    Icon: CreditCard,
    detail: "Two distinct leak points inside this pillar:",
    subLeaks: [
      { Icon: Globe,      label: "Online PSP inefficiencies",     delta: "+0.3pp / txn",  note: "Stripe/PayPal gateway fees & intl. card markups" },
      { Icon: Smartphone, label: "Physical TPV/Dataphone anomalies", delta: "+€0.18 / txn", note: "POS terminal fees above interchange caps" },
    ],
  },
  {
    id: "logistics",
    label: "Logistics",
    value: 6900,
    Icon: Truck,
    detail: "Two distinct leak points inside this pillar:",
    subLeaks: [
      { Icon: Truck,     label: "Carrier overcharges",        delta: "+€0.40 / parcel", note: "DHL/FedEx/UPS rates above peer median" },
      { Icon: Warehouse, label: "3PL storage inefficiencies", delta: "+12% / pallet·mo", note: "Pick·pack & storage fees vs 3PL benchmark" },
    ],
  },
  {
    id: "saas",
    label: "Commerce SaaS",
    value: 8200,
    Icon: Layers,
    detail: "Shopify apps & Klaviyo duplicates detected",
  },
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

/* Fast-counting total with subtle scramble effect early on */
function RollingCounter({ to, duration = 2200, start = false }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!start) {
      setV(0);
      return;
    }
    let raf, t0;
    const step = (t) => {
      if (!t0) t0 = t;
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Math.round(to * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, duration, start]);
  return <>{v.toLocaleString("en-US")}</>;
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
      className="relative py-12 md:py-16 px-5 border-t border-border/40 bg-background overflow-hidden"
    >
      <div className="absolute inset-0 dot-grid opacity-20 pointer-events-none" />
      <div className="pointer-events-none absolute -top-32 left-1/3 w-[34rem] h-[34rem] rounded-full blur-3xl bg-ambient-lilac opacity-[0.14]" />

      <div className="relative max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12 md:mb-16">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full border border-border/60 bg-background/70 backdrop-blur-sm"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cambra-cyan opacity-75" style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-cyan" />
            </span>
            <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground">
              Recoverable margin · live estimate
            </span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="font-display text-[clamp(2.2rem,5.5vw,3.8rem)] font-black tracking-[-0.045em] leading-[0.95] mb-5"
          >
            Where your margin <span className="text-saas-gradient">leaks.</span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.12 }}
            className="text-base md:text-lg text-foreground/65 max-w-lg mx-auto leading-[1.55]"
          >
            A typical operator your size carries recoverable margin hidden across three pillars: Payments (online + TPV), Logistics (carriers + 3PL) & Commerce SaaS.
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

          <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-8 md:mb-10 z-10">
            {ITEMS.map((it, i) => {
              const isPulsing = pulseIdx === i;
              return (
                <motion.div
                  key={it.id}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
                  transition={{ duration: 0.6, delay: 0.25 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                  className="relative rounded-2xl bg-card/[0.03] backdrop-blur-sm p-5 sm:p-6 flex flex-col"
                  style={{
                    border: "1px solid",
                    borderColor: isPulsing ? "rgba(44,167,193,0.7)" : "rgba(255,255,255,0.1)",
                    boxShadow: isPulsing
                      ? "0 0 0 1px rgba(44,167,193,0.35), 0 0 28px -2px rgba(44,167,193,0.5)"
                      : "0 0 0 0 rgba(44,167,193,0)",
                    transition: "border-color 600ms ease, box-shadow 600ms ease",
                  }}
                >
                  <div className="relative flex items-center gap-2.5 mb-4">
                    <motion.div
                      className="h-8 w-8 rounded-lg flex items-center justify-center bg-white/[0.05] border border-white/10"
                      animate={isPulsing ? { scale: [1, 1.12, 1] } : {}}
                      transition={{ duration: 0.6 }}
                    >
                      <it.Icon className="h-4 w-4 text-cambra-cyan" strokeWidth={2} />
                    </motion.div>
                    <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-white/60">
                      {it.label}
                    </span>
                    {it.subLeaks && (
                      <span className="ml-auto text-[8px] font-mono tracking-[0.18em] uppercase text-cambra-cyan/80 border border-cambra-cyan/30 bg-cambra-cyan/[0.08] px-1.5 py-0.5 rounded-full">
                        2 sub-leaks
                      </span>
                    )}
                  </div>
                  <div className="relative flex items-baseline gap-1.5 mb-2.5">
                    <span className="text-[28px] sm:text-[32px] font-black tabular-nums text-white tracking-[-0.02em] leading-none">
                      €<Counter to={it.value} duration={1300 + i * 200} start={inView} />
                    </span>
                    <span className="text-[11px] font-mono text-white/40">/yr</span>
                  </div>
                  <p className="relative text-[12px] text-white/60 leading-[1.5]">{it.detail}</p>

                  {it.subLeaks && (
                    <div className="relative mt-3 pt-3 border-t border-white/8 space-y-2">
                      {it.subLeaks.map((sub) => (
                        <div key={sub.label} className="flex items-start gap-2">
                          <div className="h-5 w-5 rounded-md flex items-center justify-center bg-white/[0.04] border border-white/10 shrink-0 mt-0.5">
                            <sub.Icon className="h-2.5 w-2.5 text-cambra-cyan" strokeWidth={2} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-1.5">
                              <span className="text-[11px] font-bold text-white/85 truncate">{sub.label}</span>
                              <span className="text-[9px] font-mono tabular-nums text-cambra-cyan/90 shrink-0">{sub.delta}</span>
                            </div>
                            <p className="text-[10px] text-white/45 leading-snug">{sub.note}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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
                className="relative h-11 px-5 rounded-full bg-card text-[#06080F] text-sm font-bold inline-flex items-center justify-center gap-2 hover:bg-white/95 transition overflow-hidden"
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