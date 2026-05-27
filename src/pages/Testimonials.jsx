import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Star } from "lucide-react";
import Navbar from "@/components/landing/Navbar";

const TESTIMONIALS = [
  {
    name: "Emma Rossi",
    company: "Fashion Brand",
    role: "Founder",
    text: "CAMBRA found €29K in annual savings in less than 3 minutes. We're now negotiating better terms with our payment provider.",
    rating: 5,
    avatar: "ER",
  },
  {
    name: "Marco Blanc",
    company: "Beauty E-commerce",
    role: "Operations Lead",
    text: "The infrastructure audit was eye-opening. We had no idea we were overpaying on SaaS by 40%. Already cut costs by €8K/month.",
    rating: 5,
    avatar: "MB",
  },
  {
    name: "Sophie Delacroix",
    company: "Lifestyle Retailer",
    role: "CEO",
    text: "Finally, benchmarking that actually means something. Not generic — specific to our size, geography, and channel mix. Highly recommend.",
    rating: 5,
    avatar: "SD",
  },
  {
    name: "Luca Moretti",
    company: "Food & Beverage",
    role: "CFO",
    text: "The deal negotiation support is incredible. CAMBRA's network leverage got us shipping rates we could never negotiate alone.",
    rating: 5,
    avatar: "LM",
  },
];

export default function Testimonials() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <div className="min-h-screen bg-background font-inter">
      <Navbar />
      <div className="pt-20 pb-16">
        <div className="max-w-6xl mx-auto px-5">
          <div ref={ref} className="text-center mb-12">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              className="text-[clamp(2.2rem,5vw,3.8rem)] font-black tracking-[-0.04em] leading-[0.92] mb-4"
            >
              What brands say about CAMBRA
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ delay: 0.15 }}
              className="text-base text-muted-foreground/70 max-w-xl mx-auto"
            >
              Real results from independent commerce brands across Europe.
            </motion.p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.1 + i * 0.1 }}
                className="rounded-2xl border border-border/40 bg-card p-6 flex flex-col"
              >
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(t.rating)].map((_, j) => (
                    <Star key={j} size={14} className="fill-chart-3 text-chart-3" />
                  ))}
                </div>

                <p className="text-sm text-muted-foreground/80 mb-6 flex-1">"{t.text}"</p>

                <div className="flex items-center gap-3 pt-4 border-t border-border/30">
                  <div className="w-10 h-10 rounded-full bg-foreground/10 flex items-center justify-center shrink-0 font-bold text-xs">
                    {t.avatar}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{t.name}</p>
                    <p className="text-[11px] text-muted-foreground/60">
                      {t.role} at {t.company}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}