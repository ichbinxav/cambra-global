import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, TrendingDown, CreditCard, Truck, Package } from "lucide-react";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

const SAVINGS = [
  { label: "Payments", value: "€38K", sub: "−52% fee rate", color: "text-blue-600", bg: "bg-blue-500/[0.07] border-blue-500/20", icon: CreditCard },
  { label: "Shipping", value: "€19K", sub: "−18% carrier cost", color: "text-green-600", bg: "bg-green-500/[0.07] border-green-500/20", icon: Truck },
  { label: "SaaS", value: "€24K", sub: "−30% stack waste", color: "text-orange-500", bg: "bg-orange-500/[0.07] border-orange-500/20", icon: Package },
];

const STATS = [
  { value: "€29K", label: "Avg. savings/yr" },
  { value: "1.4%", label: "Network payment rate" },
  { value: "−18%", label: "Shipping reduction" },
  { value: "1,000+", label: "Member brands" },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.2 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};
const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.8 } },
};

export default function HeroSection() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const watermarkY = useTransform(scrollYProgress, [0, 1], ["0%", "20%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);

  return (
    <section ref={ref} className="relative min-h-screen flex items-center justify-center overflow-hidden pt-14">

      {/* Grid background */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: "linear-gradient(hsl(0 0% 0% / 0.025) 1px, transparent 1px), linear-gradient(90deg, hsl(0 0% 0% / 0.025) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
      }} />

      {/* Parallax watermark */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[55vw] font-thin text-foreground/[0.014] select-none pointer-events-none leading-none"
        style={{ y: watermarkY }}
      >✱</motion.div>

      <motion.div style={{ opacity }} className="relative z-10 w-full max-w-6xl mx-auto px-5 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_440px] gap-14 lg:gap-20 items-center">

          {/* LEFT */}
          <motion.div variants={container} initial="hidden" animate="show">
            {/* Pill */}
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 mb-7 px-3.5 py-1.5 rounded-full border border-border/50 bg-background/80">
              <motion.span
                className="w-1.5 h-1.5 rounded-full bg-green-500"
                animate={{ scale: [1, 1.5, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
              />
              <span className="text-[11px] font-medium text-muted-foreground">Three layers. One advantage.</span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              variants={fadeUp}
              className="text-[clamp(2.4rem,7vw,6.5rem)] font-black tracking-[-0.05em] leading-[0.86] mb-6"
            >
              Unlock your<br />margins.<br />
              <motion.span
                className="text-foreground/40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.55, duration: 0.7 }}
              >Scale your<br />business.</motion.span>
            </motion.h1>

            <motion.p variants={fadeUp} className="text-[clamp(0.95rem,1.8vw,1.15rem)] text-foreground/70 leading-relaxed mb-6 max-w-[440px]">
              An infrastructure platform that pools independent brands into a single negotiation bloc — giving you the collective buying power of the largest groups, at every level of your business.
            </motion.p>

            <motion.p variants={fadeUp} className="text-[11px] font-bold tracking-[0.2em] uppercase text-muted-foreground/50 mb-10">
              Collective Power · Better Rates · Real Savings
            </motion.p>

            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-3 mb-8">
              <Link to="/Analyzer" className="w-full sm:w-auto">
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Button size="lg" className="w-full sm:w-auto h-14 rounded-full px-10 text-base font-bold shadow-lg gap-2">
                    Run the Analyzer <ArrowRight className="h-4 w-4" />
                  </Button>
                </motion.div>
              </Link>
              <Link to="/Onboarding" className="w-full sm:w-auto">
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Button variant="outline" size="lg" className="w-full sm:w-auto h-14 rounded-full px-10 text-base font-medium border-border/60">
                    Join THE NoDE
                  </Button>
                </motion.div>
              </Link>
            </motion.div>

            <motion.p variants={fadeUp} className="text-[11px] text-muted-foreground/45 mb-10">
              <strong className="text-foreground/60">€18K–€72K</strong> unlocked per year · <strong className="text-foreground/60">−52%</strong> payment fees · <strong className="text-foreground/60">−18%</strong> shipping costs · <span className="opacity-70">Based on network benchmarks</span>
            </motion.p>

            {/* Stats row */}
            <motion.div variants={container} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {STATS.map((s, i) => (
                <motion.div
                  key={s.label}
                  variants={fadeUp}
                  whileHover={{ y: -4, transition: { duration: 0.2 } }}
                  className="p-4 rounded-xl border border-border/40 bg-card/50"
                >
                  <p className="text-2xl font-black tracking-tight">{s.value}</p>
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5">{s.label}</p>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>

          {/* RIGHT — visual savings dashboard */}
          <motion.div
            className="hidden lg:flex flex-col gap-3"
            initial={{ opacity: 0, x: 60, rotateY: 8 }}
            animate={{ opacity: 1, x: 0, rotateY: 0 }}
            transition={{ duration: 0.9, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="rounded-2xl border border-border/60 bg-card/90 backdrop-blur-sm overflow-hidden shadow-xl">
              <div className="px-5 py-3.5 border-b border-border/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <motion.div
                    className="w-2 h-2 rounded-full bg-green-500"
                    animate={{ scale: [1, 1.6, 1], opacity: [1, 0.5, 1] }}
                    transition={{ repeat: Infinity, duration: 1.8 }}
                  />
                  <span className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground/50">Live savings analysis</span>
                </div>
                <TrendingDown size={12} className="text-muted-foreground/30" />
              </div>

              {/* Category cards */}
              <div className="p-4 space-y-2">
                {SAVINGS.map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + i * 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border ${item.bg}`}
                  >
                    <div className={`w-8 h-8 rounded-lg ${item.bg} flex items-center justify-center shrink-0`}>
                      <item.icon size={13} className={item.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground/50">{item.sub}</p>
                    </div>
                    <motion.p
                      className={`text-lg font-black tabular-nums ${item.color}`}
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.9 + i * 0.15, type: "spring", stiffness: 300, damping: 18 }}
                    >{item.value}</motion.p>
                  </motion.div>
                ))}
              </div>

              {/* Total */}
              <motion.div
                className="mx-4 mb-4 p-4 rounded-xl bg-foreground text-background flex items-center justify-between"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] opacity-35 mb-0.5">Total margin unlocked</p>
                  <p className="text-3xl font-black tracking-tight">€81K<span className="text-base font-normal opacity-40">/yr</span></p>
                </div>
                <Link to="/Analyzer">
                  <button className="h-9 px-4 rounded-full bg-background/10 hover:bg-background/20 text-background text-xs font-bold transition-colors border border-background/15 flex items-center gap-1.5">
                    Analyze mine <ArrowRight size={11} />
                  </button>
                </Link>
              </motion.div>
            </div>

            {/* Infra score mini card */}
            <motion.div
              className="rounded-xl border border-border/50 bg-card p-4 flex items-center gap-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.25, duration: 0.5 }}
            >
              <div className="relative w-12 h-12 shrink-0">
                <svg className="w-12 h-12 -rotate-90" viewBox="0 0 44 44">
                  <circle cx="22" cy="22" r="18" fill="none" stroke="hsl(var(--border))" strokeWidth="4" />
                  <motion.circle
                    cx="22" cy="22" r="18" fill="none" stroke="#f97316" strokeWidth="4" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 18}
                    initial={{ strokeDashoffset: 2 * Math.PI * 18 }}
                    animate={{ strokeDashoffset: 2 * Math.PI * 18 * 0.43 }}
                    transition={{ delay: 1.4, duration: 1.2, ease: "easeOut" }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[11px] font-black text-orange-500">57</span>
                </div>
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold">Infrastructure Score: <span className="text-orange-500">57/100</span></p>
                <p className="text-[10px] text-muted-foreground/50">Under-optimized — potential score: 84/100</p>
              </div>
            </motion.div>

            <motion.p
              className="text-center text-[10px] text-muted-foreground/25"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }}
            >Sample analysis · Independent brand · 2025</motion.p>
          </motion.div>
        </div>
      </motion.div>

      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />
    </section>
  );
}