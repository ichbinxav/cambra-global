import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, Activity, FileSearch, Gauge, Zap, CheckCircle2 } from "lucide-react";

const FEATURES = [
  { Icon: FileSearch, label: "Auto-detects inefficiencies", detail: "Across payments, shipping, SaaS, FX, banking & more" },
  { Icon: Gauge,      label: "Real peer benchmarks",       detail: "Compared to operators of similar GMV & category" },
  { Icon: Zap,        label: "Live in 3 minutes",          detail: "Connect tools or upload statements — read-only" },
];

const SAMPLE_OUTPUT = [
  { label: "Infrastructure Score", value: "62", trend: "/100", color: "score-medium" },
  { label: "Recoverable margin", value: "€24.6K", trend: "/yr", color: "cambra-cyan" },
  { label: "Drift signals", value: "5", trend: "layers", color: "score-medium" },
];

export default function AnalyzerProductSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section
      ref={ref}
      className="relative py-12 md:py-16 px-5 border-t border-border/40 bg-background overflow-hidden"
    >
      {/* Ambient backdrop */}
      <div className="absolute inset-0 dot-grid opacity-20 pointer-events-none" />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 right-1/4 w-[36rem] h-[36rem] rounded-full blur-3xl bg-ambient-mint opacity-[0.18]" />
        <div className="absolute -bottom-32 left-1/4 w-[32rem] h-[32rem] rounded-full blur-3xl bg-ambient-lilac opacity-[0.14]" />
      </div>

      <div className="relative max-w-6xl mx-auto">
        {/* Eyebrow */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-center gap-2 mb-6 w-fit mx-auto px-3 py-1.5 rounded-full border border-border/60 bg-background/70 backdrop-blur-sm"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-cambra-cyan opacity-75" style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-cyan" />
          </span>
          <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground">
            The Analyzer · Our flagship
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="text-center font-display text-[clamp(2.2rem,5.5vw,3.8rem)] font-black tracking-[-0.045em] leading-[0.95] mb-5"
        >
          One scan. <span className="text-saas-gradient">Every leak surfaced.</span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.12 }}
          className="text-center text-base md:text-lg text-foreground/65 max-w-2xl mx-auto leading-[1.6] mb-14"
        >
          The CAMBRA Analyzer is the engine behind everything. It maps your stack, benchmarks your costs, and quantifies the margin you're leaving on the table.
        </motion.p>

        {/* Main showcase card */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="relative rounded-3xl overflow-hidden border border-white/10 p-6 sm:p-10 md:p-14"
          style={{
            background:
              "radial-gradient(120% 80% at 0% 0%, rgba(31,78,216,0.22) 0%, transparent 55%), radial-gradient(100% 100% at 100% 100%, rgba(44,167,193,0.18) 0%, transparent 60%), linear-gradient(180deg, hsl(222 60% 7%) 0%, hsl(222 65% 4%) 100%)",
            boxShadow: "0 1px 0 hsl(0 0% 100% / 0.06) inset, 0 30px 80px -28px rgba(0,0,0,0.7)",
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

          {/* Floating glow */}
          <motion.div
            className="pointer-events-none absolute -top-32 -right-24 w-96 h-96 rounded-full blur-[100px]"
            style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.4), transparent)" }}
            animate={{ opacity: [0.4, 0.7, 0.4], scale: [1, 1.15, 1] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          />

          <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-10 lg:gap-14 items-center">
            {/* LEFT — copy + features */}
            <div>
              <div className="inline-flex items-center gap-2 mb-5 px-2.5 py-1.5 rounded-full border border-white/15 bg-white/[0.04] backdrop-blur-sm">
                <Activity className="h-3 w-3 text-cambra-mint" strokeWidth={2.5} />
                <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-white/70">
                  What it does
                </span>
              </div>

              <h3 className="font-display text-3xl sm:text-4xl font-black tracking-[-0.035em] leading-[1] mb-5">
                <span
                  style={{
                    background: "linear-gradient(135deg, #ffffff 0%, #B8D8E0 55%, #2CA7C1 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  Your full infrastructure audit, automated.
                </span>
              </h3>

              <p className="text-sm sm:text-base text-white/65 leading-relaxed mb-7 max-w-md">
                Instead of a 3-month consultancy engagement, the Analyzer delivers a complete operational diagnosis — instantly, free, and tailored to your scale.
              </p>

              <ul className="space-y-3 mb-8">
                {FEATURES.map((f, i) => (
                  <motion.li
                    key={f.label}
                    initial={{ opacity: 0, x: -12 }}
                    animate={inView ? { opacity: 1, x: 0 } : {}}
                    transition={{ duration: 0.5, delay: 0.4 + i * 0.08 }}
                    className="flex items-start gap-3"
                  >
                    <div className="h-7 w-7 rounded-lg flex items-center justify-center bg-white/[0.06] border border-white/15 flex-shrink-0 mt-0.5">
                      <f.Icon className="h-3.5 w-3.5 text-cambra-cyan" strokeWidth={2} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white">{f.label}</div>
                      <div className="text-[12px] text-white/55 leading-snug">{f.detail}</div>
                    </div>
                  </motion.li>
                ))}
              </ul>

              <Link to="/Analyzer">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="relative h-12 rounded-full px-7 text-sm font-bold inline-flex items-center justify-center gap-2 overflow-hidden group bg-white text-[#06080F] hover:bg-white/95 transition"
                >
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: "linear-gradient(110deg, transparent 35%, rgba(44,167,193,0.35) 50%, transparent 65%)" }}
                    animate={{ x: ["-100%", "100%"] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.2 }}
                  />
                  <Sparkles className="relative h-3.5 w-3.5" />
                  <span className="relative">Run the Analyzer</span>
                  <ArrowRight className="relative h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                </motion.button>
              </Link>
            </div>

            {/* RIGHT — sample output preview */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="relative"
            >
              <div className="relative rounded-2xl border border-white/12 bg-white/[0.03] backdrop-blur-sm p-6 sm:p-7 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
                  <div>
                    <div className="text-[9px] font-mono uppercase tracking-[0.22em] text-white/45 mb-1">
                      Analyzer output · sample
                    </div>
                    <div className="text-sm font-bold text-white">Your brand · €2M revenue</div>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-cambra-mint/30 bg-cambra-mint/10">
                    <CheckCircle2 className="h-3 w-3 text-cambra-mint" strokeWidth={2.5} />
                    <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-cambra-mint">Complete</span>
                  </div>
                </div>

                {/* KPI rows */}
                <div className="space-y-3 mb-6">
                  {SAMPLE_OUTPUT.map((kpi, i) => (
                    <motion.div
                      key={kpi.label}
                      initial={{ opacity: 0, y: 8 }}
                      animate={inView ? { opacity: 1, y: 0 } : {}}
                      transition={{ duration: 0.4, delay: 0.5 + i * 0.1 }}
                      className="flex items-center justify-between p-3 rounded-xl border border-white/8 bg-white/[0.02]"
                    >
                      <span className="text-[11px] font-medium text-white/60">{kpi.label}</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black tabular-nums tracking-tight text-white">
                          {kpi.value}
                        </span>
                        <span className="text-[10px] font-mono text-white/40">{kpi.trend}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Layer chips */}
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-[0.22em] text-white/45 mb-2.5">
                    Layers scanned
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {["Payments", "Shipping", "SaaS", "FX", "Banking", "In-store", "Insurance", "Telecom"].map((l, i) => (
                      <motion.span
                        key={l}
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={inView ? { opacity: 1, scale: 1 } : {}}
                        transition={{ duration: 0.3, delay: 0.7 + i * 0.04 }}
                        className="text-[10px] font-medium px-2 py-1 rounded-md border border-white/10 bg-white/[0.04] text-white/65"
                      >
                        {l}
                      </motion.span>
                    ))}
                  </div>
                </div>
              </div>

              <p className="mt-3 text-center text-[10px] text-white/35 font-mono">
                Sample output · Your audit will be tailored to your brand
              </p>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}