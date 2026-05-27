import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Zap } from "lucide-react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";

export default function ConnectToolsSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section
      ref={ref}
      className="relative py-20 md:py-28 px-5 border-t border-border/40 bg-background overflow-hidden"
    >
      {/* Ambient (matches other landing sections) */}
      <div className="absolute inset-0 dot-grid opacity-20 pointer-events-none" />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/3 w-[36rem] h-[36rem] rounded-full blur-3xl bg-ambient-lilac opacity-[0.15]" />
        <div className="absolute -bottom-32 right-1/4 w-[32rem] h-[32rem] rounded-full blur-3xl bg-ambient-mint opacity-[0.12]" />
      </div>

      <div className="relative max-w-4xl">
        {/* Header */}
        <div className="mb-8 md:mb-10">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-2 mb-5 w-fit px-3 py-1.5 rounded-full border border-border/60 bg-background/70 backdrop-blur-sm"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cambra-cyan opacity-75" style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-cyan" />
            </span>
            <Zap size={10} className="opacity-60" />
            <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground">Recommended · Highest accuracy</span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="font-display text-[clamp(2.4rem,6vw,4rem)] font-black tracking-[-0.045em] leading-[0.92] mb-6 text-left"
          >
            <span className="text-foreground">Connect your </span>
            <span className="text-saas-gradient">tools.</span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-2xl mb-10"
          >
            Read-only connections to Stripe, Shopify, your carriers and accounting tools. <span className="text-foreground font-semibold">~98% accuracy</span>, real numbers, zero write access.
          </motion.p>
        </div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="cambra-card p-6 md:p-8 flex flex-col items-center text-center"
        >
          <p className="text-white/70 text-sm mb-6">
            Secure read-only access to your real data.
          </p>

          <Link to="/ConnectTools" className="w-full sm:w-auto">
            <Button size="lg" className="h-12 rounded-full px-8 text-sm font-bold bg-white text-neon-1 hover:bg-white/90 w-full sm:w-auto shadow-[0_0_32px_rgba(44,167,193,0.35)]">
              Connect your tools
            </Button>
          </Link>

          <p className="text-[11px] text-white/50 mt-6 font-mono tracking-[0.15em] uppercase">
            2-minute setup · Disconnect anytime
          </p>
        </motion.div>
      </div>
    </section>
  );
}