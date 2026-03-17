import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { ArrowRight, Clock } from "lucide-react";

const CATEGORY_LABELS = {
  payments: "Payments",
  margins: "Margins",
  scaling: "Scaling",
  infrastructure: "Infrastructure",
};

export default function Insights() {
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    base44.entities.Insight.list("-created_date", 50).then(i => {
      setInsights(i);
      setLoading(false);
    });
  }, []);

  const filtered = filter === "all" ? insights : insights.filter(i => i.category === filter);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div className="mb-10">
        <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">Research</p>
        <h1 className="text-3xl font-bold tracking-tight">Insights</h1>
        <p className="text-muted-foreground text-sm mt-1.5">Intelligence for independent brands.</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-8 flex-wrap">
        {["all", "payments", "margins", "scaling", "infrastructure"].map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-4 py-1.5 rounded-full text-xs tracking-wide transition-all ${
              filter === cat
                ? "bg-foreground text-background font-medium"
                : "border border-border/60 text-muted-foreground hover:text-foreground hover:border-foreground/20"
            }`}
          >
            {cat === "all" ? "All" : CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <motion.div className="text-2xl text-muted-foreground/30" animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }}>✱</motion.div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-32 border border-dashed border-border/60 rounded-2xl">
          <div className="text-3xl mb-4 select-none opacity-20">✱</div>
          <p className="text-muted-foreground text-sm">No insights published yet. Check back soon.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filtered.map((insight, i) => (
            <Link key={insight.id} to={`/InsightDetail?id=${insight.id}`}>
              <motion.article
                className="group h-full p-6 rounded-2xl border border-border/60 bg-card hover:border-foreground/10 transition-all"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.4 }}
              >
                {insight.cover_image && (
                  <img src={insight.cover_image} alt="" className="w-full h-44 object-cover rounded-xl mb-5" />
                )}
                <div className="flex items-center gap-3 mb-3">
                  {insight.category && (
                    <span className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground bg-secondary/80 px-2.5 py-1 rounded-full">
                      {CATEGORY_LABELS[insight.category] || insight.category}
                    </span>
                  )}
                  {insight.read_time && (
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock size={11} />
                      {insight.read_time} min
                    </span>
                  )}
                </div>
                <h3 className="text-base font-semibold tracking-tight mb-2 group-hover:opacity-70 transition-opacity">{insight.title}</h3>
                {insight.excerpt && <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">{insight.excerpt}</p>}
                <div className="mt-4 flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                  Read more <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                </div>
              </motion.article>
            </Link>
          ))}
        </div>
      )}
    </motion.div>
  );
}