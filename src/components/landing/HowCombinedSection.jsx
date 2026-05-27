import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScanLine, FileSearch, Plug, ArrowRight } from "lucide-react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const METHODS = [
  {
    num: "01",
    icon: ScanLine,
    title: "Interactive Audit",
    desc: "Visual card-based flow. Your infrastructure map builds live as you answer.",
    tag: "< 3 min",
    accent: "#635BFF",
    detail: "Visual · Reactive · Addictive",
  },
  {
    num: "02",
    icon: FileSearch,
    title: "Document Upload",
    desc: "Drop invoices, statements, receipts. AI extracts and benchmarks costs automatically.",
    tag: "Instant",
    accent: "#06B6D4",
    detail: "Invoices · Statements · Contracts",
  },
  {
    num: "03",
    icon: Plug,
    title: "Connect Your Tools",
    desc: "Connect Stripe, Shopify, QuickBooks, more. Real-time benchmarking of your live infrastructure.",
    tag: "Real-time",
    accent: "#8B5CF6",
    detail: "Shopify · Stripe · QuickBooks · more",
  },
];

function MethodCard({ s, index }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
      className="relative p-6 rounded-2xl border border-border/40 bg-card overflow-hidden group"
    >
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ background: `radial-gradient(400px 250px at 50% 0%, ${s.accent}08, transparent)` }}
      />
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-5">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center"
            style={{ background: `${s.accent}12`, border: `1px solid ${s.accent}25` }}
          >
            <s.icon size={18} style={{ color: s.accent }} />
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground/30">{s.num}</span>
            <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground/40">{s.tag}</span>
          </div>
        </div>
        <h3 className="text-base font-bold tracking-tight mb-2">{s.title}</h3>
        <p className="text-sm text-muted-foreground/65 leading-relaxed mb-4">{s.desc}</p>
        <div
          className="text-[10px] font-semibold px-2.5 py-1 rounded-full inline-block"
          style={{ background: `${s.accent}10`, color: s.accent }}
        >
          {s.detail}
        </div>
      </div>
    </motion.div>
  );
}

export default function HowCombinedSection() {
  const headRef = useRef(null);
  const headInView = useInView(headRef, { once: true, margin: "-80px" });

  return (
    <section className="py-16 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto">
        <div ref={headRef} className="mb-10 text-center">
          <motion.p
            initial={{ opacity: 0 }} animate={headInView ? { opacity: 1 } : {}}
            transition={{ duration: 0.45 }}
            className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/40 mb-4"
          >
            Three audit methods
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }} animate={headInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.65, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="text-[clamp(2rem,5vw,3.2rem)] font-black tracking-[-0.04em] leading-[0.92]"
          >
            Audit your infrastructure<br />any way you prefer.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }} animate={headInView ? { opacity: 1 } : {}}
            transition={{ delay: 0.25 }}
            className="text-base text-muted-foreground/60 mt-4 max-w-xl mx-auto"
          >
            Guided flow · Document upload · Direct integrations. Pick your method.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {METHODS.map((s, i) => (
            <MethodCard key={i} s={s} index={i} />
          ))}
        </div>

        <div className="text-center mt-10">
          <Link to="/Analyzer">
            <Button className="h-12 rounded-full px-8 text-sm font-bold gap-2 bg-foreground text-background hover:opacity-90">
              Start your infrastructure audit <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}