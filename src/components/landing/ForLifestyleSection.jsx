import RevealOnScroll from "@/components/shared/RevealOnScroll";
import { motion } from "framer-motion";

const brands = ["Fashion", "Beauty", "Wellness", "Homeware", "DTC", "Lifestyle", "Food & Bev", "Accessories"];

export default function ForLifestyleSection() {
  return (
    <section className="py-36 px-6 border-t border-border/40 overflow-hidden">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-20">
          <RevealOnScroll>
            <span className="inline-flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-muted-foreground/60 mb-7">
              <span className="w-4 h-px bg-border inline-block" /> Who it's for
            </span>
          </RevealOnScroll>
          <RevealOnScroll delay={0.1}>
            <h2 className="text-[clamp(2.4rem,6vw,6rem)] font-black tracking-[-0.04em] leading-[0.86]">
              FOR LIFESTYLE<br />
              <span className="text-foreground/18">COMMERCE</span>
            </h2>
          </RevealOnScroll>
          <RevealOnScroll delay={0.2}>
            <p className="max-w-lg mx-auto text-muted-foreground leading-relaxed text-[1.05rem] mt-8">
              Built for independent brands operating across the lifestyle commerce space — from emerging DTC players to established multi-channel businesses scaling across Europe.
            </p>
          </RevealOnScroll>
        </div>

        {/* Scrolling brand types */}
        <RevealOnScroll delay={0.3}>
          <div className="flex flex-wrap justify-center gap-3">
            {brands.map((b, i) => (
              <motion.span
                key={b}
                className="px-5 py-2.5 rounded-full border border-border/50 text-sm text-muted-foreground/70 hover:border-foreground/20 hover:text-foreground transition-all"
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                whileHover={{ scale: 1.03 }}
              >
                {b}
              </motion.span>
            ))}
          </div>
        </RevealOnScroll>

        {/* Visual block */}
        <RevealOnScroll delay={0.35}>
          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { title: "€500K – €50M", label: "Revenue range", sub: "Where the opportunity is highest" },
              { title: "15+ countries", label: "Active network", sub: "Europe-first, global ambition" },
              { title: "1,000+ brands", label: "Target network size", sub: "Collective leverage at scale" },
            ].map((item, i) => (
              <div key={i} className="p-7 rounded-2xl border border-border/50 bg-card/50 text-center">
                <p className="text-3xl font-black tracking-tight mb-1">{item.title}</p>
                <p className="text-sm font-medium mb-1">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.sub}</p>
              </div>
            ))}
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}