import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, CreditCard, Truck, Package } from "lucide-react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";

const rows = [
  { icon: CreditCard, label: "Payment fees", current: "2.9%", network: "1.4%", saving: "€8,400/yr", color: "text-cambra-lilac" },
  { icon: Truck, label: "Shipping rates", current: "Base retail", network: "−18%", saving: "€5,200/yr", color: "text-cambra-mint" },
  { icon: Package, label: "SaaS stack", current: "€2,500/mo", network: "€1,750/mo", saving: "€9,000/yr", color: "text-cambra-plum" },
];

export default function AnalyzerCTA() {
  const { isAuthenticated } = useAuth();
  const leftRef = useRef(null);
  const leftInView = useInView(leftRef, { once: true, margin: "-80px" });
  const rightRef = useRef(null);
  const rightInView = useInView(rightRef, { once: true, margin: "-80px" });

  return (
    <section className="py-10 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          <motion.div
            ref={leftRef}
            className="text-center lg:text-left"
            initial={{ opacity: 0, x: -50 }}
            animate={leftInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/60 mb-5 flex items-center justify-center lg:justify-start gap-2">
              <span className="w-4 h-px bg-border inline-block" /> Infrastructure Analyzer
            </p>
            <h2 className="text-[clamp(2rem,5vw,4rem)] font-black tracking-[-0.04em] leading-[0.9] mb-6 text-center lg:text-left">
              Identify exactly where<br />value is left unoptimized.
            </h2>
            <p className="text-muted-foreground leading-relaxed text-base mb-8 max-w-sm mx-auto text-center lg:text-left">
              Benchmark your payments, shipping, and SaaS stack against real network rates. See your optimization potential in 2 minutes.
            </p>
            {isAuthenticated ? (
              <Link to="/Analyzer">
                <Button size="lg" className="h-14 rounded-full px-9 text-base font-bold gap-2 bg-saas-gradient text-white shadow-lg shadow-blue-500/20 ring-1 ring-white/10 hover:shadow-blue-500/40">
                  Run the Analyzer
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <a
                href="/auth/start"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center h-14 rounded-full px-9 text-base font-bold gap-2 shadow-md bg-foreground text-background hover:opacity-90 transition"
              >
                Sign in to Analyze
                <ArrowRight className="h-4 w-4" />
              </a>
            )}
            <p className="mt-4 text-[11px] text-muted-foreground/40">2 minutes · Real benchmarks · No commitment</p>
          </motion.div>

          <motion.div
            ref={rightRef}
            initial={{ opacity: 0, x: 50 }}
            animate={rightInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm"
          >
            <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between">
              <span className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground/60">Sample analysis — €500K brand</span>
              <div className="w-2 h-2 rounded-full bg-cambra-mint" />
            </div>

            <div className="divide-y divide-border/40">
              {rows.map((row, i) => (
                <div key={i} className="px-6 py-4 flex items-center gap-4">
                  <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <row.icon size={13} className={row.color} />
                  </div>
                  <span className="text-sm flex-1 font-medium">{row.label}</span>
                  <span className="tabular-nums text-muted-foreground/50 text-xs w-16 text-right">{row.current}</span>
                  <span className={`tabular-nums text-xs font-semibold w-12 text-right ${row.color}`}>{row.network}</span>
                  <span className="tabular-nums font-black text-sm w-20 text-right">{row.saving}</span>
                </div>
              ))}
            </div>

            <div className="px-6 py-5 border-t border-border/40 bg-foreground text-background flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] opacity-40 mb-0.5">Optimization potential / year</p>
                <span className="text-2xl font-black tracking-tight">€22,600<span className="text-base font-normal opacity-50">/yr</span></span>
              </div>
              {isAuthenticated ? (
                <Link to="/Analyzer">
                  <button className="h-11 px-6 rounded-full bg-saas-gradient text-white font-bold text-sm shadow-lg shadow-blue-500/20 ring-1 ring-white/10 hover:shadow-blue-500/40 transition-transform hover:-translate-y-0.5 flex items-center gap-2">
                    Calculate my savings <ArrowRight size={12} />
                  </button>
                </Link>
              ) : (
                <button
                  onClick={() => base44.auth.redirectToLogin(window.location.href)}
                  className="h-11 px-6 rounded-full bg-saas-gradient text-white font-bold text-sm shadow-lg shadow-blue-500/20 ring-1 ring-white/10 hover:shadow-blue-500/40 transition-transform hover:-translate-y-0.5 flex items-center gap-2"
                >
                  Sign in <ArrowRight size={12} />
                </button>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}