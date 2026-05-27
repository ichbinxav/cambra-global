import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { ArrowRight, Activity, CreditCard, Package, LayoutGrid, ArrowLeftRight, Store, Sparkles, TrendingUp } from "lucide-react";

/**
 * HeroSystemic — Cinematic hero.
 * Big claim + animated counter + live "what we found" terminal with sequential reveals.
 */

const SIGNALS = [
  { id: "psp",  Icon: CreditCard,     t: "Payment fees",      delta: "+0.3pp",       state: "drift", value: "1.7%",  peer: "1.4%",  saving: 4200 },
  { id: "ship", Icon: Package,        t: "Shipping / order",  delta: "+€0.40",       state: "drift", value: "€5.80", peer: "€5.40", saving: 6800 },
  { id: "saas", Icon: LayoutGrid,     t: "SaaS overlap",      delta: "2 duplicates", state: "alert", value: "Dup.",  peer: "1 ESP", saving: 7200 },
  { id: "fx",   Icon: ArrowLeftRight, t: "FX spread",         delta: "+0.4pp",       state: "drift", value: "1.3%",  peer: "0.9%",  saving: 3400 },
  { id: "tpe",  Icon: Store,          t: "In-store fees",     delta: "+0.2pp",       state: "drift", value: "1.6%",  peer: "1.4%",  saving: 3000 },
];

const LAYER_CHIPS = ["Payments", "Shipping", "SaaS", "Banking", "FX", "In-store", "Insurance", "Telecom"];

