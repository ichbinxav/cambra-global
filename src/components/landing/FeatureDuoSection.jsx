import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Network, BarChart2, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

function FeatureCard({ icon: Icon, title, body, accent }) {
  return (
    <div className="group relative rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{background: accent}} />
      <div className="relative z-10 p-6 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-secondary/60 border border-border/40 flex items-center justify-center">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold mb-1.5">{title}</h3>
          <p className="text-sm text-muted-foreground/80">{body}</p>
          <Link to="/Onboarding" className="inline-flex items-center gap-1.5 text-[12px] font-semibold mt-3 text-foreground/80 hover:text-foreground">
            Join to access <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function FeatureDuoSection(){
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-10 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto">
        <div ref={ref} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <motion.div initial={false} animate={inView?{opacity:1,y:0}:{}} transition={{duration:0.5}}>
            <FeatureCard
              icon={Network}
              title="Network"
              body="Connect with independent brands. Build partnerships, explore collaboration opportunities, and grow within a curated ecosystem of operators."
              accent="radial-gradient(600px 220px at 10% -10%, rgba(44,167,193,0.12), transparent)"
            />
          </motion.div>
          <motion.div initial={false} animate={inView?{opacity:1,y:0}:{}} transition={{duration:0.5, delay:0.06}}>
            <FeatureCard
              icon={BarChart2}
              title="Intelligence"
              body="Benchmark your infrastructure against the network. Track your savings score, identify gaps, and access market insights."
              accent="radial-gradient(600px 220px at 110% 110%, rgba(31,78,216,0.12), transparent)"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}