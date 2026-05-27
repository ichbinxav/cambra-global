import { Activity, Zap, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';

export default function IntelligenceWidget() {
  const findings = [
    { title: 'Stripe → Adyen migration', savings: '€12k/yr', priority: 'high' },
    { title: 'Consolidate email & CRM', savings: '€8.4k/yr', priority: 'medium' },
    { title: 'Renegotiate DHL contract', savings: '€6.2k/yr', priority: 'medium' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border/40 bg-card p-5 space-y-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <Zap className="h-4 w-4 text-chart-1" />
        <h3 className="text-xs font-bold tracking-wider uppercase text-muted-foreground">Prioritized findings</h3>
      </div>

      <div className="space-y-2.5">
        {findings.map((f, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className="p-3 rounded-lg border border-border/30 bg-secondary/50 hover:bg-secondary transition-colors cursor-pointer"
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="text-sm font-medium text-foreground/90">{f.title}</span>
              <span className={`text-[10px] px-2 py-1 rounded-full font-semibold whitespace-nowrap ${
                f.priority === 'high' ? 'bg-orange-500/10 text-orange-500' : 'bg-blue-500/10 text-blue-500'
              }`}>
                {f.priority}
              </span>
            </div>
            <div className="text-xs text-muted-foreground/70 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              <span className="font-mono font-bold text-chart-1">{f.savings}</span>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="pt-2 border-t border-border/20">
        <button className="w-full h-8 rounded-lg bg-foreground/5 hover:bg-foreground/10 transition-colors text-xs font-semibold text-foreground/70">
          View all recommendations →
        </button>
      </div>
    </motion.div>
  );
}