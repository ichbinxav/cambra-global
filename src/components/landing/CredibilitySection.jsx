import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Users, CreditCard, Network } from "lucide-react";

const BLOCKS = [
  {
    title: "Built for independent commerce",
    text: "Designed for fashion, beauty, wellness, accessories and lifestyle brands operating across online and retail channels.",
    icon: Users,
    color: "text-cambra-mint",
    bg: "bg-cambra-mint-soft border-cambra-mint"
  },
  {
    title: "Focused on real operating costs",
    text: "CAMBRA starts with the infrastructure costs brands actually feel: payments, shipping and SaaS.",
    icon: CreditCard,
    color: "text-cambra-lilac",
    bg: "bg-cambra-lilac-soft border-cambra-lilac"
  },
  {
    title: "Collective leverage, individual benefit",
    text: "Independent brands join CAMBRA to access better infrastructure conditions than they could negotiate alone.",
    icon: Network,
    color: "text-cambra-plum",
    bg: "bg-cambra-plum-soft border-cambra-plum"
  },
];

export default function CredibilitySection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-10 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto relative">
        {/* subtle ambient */}
        <div className="absolute -top-20 -left-10 w-60 h-60 rounded-full blur-3xl bg-ambient-lilac opacity-[0.15] pointer-events-none" />
        <div ref={ref} className="grid grid-cols-1 md:grid-cols-3 gap-3 relative z-10">
          {BLOCKS.map((b, i) => (
            <motion.div
              key={i}
              initial={false}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              className="group p-5 rounded-2xl border border-border/40 bg-card overflow-hidden relative"
            >
              {/* glow border */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" style={{background:"radial-gradient(400px 160px at 20% -20%, rgba(31,78,216,0.12), transparent), radial-gradient(400px 160px at 120% 120%, rgba(44,167,193,0.12), transparent)"}} />
              <div className="relative z-10 flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${b.bg}`}>
                  <b.icon className={`h-4 w-4 ${b.color}`} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold mb-1.5 tracking-tight">{b.title}</h3>
                  <p className="text-[13px] text-muted-foreground/75 leading-relaxed">{b.text}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}