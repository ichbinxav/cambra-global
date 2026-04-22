import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Search, Zap, BarChart2, ArrowRight } from "lucide-react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const STEPS = [
  {
    num: "01",
    icon: Search,
    title: "Analyze",
    desc: "Run the Analyzer to benchmark payments, shipping, and SaaS against real network data.",
    tag: "< 2 min",
    color: "text-blue-600",
    bg: "bg-blue-500/[0.08] border-blue-500/20",
  },
  {
    num: "02",
    icon: Zap,
    title: "Unlock rates",
    desc: "Activate pre‑negotiated network deals — payment rate 1.4%, −18% shipping, −30% SaaS.",
    tag: "1 click",
    color: "text-green-600",
    bg: "bg-green-500/[0.08] border-green-500/20",
  },
  {
    num: "03",
    icon: BarChart2,
    title: "Track savings",
    desc: "Monitor your Infrastructure Score and savings over time as the network compounds.",
    tag: "Ongoing",
    color: "text-purple-600",
    bg: "bg-purple-500/[0.08] border-purple-500/20",
  },
];

function StepCard({ s, index }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
      className="p-6 rounded-2xl border border-border/50 bg-card"
    >
      <div className="flex items-start justify-between mb-4">
        <span className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/40">{s.num}</span>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border text-muted-foreground/50">{s.tag}</span>
      </div>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${s.bg}`}>
          <s.icon size={16} className={s.color} />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-bold tracking-tight mb-1">{s.title}</h3>
          <p className="text-sm text-muted-foreground/70 leading-relaxed">{s.desc}</p>
        </div>
      </div>
    </motion.div>
  );
}

export default function HowCombinedSection() {
  const headRef = useRef(null);
  const headInView = useInView(headRef, { once: true, margin: "-80px" });

  return (
    <section className="py-14 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto">
        <div ref={headRef} className="mb-8">
          <motion.p
            initial={{ opacity: 0, y: 12 }} animate={headInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.45 }}
            className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-4 flex items-center justify-center gap-2"
          >
            <span className="w-4 h-px bg-border" /> How it works
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 30 }} animate={headInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.65, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="text-[clamp(2rem,5vw,3.2rem)] font-black tracking-[-0.04em] leading-[0.9]"
          >
            From analysis to savings — fast.
          </motion.h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STEPS.map((s, i) => (
            <StepCard key={i} s={s} index={i} />
          ))}
        </div>

        <div className="text-center mt-8">
          <Link to="/Analyzer">
            <Button className="h-11 rounded-full px-7 text-sm font-bold gap-2 bg-saas-gradient text-white shadow-lg shadow-blue-500/20 ring-1 ring-white/10 hover:shadow-blue-500/40">
              Start now — free <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}