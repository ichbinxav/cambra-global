import RevealOnScroll from "@/components/shared/RevealOnScroll";
import { motion } from "framer-motion";

const pillars = [
  { num: "01", title: "Collective economics", desc: "Pool purchasing power across 1,000+ brands to access rates previously reserved for enterprises." },
  { num: "02", title: "Infrastructure intelligence", desc: "Continuous analysis of your payments, shipping, and SaaS stack to surface every inefficiency." },
  { num: "03", title: "Network access", desc: "An exclusive directory of vetted independent brands — for partnerships, collaboration, and growth." },
];

export default function SolutionSection() {
  return (
    <section className="py-32 px-6 bg-foreground text-background overflow-hidden">
      <div className="max-w-5xl mx-auto">
        <div className="mb-20 text-center">
          <RevealOnScroll>
            <p className="text-[10px] tracking-[0.35em] uppercase opacity-30 mb-5">The Solution</p>
          </RevealOnScroll>
          <RevealOnScroll delay={0.1}>
            <h2 className="text-[clamp(2.2rem,5vw,5rem)] font-bold tracking-[-0.03em] leading-[0.92]">
              THE Node is the economic
              <br />
              <span className="opacity-25">layer behind independent brands.</span>
            </h2>
          </RevealOnScroll>
          <RevealOnScroll delay={0.2}>
            <p className="max-w-xl mx-auto text-lg opacity-50 leading-relaxed mt-8">
              We connect independent brands into a unified network to unlock better infrastructure, better economics, and collective leverage. When you join THE Node, you don't just get a tool — you get the power of a network.
            </p>
          </RevealOnScroll>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-background/10 rounded-2xl overflow-hidden">
          {pillars.map((p, i) => (
            <RevealOnScroll key={i} delay={i * 0.12}>
              <div className="p-8 bg-foreground h-full">
                <p className="text-[10px] tracking-[0.25em] uppercase opacity-30 mb-6">{p.num}</p>
                <h3 className="text-xl font-semibold tracking-tight mb-3 opacity-90">{p.title}</h3>
                <p className="text-sm opacity-40 leading-relaxed">{p.desc}</p>
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}