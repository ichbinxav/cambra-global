import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, TrendingDown, CreditCard, Truck, Package, CheckCircle2 } from "lucide-react";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";


const SAVINGS = [
  { label: "Payments", value: "€38K", sub: "−52% fee rate", color: "text-cambra-lilac", bg: "bg-cambra-lilac-soft border-cambra-lilac", icon: CreditCard },
  { label: "Shipping", value: "€19K", sub: "−18% carrier cost", color: "text-cambra-mint", bg: "bg-cambra-mint-soft border-cambra-mint", icon: Truck },
  { label: "SaaS", value: "€24K", sub: "−30% stack waste", color: "text-cambra-plum", bg: "bg-cambra-plum-soft border-cambra-plum", icon: Package },
];

const BULLETS = [
  "Access rates you can't unlock on your own",
  "Instantly see where you're overpaying",
  "Reduce infrastructure costs across your stack",
  "Turn collective scale into economic leverage",
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } },
};

export default function HeroSection() {
  const { isAuthenticated } = useAuth();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const watermarkY = useTransform(scrollYProgress, [0, 1], ["0%", "20%"]);

  return (
    <section ref={ref} className="relative min-h-screen flex items-center justify-center overflow-hidden pt-14">

      {/* Ambient glows */}
      <div className="absolute -top-24 -left-24 w-[46rem] h-[46rem] rounded-full blur-3xl bg-ambient-lilac opacity-[0.35] pointer-events-none" />
      <div className="absolute -bottom-20 -right-20 w-[36rem] h-[36rem] rounded-full blur-3xl bg-ambient-mint opacity-[0.35] pointer-events-none" />
      {/* Grid background */}
      <div className="absolute inset-0 pointer-events-none dot-grid" />
      <div className="noise-soft" />

      {/* Parallax watermark */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[55vw] font-thin text-foreground/[0.014] select-none pointer-events-none leading-none"
        style={{ y: watermarkY }}
      >✱</motion.div>

      <div className="relative z-10 w-full max-w-6xl mx-auto px-5 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-14 lg:gap-16 items-center">

          {/* LEFT */}
          <motion.div variants={container} initial="hidden" animate="show" className="text-center md:text-center lg:text-left">

            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 mb-8 px-3 py-1.5 rounded-full border border-border/50 bg-background/80">
              <motion.span
                className="w-1.5 h-1.5 rounded-full bg-cambra-mint"
                animate={{ scale: [1, 1.5, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
              />
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground/70">Infrastructure for independent brands</span>
            </motion.div>

            <motion.p variants={fadeUp} className="text-sm text-muted-foreground/60 mb-3 max-w-[480px] mx-auto text-center lg:text-left">
              Most brands operate below optimal infrastructure rates — and don't realize it.
            </motion.p>

            <motion.h1
              variants={fadeUp}
              className="text-[clamp(2.8rem,8vw,7.2rem)] font-black tracking-[-0.05em] leading-[0.85] mb-3 text-center lg:text-left"
            >
              Independent brands. One <br /><span className="text-saas-gradient">infrastructure</span> layer.
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="text-[clamp(1.1rem,2.6vw,1.6rem)] font-semibold text-foreground/80 mb-6 tracking-[-0.01em] text-center lg:text-left"
            >
              CAMBRA helps independent brands unlock better terms, reduce costs, and grow with confidence.
            </motion.p>

            <motion.p variants={fadeUp} className="text-base text-foreground/70 leading-relaxed mb-8 max-w-[520px] mx-auto text-center lg:text-left">
              We aggregate independent brands into a single leverage bloc. You unlock better rates on payments, shipping, and SaaS — instantly. Our analyzer identifies exactly where value is left unoptimized, then you access the deals.
            </motion.p>

            {/* Pricing pill */}
            <motion.div
              variants={fadeUp}
              className="inline-flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-8 px-5 py-4 rounded-full bg-foreground text-background mx-auto shadow-sm"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm text-background/40 line-through font-light">€60/month</span>
                <span className="text-xl sm:text-lg font-black">Free</span>
              </div>
              <span className="hidden sm:inline text-background/40">·</span>
              <span className="text-sm text-background/70">Early partners only</span>
            </motion.div>
            <motion.p variants={fadeUp} className="text-[11px] text-muted-foreground/50 mb-8 text-center lg:text-left">
              25% success fee on realized savings — if we don’t save you money, you pay zero.
            </motion.p>

            {/* Value bullets */}
            <motion.ul variants={container} className="space-y-2.5 mb-10">
              {BULLETS.map((b, i) => (
                <motion.li key={i} variants={fadeUp} className="flex items-start gap-3 text-sm text-foreground/75">
                  <CheckCircle2 size={16} className="text-chart-2 mt-0.5 shrink-0" />
                  <span className="font-medium">{b}</span>
                </motion.li>
              ))}
            </motion.ul>

            {/* CTAs */}
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-center sm:justify-center"
            aria-label="Primary calls to action">
              <Link to="/Onboarding" className="flex-1 sm:flex-none">
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Button size="lg" className="w-full sm:w-auto h-14 rounded-full px-12 text-base font-bold gap-2 bg-saas-gradient text-white shadow-lg shadow-blue-500/20 ring-1 ring-white/10 hover:shadow-blue-500/40 transition-transform hover:-translate-y-0.5">
                  JOIN CAMBRA <ArrowRight className="h-4 w-4" />
                  </Button>
                </motion.div>
              </Link>
              <motion.a
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                href="#how"
                className="flex-1 sm:flex-none h-14 rounded-full px-12 text-base font-semibold bg-foreground text-background hover:opacity-90 transition inline-flex items-center justify-center gap-2"
              >
                Explore platform <ArrowRight className="h-4 w-4" />
              </motion.a>
            </motion.div>

            {/* Trusted strip — hidden until partner logos are ready */}






          </motion.div>

          {/* RIGHT — product visual */}
          <motion.div
            className="hidden lg:flex flex-col gap-3"
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.9, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Overpaying alert */}
            <motion.div
              className="flex items-center gap-3 p-4 rounded-xl border border-destructive/30 bg-red-500/[0.08]"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-red-600 shrink-0" />
              <p className="text-sm font-semibold text-foreground/85">Overpaying detected: <span className="text-destructive font-black">€8,430/year</span></p>
              <TrendingDown size={14} className="text-destructive ml-auto shrink-0" />
            </motion.div>

            {/* Analyzer card */}
            <div className="rounded-2xl border border-border/60 bg-card/90 backdrop-blur-sm overflow-hidden shadow-xl">
              <div className="px-5 py-3.5 border-b border-border/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <motion.div
                    className="w-2 h-2 rounded-full bg-cambra-mint"
                    animate={{ scale: [1, 1.6, 1], opacity: [1, 0.5, 1] }}
                    transition={{ repeat: Infinity, duration: 1.8 }}
                  />
                  <span className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground/50">Analyzer · Savings Report</span>
                </div>
                <span className="text-[10px] text-muted-foreground/30">Sample brand · €500K/yr</span>
              </div>

              <div className="p-4 space-y-2">
                {SAVINGS.map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.65 + i * 0.13, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border bg-card`}
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
                      transition={{ delay: 0.9 + i * 0.13, type: "spring", stiffness: 300, damping: 18 }}
                    >{item.value}</motion.p>
                  </motion.div>
                ))}
              </div>

              <motion.div
               className="mx-4 mb-4 p-4 rounded-xl bg-foreground text-background flex items-center justify-between"
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 1.05, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
               <div>
                 <p className="text-[10px] uppercase tracking-[0.2em] opacity-35 mb-0.5">Potential savings unlocked</p>
                 <p className="text-3xl font-black tracking-tight">€8.4K<span className="text-base font-normal opacity-40">/yr</span></p>
               </div>
               {isAuthenticated ? (
                  <Link to="/Analyzer">
                    <button className="h-9 px-4 rounded-full bg-background/10 hover:bg-background/20 text-background text-xs font-bold transition-colors border border-background/15 flex items-center gap-1.5">
                      Analyze <ArrowRight size={11} />
                    </button>
                  </Link>
                ) : (
                  <a
                    href="/auth/start"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-9 px-4 rounded-full bg-background/10 hover:bg-background/20 text-background text-xs font-bold transition-colors border border-background/15 flex items-center gap-1.5"
                  >
                    Sign in <ArrowRight size={11} />
                  </a>
                )}
              </motion.div>
            </div>

            {/* Infra score mini card */}
            <motion.div
              className="rounded-xl border border-border/50 bg-card p-4 flex items-center gap-3.5"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2, duration: 0.5 }}
            >
              <div className="relative w-12 h-12 shrink-0">
                <svg className="w-12 h-12 -rotate-90" viewBox="0 0 44 44">
                  <circle cx="22" cy="22" r="18" fill="none" stroke="hsl(var(--border))" strokeWidth="4" />
                  <motion.circle
                    cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"
                    className="text-chart-3"
                    strokeDasharray={2 * Math.PI * 18}
                    initial={{ strokeDashoffset: 2 * Math.PI * 18 }}
                    animate={{ strokeDashoffset: 2 * Math.PI * 18 * 0.43 }}
                    transition={{ delay: 1.35, duration: 1.2, ease: "easeOut" }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-black text-cambra-plum">57</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold">Infrastructure Score: <span className="text-cambra-plum font-black">57/100</span></p>
                <p className="text-[10px] text-muted-foreground/50 leading-tight">Your potential: 84/100 · See how</p>
              </div>
            </motion.div>

            {/* Deals unlocked hint */}
            <motion.div
              className="rounded-xl border border-cambra-mint bg-cambra-mint-soft p-4 flex items-center gap-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.35 }}
            >
              <div className="w-7 h-7 rounded-lg bg-cambra-mint/15 flex items-center justify-center shrink-0">
                <span className="text-cambra-mint text-[11px] font-black">3</span>
              </div>
              <div className="flex-1">
                <p className="text-[11px] font-semibold text-foreground">Structural rates unlocked</p>
                <p className="text-[10px] text-muted-foreground/50">Rates you can't negotiate alone · Join to activate</p>
              </div>
              {!isAuthenticated && (
                <Link to="/Onboarding">
                  <button className="text-[10px] font-bold text-cambra-mint hover:opacity-90 transition-colors flex items-center gap-1">
                    Join <ArrowRight size={9} />
                  </button>
                </Link>
              )}
              {isAuthenticated && (
                <Link to="/Deals">
                  <button className="text-[10px] font-bold text-cambra-mint hover:opacity-90 transition-colors flex items-center gap-1">
                    View deals <ArrowRight size={9} />
                  </button>
                </Link>
              )}
            </motion.div>

            <motion.p
              className="text-center text-[10px] text-muted-foreground/25"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }}
            >Sample analysis · Independent brand · 2025</motion.p>
          </motion.div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />
    </section>
  );
}