// Animated counter
function Counter({ to, duration = 2 }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / (duration * 1000), 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.floor(to * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return <>{val.toLocaleString()}</>;
}

export default function HeroSystemic() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const bgY = useTransform(scrollYProgress, [0, 1], ["0%", "15%"]);

  const [revealedRows, setRevealedRows] = useState(0);
  const [pulseIdx, setPulseIdx] = useState(0);

  // Sequential row reveal
  useEffect(() => {
    if (revealedRows < SIGNALS.length) {
      const t = setTimeout(() => setRevealedRows((r) => r + 1), 350);
      return () => clearTimeout(t);
    }
  }, [revealedRows]);

  // Active pulse row
  useEffect(() => {
    if (revealedRows < SIGNALS.length) return;
    const i = setInterval(() => setPulseIdx((p) => (p + 1) % SIGNALS.length), 1600);
    return () => clearInterval(i);
  }, [revealedRows]);

  return (
    <section ref={ref} className="relative min-h-[100vh] flex items-center overflow-hidden pt-8 bg-background">
      {/* Animated backdrop */}
      <motion.div className="absolute inset-0 pointer-events-none" style={{ y: bgY }}>
        <div className="absolute inset-0 dot-grid opacity-60" />

        {/* Pulsing ambient glows */}
        <motion.div
          className="absolute -top-32 -left-32 w-[44rem] h-[44rem] rounded-full blur-[120px]"
          style={{ background: "radial-gradient(closest-side, rgba(31,78,216,0.45), transparent)" }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.85, 0.6] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-32 -right-32 w-[38rem] h-[38rem] rounded-full blur-[120px]"
          style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.5), transparent)" }}
          animate={{ scale: [1.1, 1, 1.1], opacity: [0.5, 0.85, 0.5] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Scan line */}
        <motion.div
          className="absolute left-0 right-0 h-px pointer-events-none"
          style={{ background: "linear-gradient(90deg, transparent, rgba(44,167,193,0.4), transparent)" }}
          animate={{ y: ["-10%", "110vh"] }}
          transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
        />
      </motion.div>

      {/* Bottom fade to white — smooth blend with next section */}
      <div
        className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none z-[5]"
        style={{ background: "linear-gradient(to bottom, transparent 0%, hsl(var(--background)) 85%)" }}
      />

      <div className="relative z-10 w-full max-w-6xl mx-auto px-5 py-10 md:py-14">
        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-10 lg:gap-14 items-center">

          {/* LEFT — cinematic claim */}
          <div className="text-left">
            {/* Eyebrow */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="flex items-center gap-2 mb-7 w-fit px-3 py-1.5 rounded-full border border-border/60 bg-background/70 backdrop-blur-sm"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-cambra-mint opacity-75" style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-mint" />
              </span>
              <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground">Infrastructure for independent commerce</span>
            </motion.div>

            {/* Headline — staggered words */}
            <h1 className="font-display text-[clamp(2.4rem,6.2vw,5.4rem)] font-black tracking-[-0.05em] leading-[0.88] mb-5">
              {["We find the money", ""].map((line, li) => (
                <motion.span
                  key={li}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.15 + li * 0.1, ease: [0.22, 1, 0.36, 1] }}
                  className="block"
                >
                  {line}
                </motion.span>
              ))}
              <motion.span
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="block relative"
              >
                <span
                  className="bg-clip-text text-transparent"
                  style={{
                    backgroundImage: "linear-gradient(180deg, rgba(31,78,216,0.45) 0%, rgba(44,167,193,0.45) 45%, rgba(44,167,193,0.15) 100%)",
                    backgroundSize: "200% 100%",
                    WebkitBackgroundClip: "text",
                  }}
                >
                  your stack is hiding.
                </span>
              </motion.span>
            </h1>

            {/* Sub */}
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.55 }}
              className="text-[clamp(0.95rem,1.55vw,1.15rem)] text-foreground/80 mb-6 max-w-[540px] leading-[1.55]"
            >
              CAMBRA audits every hidden cost in your business — payments, shipping, SaaS, banking and more — and shows you what you're overpaying vs. peers your size.
            </motion.p>

            {/* Layer chips — staggered */}
            <div className="flex flex-wrap gap-1.5 mb-7 max-w-[540px]">
              {LAYER_CHIPS.map((chip, i) => (
                <motion.span
                  key={chip}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.35, delay: 0.7 + i * 0.04 }}
                  className="px-2.5 py-1 text-[11px] font-medium rounded-full border border-border/50 bg-card/60 backdrop-blur-sm text-foreground/70"
                >
                  {chip}
                </motion.span>
              ))}
            </div>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 1.05 }}
              className="flex flex-col sm:flex-row gap-3 mb-5"
            >
              <motion.a
                href="/Analyzer"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="relative h-12 rounded-full px-7 text-sm font-bold text-white inline-flex items-center justify-center gap-2 overflow-hidden group"
                style={{ background: "linear-gradient(135deg, hsl(var(--cambra-navy)) 0%, hsl(var(--cambra-blue)) 100%)" }}
              >
                {/* Shimmer sweep */}
                <motion.span
                  aria-hidden
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: "linear-gradient(110deg, transparent 35%, rgba(44,167,193,0.35) 50%, transparent 65%)" }}
                  animate={{ x: ["-100%", "100%"] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.2 }}
                />
                {/* Glow */}
                <span
                  aria-hidden
                  className="absolute -inset-1 rounded-full opacity-50 blur-md group-hover:opacity-80 transition-opacity"
                  style={{ background: "linear-gradient(110deg, #1F4ED8, #2CA7C1)" }}
                />
                <Sparkles className="relative h-3.5 w-3.5" />
                <span className="relative">Run free audit</span>
                <ArrowRight className="relative h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
              </motion.a>
              <motion.a
                href="/auth/start"
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="h-12 rounded-full px-6 text-sm font-semibold border border-border/60 bg-background/60 backdrop-blur-sm text-foreground hover:border-foreground/40 transition inline-flex items-center justify-center gap-2"
              >
                Sign in
                <ArrowRight className="h-3.5 w-3.5" />
              </motion.a>
            </motion.div>

            {/* Status row */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 1.3 }}
              className="flex items-center gap-3 text-[10px] text-foreground/70 font-mono"
            >
              <Activity className="h-3 w-3 text-cambra-mint" />
              <span>3 min setup</span>
              <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
              <span>No card</span>
              <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
              <span>Read-only</span>
            </motion.div>
          </div>

          {/* RIGHT — cinematic live terminal */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.9, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="hidden lg:block"
          >
            {/* Terminal frame */}
            <div className="relative rounded-2xl border border-border/60 bg-card/95 backdrop-blur-md overflow-hidden shadow-[0_24px_80px_-20px_rgba(31,78,216,0.25)]">
              {/* Glow halo */}
              <motion.div
                className="absolute -inset-px rounded-2xl pointer-events-none"
                style={{ background: "linear-gradient(135deg, rgba(31,78,216,0.35), transparent 60%, rgba(44,167,193,0.35))" }}
                animate={{ opacity: [0.4, 0.7, 0.4] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              />
              <div className="relative rounded-2xl bg-card overflow-hidden">
                {/* Header bar */}
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
                    <motion.span
                      className="h-1.5 w-1.5 rounded-full bg-cambra-mint"
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                    <span className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground/60">
                      {revealedRows < SIGNALS.length ? "scanning" : "complete"}
                    </span>
                  </div>
                </div>

                {/* Table */}
                <div className="divide-y divide-border/40 relative">
                  <div className="px-4 py-2 grid grid-cols-[1fr_auto_auto] gap-3 text-[9px] uppercase tracking-[0.18em] text-muted-foreground/50 font-mono">
                    <span>Cost</span>
                    <span>You</span>
                    <span>Peer</span>
                  </div>

                  {SIGNALS.map((s, i) => (
                    <AnimatePresence key={s.id}>
                      {i < revealedRows && (
                        <motion.div
                          initial={{ opacity: 0, x: -20, height: 0 }}
                          animate={{
                            opacity: 1,
                            x: 0,
                            height: "auto",
                            backgroundColor: pulseIdx === i && revealedRows === SIGNALS.length ? "rgba(31, 78, 216, 0.06)" : "rgba(0,0,0,0)",
                          }}
                          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                          className="px-4 py-3 grid grid-cols-[1fr_auto_auto] gap-3 items-center overflow-hidden"
                        >
                          <div className="min-w-0 flex items-center gap-2">
                            <s.Icon className="h-3.5 w-3.5 text-foreground/70 shrink-0" strokeWidth={1.8} />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold truncate">{s.t}</div>
                              <div className="text-[10px] text-muted-foreground/60 font-mono mt-0.5 truncate">
                                Δ {s.delta}
                              </div>
                            </div>
                          </div>
                          <span className="text-xs font-mono tabular-nums text-foreground">{s.value}</span>
                          <span className="text-xs font-mono tabular-nums text-muted-foreground/70">{s.peer}</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  ))}
                </div>

                {/* Total — animated counter */}
                <div className="px-4 py-3.5 border-t border-border/50 bg-gradient-to-r from-secondary/40 via-secondary/30 to-secondary/40 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-3.5 w-3.5 text-cambra-mint" />
                    <div>
                      <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground/60">
                        Total found / year
                      </div>
                      <div className="text-lg font-black tracking-tight tabular-nums text-foreground">
                        €<Counter to={24600} duration={2.4} />
                      </div>
                    </div>
                  </div>
                  <a
                    href="/Analyzer"
                    className="text-[10px] font-bold tracking-[0.15em] uppercase text-foreground hover:opacity-70 transition inline-flex items-center gap-1 border border-border/60 px-3 py-1.5 rounded-full bg-background/70"
                  >
                    See yours <ArrowRight className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>

            <p className="mt-3 text-center text-[10px] text-muted-foreground/40 font-mono">
              Sample · Your results will be tailored to your brand
            </p>
          </motion.div>
        </div>
      </div>

      <style>{`
        @keyframes shimmer-bg {
          0% { background-position: 200% 50%; }
          100% { background-position: -200% 50%; }
        }
      `}</style>
    </section>
  );
}