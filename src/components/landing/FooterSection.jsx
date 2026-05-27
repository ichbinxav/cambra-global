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
      <section ref={ref} className="py-24 px-5 bg-foreground text-background relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.025] pointer-events-none"
          style={{
            backgroundImage: "linear-gradient(hsl(var(--background)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--background)) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        {/* Ambient glows */}
        <div className="absolute top-0 left-[30%] w-[400px] h-[400px] rounded-full blur-[100px] opacity-10" style={{ background: "radial-gradient(closest-side, #635BFF, transparent)" }} />
        <div className="absolute bottom-0 right-[20%] w-[300px] h-[300px] rounded-full blur-[80px] opacity-10" style={{ background: "radial-gradient(closest-side, #06B6D4, transparent)" }} />

        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <motion.p
            initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.5 }}
            className="text-[10px] tracking-[0.3em] uppercase opacity-25 mb-8 font-mono"
          >Continuous · Quantified · Peer-benchmarked</motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.9, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="text-[clamp(2.5rem,7vw,6rem)] font-black tracking-[-0.04em] leading-[0.88] mb-5"
          >
            Drift stops<br />compounding here.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-lg opacity-40 mb-10 max-w-md mx-auto leading-relaxed"
          >
            Eight cost layers. One engine. Peer medians, watched continuously.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.45 }}
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <Link to="/Analyzer" className="w-full sm:w-auto">
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Button size="lg" className="w-full h-14 rounded-full px-10 text-base font-bold gap-2 bg-background text-foreground hover:opacity-90">
                  Run audit
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </motion.div>
            </Link>
            <Link to="/Analyzer?preview=1" className="w-full sm:w-auto">
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Button size="lg" variant="outline" className="w-full h-14 rounded-full px-10 text-base font-bold border-background/20 text-background hover:bg-background/10">
                  See live engine
                </Button>
              </motion.div>
            </Link>
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}}
            transition={{ delay: 0.6 }}
            className="text-[11px] opacity-20 mt-6"
          >Takes less than 3 minutes · No credit card required</motion.p>
        </div>
      </section>

      {/* Footer strip */}
      <footer className="py-10 px-5 border-t border-border/40 bg-background">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-5">
            <BrandLogoWordmark className="h-4" />
            <span className="text-xs text-muted-foreground/35 font-mono">The operating system for margin</span>
          </div>
          <div className="flex items-center gap-5 text-xs text-muted-foreground/40">
            <span>© {new Date().getFullYear()} CAMBRA</span>
            <Link to="/Privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link to="/Terms" className="hover:text-foreground transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </>
  );
}