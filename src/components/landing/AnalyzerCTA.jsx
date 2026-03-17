import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import RevealOnScroll from "@/components/shared/RevealOnScroll";

export default function AnalyzerCTA() {
  return (
    <section id="analyzer" className="py-32 px-6 bg-secondary/50">
      <div className="max-w-4xl mx-auto text-center">
        <RevealOnScroll>
          <motion.div
            className="text-6xl mb-8 select-none"
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          >
            ✱
          </motion.div>
        </RevealOnScroll>
        <RevealOnScroll delay={0.1}>
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tighter leading-[0.95] mb-6">
            How much are you
            <br />
            overpaying?
          </h2>
        </RevealOnScroll>
        <RevealOnScroll delay={0.2}>
          <p className="max-w-xl mx-auto text-lg text-muted-foreground leading-relaxed mb-10">
            Run the N✱DE Analyzer. In under 3 minutes, discover exactly how much your 
            infrastructure costs you — and how much you could save.
          </p>
        </RevealOnScroll>
        <RevealOnScroll delay={0.3}>
          <Link to="/Analyzer">
            <Button size="lg" className="rounded-full px-10 text-sm tracking-wide group">
              Run the Analyzer
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </RevealOnScroll>
      </div>
    </section>
  );
}