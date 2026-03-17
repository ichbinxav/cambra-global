import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import AnimatedCounter from "@/components/shared/AnimatedCounter";
import NodeLoader from "@/components/shared/NodeLoader";
import ResultsBreakdown from "@/components/results/ResultsBreakdown";
import InfraScore from "@/components/results/InfraScore";

export default function Results() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (id) {
      base44.entities.AnalyzerResult.filter({ id }).then(results => {
        if (results.length > 0) setResult(results[0]);
        setTimeout(() => {
          setLoading(false);
          setTimeout(() => setRevealed(true), 300);
        }, 2500);
      });
    }
  }, []);

  if (loading) return <NodeLoader text="Analyzing your infrastructure" />;

  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">No results found.</p>
          <Link to="/Analyzer"><Button variant="outline">Run the Analyzer</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-16">
          <span className="text-sm font-semibold tracking-tight">THE N✱DE</span>
          <Link to="/Dashboard">
            <Button variant="outline" size="sm" className="rounded-full text-xs">Enter Dashboard</Button>
          </Link>
        </div>

        {/* Main reveal */}
        <motion.div
          className="text-center mb-20"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <motion.div
            className="text-5xl mb-6 select-none"
            initial={{ rotate: 0, scale: 0.5, opacity: 0 }}
            animate={{ rotate: 360, scale: 1, opacity: 1 }}
            transition={{ duration: 1.5, ease: "easeOut" }}
          >
            ✱
          </motion.div>

          <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-4">Your analysis is ready</p>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tighter leading-[0.95] mb-4">
            You're likely overpaying
          </h1>
          <div className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tighter text-foreground">
            {revealed && <AnimatedCounter value={result.total_savings} prefix="€" suffix="/yr" duration={2.5} />}
          </div>
        </motion.div>

        {/* Breakdown */}
        <ResultsBreakdown result={result} revealed={revealed} />

        {/* Infrastructure Score */}
        <InfraScore score={result.infra_score} revealed={revealed} />

        {/* CTA */}
        <motion.div
          className="text-center mt-20 py-16 border-t border-border"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
        >
          <h3 className="text-2xl font-bold tracking-tighter mb-3">Ready to optimize?</h3>
          <p className="text-muted-foreground mb-8">Join THE N✱DE and start saving immediately.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/Onboarding">
              <Button size="lg" className="rounded-full px-10 text-sm group">
                Join THE N✱DE <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link to="/Dashboard">
              <Button variant="outline" size="lg" className="rounded-full px-10 text-sm">
                View Dashboard
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}