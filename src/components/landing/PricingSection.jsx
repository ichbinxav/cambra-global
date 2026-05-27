import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, Zap } from "lucide-react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const INCLUDED = [
  "Full infrastructure audit (all methods)",
  "Benchmark intelligence across all categories",
  "AI Copilot — ongoing infrastructure assistant",
  "Margin leakage visualization",
  "Optimization roadmap",
  "Continuous monitoring",
  "Document vault",
  "Priority recommendations",
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
            <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/40 mb-4">Pricing</p>
            <h2 className="text-[clamp(2.2rem,5vw,4rem)] font-black tracking-[-0.04em] leading-[0.88] mb-5">
              Free to audit.<br />You pay only on results.
            </h2>
            <p className="text-muted-foreground/65 text-base leading-relaxed mb-8 max-w-sm">
              The infrastructure audit is completely free. CAMBRA takes a 25% success fee on verified margin recovery — only when we deliver.
            </p>

            {/* Impact block */}
            <div className="space-y-3">
              <div className="p-5 rounded-2xl border border-border/40 bg-card">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/35 mb-2">Average audit finding</p>
                <p className="text-4xl font-black tracking-tight">€29,000<span className="text-base font-normal text-muted-foreground/50">/yr</span></p>
                <p className="text-[11px] text-muted-foreground/35 mt-1">Recoverable margin identified per business audited.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Payments", val: "−45%", color: "#635BFF" },
                  { label: "Logistics", val: "−18%", color: "#06B6D4" },
                  { label: "SaaS", val: "−30%", color: "#8B5CF6" },
                  { label: "Banking", val: "−22%", color: "#F97316" },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="p-3.5 rounded-xl border text-center"
                    style={{ background: `${item.color}08`, borderColor: `${item.color}20` }}
                  >
                    <p className="text-xl font-black" style={{ color: item.color }}>{item.val}</p>
                    <p className="text-[10px] text-muted-foreground/45 mt-0.5">{item.label}</p>
                  </div>
                ))}
              </div>
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
                <span className="text-[10px] font-bold tracking-[0.14em] uppercase opacity-40">CAMBRA · Infrastructure Intelligence</span>
              </div>
              <div className="flex items-baseline gap-3 mb-2">
                <span className="text-xl font-light opacity-25 line-through">€60/mo</span>
                <span className="text-5xl font-black">Free</span>
              </div>
              <p className="text-sm opacity-40 leading-relaxed">25% success fee on verified margin recovery. If CAMBRA doesn't find recoverable margin, you pay nothing.</p>
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
                  Start your free audit <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <p className="text-[10px] text-muted-foreground/30 text-center mt-3">
                Takes less than 3 minutes · No credit card required
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}