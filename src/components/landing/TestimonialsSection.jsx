import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Activity, TrendingDown, AlertCircle } from "lucide-react";

const TESTIMONIALS = [
  {
    quote: "Found €18k in duplicate SaaS spend.",
    name: "CFO",
    company: "DTC skincare · €4M/yr",
    finding: "0.6% PSP delta",
    category: "Payments",
    color: "#635BFF",
  },
  {
    quote: "We'd never benchmarked our PSP stack.",
    name: "Founder",
    company: "Premium activewear · €2.1M/yr",
    finding: "€0.80/order",
    category: "Shipping",
    color: "#06B6D4",
  },
  {
    quote: "Infrastructure was quietly eating margin.",
    name: "Head of Ops",
    company: "Home fragrance · €1.6M/yr",
    finding: "2 overlapping tools",
    category: "SaaS",
    color: "#8B5CF6",
  },
];

const STATS = [
  { value: "€29K", label: "Avg. recoverable margin", icon: TrendingDown, color: "#EF4444" },
  { value: "4.2", label: "Avg. inefficiencies detected", icon: AlertCircle, color: "#F97316" },
  { value: "<3 min", label: "Time to complete audit", icon: Activity, color: "#635BFF" },
];

function TestimonialCard({ t, index }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -6 }}
      className="p-6 rounded-2xl border border-border/40 bg-background flex flex-col h-full relative overflow-hidden"
    >
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, ${t.color}, transparent)` }}
      />
      <div className="mb-5 flex items-center gap-2">
        <span className="text-xl font-black" style={{ color: t.color }}>{t.finding}</span>
        <span
          className="text-[9px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: `${t.color}12`, color: t.color }}
        >{t.category}</span>
      </div>
      <p className="text-base font-semibold text-foreground/90 leading-snug flex-1 mb-5">"{t.quote}"</p>
      <div>
        <p className="text-xs font-semibold">{t.name}</p>
        <p className="text-[10px] text-muted-foreground/40">{t.company}</p>
      </div>
    </motion.div>
  );
}

export default function TestimonialsSection() {
  const headRef = useRef(null);
  const headInView = useInView(headRef, { once: true, margin: "-80px" });
  const statsRef = useRef(null);
  const statsInView = useInView(statsRef, { once: true, margin: "-60px" });

  return (
    <section className="py-16 px-5 border-t border-border/40 bg-secondary/10">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div ref={headRef} className="text-center mb-12">
          <motion.p
            initial={{ opacity: 0 }} animate={headInView ? { opacity: 1 } : {}}
            className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/40 mb-4"
          >Operator findings</motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }} animate={headInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.75, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="text-[clamp(2rem,5vw,3.8rem)] font-black tracking-[-0.04em] leading-[0.92]"
          >
            Quietly compounding.
          </motion.h2>
        </div>

        {/* Testimonials grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          {TESTIMONIALS.map((t, i) => (
            <TestimonialCard key={i} t={t} index={i} />
          ))}
        </div>

        {/* Stats bar */}
        <div ref={statsRef} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STATS.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 15 }}
              animate={statsInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="p-6 rounded-2xl border border-border/40 bg-card flex items-center gap-4"
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${s.color}10`, border: `1px solid ${s.color}20` }}
              >
                <s.icon className="h-5 w-5" style={{ color: s.color }} />
              </div>
              <div>
                <div className="text-2xl font-black" style={{ color: s.color }}>{s.value}</div>
                <div className="text-[11px] text-muted-foreground/50">{s.label}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}