import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { ArrowRight } from "lucide-react";

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
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tighter">Insights</h1>
        <p className="text-muted-foreground text-sm mt-1">Intelligence for independent brands.</p>
      </div>

      {/* Category filters */}
      <div className="flex gap-2 mb-8 flex-wrap">
        {["all", "payments", "margins", "scaling", "infrastructure"].map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-4 py-2 rounded-full text-xs tracking-wide transition-all ${
              filter === cat
                ? "bg-foreground text-background"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {cat === "all" ? "All" : CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <motion.div className="text-3xl" animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>✱</motion.div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-2xl">
          <div className="text-3xl mb-4 select-none">✱</div>
          <p className="text-muted-foreground text-sm">No insights published yet. Check back soon.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filtered.map((insight, i) => (
            <Link key={insight.id} to={`/InsightDetail?id=${insight.id}`}>
              <motion.article
                className="group p-6 rounded-2xl border border-border bg-card hover:shadow-md hover:border-foreground/10 transition-all"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.4 }}
              >
                {insight.cover_image && (
                  <img src={insight.cover_image} alt="" className="w-full h-40 object-cover rounded-xl mb-4" />
                )}
                <div className="flex items-center gap-3 mb-3">
                  {insight.category && (
                    <span className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground bg-secondary px-2 py-1 rounded-full">
                      {CATEGORY_LABELS[insight.category] || insight.category}
                    </span>
                  )}
                  {insight.read_time && <span className="text-[10px] text-muted-foreground">{insight.read_time} min read</span>}
                </div>
                <h3 className="text-lg font-semibold tracking-tight mb-2 group-hover:underline">{insight.title}</h3>
                {insight.excerpt && <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">{insight.excerpt}</p>}
                <ArrowRight size={14} className="mt-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
              </motion.article>
            </Link>
          ))}
        </div>
      )}
    </motion.div>
  );
}