# Código clave — Refresh visual SaaS (azul/púrpura, glass, motion)

Este documento recopila los archivos principales para revisión: Landing (Navbar + Hero), Dashboard, Analyzer y Results. Al final incluyo las utilidades CSS añadidas para el gradiente y glass.

---

## Landing

La landing se compone de secciones modulares (Navbar, Hero, Problem, Solution, AnalyzerCTA, Integrations, ThreeLayers, Pricing, Benefits, Testimonials, Footer). A continuación, el código de Navbar y Hero.

### components/landing/Navbar.jsx

```jsx
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

const NAV_PUBLIC = [
  { label: "How it works", href: "#how" },
  { label: "Analyzer", href: "/Analyzer" },
  { label: "Join THE NoDE", href: "/Onboarding" },
];

const NAV_MEMBER = [
  { label: "How it works", href: "#how" },
  { label: "Analyzer", href: "/Analyzer" },
  { label: "Deals", href: "/Deals" },
  { label: "Insights", href: "/Insights" },
  { label: "Network", href: "/Network" },
  { label: "Join THE NoDE", href: "/Onboarding" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { isAuthenticated } = useAuth();
  const NAV = isAuthenticated ? NAV_MEMBER : NAV_PUBLIC;

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${scrolled ? "bg-background/95 backdrop-blur-2xl border-b border-border/40 shadow-sm" : "bg-background/80 backdrop-blur-md border-b border-border/20"}`}>
      <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">

        {/* Logo */}
        <Link to="/" className="text-sm font-black tracking-tight flex-shrink-0">
          THE NoDE
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          {NAV.map(item => (
            item.href.startsWith("/") ? (
              <Link key={item.label} to={item.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                {item.label}
              </Link>
            ) : (
              <a key={item.label} href={item.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                {item.label}
              </a>
            )
          ))}
        </nav>

        {/* Desktop CTAs */}
        <div className="hidden md:flex items-center gap-2">
          {isAuthenticated ? (
            <Link to="/Dashboard">
              <Button size="sm" className="h-8 rounded-full px-5 text-sm font-semibold shadow-sm">
                Dashboard →
              </Button>
            </Link>
          ) : (
            <>
              <a
                href="/auth/start"
                target="_blank"
                rel="noopener noreferrer"
                className="h-8 px-5 text-sm font-bold text-white bg-saas-gradient hover:opacity-90 transition-opacity rounded-full shadow-sm inline-flex items-center justify-center"
              >
                Sign in
              </a>
              <Link to="/Analyzer">
                <Button size="sm" className="h-8 rounded-full px-5 text-sm font-bold shadow-sm bg-green-600 hover:bg-green-700 text-white">
                  Check Savings
                </Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setOpen(v => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-border/40 bg-background/98 backdrop-blur-2xl px-5 py-4 space-y-1 overflow-y-auto max-h-[80vh]">
          {NAV.map(item => (
            item.href.startsWith("/") ? (
              <Link key={item.label} to={item.href} onClick={() => setOpen(false)} className="block py-3 text-sm text-muted-foreground border-b border-border/30 last:border-0">
                {item.label}
              </Link>
            ) : (
              <a key={item.label} href={item.href} onClick={() => setOpen(false)} className="block py-3 text-sm text-muted-foreground border-b border-border/30 last:border-0">
                {item.label}
              </a>
            )
          ))}
          <div className="pt-4 flex flex-col gap-2">
            <Link to="/Analyzer" onClick={() => setOpen(false)}>
              <Button className="w-full h-12 rounded-full text-sm font-bold">Run the Analyzer</Button>
            </Link>
            {isAuthenticated ? (
              <Link to="/Dashboard" onClick={() => setOpen(false)}>
                <Button variant="outline" className="w-full h-12 rounded-full text-sm">Dashboard</Button>
              </Link>
            ) : (
              <>
                <a
                  href="/auth/start"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="w-full h-12 rounded-full text-sm border border-border/70 hover:bg-secondary transition-colors font-medium flex items-center justify-center"
                >
                  Sign in with Google / Apple
                </a>
                <Link to="/Onboarding" onClick={() => setOpen(false)}>
                  <Button variant="outline" className="w-full h-12 rounded-full text-sm">Join THE NoDE</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
```

### components/landing/HeroSection.jsx

```jsx
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, TrendingDown, CreditCard, Truck, Package, CheckCircle2 } from "lucide-react";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";

const SAVINGS = [
  { label: "Payments", value: "€38K", sub: "−52% fee rate", color: "text-blue-600", bg: "bg-blue-500/[0.07] border-blue-500/20", icon: CreditCard },
  { label: "Shipping", value: "€19K", sub: "−18% carrier cost", color: "text-green-600", bg: "bg-green-500/[0.07] border-green-500/20", icon: Truck },
  { label: "SaaS", value: "€24K", sub: "−30% stack waste", color: "text-orange-500", bg: "bg-orange-500/[0.07] border-orange-500/20", icon: Package },
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

      <div className="relative z-10 w-full max-w-6xl mx-auto px-5 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-14 lg:gap-16 items-center">

          {/* LEFT */}
          <motion.div variants={container} initial="hidden" animate="show">

            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 mb-8 px-3 py-1.5 rounded-full border border-border/50 bg-background/80">
              <motion.span
                className="w-1.5 h-1.5 rounded-full bg-green-500"
                animate={{ scale: [1, 1.5, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
              />
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground/70">For Lifestyle Commerce</span>
            </motion.div>

            <motion.p variants={fadeUp} className="text-sm text-muted-foreground/60 mb-3 max-w-[480px]">
              Most brands operate below optimal infrastructure rates — and don't realize it.
            </motion.p>

            <motion.h1
              variants={fadeUp}
              className="text-[clamp(2.8rem,8vw,7.2rem)] font-black tracking-[-0.05em] leading-[0.85] mb-3"
            >
              Turn your infrastructure<br />into an advantage.
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="text-[clamp(1.2rem,3vw,1.8rem)] font-black text-green-600 mb-6 tracking-[-0.02em]"
            >
              Unlock the rates your scale should give you.
            </motion.p>

            <motion.p variants={fadeUp} className="text-base text-foreground/70 leading-relaxed mb-8 max-w-[520px]">
              We aggregate independent brands into a single leverage bloc. You unlock better rates on payments, shipping, and SaaS — instantly. Our analyzer identifies exactly where value is left unoptimized, then you access the deals.
            </motion.p>

            {/* Pricing pill */}
            <motion.div
              variants={fadeUp}
              className="inline-flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-8 px-5 py-4 rounded-full bg-foreground text-background"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm text-background/40 line-through font-light">€120/month</span>
                <span className="text-xl sm:text-lg font-black">Free</span>
              </div>
              <span className="hidden sm:inline text-background/40">·</span>
              <span className="text-sm text-background/70">Early partners only</span>
            </motion.div>
            <motion.p variants={fadeUp} className="text-[11px] text-muted-foreground/50 mb-8">
              You only pay when your economics improve.
            </motion.p>

            {/* Value bullets */}
            <motion.ul variants={container} className="space-y-2.5 mb-10">
              {BULLETS.map((b, i) => (
                <motion.li key={i} variants={fadeUp} className="flex items-start gap-3 text-sm text-foreground/75">
                  <CheckCircle2 size={16} className="text-green-500 mt-0.5 shrink-0" />
                  <span className="font-medium">{b}</span>
                </motion.li>
              ))}
            </motion.ul>

            {/* CTAs */}
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              {isAuthenticated ? (
                <>
                  <Link to="/Analyzer" className="flex-1 sm:flex-none">
                    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                      <Button size="lg" className="w-full sm:w-auto h-14 rounded-full px-12 text-base font-bold shadow-lg gap-2 bg-green-600 hover:bg-green-700">
                        Calculate your savings <ArrowRight className="h-4 w-4" />
                      </Button>
                    </motion.div>
                  </Link>
                  <Link to="/Dashboard" className="flex-1 sm:flex-none">
                    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                      <Button variant="outline" size="lg" className="w-full sm:w-auto h-14 rounded-full px-12 text-base font-medium border-border/60 hover:border-foreground/20">
                        Go to Dashboard <ArrowRight className="h-4 w-4" />
                      </Button>
                    </motion.div>
                  </Link>
                </>
              ) : (
                <>
                  <Link to="/Analyzer" className="flex-1 sm:flex-none">
                    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                      <Button size="lg" className="w-full sm:w-auto h-14 rounded-full px-12 text-base font-bold shadow-lg gap-2 bg-green-600 hover:bg-green-700">
                        Calculate your savings <ArrowRight className="h-4 w-4" />
                      </Button>
                    </motion.div>
                  </Link>
                  <motion.a
                    whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    href="/auth/start"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 sm:flex-none h-14 rounded-full px-12 text-base font-medium border border-border/60 hover:border-foreground/20 transition-colors inline-flex items-center justify-center gap-2"
                  >
                    Sign in first <ArrowRight className="h-4 w-4" />
                  </motion.a>
                </>
              )}
            </motion.div>

            <motion.div variants={fadeUp} className="flex flex-col gap-1.5 mt-4">
              <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground/60">
                <span className="w-1 h-1 rounded-full bg-foreground/30"></span>
                <span>2-minute analysis · No commitment · Read-only access</span>
              </div>
              <p className="text-sm text-muted-foreground/60">
                Identify your optimization potential instantly.
              </p>
            </motion.div>

            <motion.p variants={fadeUp} className="text-[11px] text-muted-foreground/40 mt-4">
              Avg. optimization potential: €29,000/year · €3K–€72K range · Based on real network benchmarks
            </motion.p>
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
              className="flex items-center gap-3 p-4 rounded-xl border border-red-600/30 bg-red-500/[0.08]"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-red-600 shrink-0" />
              <p className="text-sm font-semibold text-foreground/85">Overpaying detected: <span className="text-red-600 font-black">€8,430/year</span></p>
              <TrendingDown size={14} className="text-red-600 ml-auto shrink-0" />
            </motion.div>

            {/* Analyzer card */}
            <div className="rounded-2xl border border-border/60 bg-card/90 backdrop-blur-sm overflow-hidden shadow-xl">
              <div className="px-5 py-3.5 border-b border-border/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <motion.div
                    className="w-2 h-2 rounded-full bg-green-500"
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
                    cx="22" cy="22" r="18" fill="none" stroke="#f97316" strokeWidth="4" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 18}
                    initial={{ strokeDashoffset: 2 * Math.PI * 18 }}
                    animate={{ strokeDashoffset: 2 * Math.PI * 18 * 0.43 }}
                    transition={{ delay: 1.35, duration: 1.2, ease: "easeOut" }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-black text-orange-500">57</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold">Infrastructure Score: <span className="text-orange-500 font-black">57/100</span></p>
                <p className="text-[10px] text-muted-foreground/50 leading-tight">Your potential: 84/100 · See how</p>
              </div>
            </motion.div>

            {/* Deals unlocked hint */}
            <motion.div
              className="rounded-xl border border-green-500/25 bg-green-500/[0.06] p-4 flex items-center gap-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.35 }}
            >
              <div className="w-7 h-7 rounded-lg bg-green-500/15 flex items-center justify-center shrink-0">
                <span className="text-green-600 text-[11px] font-black">3</span>
              </div>
              <div className="flex-1">
                <p className="text-[11px] font-semibold text-foreground">Structural rates unlocked</p>
                <p className="text-[10px] text-muted-foreground/50">Rates you can't negotiate alone · Join to activate</p>
              </div>
              {!isAuthenticated && (
                <Link to="/Onboarding">
                  <button className="text-[10px] font-bold text-green-600 hover:text-green-700 transition-colors flex items-center gap-1">
                    Join <ArrowRight size={9} />
                  </button>
                </Link>
              )}
              {isAuthenticated && (
                <Link to="/Deals">
                  <button className="text-[10px] font-bold text-green-600 hover:text-green-700 transition-colors flex items-center gap-1">
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
```

---

## Dashboard — pages/Dashboard.jsx

```jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, TrendingDown, Users, BookOpen, AlertTriangle, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import DealsOverview from "@/components/deals/DealsOverview.jsx";
import MetricCard from "@/components/dashboard/MetricCard";
import HeroSavings from "@/components/dashboard/HeroSavings";
import InfraScore from "@/components/dashboard/InfraScore";
import SavingsTrend from "@/components/dashboard/SavingsTrend";
import InfrastructureStatus from "@/components/dashboard/InfrastructureStatus";
import GMVMetrics from "@/components/dashboard/GMVMetrics";
import { CreditCard, Truck, Package } from "lucide-react";



export default function Dashboard() {
  const [results, setResults] = useState([]);
  const [brands, setBrands] = useState([]);
  const [user, setUser] = useState(null);
  const [userDeals, setUserDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState(null);
  const [econ, setEcon] = useState({ identified: 0, activated: 0, realized: 0 });

  // Initial load — fetch user once, then data
  useEffect(() => {
    const init = async () => {
      const u = await base44.auth.me();
      setUser(u);
      setUserEmail(u.email);

      const [r, b, uds] = await Promise.all([
        base44.entities.AnalyzerResult.filter({ created_by: u.email }, "-created_date", 10),
        base44.entities.Brand.filter({ created_by: u.email }),
        base44.entities.UserDeal.filter({ user_email: u.email }),
      ]);
      setResults(r);
      setBrands(b);
      setUserDeals(uds);
      // After basics, if brand exists fetch economics
      if (b?.length) {
        try {
          const res = await base44.functions.invoke('getBrandSavings', { brandId: b[0].id });
          const d = res?.data || {};
          setEcon({
            identified: Number(d?.identified?.yearly || 0),
            activated: Number(d?.activated?.yearly || 0),
            realized: Number(d?.realized?.yearly || 0),
          });
        } catch (e) { console.warn('getBrandSavings failed', e?.message || e); }
      }
      setLoading(false);
    };

    init().catch(err => {
      console.error('Dashboard init error:', err);
      setLoading(false);
    });
  }, []);

  // Subscribe to real-time updates once we have the user email
  useEffect(() => {
    if (!userEmail) return;

    const refresh = async () => {
      const [r, uds] = await Promise.all([
        base44.entities.AnalyzerResult.filter({ created_by: userEmail }, "-created_date", 10),
        base44.entities.UserDeal.filter({ user_email: userEmail }),
      ]);
      setResults(r);
      setUserDeals(uds);
    };

    const subs = [];
    try {
      const unsub1 = base44.entities.UserDeal.subscribe(() => refresh());
      const unsub2 = base44.entities.AnalyzerResult.subscribe(() => refresh());
      if (unsub1) subs.push(unsub1);
      if (unsub2) subs.push(unsub2);
    } catch (err) {
      console.warn('Subscription error:', err);
    }

    return () => subs.forEach(unsub => unsub?.());
  }, [userEmail]);

  const latest = results[0];
  const chartData = results.slice().reverse().map((r, i) => ({ i, value: r.total_savings || 0 }));
  const score = latest?.infra_score || 0;
  
  // GMV calculations from AnalyzerInput monthly_revenue
  const gmvTotal = results.reduce((sum, r) => {
    const monthlyRevenue = r.details?.monthly_revenue || 0;
    return sum + (monthlyRevenue * 12);
  }, 0);
  const gmvAverage = results.length > 0 ? gmvTotal / Math.max(results.length, 1) : 0;

  if (loading) return (
    <div className="flex items-center justify-center py-40">
      <div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4 pb-10">

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-[-0.03em]">
            {user?.full_name ? `${user.full_name.split(" ")[0]}.` : "Dashboard"}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Infrastructure command center</p>
        </div>
        <Link to="/Analyzer">
          <Button size="sm" className="h-9 rounded-full px-5 text-xs font-bold gap-1.5">
            New Analysis <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>

      {/* Economics strip */}
      <div className="mt-1">
        {econ && (
          <div>
            {/* lazy import avoided; small component inline to keep simple */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
              <div className="p-4 rounded-xl glass ring-1 ring-blue-500/10 hover:translate-y-0.5 transition-transform">
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-1">Identified savings</p>
                <p className="text-xl font-black tabular-nums text-blue-600">€{Math.round(econ.identified).toLocaleString()}/yr</p>
              </div>
              <div className="p-4 rounded-xl glass ring-1 ring-purple-500/10 hover:translate-y-0.5 transition-transform">
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-1">Activated savings</p>
                <p className="text-xl font-black tabular-nums text-purple-600">€{Math.round(econ.activated).toLocaleString()}/yr</p>
              </div>
              <div className="p-4 rounded-xl glass ring-1 ring-green-500/10 hover:translate-y-0.5 transition-transform">
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-1">Realized savings</p>
                <p className="text-xl font-black tabular-nums text-green-600">€{Math.round(econ.realized).toLocaleString()}/yr</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {!latest ? (
        /* ── EMPTY STATE ── */
        <div className="space-y-3">
          {/* Accuracy banner */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-5 rounded-2xl border border-orange-500/20 bg-orange-500/[0.04]">
            <AlertTriangle size={16} className="text-orange-500 shrink-0 mt-0.5 sm:mt-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold">Using estimated data</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">Connect your tools or upload a statement to unlock precise insights and verified savings figures.</p>
            </div>
            <div className="flex gap-2 shrink-0 flex-wrap">
              <Link to="/ConnectTools">
                <button className="h-8 px-4 rounded-full bg-foreground text-background text-xs font-bold">Connect tools</button>
              </Link>
              <Link to="/ConnectTools">
                <button className="h-8 px-4 rounded-full border border-border/60 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">Upload data</button>
              </Link>
            </div>
          </div>

          <div className="text-center py-20 border border-dashed border-border/40 rounded-2xl bg-secondary/10">
            <div className="text-5xl mb-5 select-none opacity-10">✱</div>
            <h3 className="text-xl font-bold tracking-tight mb-2">No analysis yet</h3>
            <p className="text-sm text-muted-foreground mb-8 max-w-xs mx-auto">
              Run the 2-minute Analyzer to identify your infrastructure optimization potential.
            </p>
            <Link to="/Analyzer">
              <Button className="rounded-full px-8 text-sm font-bold gap-2">
                Run the Analyzer <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* ── ACCURACY BANNER ── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 rounded-xl border border-orange-500/20 bg-orange-500/[0.04]">
            <div className="flex items-center gap-2 flex-1">
              <div className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
              <p className="text-xs font-semibold text-orange-600">Using estimated data</p>
              <span className="text-xs text-muted-foreground/50 hidden sm:block">— Connect your tools to unlock precise insights</span>
            </div>
            <Link to="/ConnectTools">
              <button className="h-7 px-3 rounded-full border border-orange-500/30 text-[11px] font-semibold text-orange-600 hover:bg-orange-500/10 transition-colors flex items-center gap-1.5">
                <Zap size={10} /> Connect your data
              </button>
            </Link>
          </div>

          <HeroSavings latest={latest} score={score} />

          {/* ── SAVINGS OPPORTUNITIES & GMV ── */}
          <div className="grid grid-cols-3 gap-3">
            <MetricCard label="Payments" value={latest.payment_savings} icon={CreditCard} color="text-blue-600" border="border-blue-500/15" bg="bg-blue-500/[0.05]" note="payment efficiency" />
            <MetricCard label="Shipping" value={latest.shipping_savings} icon={Truck} color="text-green-600" border="border-green-500/15" bg="bg-green-500/[0.05]" note="shipping efficiency" />
            <MetricCard label="SaaS" value={latest.saas_savings} icon={Package} color="text-orange-500" border="border-orange-500/15" bg="bg-orange-500/[0.05]" note="stack efficiency" />
          </div>

          <GMVMetrics gmvTotal={gmvTotal} gmvAverage={gmvAverage} />

          {/* ── SCORE + DEALS ROW ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <InfraScore score={score} resultId={latest.id} />
            {chartData.length > 1 ? (
              <SavingsTrend chartData={chartData} />
            ) : (
              <DealsOverview userDeals={userDeals} />
            )}
          </div>

          {/* ── DEALS OVERVIEW (when chart is shown instead) ── */}
          {chartData.length > 1 && (
            <DealsOverview userDeals={userDeals} />
          )}

          <InfrastructureStatus latest={latest} />

          {/* ── QUICK ACTIONS ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { title: "Run new analysis", desc: "Update your score", path: "/Analyzer", icon: TrendingDown, accent: true },
              { title: "Browse network", desc: "1,000+ member brands", path: "/Network", icon: Users },
              { title: "Read insights", desc: "Infrastructure intelligence", path: "/Insights", icon: BookOpen },
            ].map((action, i) => (
              <Link key={i} to={action.path}>
                <div className={`group p-5 rounded-2xl border transition-all cursor-pointer ${action.accent ? "border-foreground/8 bg-foreground text-background" : "border-border/50 bg-card hover:border-border"}`}>
                  <action.icon size={14} className={`mb-3 ${action.accent ? "opacity-40" : "text-muted-foreground/40"}`} />
                  <p className={`font-semibold text-sm mb-0.5 ${action.accent ? "text-background" : ""}`}>{action.title}</p>
                  <p className={`text-xs ${action.accent ? "text-background/40" : "text-muted-foreground/60"}`}>{action.desc}</p>
                  <ArrowRight size={12} className={`mt-3 group-hover:translate-x-1 transition-transform ${action.accent ? "text-background/30" : "text-muted-foreground/25"}`} />
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

---

## Analyzer — pages/Analyzer.jsx

```jsx
// … archivo completo …
// Se incluye íntegro para referencia
import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ArrowRight, ArrowLeft, Upload, X, CheckCircle2, CreditCard, Truck, Package, BarChart3, Building2, MapPin } from "lucide-react";
import { base44 } from "@/api/base44Client";
import DataIngestionStep from "@/components/analyzer/DataIngestionStep";
import { computeInfraScore, calculateSavings, getBenchmarks } from "@/lib/scoreEngine";

const STEPS = [
  { title: "Your brand", sub: "Tell us about your business so we can benchmark you accurately.", why: "Your geography and category determine the most relevant benchmarks.", icon: Building2 },
  { title: "Revenue & scale", sub: "Your revenue determines your infrastructure leverage and savings potential.", why: "Larger volume = more negotiation leverage in the network.", icon: BarChart3 },
  { title: "Sales channels", sub: "Different channels create different cost structures and opportunities.", why: "Channel mix affects which infrastructure costs matter most for you.", icon: Package },
  { title: "Payments", sub: "We compare your current payment costs against the network benchmark of 1.4%.", why: "Payment fees are often the single largest hidden infrastructure cost.", icon: CreditCard },
  { title: "Shipping", sub: "We benchmark your shipping rates against collective volume pricing.", why: "Network volume unlocks carrier rates unavailable to individual brands.", icon: Truck },
  { title: "SaaS & Tools", sub: "We identify redundant or overpriced tools against network group licenses.", why: "Brands typically overspend on SaaS by 30% — mostly on redundant tools.", icon: Package },
  { title: "Connect your data", sub: "Choose how you want to provide your infrastructure data for the most accurate analysis.", why: "More connected data = sharper benchmarks and larger identified savings.", icon: Upload },
];

const PAYMENT_PROVIDERS = ["Stripe", "Adyen", "Mollie", "PayPal", "Klarna", "Square", "Braintree", "Worldpay", "Checkout.com", "Shopify Payments"];
const SHIPPING_PROVIDERS = ["DHL", "UPS", "FedEx", "DPD", "PostNL", "Royal Mail", "Evri", "GLS", "Colissimo", "Chronopost"];
const CATEGORIES = ["Fashion", "Beauty", "Wellness", "Lifestyle", "Food & Beverage", "Home", "Tech", "Other"];

const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Argentina", "Armenia", "Australia", "Austria",
  "Azerbaijan", "Bahrain", "Bangladesh", "Belarus", "Belgium", "Bolivia", "Bosnia and Herzegovina",
  "Brazil", "Bulgaria", "Cambodia", "Canada", "Chile", "China", "Colombia", "Costa Rica", "Croatia",
  "Cyprus", "Czech Republic", "Denmark", "Dominican Republic", "Ecuador", "Egypt", "Estonia", "Ethiopia",
  "Finland", "France", "Georgia", "Germany", "Ghana", "Greece", "Guatemala", "Honduras", "Hong Kong",
  "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Japan",
  "Jordan", "Kazakhstan", "Kenya", "Kuwait", "Latvia", "Lebanon", "Lithuania", "Luxembourg", "Malaysia",
  "Malta", "Mexico", "Moldova", "Morocco", "Netherlands", "New Zealand", "Nigeria", "Norway", "Pakistan",
  "Panama", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia",
  "Saudi Arabia", "Serbia", "Singapore", "Slovakia", "Slovenia", "South Africa", "South Korea", "Spain",
  "Sri Lanka", "Sweden", "Switzerland", "Taiwan", "Thailand", "Tunisia", "Turkey", "Ukraine",
  "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Venezuela",
  "Vietnam", "Other",
];

export default function Analyzer() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [customPayment, setCustomPayment] = useState("");
  const [customShipping, setCustomShipping] = useState("");
  const [countryOpen, setCountryOpen] = useState(false);
  const fileRef = useRef(null);

  const [data, setData] = useState({
    brand_name: "", category: "", country: "",
    monthly_revenue: 50000, monthly_transactions: 500, avg_order_value: 100,
    dtc_pct: 60, marketplace_pct: 20, wholesale_pct: 15, retail_pct: 5,
    payment_provider: "", payment_fee_pct: 2.9,
    shipping_provider: "", monthly_shipping_cost: 3000, monthly_shipments: 400,
    total_saas_spend: 1500,
  });
  const navigate = useNavigate();
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));

  const handleUpload = async (file) => {
    setUploading(true);
    setUploadProgress(0);
    const interval = setInterval(() => setUploadProgress(p => Math.min(p + 15, 90)), 200);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    clearInterval(interval);
    setUploadProgress(100);
    setUploadedFile({ name: file.name, url: file_url });
    setUploading(false);
  };

  const run = async () => {
    setLoading(true);
    const provider = data.payment_provider === "Other" ? customPayment : data.payment_provider;
    const shipper = data.shipping_provider === "Other" ? customShipping : data.shipping_provider;

    const inputData = {
      monthly_revenue: data.monthly_revenue,
      payment_fee_pct: data.payment_fee_pct,
      monthly_shipping_cost: data.monthly_shipping_cost,
      monthly_shipments: data.monthly_shipments,
      total_saas_spend: data.total_saas_spend,
      country: data.country,
      payment_provider: provider,
      shipping_provider: shipper,
      dtc_pct: data.dtc_pct,
      marketplace_pct: data.marketplace_pct,
      wholesale_pct: data.wholesale_pct,
    };

    // Unified savings calculation (tier + geo aware)
    const savings = calculateSavings(inputData);
    const scoreReport = computeInfraScore(inputData, "manual");

    const input = await base44.entities.AnalyzerInput.create({
      monthly_revenue: data.monthly_revenue, monthly_transactions: data.monthly_transactions,
      avg_order_value: data.avg_order_value,
      channel_mix: { dtc_pct: data.dtc_pct, marketplace_pct: data.marketplace_pct, wholesale_pct: data.wholesale_pct, retail_pct: data.retail_pct },
      payment_provider: provider, payment_fee_pct: data.payment_fee_pct,
      shipping_provider: shipper, monthly_shipping_cost: data.monthly_shipping_cost,
      monthly_shipments: data.monthly_shipments, total_saas_spend: data.total_saas_spend,
    });
    const result = await base44.entities.AnalyzerResult.create({
      input_id: input.id,
      payment_savings: savings.paymentSavings,
      shipping_savings: savings.shippingSavings,
      saas_savings: savings.saasSavings,
      total_savings: savings.totalSavings,
      infra_score: scoreReport.total,
      payment_benchmark: savings.benchmarks.payment.rate,
      shipping_benchmark: savings.benchmarks.shipping.perUnit,
      saas_benchmark: savings.benchmarks.saas.pct,
      details: savings.details,
    });
    navigate(`/Results?id=${result.id}`);
  };

  const SliderField = ({ label, value, onChange, min, max, s = 1, fmt = v => v }) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium text-foreground">{label}</Label>
        <span className="text-lg font-black tabular-nums">{fmt(value)}</span>
      </div>
      <Slider value={[value]} onValueChange={v => onChange(v[0])} min={min} max={max} step={s} className="py-1" />
      <div className="flex justify-between text-[11px] text-muted-foreground/40">
        <span>{fmt(min)}</span><span>{fmt(max)}</span>
      </div>
    </div>
  );

  const ProviderGrid = ({ options, selected, onSelect, customValue, onCustomChange }) => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {options.map(p => (
          <button key={p} onClick={() => onSelect(p)}
            className={`py-3 px-4 rounded-xl border text-sm font-medium text-left transition-all min-h-[48px] ${selected === p ? "border-foreground bg-foreground text-background" : "border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground"}`}>
            {p}
          </button>
        ))}
        <button onClick={() => onSelect("Other")}
          className={`py-3 px-4 rounded-xl border text-sm font-medium text-left transition-all min-h-[48px] ${selected === "Other" ? "border-foreground bg-foreground text-background" : "border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground"}`}>
          Other
        </button>
      </div>
      {selected === "Other" && (
        <Input
          value={customValue}
          onChange={e => onCustomChange(e.target.value)}
          placeholder="Search or enter your provider"
          className="h-12 text-sm border-border/60"
          autoFocus
        />
      )}
    </div>
  );

  const renderStep = () => {
    switch (step) {
      case 0: return (
        <div className="space-y-6">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Brand name</Label>
            <Input
              value={data.brand_name}
              onChange={e => set("brand_name", e.target.value)}
              placeholder="Your brand name"
              className="h-12 text-sm border-border/60"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Country</Label>
            <div className="relative">
              <button
                onClick={() => setCountryOpen(v => !v)}
                className={`w-full h-12 px-3 rounded-md border text-sm text-left flex items-center justify-between transition-colors ${data.country ? "text-foreground" : "text-muted-foreground"} border-border/60 bg-transparent hover:border-foreground/30`}
              >
                <span className="flex items-center gap-2">
                  <MapPin size={14} className="text-muted-foreground/50 shrink-0" />
                  {data.country || "Select your country"}
                </span>
                <span className="text-muted-foreground/40 text-xs">▾</span>
              </button>
              {countryOpen && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl border border-border/60 bg-background shadow-lg overflow-hidden max-h-52 overflow-y-auto">
                  {COUNTRIES.map(c => (
                    <button
                      key={c}
                      onClick={() => { set("country", c); setCountryOpen(false); }}
                      className={`w-full px-4 py-2.5 text-sm text-left hover:bg-secondary transition-colors ${data.country === c ? "bg-secondary font-semibold" : ""}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground/50">Your geography affects shipping rates and payment setups.</p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Category</Label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map(c => (
                <button key={c} onClick={() => set("category", c)}
                  className={`py-3 px-4 rounded-xl border text-sm font-medium text-left transition-all min-h-[48px] ${data.category === c ? "border-foreground bg-foreground text-background" : "border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground"}`}>
                  {c}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground/50">We benchmark you against similar independent commerce brands.</p>
          </div>
        </div>
      );

      case 1: return (
        <div className="space-y-8">
          <SliderField
            label="Monthly revenue"
            value={data.monthly_revenue}
            onChange={v => set("monthly_revenue", v)}
            min={5000} max={500000} s={5000}
            fmt={v => `€${v.toLocaleString()}`}
          />
          <div className="p-4 rounded-xl bg-blue-500/[0.05] border border-blue-500/15 text-[12px] text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">Why this matters:</span> Your revenue determines your leverage. Brands above €500K/mo unlock the strongest network terms.
          </div>
          <SliderField
            label="Monthly transactions"
            value={data.monthly_transactions}
            onChange={v => set("monthly_transactions", v)}
            min={50} max={10000} s={50}
            fmt={v => v.toLocaleString()}
          />
          <SliderField
            label="Average order value"
            value={data.avg_order_value}
            onChange={v => set("avg_order_value", v)}
            min={10} max={500} s={5}
            fmt={v => `€${v}`}
          />
        </div>
      );

      case 2: return (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-secondary/50 border border-border/40 text-[12px] text-muted-foreground leading-relaxed">
            DTC-heavy brands typically save most on payments. Wholesale-heavy brands save most on shipping and logistics.
          </div>
          {[
            { k: "dtc_pct", l: "DTC / Website" },
            { k: "marketplace_pct", l: "Marketplaces (Amazon, etc.)" },
            { k: "wholesale_pct", l: "Wholesale / B2B" },
            { k: "retail_pct", l: "Retail / Physical" },
          ].map(c => (
            <SliderField key={c.k} label={c.l} value={data[c.k]} onChange={v => set(c.k, v)} min={0} max={100} s={5} fmt={v => `${v}%`} />
          ))}
        </div>
      );

      case 3: return (
        <div className="space-y-6">
          <div>
            <Label className="text-sm font-medium mb-3 block">Your payment provider</Label>
            <ProviderGrid
              options={PAYMENT_PROVIDERS}
              selected={data.payment_provider}
              onSelect={v => set("payment_provider", v)}
              customValue={customPayment}
              onCustomChange={setCustomPayment}
            />
          </div>
          <SliderField
            label="Current effective fee rate"
            value={data.payment_fee_pct}
            onChange={v => set("payment_fee_pct", v)}
            min={0.5} max={5} s={0.1}
            fmt={v => `${v.toFixed(1)}%`}
          />
          {(() => {
            const bm = getBenchmarks(data.monthly_revenue, data.country);
            const benchmark = bm.payment.rate;
            const annualSavings = Math.max(0, Math.round(data.monthly_revenue * 12 * ((data.payment_fee_pct - benchmark) / 100)));
            return (
              <div className="p-4 rounded-xl bg-blue-500/[0.06] border border-blue-500/15 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Your current rate</span>
                  <span className="font-bold tabular-nums">{data.payment_fee_pct.toFixed(1)}%</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Network target ({bm.tier} tier{bm.eu ? " · EU" : ""})</span>
                  <span className="font-bold text-blue-600 tabular-nums">{benchmark.toFixed(1)}%</span>
                </div>
                {data.payment_fee_pct > benchmark && (
                  <div className="pt-2 border-t border-blue-500/15 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Optimization potential</span>
                    <span className="font-black text-lg text-foreground tabular-nums">
                      €{annualSavings.toLocaleString()}/yr
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      );

      case 4: return (
        <div className="space-y-6">
          <div>
            <Label className="text-sm font-medium mb-3 block">Your shipping provider</Label>
            <ProviderGrid
              options={SHIPPING_PROVIDERS}
              selected={data.shipping_provider}
              onSelect={v => set("shipping_provider", v)}
              customValue={customShipping}
              onCustomChange={setCustomShipping}
            />
          </div>
          <SliderField
            label="Monthly shipping spend"
            value={data.monthly_shipping_cost}
            onChange={v => set("monthly_shipping_cost", v)}
            min={100} max={50000} s={100}
            fmt={v => `€${v.toLocaleString()}`}
          />
          <SliderField
            label="Monthly shipments"
            value={data.monthly_shipments}
            onChange={v => set("monthly_shipments", v)}
            min={10} max={10000} s={10}
            fmt={v => v.toLocaleString()}
          />
          {(() => {
            const bm = getBenchmarks(data.monthly_revenue, data.country);
            const costPerShipment = data.monthly_shipping_cost / Math.max(data.monthly_shipments, 1);
            const gap = Math.max(0, costPerShipment - bm.shipping.perUnit);
            const annualSaving = Math.round(gap * Math.max(data.monthly_shipments, 1) * 12);
            return (
              <div className="p-4 rounded-xl bg-secondary/50 border border-border/40 text-[12px] text-muted-foreground leading-relaxed space-y-1.5">
                <div className="flex justify-between">
                  <span>Your cost/shipment</span>
                  <span className="font-bold text-foreground">€{costPerShipment.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Network target ({bm.tier} tier{bm.eu ? " · EU" : ""})</span>
                  <span className="font-bold text-green-600">€{bm.shipping.perUnit.toFixed(2)}</span>
                </div>
                {annualSaving > 0 && (
                  <div className="flex justify-between border-t border-border/30 pt-1.5 mt-1.5">
                    <span>Optimization potential</span>
                    <span className="font-black text-foreground">€{annualSaving.toLocaleString()}/yr</span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      );

      case 5: return (
        <div className="space-y-6">
          <SliderField
            label="Total monthly SaaS spend"
            value={data.total_saas_spend}
            onChange={v => set("total_saas_spend", v)}
            min={0} max={10000} s={50}
            fmt={v => `€${v.toLocaleString()}`}
          />
          <div className="p-4 rounded-xl bg-secondary/50 border border-border/40 text-[12px] text-muted-foreground leading-relaxed">
            <strong className="text-foreground">What we check:</strong> E-commerce platforms (Shopify, etc.), email (Klaviyo, etc.), support (Gorgias, Zendesk), analytics, and more. Brands typically overspend by <strong className="text-foreground">30%</strong>.
          </div>
          {(() => {
            const bm = getBenchmarks(data.monthly_revenue, data.country);
            const saasRatio = data.monthly_revenue > 0 ? data.total_saas_spend / data.monthly_revenue : 0;
            const saasGap = Math.max(0, saasRatio - bm.saas.pct);
            const saving = Math.round(saasGap * data.monthly_revenue * 12);
            const optimal = Math.round(bm.saas.pct * data.monthly_revenue);
            return (
              <div className="p-4 rounded-xl bg-orange-500/[0.05] border border-orange-500/15 space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Your current spend</span>
                  <span className="font-bold tabular-nums">€{(data.total_saas_spend * 12).toLocaleString()}/yr</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Network benchmark ({bm.tier})</span>
                  <span className="font-bold text-muted-foreground/60 tabular-nums">€{(optimal * 12).toLocaleString()}/yr</span>
                </div>
                {saving > 0 && (
                  <div className="flex items-center justify-between text-sm border-t border-orange-500/15 pt-1.5">
                    <span className="text-muted-foreground">Optimization potential</span>
                    <span className="font-black text-orange-500 tabular-nums">€{saving.toLocaleString()}/yr</span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      );

      case 6: return (
        <DataIngestionStep
          uploadedFile={uploadedFile}
          setUploadedFile={setUploadedFile}
          uploading={uploading}
          uploadProgress={uploadProgress}
          fileRef={fileRef}
          handleUpload={handleUpload}
        />
      );

      default: return null;
    }
  };

  const canContinue = () => {
    if (step === 0) return data.brand_name.trim().length > 0;
    return true;
  };

  const StepIcon = STEPS[step].icon;
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="min-h-screen flex flex-col bg-background font-inter">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 z-50 h-[3px] bg-border/30">
        <div className="h-full bg-foreground transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      {/* Header */}
      <div className="sticky top-0 z-40 flex items-center justify-between px-5 py-4 border-b border-border/40 bg-background/98 backdrop-blur-xl">
        <span className="text-sm font-black tracking-tight">THE NoDE</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground/50 hidden sm:block">~2 minutes</span>
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-foreground" : i < step ? "w-1.5 bg-foreground/50" : "w-1.5 bg-border"}`}
              />
            ))}
          </div>
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">{step + 1}/{STEPS.length}</span>
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-5 py-8 pb-36">
          {/* Step header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                <StepIcon size={17} className="text-muted-foreground/60" />
              </div>
              <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 font-medium">
                Step {step + 1} of {STEPS.length}
              </p>
            </div>
            <h2 className="text-2xl font-black tracking-tight mb-2">{STEPS[step].title}</h2>
            <p className="text-sm text-muted-foreground">{STEPS[step].sub}</p>
          </div>

          {renderStep()}
        </div>
      </div>

      {/* Sticky bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between px-5 py-4 border-t border-border/40 bg-background/98 backdrop-blur-xl">
        <Button
          variant="ghost"
          onClick={() => step === 0 ? navigate("/") : setStep(s => s - 1)}
          className="h-12 rounded-full px-5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {step === 0 ? "Home" : "Back"}
        </Button>

        {step < STEPS.length - 1 ? (
          <Button
            onClick={() => setStep(s => s + 1)}
            className="h-12 rounded-full px-6 sm:px-8 text-sm font-bold shadow-sm gap-2"
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={run}
            disabled={loading}
            className="h-12 rounded-full px-8 text-sm font-bold shadow-sm gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-background/30 border-t-background animate-spin" />
                Analyzing...
              </>
            ) : (
              <>Run Analysis <ArrowRight className="h-4 w-4" /></>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
```

---

## Results — pages/Results.jsx

```jsx
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowRight, CreditCard, Truck, Package, TrendingDown, Zap,
  Shield, AlertTriangle, CheckCircle2, ChevronRight, Lock
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import AnimatedCounter from "@/components/shared/AnimatedCounter";
import ScoreCard from "@/components/results/ScoreCard";
import { computeInfraScore } from "@/lib/scoreEngine";
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";

/* ── static data ─────────────────────────────────────────────── */
const BREAKDOWN_META = [
  { key: "payment_savings", label: "Payments", icon: CreditCard, color: "#3b82f6", bg: "bg-blue-500/[0.06] border-blue-500/15", textColor: "text-blue-600",
    detail: r => r.details?.payment_current_rate
      ? `${r.details.payment_current_rate.toFixed(1)}% current → ${r.details.payment_optimal_rate?.toFixed(1) ?? "1.4"}% network target`
      : "Efficiency improvement available" },
  { key: "shipping_savings", label: "Shipping", icon: Truck, color: "#22c55e", bg: "bg-green-500/[0.06] border-green-500/15", textColor: "text-green-600",
    detail: r => r.details?.shipping_current_avg
      ? `€${r.details.shipping_current_avg.toFixed(2)}/shipment → €${r.details.shipping_optimal_avg?.toFixed(2) ?? "5.20"} collective rate`
      : "Volume-based cost reduction available" },
  { key: "saas_savings", label: "SaaS & Tools", icon: Package, color: "#f97316", bg: "bg-orange-500/[0.06] border-orange-500/15", textColor: "text-orange-500",
    detail: r => r.details?.saas_current_total
      ? `€${r.details.saas_current_total.toLocaleString()}/mo current → €${r.details.saas_optimal_total?.toLocaleString() ?? "—"} via group licenses`
      : "Stack consolidation efficiency available" },
];

const DEALS = [
  { title: "Network payment rate", desc: "1.4% effective fee — pre-negotiated at collective volume", saving: "Up to −52%", cat: "Payments", textColor: "text-blue-600", bg: "bg-blue-500/[0.05] border-blue-500/15" },
  { title: "Collective shipping contracts", desc: "Enterprise carrier rates without enterprise volume", saving: "−18% avg.", cat: "Shipping", textColor: "text-green-600", bg: "bg-green-500/[0.05] border-green-500/15" },
  { title: "SaaS group licenses", desc: "Shared contracts on Klaviyo, Gorgias, Shopify and more", saving: "Up to −30%", cat: "SaaS", textColor: "text-orange-500", bg: "bg-orange-500/[0.05] border-orange-500/15" },
];

const RECS = [
  { cat: "Payments", action: "Switch to network payment rate", saving: "Recover €X/yr", icon: CreditCard, points: 12 },
  { cat: "Shipping", action: "Access collective shipping contracts", saving: "−18% average cost", icon: Truck, points: 8 },
  { cat: "SaaS", action: "Consolidate tools via group licenses", saving: "Save up to 30%", icon: Package, points: 7 },
];

/* ── sub-components ──────────────────────────────────────────── */
function SectionLabel({ children }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="w-5 h-px bg-border" />
      <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/45 font-medium">{children}</p>
    </div>
  );
}

function AccuracyBadge({ isEstimated }) {
  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold ${
      isEstimated ? "bg-orange-500/[0.07] border-orange-500/20 text-orange-600" : "bg-green-500/[0.07] border-green-500/20 text-green-600"
    }`}>
      <div className={`w-1.5 h-1.5 rounded-full ${isEstimated ? "bg-orange-400" : "bg-green-500"}`} />
      {isEstimated ? "Estimated analysis" : "Real data connected"}
    </div>
  );
}

/* ── main ────────────────────────────────────────────────────── */
export default function Results() {
  const [result, setResult] = useState(null);
  const [input, setInput] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scoreReport, setScoreReport] = useState(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) { setLoading(false); return; }
    base44.entities.AnalyzerResult.filter({ id }).then(async res => {
      if (!res.length) { setLoading(false); return; }
      const r = res[0];
      setResult(r);
      if (r.input_id) {
        const inputs = await base44.entities.AnalyzerInput.filter({ id: r.input_id });
        if (inputs.length) {
          setInput(inputs[0]);
          setScoreReport(computeInfraScore(inputs[0], "manual"));
        }
      }
      setLoading(false);
    });
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="w-10 h-10 rounded-full border-2 border-border border-t-foreground animate-spin mx-auto" />
        <p className="text-sm text-muted-foreground">Computing your infrastructure score…</p>
      </div>
    </div>
  );

  if (!result) return (
    <div className="min-h-screen flex items-center justify-center bg-background px-5">
      <div className="text-center">
        <p className="text-muted-foreground mb-4 text-sm">No results found.</p>
        <Link to="/Analyzer"><Button variant="outline" className="rounded-full px-6 text-sm h-11">Run the Analyzer</Button></Link>
      </div>
    </div>
  );

  const score = scoreReport?.total ?? result.infra_score ?? 0;
  const scoreColor = scoreReport?.scoreColor ?? (score >= 80 ? "#22c55e" : score >= 60 ? "#f97316" : "#3b82f6");
  const scoreLabel = scoreReport?.label ?? (score >= 60 ? "Efficient" : score >= 40 ? "Optimization opportunity detected" : "High optimization potential");
  const isEstimated = !scoreReport || scoreReport.dataQuality === "manual";

  const chartData = BREAKDOWN_META.map(m => ({
    name: m.label, value: result[m.key] || 0, fill: m.color,
  }));

  const recs = scoreReport?.impacts?.length
    ? scoreReport.impacts.map((imp, i) => ({ ...RECS[i] ?? RECS[0], action: imp.action, points: imp.pointsGain, cat: imp.category }))
    : RECS.map(r => ({ ...r, saving: r.saving.replace("€X", `€${Math.round((result.total_savings || 0) / 3).toLocaleString()}`) }));

  return (
    <div className="min-h-screen bg-background font-inter">

      {/* ── Sticky top bar ── */}
      <div className="sticky top-0 z-20 border-b border-border/40 px-5 py-3.5 flex items-center justify-between bg-background/97 backdrop-blur-2xl">
        <Link to="/" className="text-sm font-black tracking-tight">THE NoDE</Link>
        <div className="flex items-center gap-2">
          <Link to="/Reports">
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground rounded-full px-3 hidden sm:flex">History</Button>
          </Link>
          <Link to="/ConnectTools">
            <Button variant="outline" size="sm" className="h-8 text-xs rounded-full px-3 border-border/60 gap-1.5">
              <Zap size={11} /> Connect tools
            </Button>
          </Link>
          <Link to="/Dashboard">
            <Button size="sm" className="h-8 rounded-full text-xs px-4 font-semibold">Dashboard</Button>
          </Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 py-10 pb-24 space-y-12">

        {/* ═══ 1. MAIN RESULT ═══════════════════════════════════════ */}
        <div className="text-center">
          <p className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground/40 mb-5">Infrastructure analysis complete</p>

          {/* Accuracy badge */}
          <div className="flex justify-center mb-5">
            <AccuracyBadge isEstimated={isEstimated} />
          </div>

          <p className="text-sm text-muted-foreground mb-3">Optimization potential identified across your infrastructure</p>

          {/* THE BIG NUMBER */}
          <div className="text-[clamp(5rem,18vw,10rem)] font-black tracking-[-0.055em] leading-none mb-2">
            <AnimatedCounter value={result.total_savings} prefix="€" duration={2} />
          </div>
          <p className="text-muted-foreground/50 text-base mb-2">per year across your infrastructure</p>
          <p className="text-muted-foreground/35 text-sm mb-7">Value currently left unoptimized. Most brands your size improve this within the first cycle.</p>

          {/* Score pill */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <div className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-border/50 bg-card">
              <Shield size={12} className="text-muted-foreground/35" />
              <span className="text-sm font-bold">Infrastructure Score</span>
              <span className="text-sm font-black tabular-nums" style={{ color: scoreColor }}>{score}/100</span>
              <span className="text-xs text-muted-foreground/40">· {scoreLabel}</span>
            </div>
          </div>
        </div>

        {/* ═══ 2. ACCURACY NOTICE ══════════════════════════════════ */}
        {isEstimated && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-5 rounded-2xl border border-orange-500/20 bg-orange-500/[0.04]">
            <AlertTriangle size={16} className="text-orange-500 shrink-0 mt-0.5 sm:mt-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold">Using estimated data</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">This analysis uses your manual inputs. Connect your tools or upload statements to unlock precise, verified savings figures.</p>
              <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground/40">
                <span>🔒 Encrypted</span>
                <span>👁 Read-only access</span>
                <span>🚫 Never shared</span>
              </div>
            </div>
            <Link to="/ConnectTools" className="shrink-0">
              <button className="h-9 px-4 rounded-full bg-foreground text-background text-xs font-bold flex items-center gap-1.5 whitespace-nowrap">
                <Zap size={11} /> Connect your data
              </button>
            </Link>
          </div>
        )}

        {/* ═══ 3. INFRASTRUCTURE SCORE ══════════════════════════════ */}
        <div>
          <SectionLabel>Infrastructure score</SectionLabel>
          {scoreReport ? (
            <ScoreCard scoreReport={scoreReport} />
          ) : (
            <div className="p-7 rounded-2xl border border-border/50 bg-card flex items-center gap-6">
              <div className="relative w-20 h-20 shrink-0">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
                  <circle cx="40" cy="40" r="34" fill="none" stroke={scoreColor} strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 34} strokeDashoffset={2 * Math.PI * 34 * (1 - score / 100)}
                    style={{ transition: "stroke-dashoffset 1.5s ease-out" }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-black" style={{ color: scoreColor }}>{score}</span>
                  <span className="text-[9px] text-muted-foreground/40">/100</span>
                </div>
              </div>
              <div>
                <p className="font-bold text-xl mb-1">{scoreLabel}</p>
                <p className="text-sm text-muted-foreground">Connect your tools to unlock a precise multi-dimensional score.</p>
              </div>
            </div>
          )}
        </div>

        {/* ═══ 4. TOP SAVINGS OPPORTUNITIES ════════════════════════ */}
        <div>
          <SectionLabel>Top savings opportunities</SectionLabel>

          {/* Visual bar chart */}
          <div className="mb-4 p-5 rounded-2xl border border-border/50 bg-card">
            <p className="text-[10px] text-muted-foreground/40 uppercase tracking-[0.15em] mb-4">Annual savings by category</p>
            <ResponsiveContainer width="100%" height={90}>
              <BarChart data={chartData} barSize={32} barGap={8}>
                <XAxis dataKey="name" axisLine={false} tickLine={false}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", opacity: 0.6 }} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: "1px solid hsl(var(--border))", fontSize: 11, background: "hsl(var(--card))" }}
                  formatter={v => [`€${v?.toLocaleString()}`, "Savings/yr"]}
                  cursor={{ fill: "hsl(var(--secondary))", radius: 6 }}
                />
                <Bar dataKey="value" radius={[5, 5, 0, 0]}>
                  {chartData.map((entry, i) => <Cell key={i} fill={entry.fill} fillOpacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Cards */}
          <div className="space-y-2.5">
            {BREAKDOWN_META.map(item => (
              <div key={item.key} className={`flex items-center gap-4 p-5 rounded-xl border ${item.bg}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${item.bg}`}>
                  <item.icon size={15} className={item.textColor} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className="text-[11px] text-muted-foreground/50">{item.detail(result)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-2xl font-black tabular-nums ${item.textColor}`}>
                    €{(result[item.key] || 0).toLocaleString()}
                  </p>
                  <p className="text-[10px] text-muted-foreground/40">/year</p>
                </div>
              </div>
            ))}

            {/* Total row */}
            <div className="flex items-center justify-between p-5 rounded-xl bg-foreground text-background">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] opacity-35 mb-0.5">Total annual potential</p>
                <p className="text-2xl font-black tracking-tight tabular-nums">
                  €{(result.total_savings || 0).toLocaleString()}
                  <span className="text-base font-normal opacity-35 ml-1">/yr</span>
                </p>
              </div>
              <TrendingDown size={22} className="opacity-15" />
            </div>
          </div>
        </div>

        {/* ═══ 5. BENCHMARK COMPARISON ══════════════════════════════ */}
        <div>
          <SectionLabel>Benchmark comparison</SectionLabel>
          <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
            <div className="grid grid-cols-4 px-6 py-2.5 bg-secondary/50 border-b border-border/30">
              {["Metric", "Yours", "Network avg", "Gap"].map((h, i) => (
                <span key={i} className={`text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 ${i > 0 ? "text-center" : ""} ${i === 3 ? "text-right" : ""}`}>{h}</span>
              ))}
            </div>
            {[
              {
                metric: "Payment fee", bad: (result.details?.payment_current_rate ?? 2.9) > (result.details?.payment_optimal_rate ?? 1.4),
                yours: `${(result.details?.payment_current_rate ?? 2.9).toFixed(1)}%`,
                network: `${(result.details?.payment_optimal_rate ?? 1.4).toFixed(1)}%`,
                gap: result.details?.payment_current_rate && result.details?.payment_optimal_rate
                  ? `−${(result.details.payment_current_rate - result.details.payment_optimal_rate).toFixed(1)}%`
                  : "Potential gap",
              },
              {
                metric: "Cost/shipment", bad: (result.details?.shipping_current_avg ?? 7.5) > (result.details?.shipping_optimal_avg ?? 5.2),
                yours: `€${(result.details?.shipping_current_avg ?? 7.5).toFixed(2)}`,
                network: `€${(result.details?.shipping_optimal_avg ?? 5.2).toFixed(2)}`,
                gap: result.details?.shipping_current_avg && result.details?.shipping_optimal_avg
                  ? `−€${(result.details.shipping_current_avg - result.details.shipping_optimal_avg).toFixed(2)}`
                  : "Potential gap",
              },
              {
                metric: "SaaS / revenue", bad: true,
                yours: input?.monthly_revenue ? `${((input.total_saas_spend / input.monthly_revenue) * 100).toFixed(1)}%` : "~5%",
                network: result.details?.saas_optimal_total && input?.monthly_revenue
                  ? `${((result.details.saas_optimal_total / input.monthly_revenue) * 100).toFixed(1)}%`
                  : "2.5%",
                gap: "Efficiency gap",
              },
              {
                metric: "Infrastructure score", bad: score < 72,
                yours: `${score}/100`, network: "72/100",
                gap: score >= 72 ? "Above avg ↑" : `−${72 - score} pts`,
              },
            ].map((row, i) => (
              <div key={i} className="grid grid-cols-4 px-6 py-4 border-b border-border/15 last:border-0 items-center">
                <span className="text-xs text-muted-foreground/60">{row.metric}</span>
                <span className="text-xs font-bold tabular-nums text-center">{row.yours}</span>
                <span className="text-xs text-muted-foreground/35 tabular-nums text-center">{row.network}</span>
                <span className={`text-xs font-bold text-right tabular-nums ${row.bad ? "text-orange-500" : "text-green-600"}`}>{row.gap}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ 6. RECOMMENDATIONS ══════════════════════════════════ */}
        <div>
          <SectionLabel>Recommended actions</SectionLabel>
          <div className="space-y-2">
            {recs.map((item, i) => (
              <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-card hover:border-border transition-colors group">
                <div className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                  <item.icon size={13} className="text-muted-foreground/50" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground/40 mb-0.5">{item.cat}</p>
                  <p className="text-sm font-semibold">{item.action}</p>
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <p className="text-xs font-semibold text-green-600">{item.saving}</p>
                  <p className="text-[10px] font-bold text-green-600/60 bg-green-500/[0.07] border border-green-500/15 px-2 py-0.5 rounded-full">
                    +{item.points} pts
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ 7. DEALS ════════════════════════════════════════════ */}
        <div>
          <SectionLabel>Available deals via THE NoDE</SectionLabel>
          <div className="space-y-3">
            {DEALS.map((deal, i) => (
              <div key={i} className={`p-5 rounded-xl border flex items-center gap-4 ${deal.bg}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-sm font-semibold">{deal.title}</p>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full bg-background/70 ${deal.textColor}`}>{deal.cat}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground/55">{deal.desc}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-base font-black ${deal.textColor} mb-1`}>{deal.saving}</p>
                  <Link to="/Deals">
                    <button className={`text-[11px] font-bold flex items-center justify-end gap-1 px-3 py-1.5 rounded-full border ${deal.bg} ${deal.textColor} hover:opacity-80 transition-opacity`}>
                      Unlock <ArrowRight size={9} />
                    </button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ ACCURACY FOOTER ══════════════════════════════════════ */}
        <div className="p-6 rounded-2xl border border-border/40 bg-secondary/15">
          <div className="flex items-start gap-3 mb-4">
            <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${isEstimated ? "bg-orange-400" : "bg-green-500"}`} />
            <div>
              <p className="text-sm font-semibold">{scoreReport?.accuracyLabel ?? "Estimated — connect tools to refine"}</p>
              <p className="text-xs text-muted-foreground/55 mt-1 leading-relaxed">
                This report uses manual inputs. Connect your tools or upload statements to unlock a verified Infrastructure Score with precise savings figures.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/ConnectTools">
              <button className="h-9 px-4 rounded-full bg-foreground text-background text-xs font-bold flex items-center gap-1.5">
                <Zap size={11} /> Connect your data
              </button>
            </Link>
            <Link to="/Analyzer">
              <button className="h-9 px-4 rounded-full border border-border/60 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                Re-run analysis
              </button>
            </Link>
          </div>
        </div>

        {/* ═══ FINAL CTA ═══════════════════════════════════════════ */}
        <div className="text-center pt-2">
          <h3 className="text-2xl font-black tracking-[-0.03em] mb-2">Ready to recover this?</h3>
          <p className="text-muted-foreground text-sm mb-7 max-w-sm mx-auto">
            Join THE NoDE network and start fixing your infrastructure today.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/Onboarding" className="w-full sm:w-auto">
              <Button size="lg" className="w-full rounded-full px-10 text-sm font-bold gap-2 shadow-sm">
                Join THE NoDE <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/Deals" className="w-full sm:w-auto">
              <Button variant="outline" size="lg" className="w-full rounded-full px-10 text-sm border-border/60">
                Activate deals
              </Button>
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
```

---

## Estilos — index.css (utilidades añadidas)

```css
/* SaaS gradient + glass */
.bg-saas-gradient { background: linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%); }
.text-saas-gradient { background: linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.glass { background: hsl(var(--card) / 0.6); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid hsl(var(--border) / 0.6); }
```

> Rutas de referencia:
> - Landing: `src/pages/Landing.jsx` compone todas las secciones anteriores.
> - Dashboard: `src/pages/Dashboard.jsx`
> - Analyzer: `src/pages/Analyzer.jsx`
> - Results: `src/pages/Results.jsx`
> - Navbar/Hero: `src/components/landing/`
> - Estilos: `src/index.css