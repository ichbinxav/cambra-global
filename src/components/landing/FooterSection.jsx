import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import RevealOnScroll from "@/components/shared/RevealOnScroll";

export default function FooterSection() {
  return (
    <>
      {/* Final CTA */}
      <section className="py-40 px-6 bg-foreground text-background overflow-hidden relative">
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[50vw] font-extralight opacity-[0.03] select-none pointer-events-none leading-none"
          animate={{ rotate: 360 }}
          transition={{ duration: 120, repeat: Infinity, ease: "linear" }}
        >
          ✱
        </motion.div>
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <RevealOnScroll>
            <p className="text-[10px] tracking-[0.35em] uppercase opacity-30 mb-6">Ready to join?</p>
            <h2 className="text-[clamp(2.5rem,6vw,6rem)] font-bold tracking-[-0.03em] leading-[0.9] mb-10">
              Join the network
              <br />
              <span className="opacity-20">redefining how brands scale.</span>
            </h2>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/Onboarding">
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-full px-10 h-12 text-sm tracking-wide group border-background/20 text-background hover:bg-background hover:text-foreground font-medium"
                >
                  Join THE Node
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link to="/Analyzer">
                <Button
                  size="lg"
                  variant="ghost"
                  className="rounded-full px-10 h-12 text-sm text-background/50 hover:text-background hover:bg-background/10"
                >
                  Run the Analyzer
                </Button>
              </Link>
            </div>
          </RevealOnScroll>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-14 px-6 border-t border-border/40">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <span className="text-sm font-bold tracking-tight">THE N✱DE</span>
          <div className="flex gap-8 text-xs text-muted-foreground">
            <span>© {new Date().getFullYear()} THE Node</span>
            <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </>
  );
}