import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, CreditCard, Truck, Package, BarChart2 } from "lucide-react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const FEATURES = [
  { icon: BarChart2, label: "Infrastructure Analyzer", sub: "Unlimited runs" },
  { icon: CreditCard, label: "Payment rate optimization", sub: "1.4% network rate" },
  { icon: Truck, label: "Shipping contract access", sub: "−18% avg. saving" },
  { icon: Package, label: "SaaS group deals", sub: "Up to −30% on tools" },
];

const EXTRAS = [
  "Full network benchmark access",
  "Savings history & dashboard",
  "Member network directory",
  "Priority deal activation",
];

export default function PricingSection() {
  const leftRef = useRef(null);
  const leftInView = useInView(leftRef, { once: true, margin: "-80px" });
  const rightRef = useRef(null);
  const rightInView = useInView(rightRef, { once: true, margin: "-80px" });

  return (
    <section className="py-10 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto">

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">

          {/* Left */}
          <motion.div
            ref={leftRef}
            className="text-center lg:text-left"
            initial={{ opacity: 0, x: -40 }}
            animate={leftInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-5 flex items-center justify-center lg:justify-start gap-2">
              <span className="w-4 h-px bg-border" /> Pricing
            </p>
            <h2 className="text-[clamp(2.2rem,5vw,4rem)] font-black tracking-[-0.04em] leading-[0.88] mb-5 text-center lg:text-left">
              You don't pay us.<br />You keep the savings.
            </h2>
            <p className="text-muted-foreground text-base leading-relaxed mb-8 max-w-sm mx-auto text-center lg:text-left">
              Zero upfront cost. Zero commitment. You only pay when your infrastructure costs drop. When they do, we share in the gain.
            </p>

            {/* Savings range */}
            <div className="space-y-3">
              <div className="p-5 rounded-2xl border border-border/40 bg-card">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40 mb-2">Savings potential per brand</p>
                <p className="text-4xl font-black tracking-tight">€18K – €72K<span className="text-base font-normal text-muted-foreground">/yr</span></p>
                <p className="text-[11px] text-muted-foreground/40 mt-1">Based on real network benchmarks across payments, shipping, and SaaS.</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Payments", val: "−52%", color: "text-cambra-lilac", bg: "bg-cambra-lilac-soft border-cambra-lilac" },
                  { label: "Shipping", val: "−18%", color: "text-cambra-mint", bg: "bg-cambra-mint-soft border-cambra-mint" },
                  { label: "SaaS", val: "−30%", color: "text-cambra-plum", bg: "bg-cambra-plum-soft border-cambra-plum" },
                ].map((item, i) => (
                  <div key={i} className={`p-3.5 rounded-xl border text-center ${item.bg}`}>
                    <p className={`text-xl font-black ${item.color}`}>{item.val}</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Right — pricing card */}
          <motion.div
            ref={rightRef}
            initial={{ opacity: 0, x: 40, y: 20 }}
            animate={rightInView ? { opacity: 1, x: 0, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm"
          >
            {/* Header */}
            <div className="px-7 py-6 border-b border-border/40 bg-foreground text-background">
              {/* Early partner badge */}
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-background/15 bg-background/10 mb-4">
                <span className="w-1 h-1 rounded-full bg-green-400" />
                <span className="text-[10px] font-semibold text-background/60 tracking-[0.1em] uppercase">CAMBRA · Early partner</span>
              </div>

              <div className="flex items-baseline gap-3 mb-1">
                {/* Crossed-out price */}
                <span className="text-xl font-light text-background/25 line-through">€60/mo</span>
                <span className="text-5xl font-black">Free</span>
              </div>
              <p className="text-sm text-background/50">25% success fee on realized savings · If we don’t save you money, you pay zero.</p>
            </div>

            {/* Feature icons */}
            <div className="px-7 pt-6 pb-4 grid grid-cols-2 gap-3">
              {FEATURES.map((f, i) => (
                <div key={i} className="flex items-center gap-2.5 p-3 rounded-xl bg-secondary/50 border border-border/30">
                  <f.icon size={13} className="text-muted-foreground/50 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold truncate">{f.label}</p>
                    <p className="text-[10px] text-muted-foreground/40">{f.sub}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Extras */}
            <div className="px-7 pb-6 space-y-2">
              {EXTRAS.map(f => (
                <div key={f} className="flex items-center gap-2.5">
                  <CheckCircle2 size={12} className="text-cambra-mint shrink-0" />
                  <span className="text-xs text-muted-foreground">{f}</span>
                </div>
              ))}
            </div>

            {/* Economics clarity */}
            <div className="px-7 pb-4">
              <div className="p-4 rounded-xl border border-border/40 bg-secondary/30">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-2">Economics</p>
                <ul className="text-xs text-muted-foreground space-y-1.5">
                  <li>• 25% success fee on realized savings</li>
                  <li>• If we don’t save you money, you pay zero</li>
                  <li>• Membership standard price: <span className="line-through">€60/month</span> — Free for Early Adopters</li>
                </ul>
              </div>
            </div>

            {/* CTA */}
            <div className="px-7 pb-7">
              <Link to="/Onboarding">
                <Button className="w-full h-12 rounded-xl text-sm font-bold gap-2 bg-saas-gradient text-white shadow-lg shadow-blue-500/20 ring-1 ring-white/10 hover:shadow-blue-500/40">
                  Join CAMBRA <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <p className="text-[10px] text-muted-foreground/40 text-center mt-3">
                We only succeed when your costs improve · Most brands see results within the first cycle.
              </p>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}