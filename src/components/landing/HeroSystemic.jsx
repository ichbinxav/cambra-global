import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, Activity, CreditCard, Package, LayoutGrid, ArrowLeftRight, Store } from "lucide-react";

/**
 * HeroSystemic — Plain-English hero.
 * Clear promise on the left + live "what we found" terminal on the right.
 */

const SIGNALS = [
  { id: "psp",  Icon: CreditCard,     t: "Payment fees",      delta: "+0.3pp",    state: "drift", value: "1.7%",  peer: "1.4%" },
  { id: "ship", Icon: Package,        t: "Shipping / order",  delta: "+€0.40",    state: "drift", value: "€5.80", peer: "€5.40" },
  { id: "saas", Icon: LayoutGrid,     t: "SaaS overlap",      delta: "2 duplicates", state: "alert", value: "Klaviyo · Sendinblue", peer: "1 ESP" },
  { id: "fx",   Icon: ArrowLeftRight, t: "FX spread",         delta: "+0.4pp",    state: "drift", value: "1.3%",  peer: "0.9%" },
  { id: "tpe",  Icon: Store,          t: "In-store fees",     delta: "+0.2pp",    state: "drift", value: "1.6%",  peer: "1.4%" },
];

const TICKER = [
  "Found €11,400 / yr on Stripe fees",
  "Found 2 duplicate SaaS tools",
  "Found €6,900 / yr on shipping",
  "Found €4,100 / yr on FX spread",
  "Found €2,200 / yr on TPE fees",
];

const LAYER_CHIPS = ["Payments", "Shipping", "SaaS", "Banking", "FX", "In-store", "Insurance", "Telecom"];

