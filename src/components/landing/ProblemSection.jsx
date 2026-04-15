import { CreditCard, Truck, Layers, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";

const PROBLEMS = [
  {
    icon: CreditCard,
    metric: "2.9%",
    label: "Avg. payment fee",
    benchmark: "Network: 1.4%",
    delta: "You overpay by 107%",
    annual: "€18K–€38K/yr lost",
    color: "text-blue-600",
    bg: "bg-blue-500/[0.05] border-blue-500/20",
    barColor: "#3b82f6",
    yours: 72,
    theirs: 35,
  },
  {
    icon: Truck,
    metric: "+23%",
    label: "Shipping overspend vs. enterprise",
    benchmark: "Volume-based gap",
    delta: "Pay enterprise prices without the scale",
    annual: "€12K–€24K/yr lost",
    color: "text-orange-500",
    bg: "bg-orange-500/[0.05] border-orange-500/20",
    barColor: "#f97316",
    yours: 85,
    theirs: 62,
  },
  {
    icon: Layers,
    metric: "€28K",
    label: "Avg. SaaS waste per year",
    benchmark: "Redundant & overpriced tools",
    delta: "30% of SaaS spend is recoverable",
    annual: "€8K–€28K/yr lost",
    color: "text-green-600",
    bg: "bg-green-500/[0.05] border-green-500/20",
    barColor: "#22c55e",
    yours: 78,
    theirs: 55,
  },
];

function AnimatedBar({ width, color, delay }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <div ref={ref} className="h-2 rounded-full bg-border/30 overflow-hidden">
      <motion.div
        className="h-full rounded-full opacity-70"
        style={{ background: color || undefined }}
        initial={{ width: 0 }}
        animate={inView ? { width: `${width}%` } : { width: 0 }}
        transition={{ duration: 1, delay: delay || 0, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

function GreenBar({ width, delay }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <div ref={ref} className="h-2 rounded-full bg-border/30 overflow-hidden">
      <motion.div
        className="h-full rounded-full bg-green-500 opacity-70"
        initial={{ width: 0 }}
        animate={inView ? { width: `${width}%` } : { width: 0 }}
        transition={{ duration: 1, delay: (delay || 0) + 0.2, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

function ProblemCard({ item, index }) {
  const cardRef = useRef(null);
  const cardInView = useInView(cardRef, { once: true, margin: "-60px" });
  return (
    <motion.div
      key={index}
      ref={cardRef}
      initial={{ opacity: 0, x: 50 }}
      animate={cardInView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.65, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ x: 6, transition: { duration: 0.2 } }}
      className={`p-6 rounded-2xl border ${item.bg}`}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${item.bg}`}>
            <item.icon size={15} className={item.color} />
          </div>
          <div>
            <p className="text-sm font-semibold">{item.label}</p>
            <p className="text-[10px] text-muted-foreground/50">{item.benchmark}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <motion.p
            className={`text-2xl font-black tabular-nums ${item.color}`}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={cardInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: index * 0.12 + 0.3, type: "spring", stiffness: 260, damping: 16 }}
          >{item.metric}</motion.p>
          <p className={`text-[10px] font-semibold ${item.color} opacity-70`}>{item.annual}</p>
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-[10px] text-muted-foreground/50">You</span>
            <span className="text-[10px] font-semibold text-muted-foreground/70">{item.yours}% of max</span>
          </div>
          <AnimatedBar width={item.yours} color={item.barColor} delay={index * 0.12 + 0.15} />
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-[10px] text-muted-foreground/50">Network rate</span>
            <span className="text-[10px] font-semibold text-green-600">{item.theirs}% of max</span>
          </div>
          <GreenBar width={item.theirs} delay={index * 0.12 + 0.15} />
        </div>
      </div>

      <p className={`text-[11px] font-medium mt-3 ${item.color}`}>{item.delta}</p>
    </motion.div>
  );
}

export default function ProblemSection() {
  const { isAuthenticated } = useAuth();
  const headRef = useRef(null);
  const headInView = useInView(headRef, { once: true, margin: "-80px" });

  return (
    <section className="py-16 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-16 items-start">

          {/* Left */}
          <div className="lg:sticky lg:top-24" ref={headRef}>
            <motion.p
              initial={{ opacity: 0, y: 20 }} animate={headInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6 }}
              className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-5 flex items-center gap-2"
            >
              <span className="w-4 h-px bg-border" /> The problem
            </motion.p>
            <motion.h2
              initial={{ opacity: 0, y: 30 }} animate={headInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="text-[clamp(2.2rem,5vw,4rem)] font-black tracking-[-0.04em] leading-[0.88] mb-5"
            >
              You're paying<br />what enterprises pay.<br />You don't have<br />their leverage.
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }} animate={headInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.25 }}
              className="text-muted-foreground text-sm leading-relaxed mb-6 max-w-xs"
            >
              Retailers negotiate volume discounts. You negotiate alone. Same infrastructure. Very different pricing.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, scale: 0.92 }} animate={headInView ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 0.6, delay: 0.35 }}
              className="p-5 rounded-2xl border border-border/40 bg-card mb-6"
            >
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40 mb-2">Avg. optimization potential</p>
              <p className="text-4xl font-black text-foreground">€29K<span className="text-sm font-normal text-muted-foreground">/yr</span></p>
              <p className="text-[11px] text-muted-foreground/50 mt-2">Across payments, shipping, SaaS · Real network benchmarks</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }} animate={headInView ? { opacity: 1 } : {}}
              transition={{ delay: 0.5 }}
            >
              {isAuthenticated ? (
                <Link to="/Analyzer">
                  <button className="flex items-center gap-2 text-sm font-bold text-green-600 hover:text-green-700 hover:gap-3 transition-all">
                    Calculate your savings <ArrowRight size={13} />
                  </button>
                </Link>
              ) : (
                <a
                  href="/auth/start"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm font-bold text-green-600 hover:text-green-700 hover:gap-3 transition-all"
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