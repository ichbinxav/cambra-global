import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ArrowRight, Clock, Sparkles, TrendingUp, BookOpen } from "lucide-react";
import PageHero from "@/components/shared/PageHero";
import { useToast } from "@/components/shared/Toast.jsx";

const CATEGORIES = {
  payments: { label: "Payments", color: "#1F4ED8" },
  margins: { label: "Margins", color: "#2CA7C1" },
  scaling: { label: "Scaling", color: "#0EA5E9" },
  infrastructure: { label: "Infrastructure", color: "#0F172A" },
};

export default function Insights() {
  const { toast } = useToast();
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [subscribed, setSubscribed] = useState(false);

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
      } catch {}
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
      toast.success('Access activated — early partners free for life.');
    } else if (status === 'requires_checkout') {
      toast.info('Early-access seats are full for now — we will reopen soon.');
    } else if (res?.data?.error) {
      toast.error(res.data.error);
    }
  };

  const featured = filtered[0];
  const rest = filtered.slice(1);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
      <PageHero
        eyebrow="Research · Margin intelligence"
        title="Insights."
        subtitle="Intelligence for independent operators. Benchmarks, research and infrastructure analysis."
        icon={Sparkles}
        actions={
          <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <BookOpen size={11} /> {insights.length} articles
            </div>
            <div className="w-px h-3 bg-border" />
            <div className="flex items-center gap-1.5">
              <TrendingUp size={11} /> Updated weekly
            </div>
          </div>
        }
      />

      {!subscribed && (
        <div className="cambra-card mb-6 p-5">
          <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-bold mb-0.5 text-white">Members-only research</p>
              <p className="text-xs text-white/65">Unlock all insights — early partners join for free.</p>
            </div>
            <Button onClick={handleSubscribe} className="h-9 rounded-full px-5 text-xs font-bold bg-white text-[#06080F] hover:bg-white/90">
              Unlock — Free
            </Button>
          </div>
        </div>
      )}

      <div className={!subscribed ? 'pointer-events-none select-none blur-[2px]' : ''}>
        {/* Filter chips */}
        <div className="flex gap-2 mb-8 flex-wrap">
          {["all", ...Object.keys(CATEGORIES)].map(cat => {
            const meta = CATEGORIES[cat];
            const isActive = filter === cat;
            return (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all ${
                  isActive
                    ? "bg-foreground text-background shadow-sm"
                    : "border border-border/60 text-muted-foreground hover:text-foreground hover:border-foreground/30 bg-card/60"
                }`}
                style={isActive && meta ? { background: `linear-gradient(135deg, ${meta.color}, ${meta.color}dd)`, color: "#fff" } : {}}
              >
                {cat === "all" ? "All articles" : meta.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-40">
            <motion.div className="text-2xl text-muted-foreground/25" animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }}>✱</motion.div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-36 border border-dashed border-border/50 rounded-2xl bg-secondary/10">
            <div className="text-4xl mb-4 select-none opacity-15">✱</div>
            <p className="text-muted-foreground text-sm">No insights published yet. Check back soon.</p>
          </div>
        ) : (
          <>
            {/* Featured — large dark hero card */}
            {featured && (
              <Link to={`/InsightDetail?id=${featured.id}`} className="block mb-6">
                <motion.article
                  className="group relative overflow-hidden rounded-3xl border border-white/10 bg-[#06080F] text-white shadow-[0_24px_80px_-24px_rgba(0,0,0,0.6)]"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ y: -3 }}
                  transition={{ duration: 0.4 }}
                >
                  {/* Ambient layers */}
                  <div className="pointer-events-none absolute inset-0">
                    <div className="absolute -top-32 -left-20 w-[28rem] h-[28rem] rounded-full blur-3xl"
                         style={{ background: "radial-gradient(closest-side, rgba(31,78,216,0.45), transparent 60%)" }} />
                    <div className="absolute -bottom-32 -right-20 w-[24rem] h-[24rem] rounded-full blur-3xl"
                         style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.4), transparent 60%)" }} />
                    <div className="absolute inset-0 opacity-[0.06]"
                         style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "44px 44px" }} />
                  </div>

                  <div className="relative grid md:grid-cols-2 gap-0 min-h-[320px]">
                    {/* Left: copy */}
                    <div className="p-7 sm:p-10 flex flex-col justify-between">
                      <div>
                        <div className="inline-flex items-center gap-2 mb-5 px-2.5 py-1.5 rounded-full border border-white/15 bg-white/[0.04] backdrop-blur-sm">
                          <Sparkles size={10} className="text-cambra-mint" />
                          <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-white/70">Featured</span>
                        </div>

                        <div className="flex items-center gap-2 mb-4 flex-wrap">
                          {featured.category && CATEGORIES[featured.category] && (
                            <span className="text-[10px] tracking-[0.15em] uppercase font-bold px-2.5 py-1 rounded-full border"
                                  style={{
                                    background: `${CATEGORIES[featured.category].color}22`,
                                    borderColor: `${CATEGORIES[featured.category].color}55`,
                                    color: CATEGORIES[featured.category].color === "#000000" ? "#fff" : "#fff",
                                  }}>
                              {CATEGORIES[featured.category].label}
                            </span>
                          )}
                          {featured.read_time && (
                            <span className="text-[11px] text-white/50 flex items-center gap-1">
                              <Clock size={11} /> {featured.read_time} min read
                            </span>
                          )}
                        </div>

                        <h2 className="font-display text-[clamp(1.6rem,3.5vw,2.6rem)] font-black tracking-[-0.03em] leading-[1] mb-4">
                          <span style={{ background: "linear-gradient(135deg, #ffffff 0%, #B8D8E0 60%, #2CA7C1 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                            {featured.title}
                          </span>
                        </h2>
                        {featured.excerpt && <p className="text-white/65 leading-relaxed text-[15px] line-clamp-4">{featured.excerpt}</p>}
                      </div>

                      <div className="flex items-center gap-2 mt-6 text-sm font-bold text-white group-hover:gap-3 transition-all">
                        Read article <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>

                    {/* Right: cover image or visual */}
                    <div className="relative overflow-hidden md:rounded-r-3xl min-h-[200px] md:min-h-full">
                      {featured.cover_image ? (
                        <>
                          <img src={featured.cover_image} alt="" className="w-full h-full object-cover absolute inset-0 group-hover:scale-105 transition-transform duration-700" />
                          <div className="absolute inset-0 bg-gradient-to-tr from-[#06080F]/80 via-transparent to-transparent md:bg-gradient-to-l" />
                        </>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-[10rem] font-black opacity-[0.04] select-none">✱</div>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.article>
              </Link>
            )}

            {/* Rest — grid of premium cards */}
            {rest.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {rest.map((insight, i) => {
                  const cat = CATEGORIES[insight.category];
                  return (
                    <Link key={insight.id} to={`/InsightDetail?id=${insight.id}`}>
                      <motion.article
                        className="cambra-card group h-full transition-all hover:-translate-y-1"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: (i + 1) * 0.05 }}
                      >
                        {/* Cover */}
                        <div className="relative aspect-[16/10] overflow-hidden">
                          {insight.cover_image ? (
                            <img src={insight.cover_image} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center"
                                 style={{ background: `linear-gradient(135deg, ${cat?.color || "#1F4ED8"}33, ${cat?.color || "#2CA7C1"}15)` }}>
                              <div className="text-[5rem] font-black opacity-10 select-none text-white">{String(i + 2).padStart(2, "0")}</div>
                            </div>
                          )}
                          {cat && (
                            <div className="absolute top-3 left-3">
                              <span className="text-[9px] tracking-[0.15em] uppercase font-bold px-2 py-1 rounded-full backdrop-blur-md border border-white/20 bg-white/10 text-white">
                                {cat.label}
                              </span>
                            </div>
                          )}
                          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#06080F] to-transparent" />
                        </div>

                        <div className="relative p-5">
                          {insight.read_time && (
                            <div className="flex items-center gap-1.5 text-[11px] text-white/50 mb-2">
                              <Clock size={10} /> {insight.read_time} min read
                            </div>
                          )}
                          <h3 className="text-base font-black tracking-tight mb-2 leading-snug text-white line-clamp-2">{insight.title}</h3>
                          {insight.excerpt && <p className="text-[13px] text-white/65 leading-relaxed line-clamp-2">{insight.excerpt}</p>}
                          <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-white group-hover:gap-2 transition-all">
                            Read article <ArrowRight size={11} />
                          </div>
                        </div>
                      </motion.article>
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}