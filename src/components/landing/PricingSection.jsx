import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, Zap } from "lucide-react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const INCLUDED = [
  "8 cost layers monitored continuously",
  "Peer medians at your tier & geography",
  "Live drift detection",
  "Quiet operational assistant",
  "Recoverable margin, quantified",
  "Document vault & evidence trail",
  "Provider migration support",
];

export default function PricingSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-16 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto" ref={ref}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          {/* Left */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/40 mb-4 font-mono">Pricing · Aligned incentives</p>
            <h2 className="text-[clamp(2.2rem,5vw,4rem)] font-black tracking-[-0.04em] leading-[0.88] mb-5">
              Aligned with your margin.
            </h2>
            <p className="text-muted-foreground/65 text-base leading-relaxed mb-8 max-w-sm">
              Run an audit free. CAMBRA watches continuously. We take a cut of margin we recover — align incentives.
            </p>

            {/* Typical findings */}
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/40 mb-2 font-mono">Typical findings · €1–5M tier</p>
              {[
                { label: "PSP effective rate", val: "0.6pp drift", color: "#635BFF" },
                { label: "Shipping per order", val: "€0.80 above peer", color: "#06B6D4" },
                { label: "SaaS overlap", val: "2 redundant tools", color: "#8B5CF6" },
                { label: "TPE all-in", val: "0.4pp drift", color: "#F97316" },
                { label: "FX spread", val: "0.7pp drift", color: "#10B981" },
              ].map((item, i) => (
                <div
                  key={i}
                  className="px-4 py-3 rounded-xl border border-border/40 bg-card flex items-center justify-between"
                >
                  <span className="text-sm font-medium text-foreground/80">{item.label}</span>
                  <span className="text-xs font-mono tabular-nums font-bold" style={{ color: item.color }}>{item.val}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right — pricing card */}
          <motion.div
            initial={{ opacity: 0, x: 30, y: 10 }}
            animate={inView ? { opacity: 1, x: 0, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl border border-border/50 bg-card overflow-hidden shadow-lg"
          >
            {/* Card header */}
            <div className="px-7 py-6 border-b border-border/40 bg-foreground text-background">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="h-3.5 w-3.5 opacity-40" />
                <span className="text-[10px] font-bold tracking-[0.14em] uppercase opacity-40">CAMBRA · Engine</span>
              </div>
              <div className="flex items-baseline gap-3 mb-2">
                <span className="text-5xl font-black">€0</span>
                <span className="text-sm opacity-40">/ audit · / monitoring</span>
              </div>
              <p className="text-sm opacity-40 leading-relaxed">Success fee on verified margin recovery only. No subscription. No procurement contracts.</p>
            </div>

            {/* What's included */}
            <div className="px-7 py-6 space-y-2.5">
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/35 mb-3">Everything included</p>
              {INCLUDED.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={inView ? { opacity: 1, x: 0 } : {}}
                  transition={{ delay: 0.3 + i * 0.04 }}
                  className="flex items-center gap-2.5"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  <span className="text-sm text-foreground/70">{item}</span>
                </motion.div>
              ))}
            </div>

            {/* CTA */}
            <div className="px-7 pb-7">
              <Link to="/Analyzer">
                <Button className="w-full h-12 rounded-xl text-sm font-bold gap-2 bg-foreground text-background hover:opacity-90">
                  Run audit <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <p className="text-[10px] text-muted-foreground/30 text-center mt-3 font-mono">
                ~3 min · No card · Monitoring included
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}