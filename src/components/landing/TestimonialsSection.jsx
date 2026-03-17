import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const testimonials = [
  {
    quote: "Discovered we were overpaying on Stripe by 1.4%. After switching to the network rate, we recovered €38,000 in the first year alone.",
    name: "Founder",
    company: "Contemporary skincare brand",
    saving: "€38K",
    savingNote: "recovered year 1",
    category: "Payments",
    color: "text-blue-600",
    bg: "bg-blue-500/[0.04] border-blue-500/15",
  },
  {
    quote: "The Analyzer identified €24,000 in hidden infrastructure costs we hadn't tracked. Changed how we think about our entire P&L.",
    name: "CEO",
    company: "Premium activewear brand",
    saving: "€24K",
    savingNote: "hidden costs surfaced",
    category: "Infrastructure",
    color: "text-orange-500",
    bg: "bg-orange-500/[0.04] border-orange-500/15",
  },
  {
    quote: "Repriced our full shipping structure through the network. We save €19,000 a year now. It genuinely took one afternoon.",
    name: "Operations Director",
    company: "Design-led home fragrance",
    saving: "€19K",
    savingNote: "per year on shipping",
    category: "Shipping",
    color: "text-green-600",
    bg: "bg-green-500/[0.04] border-green-500/15",
  },
];

export default function TestimonialsSection() {
  const headRef = useRef(null);
  const headInView = useInView(headRef, { once: true, margin: "-80px" });
  const trustRef = useRef(null);
  const trustInView = useInView(trustRef, { once: true, margin: "-60px" });

  return (
    <section className="py-24 px-5 border-t border-border/40 bg-secondary/20">
      <div className="max-w-6xl mx-auto">
        <div ref={headRef} className="text-center mb-14">
          <motion.p
            initial={{ opacity: 0, y: 16 }} animate={headInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/60 mb-5 flex items-center justify-center gap-2"
          >
            <span className="w-4 h-px bg-border inline-block" /> Results
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 40 }} animate={headInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.75, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="text-[clamp(2rem,5vw,4rem)] font-black tracking-[-0.04em] leading-[0.9]"
          >
            Brands are saving real money.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={headInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="mt-4 text-muted-foreground text-base max-w-md mx-auto"
          >
            Independent commerce brands across Europe using THE NoDE network.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {testimonials.map((t, i) => {
            const ref = useRef(null);
            const inView = useInView(ref, { once: true, margin: "-60px" });
            return (
              <motion.div
                key={i}
                ref={ref}
                initial={{ opacity: 0, y: 50, rotateX: 8 }}
                animate={inView ? { opacity: 1, y: 0, rotateX: 0 } : {}}
                transition={{ duration: 0.7, delay: i * 0.13, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ y: -8, boxShadow: "0 20px 40px -12px rgba(0,0,0,0.1)", transition: { duration: 0.25 } }}
                className="p-7 rounded-2xl border bg-background h-full flex flex-col"
              >
                <motion.div
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border mb-5 w-fit ${t.bg}`}
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={inView ? { scale: 1, opacity: 1 } : {}}
                  transition={{ delay: i * 0.13 + 0.25, type: "spring", stiffness: 280, damping: 18 }}
                >
                  <span className={`text-sm font-black ${t.color}`}>{t.saving}</span>
                  <span className="text-[10px] text-muted-foreground/60">{t.savingNote}</span>
                </motion.div>

                <p className="text-sm text-muted-foreground leading-relaxed flex-1 mb-6">"{t.quote}"</p>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold">{t.name}</p>
                    <p className="text-[11px] text-muted-foreground/50">{t.company}</p>
                  </div>
                  <span className={`text-[10px] font-semibold uppercase tracking-[0.15em] px-2 py-1 rounded-full bg-secondary ${t.color}`}>
                    {t.category}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Trust bar */}
        <div ref={trustRef} className="mt-10 pt-10 border-t border-border/40 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { value: "15+", label: "Countries active" },
            { value: "€18K–72K", label: "Savings range per brand" },
            { value: "1.4%", label: "Network payment rate" },
            { value: "−18%", label: "Avg. shipping reduction" },
          ].map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 24 }}
              animate={trustInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.55, delay: i * 0.1 }}
            >
              <motion.p
                className="text-2xl font-black tracking-tight"
                initial={{ scale: 0.7 }}
                animate={trustInView ? { scale: 1 } : {}}
                transition={{ delay: i * 0.1 + 0.15, type: "spring", stiffness: 260, damping: 16 }}
              >{s.value}</motion.p>
              <p className="text-[11px] text-muted-foreground/50 mt-1">{s.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}