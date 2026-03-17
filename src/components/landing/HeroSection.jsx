import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
        backgroundSize: "60px 60px"
      }} />

      {/* Floating symbol */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[30vw] font-extralight text-foreground/[0.02] select-none pointer-events-none"
        animate={{ rotate: 360 }}
        transition={{ duration: 120, repeat: Infinity, ease: "linear" }}
      >
        ✱
      </motion.div>

      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-8">
            Infrastructure for independent commerce
          </p>
        </motion.div>

        <motion.h1
          className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-bold tracking-tighter leading-[0.9] mb-8"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
        >
          Independent brands.
          <br />
          <span className="text-muted-foreground/40">One network.</span>
          <br />
          Unlimited leverage.
        </motion.h1>

        <motion.p
          className="max-w-xl mx-auto text-lg text-muted-foreground leading-relaxed mb-12"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        >
          Connect your business. Reduce costs. Scale with the power of a collective network.
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row gap-4 justify-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <Link to="/Onboarding">
            <Button size="lg" className="rounded-full px-8 text-sm tracking-wide group">
              Join THE N✱DE
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
          <Link to="/Analyzer">
            <Button variant="outline" size="lg" className="rounded-full px-8 text-sm tracking-wide">
              Run the Analyzer
            </Button>
          </Link>
        </motion.div>

        <motion.div
          className="mt-20 flex items-center justify-center gap-12 text-xs tracking-[0.15em] uppercase text-muted-foreground/60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.8 }}
        >
          <span>Fashion</span>
          <span className="text-muted-foreground/30">✱</span>
          <span>Beauty</span>
          <span className="text-muted-foreground/30">✱</span>
          <span>Wellness</span>
          <span className="text-muted-foreground/30">✱</span>
          <span>Lifestyle</span>
        </motion.div>
      </div>
    </section>
  );
}