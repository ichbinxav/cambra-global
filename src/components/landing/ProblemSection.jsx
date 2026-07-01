import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { useAuth } from "@/lib/AuthContext";

// Right-column KPI cards were removed from this section; the heading/CTA on
// the left still render. Prior animated card scaffolding lives in git history.

export default function ProblemSection() {
  const { isAuthenticated } = useAuth();
  const headRef = useRef(null);
  const headInView = useInView(headRef, { once: true, margin: "-80px" });

  return (
    <section className="py-10 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-16 items-start">

          {/* Left */}
          <div className="lg:sticky lg:top-24 text-center lg:text-left" ref={headRef}>
            <motion.p
              initial={false} animate={headInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6 }}
              className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-5 flex items-center justify-center lg:justify-start gap-2"
            >
              <span className="w-4 h-px bg-border" /> The problem
            </motion.p>
            <motion.h2
              initial={false} animate={headInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="text-[clamp(2.2rem,5vw,4rem)] font-black tracking-[-0.04em] leading-[0.88] mb-5 text-center lg:text-left"
            >
              You're paying<br />what enterprises pay.<br />You don't have<br />their leverage.
            </motion.h2>
            <motion.p
              initial={false} animate={headInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.25 }}
              className="text-muted-foreground text-sm leading-relaxed mb-6 max-w-xs mx-auto text-center lg:text-left"
            >
              Retailers negotiate volume discounts. You negotiate alone. Same infrastructure. Very different pricing.
            </motion.p>

            <motion.div
              initial={false} animate={headInView ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 0.6, delay: 0.35 }}
              className="p-5 rounded-2xl border border-border/40 bg-card mb-6"
            >
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40 mb-2">Avg. optimization potential</p>
              <p className="text-4xl font-black text-foreground">€29K<span className="text-sm font-normal text-muted-foreground">/yr</span></p>
              <p className="text-[11px] text-muted-foreground/50 mt-2">Across payments, shipping, SaaS · Real network benchmarks</p>
            </motion.div>

            <motion.div className="flex justify-center lg:justify-start"
              initial={false} animate={headInView ? { opacity: 1 } : {}}
              transition={{ delay: 0.5 }}
            >
              {isAuthenticated ? (
                <Link to="/Analyzer">
                  <button className="h-11 px-6 rounded-full bg-saas-gradient text-white font-bold text-sm shadow-lg shadow-blue-500/20 ring-1 ring-white/10 hover:shadow-blue-500/40 transition-transform hover:-translate-y-0.5 flex items-center gap-2">
                    Calculate your savings <ArrowRight size={13} />
                  </button>
                </Link>
              ) : (
                <a
                  href="/auth/start"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-11 px-6 rounded-full bg-saas-gradient text-white font-bold text-sm shadow-lg shadow-blue-500/20 ring-1 ring-white/10 hover:shadow-blue-500/40 transition-transform hover:-translate-y-0.5 inline-flex items-center gap-2"
                >
                  Sign in to analyze <ArrowRight size={13} />
                </a>
              )}
            </motion.div>
          </div>

          {/* Right — animated cards */}
          <div className="space-y-4">
            {/* KPI cards removed per request */}
          </div>
        </div>
      </div>
    </section>
  );
}