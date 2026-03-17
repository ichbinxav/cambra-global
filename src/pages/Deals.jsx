import { motion } from "framer-motion";

const DEAL_CATEGORIES = [
  { title: "Payment Processing", desc: "Network-negotiated rates from top providers.", status: "Coming Q2 2026" },
  { title: "Shipping & Logistics", desc: "Volume discounts across major carriers.", status: "Coming Q3 2026" },
  { title: "SaaS Bundle", desc: "Discounted subscriptions for essential tools.", status: "Coming Q3 2026" },
  { title: "Insurance", desc: "Group rates for business insurance.", status: "Coming Q4 2026" },
  { title: "Banking", desc: "Tailored financial products for brands.", status: "Coming 2027" },
  { title: "Warehousing", desc: "Shared fulfillment infrastructure.", status: "Coming 2027" },
];

export default function Deals() {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tighter">Deals</h1>
        <p className="text-muted-foreground text-sm mt-1">Infrastructure deals negotiated by the network, for the network.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {DEAL_CATEGORIES.map((deal, i) => (
          <motion.div
            key={deal.title}
            className="p-6 rounded-2xl border border-border bg-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.5 }}
          >
            <div className="text-lg mb-3 select-none">✱</div>
            <h3 className="font-semibold tracking-tight mb-2">{deal.title}</h3>
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{deal.desc}</p>
            <span className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground bg-secondary px-3 py-1.5 rounded-full">
              {deal.status}
            </span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}