import { useEffect, useRef, useState } from "react";
import { ArrowRight, TrendingDown, Zap, CreditCard, Truck, Package } from "lucide-react";
import { motion, useScroll, useTransform, animate } from "framer-motion";

// Animated counter hook
function useCounter(target, duration = 1.8, delay = 0) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      const controls = animate(0, target, {
        duration,
        ease: [0.22, 1, 0.36, 1],
        onUpdate: (v) => setValue(Math.round(v)),
      });
      return () => controls.stop();
    }, delay * 1000);
    return () => clearTimeout(timer);
  }, [target, duration, delay]);
  return value;
}

const SAVINGS = [
  { label: "Payments", amount: "€12,400", pct: "2.8% → tier benchmark", color: "text-cambra-lilac", bg: "bg-cambra-lilac-soft border-cambra-lilac", icon: CreditCard },
  { label: "Logistics", amount: "€8,200", pct: "+22% above benchmark", color: "text-cambra-mint", bg: "bg-cambra-mint-soft border-cambra-mint", icon: Truck },
  { label: "SaaS Stack", amount: "€5,800", pct: "3 redundant tools", color: "text-cambra-plum", bg: "bg-cambra-plum-soft border-cambra-plum", icon: Package },
  { label: "Banking & Insurance", amount: "€3,200", pct: "FX + coverage overlap", color: "text-cambra-mint", bg: "bg-cambra-mint-soft border-cambra-mint", icon: CreditCard },
];

const fadeUp = { hidden: { opacity: 0, y: 40 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } } };
const container = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } } };

