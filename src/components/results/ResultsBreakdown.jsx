import { motion } from "framer-motion";
import AnimatedCounter from "@/components/shared/AnimatedCounter";

const items = [
  { key: "payment_savings", label: "Payment Processing", icon: "💳" },
  { key: "shipping_savings", label: "Shipping & Logistics", icon: "📦" },
  { key: "saas_savings", label: "SaaS & Tools", icon: "⚡" },
];

export default function ResultsBreakdown({ result, revealed }) {
  return (
    <motion.div
      className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.8, duration: 0.8 }}
    >
      {items.map((item, i) => (
        <motion.div
          key={item.key}
          className="p-8 rounded-2xl border border-border bg-card hover:shadow-lg transition-shadow"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 + i * 0.2, duration: 0.6 }}
        >
          <div className="text-2xl mb-4">{item.icon}</div>
          <p className="text-sm text-muted-foreground mb-2">{item.label}</p>
          <div className="text-3xl font-bold tracking-tight">
            {revealed && (
              <AnimatedCounter value={result[item.key]} prefix="€" suffix="/yr" duration={2} />
            )}
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}