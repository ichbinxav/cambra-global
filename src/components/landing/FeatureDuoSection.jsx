import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Zap, Brain, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const FEATURES = [
  {
    icon: Zap,
    title: "Infrastructure Intelligence",
    body: "Benchmark your entire operational stack against real data from comparable operators. Identify where you are overpaying and by exactly how much.",
    accent: "#635BFF",
    link: "/Analyzer",
    linkLabel: "Run your audit",
    stats: [
      { label: "Avg. inefficiencies detected", value: "4.2" },
      { label: "Benchmark accuracy", value: "94%" },
    ],
  },
  {
    icon: Brain,
    title: "AI Copilot",
    body: "Your infrastructure intelligence assistant. Explains findings, recommends actions, answers questions and guides you through every optimization opportunity.",
    accent: "#06B6D4",
    link: "/Dashboard",
    linkLabel: "Explore the dashboard",
    stats: [
      { label: "Response accuracy", value: "AI-native" },
      { label: "Infrastructure domains", value: "6" },
    ],
  },
];

export default function FeatureDuoSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-12 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto">
        <div ref={ref} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FEATURES.map((feat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.55, delay: i * 0.08 }}
              className="group relative rounded-2xl border border-border/40 bg-card overflow-hidden"
              whileHover={{ y: -3 }}
            >
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-400"
                style={{ background: `radial-gradient(500px 300px at ${i === 0 ? "10% -10%" : "110% 110%"}, ${feat.accent}08, transparent)` }}
              />
              <div className="relative z-10 p-6">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: `${feat.accent}12`, border: `1px solid ${feat.accent}25` }}
                >
                  <feat.icon className="h-5 w-5" style={{ color: feat.accent }} />
                </div>
                <h3 className="text-base font-bold mb-2">{feat.title}</h3>
                <p className="text-sm text-muted-foreground/70 leading-relaxed mb-5">{feat.body}</p>
                <div className="grid grid-cols-2 gap-2 mb-5">
                  {feat.stats.map((s, j) => (
                    <div key={j} className="p-2.5 rounded-lg border border-border/40 bg-background/50">
                      <div className="text-sm font-black" style={{ color: feat.accent }}>{s.value}</div>
                      <div className="text-[10px] text-muted-foreground/45">{s.label}</div>
                    </div>
                  ))}
                </div>
                <Link to={feat.link} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-foreground/60 hover:text-foreground transition-colors">
                  {feat.linkLabel} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}