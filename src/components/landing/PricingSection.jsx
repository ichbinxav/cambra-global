import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, Zap } from "lucide-react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const INCLUDED = [
  "8 cost layers monitored continuously",
  "Peer medians at your tier & geography",
  "Live drift detection",
  "Business insights & benchmarks",
  "Recoverable margin, quantified",
  "Document vault & evidence trail",
  "Provider migration support",
];

export default function PricingSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-14 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto" ref={ref}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          {/* Left */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center gap-2 mb-5 w-fit px-3 py-1.5 rounded-full border border-border/60 bg-background/70 backdrop-blur-sm">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-cambra-lilac opacity-75" style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-lilac" />
              </span>
              <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground">Pricing · Aligned incentives</span>
            </div>
            <h2 className="text-[clamp(2.2rem,5vw,4rem)] font-black tracking-[-0.04em] leading-[0.88] mb-5">
              <span className="text-saas-gradient">Aligned</span> with your margin.
            </h2>
            <p className="text-muted-foreground/65 text-base leading-relaxed mb-8 max-w-sm">
              Run an audit free. CAMBRA watches continuously. We take a cut of margin we recover — align incentives.
            </p>

            {/* Recovery brackets — realistic, not exaggerated */}
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/40 mb-3 font-mono">Typical annual recovery</p>
              <div className="rounded-xl border border-border/40 bg-card overflow-hidden divide-y divide-border/40">
                {[
                  { tier: "€500K – €1M",  range: "€4K – €12K"  },
                  { tier: "€1M – €5M",    range: "€15K – €35K" },
                  { tier: "€5M – €20M",   range: "€40K – €120K"},
                  { tier: "€20M+",        range: "€100K+"      },
                ].map((b, i) => (
                  <div key={i} className="px-4 py-3 flex items-center justify-between">
                    <span className="text-sm text-foreground/70 font-mono">{b.tier}</span>
                    <span className="text-sm font-bold tabular-nums">{b.range}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground/40 mt-2 font-mono">
                Net of CAMBRA's success fee. Aligned incentives.
              </p>
            </div>
          </motion.div>

          {/* Right — pricing card */}
          <motion.div
            initial={{ opacity: 0, x: 30, y: 10 }}
            animate={inView ? { opacity: 1, x: 0, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="cambra-card overflow-hidden"
          >
            {/* Card header */}
            <div className="px-7 py-6 border-b border-white/10">
              <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full border border-white/15 bg-white/[0.04] backdrop-blur-sm">
                <Zap className="h-3 w-3 text-white/60" />
                <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-white/60">CAMBRA · Engine</span>
              </div>
              <div className="flex items-baseline gap-3 mb-2">
                <span 
                  className="text-5xl font-black"
                  style={{
                    background: "linear-gradient(135deg, #1F4ED8 0%, #2CA7C1 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text"
                  }}
                >
                  €0
                </span>
                <span className="text-sm text-white/60">/ audit · / monitoring</span>
              </div>
              <p className="text-xs text-white/50 italic mb-2">
                <span className="line-through">€60</span> for early brand partners
              </p>
              <p className="text-sm text-white/65 leading-relaxed">Success fee on verified margin recovery only. No subscription.</p>
            </div>

            {/* What's included */}
            <div className="px-7 py-6 space-y-2.5">
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/50 mb-3">Everything included</p>
              {INCLUDED.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={inView ? { opacity: 1, x: 0 } : {}}
                  transition={{ delay: 0.3 + i * 0.04 }}
                  className="flex items-center gap-2.5"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-cambra-cyan shrink-0" />
                  <span className="text-sm text-white/75">{item}</span>
                </motion.div>
              ))}
            </div>

            {/* CTA */}
            <div className="px-7 pb-7">
              <Link to="/Pricing">
                <Button className="w-full h-12 rounded-xl text-sm font-bold gap-2 bg-white text-neon-1 hover:bg-white/90">
                  Discover pricing <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <p className="text-[10px] text-white/40 text-center mt-3 font-mono">
                ~3 min · No card · Monitoring included
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}