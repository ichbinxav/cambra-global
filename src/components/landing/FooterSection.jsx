import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, TrendingUp, Activity } from "lucide-react";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import BrandLogoWordmark from "@/components/shared/BrandLogoWordmark";
import { useRef, useEffect, useState } from "react";

const LIVE_TICKER = [
  { brand: "Studio Mara", amount: "€42,800", label: "PSP renegotiation" },
  { brand: "Noma Brand", amount: "€11,400", label: "SaaS dedup" },
  { brand: "Lumen Co", amount: "€67,200", label: "Shipping rates" },
  { brand: "Atelier Vrai", amount: "€28,900", label: "FX spread" },
  { brand: "Maison Or", amount: "€19,500", label: "Banking fees" },
];

const MARQUEE_TEXT = "€10K · €25K · €50K · €100K · MARGIN RECOVERED · ";

export default function FooterSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const parallaxY = useTransform(scrollYProgress, [0, 1], ["0%", "-20%"]);
  const glowOpacity = useTransform(scrollYProgress, [0, 0.5, 1], [0.15, 0.35, 0.15]);

  const [tickerIdx, setTickerIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTickerIdx((i) => (i + 1) % LIVE_TICKER.length), 2200);
    return () => clearInterval(t);
  }, []);

  const current = LIVE_TICKER[tickerIdx];

  return (
    <>
      {/* Final CTA — IMPACT */}
      <section
        ref={ref}
        className="relative overflow-hidden bg-foreground text-background"
        style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        {/* Animated grid backdrop */}
        <motion.div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--background)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--background)) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
            y: parallaxY,
          }}
        />

        {/* Massive marquee text — background layer */}
        <motion.div
          className="absolute inset-0 flex items-center pointer-events-none overflow-hidden"
          aria-hidden
        >
          <motion.div
            className="whitespace-nowrap font-black tracking-[-0.04em] text-background/[0.04]"
            style={{ fontSize: "clamp(8rem, 22vw, 22rem)", lineHeight: 1 }}
            animate={{ x: ["0%", "-50%"] }}
            transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
          >
            {MARQUEE_TEXT.repeat(8)}
          </motion.div>
        </motion.div>

        {/* Ambient pulsing glows */}
        <motion.div
          className="absolute top-[10%] left-[15%] w-[500px] h-[500px] rounded-full blur-[120px] pointer-events-none"
          style={{
            background: "radial-gradient(closest-side, #1F4ED8, transparent)",
            opacity: glowOpacity,
          }}
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-[10%] right-[10%] w-[420px] h-[420px] rounded-full blur-[110px] pointer-events-none"
          style={{
            background: "radial-gradient(closest-side, #2CA7C1, transparent)",
            opacity: glowOpacity,
          }}
          animate={{ scale: [1.1, 1, 1.1] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Scan line */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            className="absolute left-0 right-0 h-px"
            style={{ background: "linear-gradient(90deg, transparent, rgba(44,167,193,0.5), transparent)" }}
            animate={{ y: ["-10%", "110%"] }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          />
        </div>

        {/* CONTENT */}
        <div className="relative z-10 max-w-4xl mx-auto px-5 py-24 text-center w-full">
          {/* Live ticker pill */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2.5 mb-10 px-3.5 py-2 rounded-full border border-background/15 bg-background/[0.04] backdrop-blur-md"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cambra-mint opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cambra-mint" />
            </span>
            <span className="text-[10px] font-mono tracking-[0.22em] uppercase text-background/60">
              Live recovery feed
            </span>
            <span className="h-3 w-px bg-background/15" />
            <motion.div
              key={current.brand}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-2"
            >
              <span className="text-[11px] font-bold text-background tabular-nums">{current.amount}</span>
              <span className="text-[10px] font-mono text-background/45">· {current.label}</span>
            </motion.div>
          </motion.div>

          {/* Massive headline with shimmer */}
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 1, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="font-display font-black tracking-[-0.05em] leading-[0.85] mb-6"
            style={{ fontSize: "clamp(2.8rem, 8.5vw, 7.5rem)" }}
          >
            <span className="block">Stop leaving</span>
            <span className="block relative">
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage: "linear-gradient(110deg, #FFFFFF 0%, #1F4ED8 30%, #2CA7C1 50%, #FFFFFF 70%, #FFFFFF 100%)",
                  backgroundSize: "200% 100%",
                  WebkitBackgroundClip: "text",
                  animation: "shimmer-bg 6s linear infinite",
                }}
              >
                margin on the table.
              </span>
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="text-base md:text-xl text-background/55 mb-12 max-w-xl mx-auto leading-[1.55] font-light"
          >
            <span className="text-background/85 font-medium">€10K–€100K</span> annual recovery.
            Verified. Immediate. Aligned incentives.
          </motion.p>

          {/* CTA cluster */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.6 }}
            className="flex flex-col sm:flex-row gap-3 justify-center items-center mb-8"
          >
            <Link to="/Analyzer" className="w-full sm:w-auto group">
              <motion.div
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="relative w-full sm:w-auto"
              >
                {/* Glow ring */}
                <div
                  className="absolute -inset-1 rounded-full opacity-60 blur-md group-hover:opacity-90 transition-opacity"
                  style={{ background: "linear-gradient(110deg, #1F4ED8, #2CA7C1)" }}
                />
                <div className="relative h-14 sm:h-16 px-8 sm:px-12 rounded-full bg-background text-foreground font-bold text-base sm:text-lg inline-flex items-center justify-center gap-3 w-full sm:w-auto overflow-hidden">
                  {/* Shimmer sweep */}
                  <motion.div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: "linear-gradient(110deg, transparent 35%, rgba(31,78,216,0.15) 50%, transparent 65%)",
                    }}
                    animate={{ x: ["-100%", "100%"] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", repeatDelay: 1 }}
                  />
                  <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-saas-gradient relative z-10" />
                  <span className="relative z-10">Run audit</span>
                  <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 relative z-10 group-hover:translate-x-1 transition-transform" />
                </div>
              </motion.div>
            </Link>

            <Link to="/Analyzer?preview=1" className="w-full sm:w-auto">
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <div className="h-14 sm:h-16 px-8 sm:px-10 rounded-full border border-background/25 bg-background/[0.04] backdrop-blur-md text-background font-bold text-base sm:text-lg inline-flex items-center justify-center gap-2 hover:bg-background/[0.1] hover:border-background/40 transition-all w-full sm:w-auto">
                  <Activity className="h-4 w-4 text-cambra-mint" />
                  See live engine
                </div>
              </motion.div>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.5, delay: 0.9 }}
            className="flex items-center justify-center gap-3 text-[11px] font-mono tracking-[0.15em] uppercase text-background/30"
          >
            <span>3 minutes</span>
            <span className="h-1 w-1 rounded-full bg-background/20" />
            <span>No credit card</span>
            <span className="h-1 w-1 rounded-full bg-background/20" />
            <span>Free audit</span>
          </motion.div>

          {/* Recovery stats strip */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 1 }}
            className="mt-16 pt-10 border-t border-background/10 grid grid-cols-3 gap-4 max-w-2xl mx-auto"
          >
            {[
              { v: "€24.6K", l: "Median yearly recovery" },
              { v: "8", l: "Cost layers benchmarked" },
              { v: "0%", l: "Upfront fee" },
            ].map((stat, i) => (
              <motion.div
                key={stat.l}
                initial={{ opacity: 0, y: 10 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 1.1 + i * 0.1 }}
                className="text-center"
              >
                <div className="text-2xl md:text-3xl font-black tracking-[-0.03em] text-background tabular-nums">
                  {stat.v}
                </div>
                <div className="text-[9px] md:text-[10px] font-mono tracking-[0.18em] uppercase text-background/35 mt-1">
                  {stat.l}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>

        <style>{`
          @keyframes shimmer-bg {
            0% { background-position: 200% 50%; }
            100% { background-position: -200% 50%; }
          }
        `}</style>
      </section>

      {/* Footer strip */}
      <footer className="py-10 px-5 border-t border-border/40 bg-background">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-5">
            <BrandLogoWordmark className="h-4" />
            <span className="text-xs text-muted-foreground/35 font-mono">The operating system for margin</span>
          </div>
          <div className="flex items-center gap-5 text-xs text-muted-foreground/40">
            <span>© {new Date().getFullYear()} CAMBRA</span>
            <Link to="/Privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link to="/Terms" className="hover:text-foreground transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </>
  );
}