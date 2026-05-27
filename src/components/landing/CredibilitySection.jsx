import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Eye, Cpu, TrendingDown } from "lucide-react";

const BLOCKS = [
  {
    title: "Continuous, not episodic.",
    text: "Most audits are point-in-time. CAMBRA runs continuously — drift surfaces the moment it appears.",
    icon: Eye,
    accent: "#635BFF",
  },
  {
    title: "Peer-tier benchmarks.",
    text: "Compared against operators at your revenue tier and geography. Not vague industry ranges.",
    icon: Cpu,
    accent: "#06B6D4",
  },
  {
    title: "Quantified, not vague.",
    text: "Every drift expressed as a number. €0.80/order, 0.6pp PSP delta, 2 overlapping tools.",
    icon: TrendingDown,
    accent: "#8B5CF6",
  },
];

export default function CredibilitySection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-12 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto relative">
        <div ref={ref} className="grid grid-cols-1 md:grid-cols-3 gap-3 relative z-10">
          {BLOCKS.map((b, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="group p-5 rounded-2xl border border-border/40 bg-card overflow-hidden relative"
              whileHover={{ y: -3 }}
            >
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-400 pointer-events-none rounded-2xl"
                style={{ background: `radial-gradient(300px 200px at 10% 0%, ${b.accent}10, transparent)` }}
              />
              <div className="relative z-10 flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `${b.accent}12`, border: `1px solid ${b.accent}25` }}
                >
                  <b.icon className="h-4 w-4" style={{ color: b.accent }} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold mb-1.5 tracking-tight">{b.title}</h3>
                  <p className="text-[13px] text-muted-foreground/70 leading-relaxed">{b.text}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}