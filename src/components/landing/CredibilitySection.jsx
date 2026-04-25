import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const BLOCKS = [
  {
    title: "Built for independent commerce",
    text: "Designed for fashion, beauty, wellness, accessories and lifestyle brands operating across online and retail channels.",
  },
  {
    title: "Focused on real operating costs",
    text: "CAMBRA starts with the infrastructure costs brands actually feel: payments, shipping and SaaS.",
  },
  {
    title: "Collective leverage, individual benefit",
    text: "Independent brands join CAMBRA to access better infrastructure conditions than they could negotiate alone.",
  },
];

export default function CredibilitySection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-10 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto">
        <div ref={ref} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {BLOCKS.map((b, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              className="p-5 rounded-2xl border border-border/40 bg-card"
            >
              <h3 className="text-sm font-semibold mb-1.5 tracking-tight">{b.title}</h3>
              <p className="text-[13px] text-muted-foreground/75 leading-relaxed">{b.text}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}