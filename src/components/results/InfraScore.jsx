import { motion } from "framer-motion";
import AnimatedCounter from "@/components/shared/AnimatedCounter";

export default function InfraScore({ score, revealed }) {
  const circumference = 2 * Math.PI * 80;
  const strokeOffset = circumference - (score / 100) * circumference;

  return (
    <motion.div
      className="flex flex-col items-center py-16"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1.5, duration: 0.8 }}
    >
      <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-8">Infrastructure Score</p>

      <div className="relative w-48 h-48">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 180 180">
          <circle cx="90" cy="90" r="80" fill="none" stroke="hsl(var(--border))" strokeWidth="4" />
          <motion.circle
            cx="90" cy="90" r="80" fill="none"
            stroke="hsl(var(--foreground))" strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={revealed ? { strokeDashoffset: strokeOffset } : {}}
            transition={{ duration: 2, delay: 0.5, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-4xl font-bold tracking-tighter">
            {revealed && <AnimatedCounter value={score} duration={2} />}
          </div>
          <p className="text-xs text-muted-foreground mt-1">/100</p>
        </div>
      </div>

      <p className="mt-6 text-sm text-muted-foreground max-w-sm text-center">
        {score >= 70 ? "Good infrastructure baseline. THE N✱DE can push you further." :
         score >= 40 ? "Significant optimization potential. THE N✱DE can transform your economics." :
         "Critical infrastructure gaps. THE N✱DE can save you substantially."}
      </p>
    </motion.div>
  );
}