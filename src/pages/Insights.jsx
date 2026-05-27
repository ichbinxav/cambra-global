import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
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
  const [subscribed, setSubscribed] = useState(false);
  const [subLoading, setSubLoading] = useState(true);

  useEffect(() => {
    base44.entities.Insight.list("-created_date", 50).then(i => { setInsights(i); setLoading(false); });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const authed = await base44.auth.isAuthenticated();
        if (!authed) { setSubscribed(false); return; }
        const me = await base44.auth.me();
        const subs = await base44.entities.Subscription.filter({ user_email: me.email, status: 'active' }, '-created_date', 1);
        setSubscribed(subs.length > 0);
      } finally {
        setSubLoading(false);
      }
    })();
  }, []);

  const filtered = filter === "all" ? insights : insights.filter(i => i.category === filter);

  const handleSubscribe = async () => {
    const authed = await base44.auth.isAuthenticated();
    if (!authed) { base44.auth.redirectToLogin(window.location.href); return; }
    const res = await base44.functions.invoke('startSubscription', {});
    const status = res?.data?.status;
    if (status === 'activated_free' || status === 'already_active') {
      setSubscribed(true);
      alert('Access activated — early partners free for life.');
    } else if (status === 'requires_checkout') {
      alert('Free seats are over. We will enable paid plan (€60/mo) soon.');
    } else if (res?.data?.error) {
      alert(res.data.error);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
      <div className="mb-10">
        <div className="inline-flex items-center gap-2 mb-4 px-2.5 py-1.5 rounded-full border border-border/60 bg-background/80 backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-cambra-mint" />
          <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-muted-foreground">
            Research · For lifestyle commerce
          </span>
        </div>
        <h1 className="font-display text-[clamp(2rem,4.5vw,3.2rem)] font-black tracking-[-0.045em] leading-[0.92]">
          <span className="text-saas-gradient">Insights.</span>
        </h1>
        <p className="text-foreground/65 text-sm mt-3 max-w-xl leading-relaxed">Intelligence for independent brands. Trends, benchmarks and research curated for operators.</p>
      </div>

      {!subscribed && (
        <div className="mb-6 p-4 rounded-xl border border-blue-500/20 bg-blue-500/[0.06] flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-semibold">Members-only research</p>
            <p className="text-xs text-muted-foreground/60">Unlock all insights — early partners join for free.</p>
          </div>
          <Button onClick={handleSubscribe} className="h-9 rounded-full px-5 text-xs font-bold">Unlock access — <span className="mx-1 line-through opacity-80">€60</span> <span className="font-semibold">Free</span></Button>
        </div>
      )}

       {/* Filter chips */}
       <div className={`${!subscribed ? 'pointer-events-none select-none blur-[2px]' : ''}`}>
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
        </div>
        </motion.div>
        );
}