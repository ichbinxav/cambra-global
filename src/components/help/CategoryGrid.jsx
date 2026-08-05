import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Sparkles, Activity, Gauge, TrendingDown, CreditCard, Truck, Package,
  BarChart3, Plug, Upload, Shield, Wallet, Wrench, Scale, ArrowUpRight,
} from "lucide-react";
import { getVisibleCategories } from "@/lib/helpCenterData";

const ICON_MAP = {
  Sparkles, Activity, Gauge, TrendingDown, CreditCard, Truck, Package,
  BarChart3, Plug, Upload, Shield, Wallet, Wrench, Scale,
};

export default function CategoryGrid() {
  // v59 — categories governed by featureScope (see getVisibleCategories).
  // Dormant-vertical categories are retired (not in CATEGORIES), so they
  // never appear here and /Help/<retired-slug> redirects to /Help.
  const visibleCategories = getVisibleCategories();

  return (
    <section className="py-12 px-5">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-baseline justify-between mb-8">
          <h2 className="text-2xl md:text-3xl font-black tracking-[-0.03em]" style={{ color: "var(--ink)" }}>
            Explore the knowledge base.
          </h2>
          <p className="hidden md:block text-xs" style={{ color: "var(--gris-2)" }}>
            {visibleCategories.length} categories · Continuously updated
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {visibleCategories.map((cat, i) => {
            const Icon = ICON_MAP[cat.icon] || Sparkles;
            return (
              <motion.div
                key={cat.slug}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }}
              >
                <Link
                  to={`/Help/${cat.slug}`}
                  className="group relative block h-full p-5 rounded-2xl transition-all overflow-hidden hover:-translate-y-0.5"
                  style={{
                    border: "1px solid var(--linea)",
                    background: "#fff",
                    boxShadow: "0 4px 20px rgba(12,12,22,0.04)",
                  }}
                >
                  <div className="relative">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-105"
                      style={{
                        background: `${cat.accent}14`,
                        border: `1px solid ${cat.accent}30`,
                      }}
                    >
                      <Icon className="w-4 h-4" style={{ color: cat.accent }} />
                    </div>

                    <h3 className="text-[15px] font-bold tracking-tight mb-1.5 flex items-center gap-1.5" style={{ color: "var(--ink)" }}>
                      {cat.title}
                      <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" style={{ color: "var(--gris-2)" }} />
                    </h3>
                    <p className="text-xs leading-relaxed" style={{ color: "var(--gris-1)" }}>
                      {cat.description}
                    </p>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}