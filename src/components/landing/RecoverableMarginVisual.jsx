import { motion, useInView } from "framer-motion";
import { useRef, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CreditCard, Truck, Layers } from "lucide-react";

const ITEMS = [
  { id: "payments", label: "Payments", value: 11400, Icon: CreditCard, detail: "PSP fees +0.3pp above peer median" },
  { id: "shipping", label: "Shipping", value: 6900,  Icon: Truck,      detail: "+€0.40 / parcel vs peer" },
  { id: "saas",     label: "SaaS",     value: 8200,  Icon: Layers,     detail: "Duplicate subscriptions detected" },
];
const TOTAL = ITEMS.reduce((s, i) => s + i.value, 0);

function Counter({ to, duration = 1200 }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf, start;
    const step = (t) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / duration);
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return <>{v.toLocaleString("en-US")}</>;
}

export default function RecoverableMarginVisual() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

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
            <span className="h-1.5 w-1.5 rounded-full bg-cambra-cyan" />
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

          <div className="relative grid md:grid-cols-3 gap-3 sm:gap-4 mb-6 md:mb-8">
            {ITEMS.map((it, i) => (
              <motion.div
                key={it.id}
                initial={{ opacity: 0, y: 16 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.25 + i * 0.08 }}
                className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-4 sm:p-5"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-7 w-7 rounded-lg flex items-center justify-center bg-white/[0.05] border border-white/10">
                    <it.Icon className="h-3.5 w-3.5 text-cambra-cyan" strokeWidth={2} />
                  </div>
                  <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/55">
                    {it.label}
                  </span>
                </div>
                <div className="flex items-baseline gap-1 mb-1.5">
                  <span className="text-2xl sm:text-3xl font-black tabular-nums text-white tracking-tight">
                    €<Counter to={it.value} />
                  </span>
                  <span className="text-[10px] font-mono text-white/40">/yr</span>
                </div>
                <p className="text-[11px] text-white/55 leading-snug">{it.detail}</p>
              </motion.div>
            ))}
          </div>

          {/* Total */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.55 }}
            className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pt-6 border-t border-white/10"
          >
            <div>
              <div className="text-[10px] font-bold tracking-[0.22em] uppercase text-white/45 mb-2">
                Total annual savings
              </div>
              <div className="flex items-baseline gap-2">
                <span
                  className="font-display text-[clamp(2.6rem,6vw,4rem)] font-black tracking-[-0.04em] leading-none tabular-nums"
                  style={{
                    background: "linear-gradient(135deg, #ffffff 0%, #B8D8E0 55%, #2CA7C1 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  €<Counter to={TOTAL} duration={1600} />
                </span>
                <span className="text-xs font-mono text-white/40">/ year · estimate</span>
              </div>
            </div>

            <Link to="/Analyzer" className="shrink-0">
              <button className="h-11 px-5 rounded-full bg-white text-[#06080F] text-sm font-bold inline-flex items-center justify-center gap-2 hover:bg-white/90 transition">
                See your number <ArrowRight className="h-4 w-4" />
              </button>
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}