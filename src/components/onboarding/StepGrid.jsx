import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TrendingDown, Zap, Building2, ArrowRight, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";

export default function StepGrid({ statuses }) {
  // Heuristics: brand step considered done if any vertical reports completeness, analyzer done if payments touched, connect done if any integration present
  const anyVerticalTouched = statuses
    ? Object.values(statuses).some((s) => (s?.completeness || 0) > 0)
    : false;

  const steps = [
    {
      step: 1,
      title: "Tell us about your brand",
      done: anyVerticalTouched, // proxy: if onboarding has any data, brand exists
      icon: Building2,
      color: "text-cambra-plum",
      bg: "bg-cambra-plum-soft border-cambra-plum",
      cta: (
        <Link to="/BrandProfile" className="w-full">
          <Button className="w-full h-auto rounded-xl px-4 py-3 text-left flex items-start justify-between gap-3">
            <span>
              <span className="block text-sm font-semibold">Tell us about your brand</span>
              <span className="block text-[11px] text-muted-foreground/75">Name, country, category</span>
            </span>
            <ArrowRight size={14} />
          </Button>
        </Link>
      ),
    },
    {
      step: 2,
      title: "Run the analyzer",
      done: (statuses?.payments?.completeness || 0) >= 50,
      desc: "Get your savings potential in 2 minutes.",
      icon: TrendingDown,
      color: "text-cambra-lilac",
      bg: "bg-cambra-lilac-soft border-cambra-lilac",
      cta: (
        <Link to="/Analyzer" className="w-full">
          <Button className="w-full h-10 rounded-xl gap-1.5">
            Run the analyzer <ArrowRight size={14} />
          </Button>
        </Link>
      ),
    },
    {
      step: 3,
      title: "Connect your tools",
      done: false, // requires integration tracking
      desc: "Precision and automatic verification.",
      icon: Zap,
      color: "text-cambra-mint",
      bg: "bg-cambra-mint-soft border-cambra-mint",
      cta: (
        <Link to="/ConnectTools" className="w-full">
          <Button variant="outline" className="w-full h-10 rounded-xl gap-1.5">
            Connect your tools <ArrowRight size={14} />
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {steps.map((s, i) => (
        <motion.div
          key={s.title}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: i * 0.08 }}
          className={`relative p-5 rounded-2xl border ${s.bg} ${s.done ? "opacity-95" : ""}`}
        >
          {s.done && (
            <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/30 text-[9px] font-bold text-green-600">
              <CheckCircle2 className="w-2.5 h-2.5" /> DONE
            </span>
          )}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <s.icon size={14} className={s.color} />
              <p className="text-sm font-semibold">{s.title}</p>
            </div>
            {!s.done && (
              <span className="text-[10px] font-bold tracking-[0.15em] text-muted-foreground/60 uppercase">Step {s.step}</span>
            )}
          </div>
          {s.desc && <p className="text-xs text-muted-foreground mb-3">{s.desc}</p>}
          {s.cta}
        </motion.div>
      ))}
    </div>
  );
}