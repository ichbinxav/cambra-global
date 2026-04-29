import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Globe, CreditCard, Truck, Percent } from "lucide-react";

const testimonials = [
  {
    quote: "Discovered we were overpaying on Stripe by 1.4%. After switching to the network rate, we recovered €38,000 in the first year alone.",
    name: "Founder",
    company: "Contemporary skincare brand",
    saving: "€38K",
    savingNote: "recovered year 1",
    category: "Payments",
    color: "text-chart-1",
    bg: "bg-blue-500/[0.04] border-blue-500/15",
  },
  {
    quote: "The Analyzer identified €24,000 in hidden infrastructure costs we hadn't tracked. Changed how we think about our entire P&L.",
    name: "CEO",
    company: "Premium activewear brand",
    saving: "€24K",
    savingNote: "hidden costs surfaced",
    category: "Infrastructure",
    color: "text-chart-3",
    bg: "bg-orange-500/[0.04] border-orange-500/15",
  },
  {
    quote: "Repriced our full shipping structure through the network. We save €19,000 a year now. It genuinely took one afternoon.",
    name: "Operations Director",
    company: "Design-led home fragrance",
    saving: "€19K",
    savingNote: "per year on shipping",
    category: "Shipping",
    color: "text-chart-2",
    bg: "bg-green-500/[0.04] border-green-500/15",
  },
];

function TestimonialCard({ t, index }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      key={index}
      ref={ref}
      initial={false}
      animate={inView ? { opacity: 1, y: 0, rotateX: 0 } : {}}
      transition={{ duration: 0.7, delay: index * 0.13, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -8, boxShadow: "0 20px 40px -12px rgba(0,0,0,0.1)", transition: { duration: 0.25 } }}
      className="p-7 rounded-2xl border bg-background h-full flex flex-col"
    >
      <motion.div
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border mb-5 w-fit ${t.bg}`}
        initial={false}
        animate={inView ? { scale: 1, opacity: 1 } : {}}
        transition={{ delay: index * 0.13 + 0.25, type: "spring", stiffness: 280, damping: 18 }}
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
}

export default function TestimonialsSection() {
  const headRef = useRef(null);
  const headInView = useInView(headRef, { once: true, margin: "-80px" });
  const trustRef = useRef(null);
  const trustInView = useInView(trustRef, { once: true, margin: "-60px" });

  return (
    <section className="py-10 px-5 border-t border-border/40 bg-secondary/20">
      <div className="max-w-6xl mx-auto">
        <div ref={headRef} className="text-center mb-14">
          <motion.p
            initial={false} animate={headInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/60 mb-5 flex items-center justify-center gap-2"
          >
            <span className="w-4 h-px bg-border inline-block" /> Results
          </motion.p>
          <motion.h2
            initial={false} animate={headInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.75, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="text-[clamp(2rem,5vw,4rem)] font-black tracking-[-0.04em] leading-[0.9]"
          >
            Brands are saving real money.
          </motion.h2>
          <motion.p
            initial={false} animate={headInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="mt-4 text-muted-foreground text-base max-w-md mx-auto"
          >
            Independent commerce brands across Europe using the CAMBRA network.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {testimonials.map((t, i) => (
            <TestimonialCard key={i} t={t} index={i} />
          ))}
        </div>

        {/* Trust bar */}
        <div ref={trustRef} className="mt-10 pt-10 border-t border-border/40">
         <div className="mb-4 text-center lg:text-left">
           <p className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground/45">Network benchmarks</p>
           <h3 className="text-[clamp(1.5rem,4vw,2.4rem)] font-black tracking-[-0.02em]">By the numbers</h3>
         </div>
         <div className="grid grid-cols-1 gap-3">
         {[
            { value: "15+", label: "Countries active", icon: Globe, color: "text-foreground", bg: "bg-secondary/60 border-border/60" },
            { value: "€18K–72K", label: "Savings range per brand", icon: Percent, color: "text-chart-3", bg: "bg-orange-500/[0.08] border-orange-500/20" },
            { value: "1.4%", label: "Network payment rate", icon: CreditCard, color: "text-chart-1", bg: "bg-blue-500/[0.08] border-blue-500/20" },
            { value: "−18%", label: "Avg. shipping reduction", icon: Truck, color: "text-chart-2", bg: "bg-green-500/[0.08] border-green-500/20" },
          ].map((s, i) => (
            <motion.div
              key={i}
              initial={false}
              animate={trustInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              whileHover={{ y: -2 }}
              className={`p-5 md:p-6 rounded-2xl border flex items-center gap-4 ${s.bg}`}
            >
              <div className="w-12 h-12 rounded-2xl bg-background/70 border border-border/40 flex items-center justify-center shrink-0">
                <s.icon size={16} className={`${s.color} opacity-90`} />
              </div>
              <div className="min-w-0">
                <motion.p
                  className={`text-5xl md:text-6xl font-black tracking-tight ${s.color}`}
                  initial={false}
                  animate={trustInView ? { scale: 1 } : {}}
                  transition={{ delay: i * 0.08 + 0.1, type: 'spring', stiffness: 280, damping: 16 }}
                >{s.value}</motion.p>
                <p className="text-base md:text-lg text-muted-foreground/60">{s.label}</p>
              </div>
            </motion.div>
          ))}
            </div>
          </div>
        </div>
      </section>
  );
}