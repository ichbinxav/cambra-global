import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { motion, useInView } from "framer-motion";
import BrandLogoWordmark from "@/components/shared/BrandLogoWordmark";
import { useRef } from "react";

export default function FooterSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <>
      {/* Final CTA */}
      <section ref={ref} className="py-20 px-5 bg-foreground text-background relative overflow-hidden">
        <motion.div
          className="absolute inset-0 flex items-center justify-center text-[50vw] font-thin text-background/[0.02] select-none pointer-events-none leading-none"
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 80, repeat: Infinity, ease: "linear" }}
        >✱</motion.div>
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: "linear-gradient(hsl(var(--background)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--background)) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="text-[10px] tracking-[0.3em] uppercase opacity-25 mb-8">Find your unfair advantage</motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 60 }} animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.9, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="text-[clamp(2.5rem,7vw,7rem)] font-black tracking-[-0.04em] leading-[0.88] mb-4"
          >
            Stop overpaying for your infrastructure.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 24 }} animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-base opacity-40 mb-10 max-w-sm mx-auto"
          >
            Brands typically identify €29,000/year in optimization potential. Most improvements activate within minutes.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 24 }} animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.45 }}
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <Link to="/Analyzer" className="w-full sm:w-auto">
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Button size="lg" className="w-full h-14 rounded-full px-10 text-base font-bold gap-2 bg-saas-gradient text-white shadow-lg shadow-blue-500/20 ring-1 ring-white/10 hover:shadow-blue-500/40">
                  Calculate your savings
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </motion.div>
            </Link>
            <Link to="/Analyzer" className="w-full sm:w-auto">
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Button size="lg" className="w-full h-14 rounded-full px-10 text-base font-bold bg-background text-foreground border border-background/20 hover:bg-background/90">
                  Run the analyzer
                </Button>
              </motion.div>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer strip */}
      <footer className="py-10 px-5 border-t border-border/40 bg-background">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-5">
            <BrandLogoWordmark className="h-4" />
            <span className="text-xs text-muted-foreground/40">The operating layer behind independent brands</span>
          </div>
          <div className="flex items-center gap-5 text-xs text-muted-foreground/50">
            <span>© {new Date().getFullYear()} CAMBRA Collective</span>
            <Link to="/Privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link to="/Terms" className="hover:text-foreground transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </>
  );
}