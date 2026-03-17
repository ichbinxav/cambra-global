import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Fine grid */}
      <div
        className="absolute inset-0 opacity-[0.022]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      />

      {/* Ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-blue-500/[0.03] blur-3xl pointer-events-none" />

      {/* Background ✱ */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[42vw] font-thin text-foreground/[0.015] select-none pointer-events-none leading-none"
        animate={{ rotate: 360 }}
        transition={{ duration: 200, repeat: Infinity, ease: "linear" }}
      >
        ✱
      </motion.div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 text-center">
        {/* Tag */}
        <motion.div
          className="inline-flex items-center gap-2.5 mb-10"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse-slow" />
          <span className="text-[11px] tracking-[0.3em] uppercase text-muted-foreground/70">
            Infrastructure for independent commerce
          </span>
        </motion.div>

        {/* Headline */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 className="text-[clamp(3.2rem,10vw,9.5rem)] font-black tracking-[-0.04em] leading-[0.86]">
            Independent<br />
            brands.{" "}
            <span className="text-foreground/18">One</span>
            <br />
            <span className="text-foreground/18">network.</span>
          </h1>
        </motion.div>

        {/* Sub */}
        <motion.p
          className="max-w-md mx-auto text-lg text-muted-foreground leading-relaxed mt-10 mb-12"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          Connect your business. Reduce costs. Scale with the power of a coordinated economic network.
        </motion.p>

        {/* CTAs */}
        <motion.div
          className="flex flex-col sm:flex-row gap-3 justify-center"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.45 }}
        >
          <Link to="/Onboarding">
            <Button size="lg" className="h-12 rounded-full px-9 text-sm font-semibold group shadow-sm">
              Join THE NoDE
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
          <Link to="/Analyzer">
            <Button variant="outline" size="lg" className="h-12 rounded-full px-9 text-sm font-medium border-border/70">
              Run the Analyzer →
            </Button>
          </Link>
        </motion.div>

        {/* Proof line */}
        <motion.p
          className="mt-12 text-[12px] text-muted-foreground/50 tracking-wide"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
        >
          Early partners across Europe are already connecting — and outperforming.
        </motion.p>

        {/* Category line */}
        <motion.div
          className="mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1 }}
        >
          {["Fashion", "Beauty", "Wellness", "Lifestyle", "DTC"].map((cat, i, arr) => (
            <span key={cat} className="flex items-center gap-8 text-[11px] tracking-[0.2em] uppercase text-muted-foreground/35">
              {cat}
              {i < arr.length - 1 && <span className="text-muted-foreground/15">✱</span>}
            </span>
          ))}
        </motion.div>
      </div>

      {/* Bottom gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-background to-transparent pointer-events-none" />

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
      >
        <motion.div
          className="w-px h-10 bg-gradient-to-b from-transparent to-border/60"
          animate={{ scaleY: [0, 1, 0], originY: 0 }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>
    </section>
  );
}