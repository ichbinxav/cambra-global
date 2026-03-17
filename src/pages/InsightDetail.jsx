import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";

const CATEGORIES = { payments: "Payments", margins: "Margins", scaling: "Scaling", infrastructure: "Infrastructure" };

export default function InsightDetail() {
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) {
      base44.entities.Insight.filter({ id }).then(res => {
        if (res.length > 0) setInsight(res[0]);
        setLoading(false);
      });
    }
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-40">
      <motion.div className="text-2xl text-muted-foreground/25" animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }}>✱</motion.div>
    </div>
  );

  if (!insight) return (
    <div className="text-center py-36">
      <p className="text-muted-foreground text-sm mb-4">Insight not found.</p>
      <Link to="/Insights"><Button variant="outline" className="rounded-full px-6 text-sm">Back to Insights</Button></Link>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
      <Link to="/Insights">
        <Button variant="ghost" size="sm" className="mb-8 h-8 text-muted-foreground -ml-2 text-xs rounded-full px-3">
          <ArrowLeft size={13} className="mr-1.5" /> Back to Insights
        </Button>
      </Link>

      <article className="max-w-2xl">
        <div className="flex items-center gap-3 mb-5">
          {insight.category && (
            <span className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground/50 bg-secondary px-2.5 py-1 rounded-full">
              {CATEGORIES[insight.category] || insight.category}
            </span>
          )}
          {insight.read_time && (
            <span className="text-[11px] text-muted-foreground/50 flex items-center gap-1.5">
              <Clock size={11} /> {insight.read_time} min read
            </span>
          )}
        </div>

        <h1 className="text-[clamp(2rem,5vw,3.5rem)] font-black tracking-[-0.04em] leading-[0.88] mt-4 mb-8">{insight.title}</h1>

        {insight.cover_image && (
          <img src={insight.cover_image} alt="" className="w-full rounded-2xl mb-10 object-cover max-h-80" />
        )}

        <div className="prose prose-sm prose-neutral max-w-none [&_h2]:font-black [&_h2]:tracking-tight [&_p]:text-muted-foreground [&_p]:leading-relaxed [&_strong]:text-foreground">
          <ReactMarkdown>{insight.content || ""}</ReactMarkdown>
        </div>
      </article>
    </motion.div>
  );
}