import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TrendingDown, Zap, Building2, ArrowRight, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";

export default function StepGrid({ statuses }) {
  const anyVerticalTouched = statuses
    ? Object.values(statuses).some((s) => (s?.completeness || 0) > 0)
    : false;

  const steps = [
    {
      step: 1,
      title: "Tell us about your brand",
      done: anyVerticalTouched,
      icon: Building2,
      tone: "#7AA8FF",
      desc: "Name, country, category.",
      cta: (
        <Link to="/BrandProfile" className="w-full">
          <Button className="w-full h-10 rounded-xl gap-1.5 bg-card text-[#06080F] hover:bg-white/90 font-semibold">
            Open profile <ArrowRight size={14} />
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
      tone: "#52EBA4",
      cta: (
        <Link to="/Analyzer" className="w-full">
          <Button className="w-full h-10 rounded-xl gap-1.5 bg-card text-[#06080F] hover:bg-white/90 font-semibold">
            Run the analyzer <ArrowRight size={14} />
          </Button>
        </Link>
      ),
    },
    {
      step: 3,
      title: "Connect your tools",
      done: false,
      desc: "Precision and automatic verification.",
      icon: Zap,
      tone: "#7BD9F0",
      cta: (
        <Link to="/ConnectTools" className="w-full">
          <Button className="w-full h-10 rounded-xl gap-1.5 bg-white/10 text-white border border-white/15 hover:bg-white/15 font-semibold">
            Connect tools <ArrowRight size={14} />
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
          className="cambra-card p-5"
        >
          <div
            className="pointer-events-none absolute -top-14 -right-14 w-36 h-36 rounded-full blur-3xl opacity-50"
            style={{ background: `radial-gradient(closest-side, ${s.tone}55, transparent)`, zIndex: 0 }}
          />
          {s.done && (
            <span className="absolute top-3 right-3 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#52EBA4]/15 border border-[#52EBA4]/35 text-[9px] font-bold text-[#52EBA4]">
              <CheckCircle2 className="w-2.5 h-2.5" /> DONE
            </span>
          )}
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <s.icon size={14} style={{ color: s.tone }} />
                <p className="text-sm font-semibold text-white">{s.title}</p>
              </div>
              {!s.done && (
                <span className="text-[10px] font-bold tracking-[0.15em] text-white/45 uppercase">Step {s.step}</span>
              )}
            </div>
            {s.desc && <p className="text-xs text-white/65 mb-3">{s.desc}</p>}
            {s.cta}
          </div>
        </motion.div>
      ))}
    </div>
  );
}