import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import RevealOnScroll from "@/components/shared/RevealOnScroll";

export default function FooterSection() {
  return (
    <>
      {/* Final CTA */}
      <section className="py-32 px-6 bg-foreground text-background">
        <div className="max-w-4xl mx-auto text-center">
          <RevealOnScroll>
            <motion.div
              className="text-8xl mb-10 select-none opacity-20"
              animate={{ rotate: 360 }}
              transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
            >
              ✱
            </motion.div>
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tighter leading-[0.95] mb-8">
              Join the network redefining
              <br />
              <span className="opacity-40">how brands scale.</span>
            </h2>
            <Link to="/Onboarding">
              <Button 
                size="lg" 
                variant="outline"
                className="rounded-full px-10 text-sm tracking-wide group border-background/20 text-background hover:bg-background hover:text-foreground"
              >
                Join THE N✱DE
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </RevealOnScroll>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-border">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <span className="text-sm font-semibold tracking-tight">THE N✱DE</span>
          <div className="flex gap-8 text-xs text-muted-foreground">
            <span>© {new Date().getFullYear()}</span>
            <span>Privacy</span>
            <span>Terms</span>
          </div>
        </div>
      </footer>
    </>
  );
}