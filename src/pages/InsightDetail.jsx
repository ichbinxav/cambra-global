import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";

export default function InsightDetail() {
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (id) {
      base44.entities.Insight.filter({ id }).then(results => {
        if (results.length > 0) setInsight(results[0]);
        setLoading(false);
      });
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <motion.div className="text-3xl" animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>✱</motion.div>
      </div>
    );
  }

  if (!insight) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Insight not found.</p>
        <Link to="/Insights"><Button variant="outline" className="mt-4">Back to Insights</Button></Link>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
      <Link to="/Insights">
        <Button variant="ghost" size="sm" className="mb-8 text-muted-foreground">
          <ArrowLeft size={14} className="mr-2" /> Back to Insights
        </Button>
      </Link>

      <article className="max-w-2xl">
        {insight.category && (
          <span className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground bg-secondary px-2 py-1 rounded-full">
            {insight.category}
          </span>
        )}
        <h1 className="text-4xl font-bold tracking-tighter mt-4 mb-4 leading-tight">{insight.title}</h1>
        {insight.read_time && <p className="text-sm text-muted-foreground mb-8">{insight.read_time} min read</p>}

        {insight.cover_image && (
          <img src={insight.cover_image} alt="" className="w-full rounded-2xl mb-8 object-cover max-h-80" />
        )}

        <div className="prose prose-sm max-w-none">
          <ReactMarkdown>{insight.content || ""}</ReactMarkdown>
        </div>
      </article>
    </motion.div>
  );
}