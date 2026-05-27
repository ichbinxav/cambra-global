import { AlertCircle, TrendingDown } from 'lucide-react';
import { motion } from 'framer-motion';

const ALERTS = [
  { category: 'Payments', drift: '+0.06pp', vs: 'peer', impact: '€1.8k/yr' },
  { category: 'Shipping', drift: '€0.12/order', vs: 'peer', impact: '€5.6k/yr' },
  { category: 'SaaS', overlap: '2 tools', impact: '€4.8k/yr' },
];

export default function DriftAlertStrip() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
      {ALERTS.map((alert, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08 }}
          className="p-4 rounded-xl border border-orange-500/20 bg-orange-500/5 flex items-start gap-3"
        >
          <AlertCircle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-sm font-semibold text-foreground">{alert.category}</span>
              {alert.drift && <span className="text-xs font-mono font-bold text-orange-500">{alert.drift}</span>}
              {alert.overlap && <span className="text-xs font-mono font-bold text-orange-500">{alert.overlap}</span>}
            </div>
            <div className="text-[11px] text-muted-foreground/70">
              {alert.vs && `${alert.vs} median`}
              {alert.overlap && `duplicated`}
            </div>
            <div className="text-[10px] font-mono text-orange-500/80 mt-1">Impact: {alert.impact}</div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}