import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
      {/* Subtle grid */}
      <div className="absolute inset-0 opacity-[0.025]" style={{
        backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
        backgroundSize: "80px 80px"
      }} />

      {/* Large background symbol */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[40vw] font-extralight text-foreground/[0.018] select-none pointer-events-none leading-none"
        animate={{ rotate: 360 }}
        transition={{ duration: 180, repeat: Infinity, ease: "linear" }}
      >
        ✱
      </motion.div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 text-center">
        {/* Badge */}
        <motion.div
          className="inline-flex items-center gap-2 mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <span className="text-[10px] tracking-[0.35em] uppercase text-muted-foreground border border-border/60 rounded-full px-4 py-1.5">
            Infrastructure for independent commerce
          </span>
        </motion.div>

        {/* Main headline */}
        <motion.h1
          className="text-[clamp(3rem,9vw,8.5rem)] font-bold tracking-[-0.03em] leading-[0.88] mb-8"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
        >
          Independent brands.
          <br />
          <span className="text-foreground/20">One network.</span>
          <br />
          Unlimited leverage.
        </motion.h1>

        {/* Sub */}
        <motion.p
          className="max-w-lg mx-auto text-lg text-muted-foreground leading-relaxed mb-14"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
        >
          We turn independent brands into a coordinated economic force — reducing costs, improving margins, and unlocking enterprise-grade infrastructure.
        </motion.p>

        {/* CTAs */}
        <motion.div
          className="flex flex-col sm:flex-row gap-3 justify-center items-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <Link to="/Onboarding">
            <Button size="lg" className="rounded-full px-9 h-12 text-sm tracking-wide group font-medium">
              Join THE Node
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
          <Link to="/Analyzer">
            <Button variant="outline" size="lg" className="rounded-full px-9 h-12 text-sm tracking-wide font-medium border-border/60">
              Run the Analyzer →
            </Button>
          </Link>
        </motion.div>

        {/* Social proof */}
        <motion.div
          className="mt-20 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-[11px] tracking-[0.2em] uppercase text-muted-foreground/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.7 }}
        >
          {["Fashion", "Beauty", "Wellness", "Lifestyle", "DTC"].map((cat, i, arr) => (
            <span key={cat} className="flex items-center gap-10">
              {cat}
              {i < arr.length - 1 && <span className="text-muted-foreground/20">✱</span>}
            </span>
          ))}
        </motion.div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}