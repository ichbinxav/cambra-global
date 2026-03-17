import RevealOnScroll from "@/components/shared/RevealOnScroll";
import { motion } from "framer-motion";

const pillars = [
  { num: "01", title: "Collective economics", desc: "Pool purchasing power across hundreds of brands. Access rates previously reserved for enterprises." },
  { num: "02", title: "Infrastructure intelligence", desc: "Continuous analysis of your payments, logistics, and SaaS stack. Surface every inefficiency. Act on it." },
  { num: "03", title: "Network proximity", desc: "An exclusive directory of vetted independent brands for partnerships, deal-sharing, and strategic collaboration." },
];

export default function SolutionSection() {
  return (
    <section className="py-36 px-6 bg-foreground text-background overflow-hidden relative">
      {/* Rotating background symbol */}
      <motion.div
        className="absolute right-[-15vw] top-1/2 -translate-y-1/2 text-[60vw] font-thin text-background/[0.012] select-none pointer-events-none leading-none"
        animate={{ rotate: -360 }}
        transition={{ duration: 300, repeat: Infinity, ease: "linear" }}
      >
        ✱
      </motion.div>

      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="mb-20">
          <RevealOnScroll>
            <span className="inline-flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase opacity-30 mb-7">
              <span className="w-4 h-px bg-background/30 inline-block" /> The Solution
            </span>
          </RevealOnScroll>
          <RevealOnScroll delay={0.1}>
            <h2 className="text-[clamp(2.4rem,6vw,6rem)] font-black tracking-[-0.04em] leading-[0.86] max-w-4xl">
              THE NoDE is the economic
              <br />
              <span className="opacity-20">layer behind independent brands.</span>
            </h2>
          </RevealOnScroll>
          <RevealOnScroll delay={0.2}>
            <p className="max-w-xl text-[1.05rem] opacity-45 leading-relaxed mt-8">
              We connect independent brands into a unified network to unlock better infrastructure, better economics, and collective leverage. When you join THE NoDE, you don't just get a tool — you get the power of a network.
            </p>
          </RevealOnScroll>
        </div>

        {/* Pillars grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-background/[0.08] rounded-2xl overflow-hidden">
          {pillars.map((p, i) => (
            <RevealOnScroll key={i} delay={i * 0.1}>
              <motion.div
                className="p-9 bg-foreground h-full group cursor-default"
                whileHover={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                transition={{ duration: 0.2 }}
              >
                <p className="text-[10px] tracking-[0.3em] uppercase opacity-25 mb-7">{p.num}</p>
                <h3 className="text-xl font-bold tracking-tight mb-3 opacity-90">{p.title}</h3>
                <p className="text-sm opacity-35 leading-relaxed">{p.desc}</p>
              </motion.div>
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}