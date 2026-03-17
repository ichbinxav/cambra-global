import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import RevealOnScroll from "@/components/shared/RevealOnScroll";

export default function FooterSection() {
  return (
    <>
      {/* Final CTA — black */}
      <section className="py-44 px-6 bg-foreground text-background overflow-hidden relative">
        <motion.div
          className="absolute inset-0 flex items-center justify-center text-[55vw] font-thin text-background/[0.02] select-none pointer-events-none leading-none overflow-hidden"
          animate={{ rotate: 360 }}
          transition={{ duration: 240, repeat: Infinity, ease: "linear" }}
        >
          ✱
        </motion.div>
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <RevealOnScroll>
            <span className="text-[10px] tracking-[0.3em] uppercase opacity-30 block mb-8">Ready?</span>
            <h2 className="text-[clamp(3rem,8vw,8rem)] font-black tracking-[-0.04em] leading-[0.85] mb-12">
              Join the network<br />
              <span className="opacity-18">redefining how</span><br />
              <span className="opacity-18">brands scale.</span>
            </h2>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/Onboarding">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-full px-10 text-sm font-semibold group border-background/20 text-background hover:bg-background hover:text-foreground"
                >
                  Join THE NoDE
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link to="/Analyzer">
                <Button
                  size="lg"
                  variant="ghost"
                  className="h-12 rounded-full px-10 text-sm text-background/40 hover:text-background hover:bg-background/8"
                >
                  Run the Analyzer
                </Button>
              </Link>
            </div>
          </RevealOnScroll>
        </div>
      </section>

      {/* Footer strip */}
      <footer className="py-12 px-6 border-t border-border/40 bg-background">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-5">
          <div className="flex items-center gap-6">
            <span className="text-sm font-black tracking-tight">THE N✱DE</span>
            <span className="text-xs text-muted-foreground/40">Infrastructure for independent commerce</span>
          </div>
          <div className="flex gap-6 text-xs text-muted-foreground/50">
            <span>© {new Date().getFullYear()} THE NoDE</span>
            <Link to="/Privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link to="/Terms" className="hover:text-foreground transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </>
  );
}