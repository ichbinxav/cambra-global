import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, Activity } from "lucide-react";

/**
 * HeroSystemic — Continuous infrastructure intelligence for modern commerce.
 * Premium, systemic, operational. Mirrors a live intelligence terminal.
 */

const SIGNALS = [
  { t: "PSP effective rate", delta: "+0.6%", state: "drift", value: "2.0%", peer: "1.4%" },
  { t: "Shipping cost / order", delta: "+€0.80", state: "drift", value: "€6.20", peer: "€5.40" },
  { t: "SaaS overlap", delta: "2 tools", state: "alert", value: "Klaviyo · Sendinblue", peer: "1 ESP" },
  { t: "FX exposure", delta: "Unbenchmarked", state: "neutral", value: "—", peer: "—" },
  { t: "TPE all-in", delta: "+0.4%", state: "drift", value: "1.8%", peer: "1.4%" },
];

const TICKER = [
  "Currently benchmarking payments…",
  "2 redundant SaaS tools detected.",
  "Stripe fees above peer median.",
  "FX exposure unbenchmarked.",
  "Infrastructure drift increasing.",
  "Shipping cost per order +14% vs peer.",
];

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
    <section ref={ref} className="relative min-h-[92vh] flex items-center overflow-hidden pt-14 bg-background">
      {/* Background — restrained */}
      <motion.div className="absolute inset-0 pointer-events-none" style={{ y: bgY }}>
        <div className="absolute inset-0 dot-grid opacity-60" />
        <div className="absolute -top-32 -left-32 w-[40rem] h-[40rem] rounded-full blur-3xl bg-ambient-lilac opacity-[0.25]" />
        <div className="absolute -bottom-32 -right-32 w-[34rem] h-[34rem] rounded-full blur-3xl bg-ambient-mint opacity-[0.22]" />
      </motion.div>

      <div className="relative z-10 w-full max-w-6xl mx-auto px-5 py-16 md:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-16 items-center">

          {/* LEFT — positioning */}
          <div className="text-left">
            {/* Live system badge */}
            <div className="inline-flex items-center gap-2 mb-7 px-2.5 py-1.5 rounded-full border border-border/60 bg-background/80 backdrop-blur-sm">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cambra-mint opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-mint" />
              </span>
              <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-muted-foreground">
                Engine · Live
              </span>
            </div>

            {/* Editorial headline */}
            <h1 className="font-display text-[clamp(2.4rem,6.4vw,5.6rem)] font-black tracking-[-0.05em] leading-[0.88] mb-6">
              You optimize growth.{" "}
              <span className="text-saas-gradient">Margin optimizes itself here.</span>
            </h1>

            <p className="text-[clamp(0.95rem,1.6vw,1.15rem)] text-foreground/60 mb-8 max-w-[560px] leading-[1.55]">
              Eight cost layers. Eight separate benchmarks. Eight separate savings opportunities. CAMBRA finds them all.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <a
                href="/Analyzer"
                className="h-12 rounded-full px-7 text-sm font-bold bg-foreground text-background ring-1 ring-foreground/10 hover:bg-foreground/90 transition inline-flex items-center justify-center gap-2"
              >
                Run audit
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
              <a
                href="#heatmap"
                className="h-12 rounded-full px-6 text-sm font-semibold border border-border/60 bg-background/60 backdrop-blur-sm text-foreground/85 hover:border-foreground/40 hover:text-foreground transition inline-flex items-center justify-center gap-2"
              >
                See live engine
              </a>
            </div>

            {/* Mini operating-system ticker */}
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

          {/* RIGHT — live intelligence terminal */}
          <div className="hidden lg:block">
            <div className="rounded-2xl border border-border/60 bg-card/95 backdrop-blur-md overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.08)]">
              {/* Terminal header */}
              <div className="px-4 py-2.5 border-b border-border/50 flex items-center justify-between bg-secondary/40">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-foreground/15" />
                    <span className="h-2 w-2 rounded-full bg-foreground/15" />
                    <span className="h-2 w-2 rounded-full bg-foreground/15" />
                  </div>
                  <span className="ml-2 text-[10px] font-mono tracking-wider text-muted-foreground/70">
                    cambra · live_engine
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-cambra-mint animate-pulse" />
                  <span className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground/60">scanning</span>
                </div>
              </div>

              {/* Signals */}
              <div className="divide-y divide-border/40">
                <div className="px-4 py-2 grid grid-cols-[1fr_auto_auto] gap-3 text-[9px] uppercase tracking-[0.18em] text-muted-foreground/50 font-mono">
                  <span>Signal</span>
                  <span>You</span>
                  <span>Peer</span>
                </div>

                {SIGNALS.map((s, i) => (
                  <motion.div
                    key={s.t}
                    animate={{
                      backgroundColor: activeRow === i ? "rgba(31, 78, 216, 0.04)" : "rgba(0,0,0,0)",
                    }}
                    transition={{ duration: 0.4 }}
                    className="px-4 py-3 grid grid-cols-[1fr_auto_auto] gap-3 items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                            s.state === "alert" ? "bg-destructive" :
                            s.state === "drift" ? "bg-cambra-plum" :
                            "bg-muted-foreground/40"
                          }`}
                        />
                        <span className="text-xs font-semibold truncate">{s.t}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground/60 font-mono mt-0.5 ml-3.5 truncate">
                        Δ {s.delta}
                      </div>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-foreground">{s.value}</span>
                    <span className="text-xs font-mono tabular-nums text-muted-foreground/70">{s.peer}</span>
                  </motion.div>
                ))}
              </div>

              {/* Footer */}
              <div className="px-4 py-3 border-t border-border/50 bg-secondary/30 flex items-center justify-between">
                <div className="text-[10px] text-muted-foreground/60 font-mono">
                  5 signals · 1 alert · 3 drifts
                </div>
                <a
                  href="/Analyzer"
                  className="text-[10px] font-bold tracking-[0.15em] uppercase text-foreground hover:opacity-70 transition inline-flex items-center gap-1"
                >
                  Inspect <ArrowRight className="h-3 w-3" />
                </a>
              </div>
            </div>

            <p className="mt-3 text-center text-[10px] text-muted-foreground/40 font-mono">
              Live engine · Sample brand · Continuous monitoring
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}