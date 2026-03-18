import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";

export default function FooterSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <>
      {/* Final CTA */}
      <section ref={ref} className="py-32 px-5 bg-foreground text-background relative overflow-hidden">
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
            Stop overpaying<br />for your infrastructure.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 24 }} animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-base opacity-40 mb-10 max-w-sm mx-auto"
          >
            Brands typically unlock €29,000/year in savings. Most improvements can be activated in minutes.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 24 }} animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.45 }}
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <Link to="/Analyzer" className="w-full sm:w-auto">
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Button size="lg" variant="outline" className="w-full h-14 rounded-full px-10 text-base font-bold border-background/25 text-background hover:bg-background hover:text-foreground gap-2">
                  Calculate your savings
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </motion.div>
            </Link>
            <Link to="/Onboarding" className="w-full sm:w-auto">
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Button size="lg" variant="ghost" className="w-full h-14 rounded-full px-10 text-base text-background/50 hover:text-background hover:bg-background/10">
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
            <span className="text-sm font-black tracking-tight">THE NoDE</span>
            <span className="text-xs text-muted-foreground/40">Infrastructure leverage for independent brands</span>
          </div>
          <div className="flex items-center gap-5 text-xs text-muted-foreground/50">
            <span>© {new Date().getFullYear()} THE NoDE</span>
            <Link to="/Privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link to="/Terms" className="hover:text-foreground transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </>
  );
}