export default function HeroSection_Public() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const bgY = useTransform(scrollYProgress, [0, 1], ["0%", "12%"]);
  const leakage = useCounter(26400, 1.2, 0.6);

  return (
    <section ref={ref} className="relative min-h-screen flex items-center overflow-hidden pt-14">
      {/* Background — original CAMBRA aesthetic */}
      <motion.div className="absolute inset-0 pointer-events-none" style={{ y: bgY }}>
        <div className="absolute inset-0 dot-grid" />
        <div className="noise-soft" />
        <div className="absolute -top-24 -left-24 w-[46rem] h-[46rem] rounded-full blur-3xl bg-ambient-lilac opacity-[0.35]" />
        <div className="absolute -bottom-20 -right-20 w-[36rem] h-[36rem] rounded-full blur-3xl bg-ambient-mint opacity-[0.35]" />
      </motion.div>

      {/* Watermark logo */}
      <img
        src="https://media.base44.com/images/public/69b8bcd2986e2cf428289270/411e1f39a_cambra_c_logo_white_background.png"
        alt=""
        className="absolute bottom-6 right-6 w-40 sm:w-52 md:w-64 lg:w-80 opacity-[0.06] pointer-events-none select-none"
      />

      <div className="relative z-10 w-full max-w-6xl mx-auto px-5 py-16 md:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-12 lg:gap-16 items-center">

          {/* LEFT */}
          <motion.div variants={container} initial="hidden" animate="show" className="text-center lg:text-left">

            {/* Badge */}
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 mb-8 px-3 py-1.5 rounded-full border border-border/50 bg-background/80">
              <motion.span
                className="w-1.5 h-1.5 rounded-full bg-cambra-mint"
                animate={{ scale: [1, 1.5, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
              />
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground/70">Infrastructure Audit Intelligence</span>
            </motion.div>

            {/* Headline */}
            <motion.h1 variants={fadeUp} className="text-[clamp(2.8rem,8vw,7.2rem)] font-black tracking-[-0.05em] leading-[0.85] mb-5 text-center lg:text-left">
              Your business is probably{" "}
              <span className="text-saas-gradient">leaking margin.</span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p variants={fadeUp} className="text-[clamp(1rem,2.2vw,1.35rem)] font-medium text-foreground/65 mb-8 max-w-[620px] mx-auto lg:mx-0 leading-[1.5] text-center lg:text-left">
              Audit your entire infrastructure. Surface every margin leak.
            </motion.p>

            {/* CTAs */}
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-3 items-center justify-center lg:justify-start mb-5">
              <motion.a
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                href="/Analyzer"
                className="h-14 rounded-full px-10 text-base font-bold bg-saas-gradient text-white shadow-lg shadow-blue-500/20 ring-1 ring-white/10 hover:shadow-blue-500/40 transition inline-flex items-center justify-center gap-2"
              >
                <Zap className="h-4 w-4" />
                Run Infrastructure Audit
                <ArrowRight className="h-4 w-4" />
              </motion.a>
              <a href="/Onboarding" className="h-14 rounded-full px-8 text-base font-semibold border border-border/60 bg-background/60 backdrop-blur-sm text-foreground/80 hover:border-foreground/40 hover:text-foreground transition-all inline-flex items-center justify-center gap-2">
                Join CAMBRA
              </a>
            </motion.div>

            <motion.p variants={fadeUp} className="text-[11px] text-muted-foreground/40 text-center lg:text-left">
              Takes less than 3 minutes · No credit card required
            </motion.p>

            {/* Stats */}
            <motion.div variants={fadeUp} className="mt-10 grid grid-cols-3 gap-3 max-w-[500px] mx-auto lg:mx-0">
              {[
                { label: "Avg. recoverable margin", value: "€29K/yr" },
                { label: "Inefficiencies detected", value: "4.2" },
                { label: "Time to complete audit", value: "<3 min" },
              ].map((stat, i) => (
                <motion.div key={i} className="p-3 rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm" whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
                  <div className="text-lg font-black tracking-tight text-foreground">{stat.value}</div>
                  <div className="text-[10px] text-muted-foreground/50 leading-tight mt-0.5">{stat.label}</div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>

          {/* RIGHT — original-style product visual */}
          <motion.div
            className="hidden lg:flex flex-col gap-3"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Overpaying alert */}
            <motion.div
              className="flex items-center gap-3 p-4 rounded-xl border border-destructive/30 bg-red-500/[0.08]"
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.3, type: "spring", stiffness: 400, damping: 28 }}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-red-600 shrink-0" />
              <p className="text-sm font-semibold text-foreground/85">Margin leakage detected: <span className="text-destructive font-black">€26,400/year</span></p>
              <TrendingDown size={14} className="text-destructive ml-auto shrink-0" />
            </motion.div>

            {/* Savings card */}
            <div className="rounded-2xl border border-border/60 bg-card/90 backdrop-blur-sm overflow-hidden shadow-xl">
              <div className="px-5 py-3.5 border-b border-border/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <motion.div
                    className="w-2 h-2 rounded-full bg-cambra-mint"
                    animate={{ scale: [1, 1.6, 1], opacity: [1, 0.5, 1] }}
                    transition={{ repeat: Infinity, duration: 1.8 }}
                  />
                  <span className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground/50">Live Audit · Savings Report</span>
                </div>
                <span className="text-[10px] text-muted-foreground/30">Sample brand · €1.8M/yr</span>
              </div>

              <div className="p-4 space-y-2">
                {SAVINGS.map((item, i) => (
                  <motion.div
                    key={i}
                    className="flex items-center gap-3 p-3.5 rounded-xl border bg-card"
                    initial={{ opacity: 0, x: -16, scale: 0.97 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    transition={{ delay: 0.35 + i * 0.08, type: "spring", stiffness: 500, damping: 30 }}
                  >
                    <div className={`w-8 h-8 rounded-lg ${item.bg} flex items-center justify-center shrink-0`}>
                      <item.icon size={13} className={item.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground/50">{item.pct}</p>
                    </div>
                    <motion.p
                      className={`text-lg font-black tabular-nums ${item.color}`}
                      initial={{ opacity: 0, scale: 0.4 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.5 + i * 0.08, type: "spring", stiffness: 600, damping: 22 }}
                    >{item.amount}</motion.p>
                  </motion.div>
                ))}
              </div>

              <motion.div
                className="mx-4 mb-4 p-4 rounded-xl bg-foreground text-background flex items-center justify-between"
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.6, type: "spring", stiffness: 450, damping: 28 }}
              >
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] opacity-35 mb-0.5">Estimated recoverable margin</p>
                  <p className="text-3xl font-black tracking-tight tabular-nums">
                    €{leakage.toLocaleString()}<span className="text-base font-normal opacity-40">/yr</span>
                  </p>
                  <p className="text-[9px] opacity-25 mt-0.5">Your infrastructure verticals</p>
                </div>
                <a href="/Analyzer" className="h-9 px-4 rounded-full bg-background/10 hover:bg-background/20 text-background text-xs font-bold transition-colors border border-background/15 flex items-center gap-1.5">
                  Audit <ArrowRight size={11} />
                </a>
              </motion.div>
            </div>

            {/* Infra score mini card */}
            <motion.div
              className="rounded-xl border border-border/50 bg-card p-4 flex items-center gap-3.5"
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.72, type: "spring", stiffness: 450, damping: 28 }}
            >
              <div className="relative w-12 h-12 shrink-0">
                <svg className="w-12 h-12 -rotate-90" viewBox="0 0 44 44">
                  <circle cx="22" cy="22" r="18" fill="none" stroke="hsl(var(--border))" strokeWidth="4" />
                  <motion.circle
                    cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"
                    className="text-chart-3"
                    strokeDasharray={2 * Math.PI * 18}
                    initial={{ strokeDashoffset: 2 * Math.PI * 18 }}
                    animate={{ strokeDashoffset: 2 * Math.PI * 18 * 0.37 }}
                    transition={{ delay: 0.85, duration: 0.8, ease: "easeOut" }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-black text-cambra-plum">63</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold">Infrastructure Score: <span className="text-cambra-plum font-black">63/100</span></p>
                <p className="text-[10px] text-muted-foreground/50 leading-tight">Below benchmark · Audit to see full breakdown</p>
              </div>
            </motion.div>

            <motion.p
              className="text-center text-[10px] text-muted-foreground/25"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
            >Sample analysis · Estimated figures · 2025</motion.p>
          </motion.div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />
    </section>
  );
}