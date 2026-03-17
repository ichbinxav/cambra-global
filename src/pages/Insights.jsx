import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { ArrowRight, Clock } from "lucide-react";

const CATEGORIES = {
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
    base44.entities.Insight.list("-created_date", 50).then(i => { setInsights(i); setLoading(false); });
  }, []);

  const filtered = filter === "all" ? insights : insights.filter(i => i.category === filter);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
      <div className="mb-10">
        <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-2">Research</p>
        <h1 className="text-3xl font-black tracking-[-0.03em]">Insights</h1>
        <p className="text-muted-foreground text-sm mt-1.5">Intelligence for independent brands. FOR LIFESTYLE COMMERCE.</p>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 mb-8 flex-wrap">
        {["all", ...Object.keys(CATEGORIES)].map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-4 py-1.5 rounded-full text-xs font-medium tracking-wide transition-all ${
              filter === cat
                ? "bg-foreground text-background"
                : "border border-border/60 text-muted-foreground hover:text-foreground hover:border-foreground/20"
            }`}
          >
            {cat === "all" ? "All" : CATEGORIES[cat]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-40">
          <motion.div className="text-2xl text-muted-foreground/25" animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }}>✱</motion.div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-36 border border-dashed border-border/50 rounded-2xl">
          <div className="text-3xl mb-4 select-none opacity-15">✱</div>
          <p className="text-muted-foreground text-sm">No insights published yet. Check back soon.</p>
        </div>
      ) : (
        <>
          {/* Featured first */}
          {filtered[0] && (
            <Link to={`/InsightDetail?id=${filtered[0].id}`} className="block mb-5">
              <motion.article
                className="group p-8 rounded-2xl border border-border/50 bg-card/60 hover:border-border hover:bg-card transition-all"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -2 }}
              >
                {filtered[0].cover_image && (
                  <img src={filtered[0].cover_image} alt="" className="w-full h-56 object-cover rounded-xl mb-7" />
                )}
                <div className="flex items-center gap-3 mb-4">
                  {filtered[0].category && (
                    <span className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground/50 bg-secondary/80 px-2.5 py-1 rounded-full">
                      {CATEGORIES[filtered[0].category] || filtered[0].category}
                    </span>
                  )}
                  {filtered[0].read_time && (
                    <span className="text-[11px] text-muted-foreground/50 flex items-center gap-1">
                      <Clock size={11} /> {filtered[0].read_time} min
                    </span>
                  )}
                </div>
                <h2 className="text-2xl font-black tracking-[-0.02em] mb-3 group-hover:opacity-70 transition-opacity">{filtered[0].title}</h2>
                {filtered[0].excerpt && <p className="text-muted-foreground leading-relaxed">{filtered[0].excerpt}</p>}
                <div className="flex items-center gap-1.5 mt-5 text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                  Read more <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                </div>
              </motion.article>
            </Link>
          )}
          {/* Rest */}
          {filtered.length > 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filtered.slice(1).map((insight, i) => (
                <Link key={insight.id} to={`/InsightDetail?id=${insight.id}`}>
                  <motion.article
                    className="group h-full p-6 rounded-2xl border border-border/50 bg-card/60 hover:border-border hover:bg-card transition-all"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: (i + 1) * 0.06 }}
                    whileHover={{ y: -2 }}
                  >
                    {insight.cover_image && <img src={insight.cover_image} alt="" className="w-full h-40 object-cover rounded-xl mb-5" />}
                    <div className="flex items-center gap-3 mb-3">
                      {insight.category && (
                        <span className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground/50 bg-secondary/80 px-2.5 py-1 rounded-full">
                          {CATEGORIES[insight.category] || insight.category}
                        </span>
                      )}
                      {insight.read_time && <span className="text-[11px] text-muted-foreground/50 flex items-center gap-1"><Clock size={11} /> {insight.read_time} min</span>}
                    </div>
                    <h3 className="text-base font-bold tracking-tight mb-2 group-hover:opacity-70 transition-opacity">{insight.title}</h3>
                    {insight.excerpt && <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">{insight.excerpt}</p>}
                    <div className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                      Read more <ArrowRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </motion.article>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}