export default function HeroSystemic() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const bgY = useTransform(scrollYProgress, [0, 1], ["0%", "10%"]);
  const [tickerIdx, setTickerIdx] = useState(0);
  const [activeRow, setActiveRow] = useState(0);

  useEffect(() => {
    const a = setInterval(() => setTickerIdx((i) => (i + 1) % TICKER.length), 2400);
    const b = setInterval(() => setActiveRow((i) => (i + 1) % SIGNALS.length), 1800);
    return () => { clearInterval(a); clearInterval(b); };
  }, []);

  return (
    <section ref={ref} className="relative min-h-[92vh] flex items-center overflow-hidden pt-6 bg-background">
      <motion.div className="absolute inset-0 pointer-events-none" style={{ y: bgY }}>
        <div className="absolute inset-0 dot-grid opacity-60" />
        <div className="absolute -top-32 -left-32 w-[40rem] h-[40rem] rounded-full blur-3xl bg-ambient-lilac opacity-[0.25]" />
        <div className="absolute -bottom-32 -right-32 w-[34rem] h-[34rem] rounded-full blur-3xl bg-ambient-mint opacity-[0.22]" />
      </motion.div>

      <div className="relative z-10 w-full max-w-6xl mx-auto px-5 py-8 md:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-16 items-center">

          {/* LEFT — clear promise */}
          <div className="text-left">
            <div className="inline-flex items-center gap-2 mb-7 px-2.5 py-1.5 rounded-full border border-border/60 bg-background/80 backdrop-blur-sm">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cambra-mint opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-mint" />
              </span>
              <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-muted-foreground">
                Live · 8 cost layers
              </span>
            </div>

            <h1 className="font-display text-[clamp(2.2rem,5.8vw,5rem)] font-black tracking-[-0.05em] leading-[0.9] mb-5">
              We find the money <span className="text-saas-gradient">your stack is hiding.</span>
            </h1>

            <p className="text-[clamp(0.95rem,1.6vw,1.15rem)] text-foreground/65 mb-7 max-w-[540px] leading-[1.55]">
              CAMBRA audits every hidden cost in your business — payments, shipping, SaaS, banking and more — and shows you what you're overpaying vs. peers your size.
            </p>

            {/* Layer chips — what we watch */}
            <div className="flex flex-wrap gap-1.5 mb-8 max-w-[540px]">
              {LAYER_CHIPS.map((chip) => (
                <span
                  key={chip}
                  className="px-2.5 py-1 text-[11px] font-medium rounded-full border border-border/50 bg-card/60 backdrop-blur-sm text-foreground/70"
                >
                  {chip}
                </span>
              ))}
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <a
                href="/Analyzer"
                className="h-12 rounded-full px-7 text-sm font-bold bg-foreground text-background ring-1 ring-foreground/10 hover:bg-foreground/90 transition inline-flex items-center justify-center gap-2"
              >
                Start free audit
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
              <a
                href="#how"
                className="h-12 rounded-full px-6 text-sm font-semibold border border-border/60 bg-background/60 backdrop-blur-sm text-foreground hover:border-foreground/40 hover:text-foreground transition inline-flex items-center justify-center gap-2"
              >
                How it works
              </a>
            </div>

            {/* Ticker — what we found for other brands */}
            <div className="h-6 flex items-center gap-2 text-[11px] text-muted-foreground/70 font-mono">
              <Activity className="h-3 w-3 text-cambra-mint" />
              <motion.span
                key={tickerIdx}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                {TICKER[tickerIdx]}
              </motion.span>
            </div>
          </div>

          {/* RIGHT — live findings terminal */}
          <div className="hidden lg:block">
            <div className="rounded-2xl border border-border/60 bg-card/95 backdrop-blur-md overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.08)]">
              <div className="px-4 py-2.5 border-b border-border/50 flex items-center justify-between bg-secondary/40">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-foreground/15" />
                    <span className="h-2 w-2 rounded-full bg-foreground/15" />
                    <span className="h-2 w-2 rounded-full bg-foreground/15" />
                  </div>
                  <span className="ml-2 text-[10px] font-mono tracking-wider text-muted-foreground/70">
                    sample brand · €2M revenue
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-cambra-mint animate-pulse" />
                  <span className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground/60">scanning</span>
                </div>
              </div>

              <div className="divide-y divide-border/40">
                <div className="px-4 py-2 grid grid-cols-[1fr_auto_auto] gap-3 text-[9px] uppercase tracking-[0.18em] text-muted-foreground/50 font-mono">
                  <span>Cost</span>
                  <span>You</span>
                  <span>Peer</span>
                </div>

                {SIGNALS.map((s, i) => (
                  <motion.div
                    key={s.id}
                    animate={{
                      backgroundColor: activeRow === i ? "rgba(31, 78, 216, 0.04)" : "rgba(0,0,0,0)",
                    }}
                    transition={{ duration: 0.4 }}
                    className="px-4 py-3 grid grid-cols-[1fr_auto_auto] gap-3 items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <s.Icon className="h-3.5 w-3.5 text-foreground/70 shrink-0" strokeWidth={1.8} />
                        <span className="text-xs font-semibold truncate">{s.t}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground/60 font-mono mt-0.5 ml-5 truncate">
                        Δ {s.delta}
                      </div>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-foreground">{s.value}</span>
                    <span className="text-xs font-mono tabular-nums text-muted-foreground/70">{s.peer}</span>
                  </motion.div>
                ))}
              </div>

              <div className="px-4 py-3 border-t border-border/50 bg-secondary/30 flex items-center justify-between">
                <div className="text-[10px] text-muted-foreground/60 font-mono">
                  Total found: <span className="font-bold text-foreground">€24,600 / yr</span>
                </div>
                <a
                  href="/Analyzer"
                  className="text-[10px] font-bold tracking-[0.15em] uppercase text-foreground hover:opacity-70 transition inline-flex items-center gap-1"
                >
                  See yours <ArrowRight className="h-3 w-3" />
                </a>
              </div>
            </div>

            <p className="mt-3 text-center text-[10px] text-muted-foreground/40 font-mono">
              Sample · Your results will be tailored to your brand
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}