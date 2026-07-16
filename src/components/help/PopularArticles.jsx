import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { TrendingUp, ArrowUpRight, Clock } from "lucide-react";
import { POPULAR, getCategory } from "@/lib/helpCenterData";

export default function PopularArticles() {
  return (
    <section
      className="py-12 px-5"
      style={{
        background: "rgba(255,255,255,0.02)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="max-w-6xl mx-auto">
        <div className="flex items-baseline justify-between mb-8">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-bold tracking-[0.25em] uppercase text-white/45 mb-2">
              <TrendingUp className="w-3 h-3" />
              Popular this week
            </p>
            <h2 className="text-2xl md:text-3xl font-black tracking-[-0.03em] text-white">
              What brands are asking.
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {POPULAR.map((item, i) => {
            const cat = getCategory(item.category);
            return (
              <motion.div
                key={item.slug}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
              >
                <Link
                  to={`/Help/${item.category}`}
                  className="group block h-full p-5 rounded-xl transition-all backdrop-blur-sm"
                  style={{ border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)" }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className="text-[10px] font-bold uppercase tracking-[0.15em] px-2 py-0.5 rounded-full"
                      style={{
                        color: cat?.accent || "#8B7BFF",
                        background: `${cat?.accent || "#8B7BFF"}18`,
                      }}
                    >
                      {cat?.title || item.category}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-white/45">
                      <Clock className="w-3 h-3" /> {item.read}
                    </span>
                  </div>
                  <h3 className="text-[15px] font-bold tracking-tight leading-snug mb-3 text-white group-hover:text-cyan-300 transition-colors">
                    {item.title}
                  </h3>
                  <div className="flex items-center gap-1 text-xs text-white/50 group-hover:text-white transition-colors">
                    <span>Read article</span>
                    <ArrowUpRight className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
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