import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import BrandGlyph from "@/components/shared/BrandGlyph";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export default function OnboardingHero() {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-card">
      {/* Ambient visuals */}
      <div className="absolute -top-24 -left-24 w-[30rem] h-[30rem] rounded-full blur-3xl bg-ambient-lilac opacity-[0.35] pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-[26rem] h-[26rem] rounded-full blur-3xl bg-ambient-mint opacity-[0.35] pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none dot-grid opacity-50" />

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6 p-6 lg:p-10">
        {/* Left copy */}
        <div className="flex flex-col justify-center text-center lg:text-left">
          <div className="inline-flex items-center gap-2 self-center lg:self-start mb-4 px-3 py-1.5 rounded-full border border-border/50 bg-background/70">
            <span className="w-1.5 h-1.5 rounded-full bg-chart-2" />
            <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground/70">Onboarding · 3 steps</span>
          </div>

          <h1 className="text-[clamp(2rem,5vw,3.2rem)] font-black tracking-[-0.04em] leading-[0.95]">
            Let's start unlocking your savings.
          </h1>
          <p className="text-sm text-muted-foreground/70 mt-3 max-w-xl mx-auto lg:mx-0">
            Run the Analyzer, connect your data, and complete your brand profile. It takes a few minutes and you'll get a clear, actionable report.
          </p>

          <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:justify-center lg:justify-start">
            <Link to="/Analyzer">
              <Button className="h-11 rounded-full px-6 text-sm font-bold bg-saas-gradient text-white shadow-lg ring-1 ring-white/10">
                Run Analyzer <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/ConnectTools">
              <Button variant="outline" className="h-11 rounded-full px-6 text-sm">
                Connect data
              </Button>
            </Link>
          </div>
        </div>

        {/* Right visual */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BrandGlyph className="h-6 w-6" />
              <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground/60">Progress</span>
            </div>
            <span className="text-[10px] text-muted-foreground/40">Visual preview</span>
          </div>

          {/* Faux progress tiles */}
          <div className="grid grid-cols-3 gap-2">
            {[{label:'Analyzer', color:'text-cambra-lilac', bg:'bg-cambra-lilac-soft border-cambra-lilac'}, {label:'Data', color:'text-cambra-mint', bg:'bg-cambra-mint-soft border-cambra-mint'}, {label:'Profile', color:'text-cambra-plum', bg:'bg-cambra-plum-soft border-cambra-plum'}].map((t, i)=> (
              <motion.div
                key={t.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.1 }}
                className={`p-4 rounded-xl border ${t.bg}`}
              >
                <p className="text-xs text-muted-foreground/50 mb-1">Step {i+1}</p>
                <p className={`text-sm font-semibold ${t.color}`}>{t.label}</p>
              </motion.div>
            ))}
          </div>

          {/* Gauge */}
          <div className="mt-5 flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-secondary/30">
            <div className="relative w-14 h-14 shrink-0">
              <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="22" fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
                <motion.circle
                  cx="28" cy="28" r="22" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"
                  className="text-chart-2"
                  strokeDasharray={2 * Math.PI * 22}
                  initial={{ strokeDashoffset: 2 * Math.PI * 22 }}
                  animate={{ strokeDashoffset: 2 * Math.PI * 22 * 0.45 }}
                  transition={{ duration: 1, delay: 0.2 }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-black text-chart-2">45%</span>
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-none">Complete your onboarding</p>
              <p className="text-[11px] text-muted-foreground/60 mt-1">Finish the 3 steps to unlock the verified report.</p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}