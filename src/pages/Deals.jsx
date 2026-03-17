import { motion } from "framer-motion";
import { Lock } from "lucide-react";

const DEALS = [
  { title: "Payment Processing", desc: "Network-negotiated rates from top European payment processors. Target: 1.4% effective rate.", status: "Coming Q2 2026", phase: "soon" },
  { title: "Shipping & Logistics", desc: "Collective volume discounts across DHL, DPD, UPS, and specialist carriers.", status: "Coming Q3 2026", phase: "soon" },
  { title: "SaaS Bundle", desc: "Group licenses and discounted subscriptions for essential commerce tools.", status: "Coming Q3 2026", phase: "soon" },
  { title: "Business Insurance", desc: "Group rates for product liability, D&O, and e-commerce specific cover.", status: "Coming Q4 2026", phase: "future" },
  { title: "Business Banking", desc: "Tailored financial products, FX, and credit lines for scaling brands.", status: "Coming 2027", phase: "future" },
  { title: "Shared Warehousing", desc: "Distributed fulfillment infrastructure across Europe — shared by the network.", status: "Coming 2027", phase: "future" },
];

export default function Deals() {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
      <div className="mb-10">
        <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-2">Network</p>
        <h1 className="text-3xl font-black tracking-[-0.03em]">Deals</h1>
        <p className="text-muted-foreground text-sm mt-1.5">Infrastructure deals negotiated by the network, for the network.</p>
      </div>

      {/* Banner */}
      <div className="p-6 rounded-2xl border border-blue-500/20 bg-blue-500/[0.03] mb-8">
        <div className="flex items-start gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 animate-pulse-slow shrink-0" />
          <div>
            <p className="text-sm font-semibold mb-1">Network deals are being negotiated</p>
            <p className="text-sm text-muted-foreground">As THE NoDE network grows, collective purchasing power increases. Deals will unlock as we reach critical mass in each category.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {DEALS.map((deal, i) => (
          <motion.div
            key={deal.title}
            className="group p-7 rounded-2xl border border-border/50 bg-card/60 hover:bg-card hover:border-border transition-all"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.4 }}
            whileHover={{ y: -2 }}
          >
            <div className="flex items-start justify-between mb-5">
              <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                <Lock size={13} className="text-muted-foreground/50" />
              </div>
              <span className={`text-[10px] tracking-[0.1em] uppercase px-2.5 py-1 rounded-full ${
                deal.phase === "soon"
                  ? "bg-blue-500/10 text-blue-600"
                  : "bg-secondary text-muted-foreground/50"
              }`}>
                {deal.phase === "soon" ? "Soon" : "Planned"}
              </span>
            </div>
            <h3 className="font-bold tracking-tight mb-2 text-sm">{deal.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">{deal.desc}</p>
            <p className="text-[11px] text-muted-foreground/40">{deal.status}</p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}