import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Clock } from "lucide-react";
import { useI18n } from "@/lib/i18n.jsx";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";

const CATEGORIES = { payments: "Payments", margins: "Margins", scaling: "Scaling", infrastructure: "Infrastructure" };

export default function InsightDetail() { const { t } = useI18n(); const CATS = { payments: t('insights.categories.payments', { default: 'Payments' }), margins: t('insights.categories.margins', { default: 'Margins' }), scaling: t('insights.categories.scaling', { default: 'Scaling' }), infrastructure: t('insights.categories.infrastructure', { default: 'Infrastructure' }) };
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [subLoading, setSubLoading] = useState(true);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) {
      base44.entities.Insight.filter({ id }).then(res => {
        if (res.length > 0) setInsight(res[0]);
        setLoading(false);
      });
    }
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

  if (loading) return (
    <div className="flex items-center justify-center py-40">
      <motion.div className="text-2xl text-muted-foreground/25" animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }}>✱</motion.div>
    </div>
  );

  if (!insight) return (
    <div className="text-center py-36">
      <p className="text-muted-foreground text-sm mb-4">{t('insights.ui.not_found', { default: 'Insight not found.' })}</p>
      <Link to="/Insights"><Button variant="outline" className="rounded-full px-6 text-sm">{t('insights.ui.back_to', { default: 'Back to Insights' })}</Button></Link>
    </div>
  );

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
      <Link to="/Insights">
        <Button variant="ghost" size="sm" className="mb-8 h-8 text-muted-foreground -ml-2 text-xs rounded-full px-3">
          <ArrowLeft size={13} className="mr-1.5" /> {t('insights.ui.back_to', { default: 'Back to Insights' })}
        </Button>
      </Link>

      {!subscribed && (
        <div className="mb-6 p-4 rounded-xl border border-blue-500/20 bg-blue-500/[0.06] flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-semibold">{t('insights.banner.members_only', { default: 'Members-only research' })}</p>
            <p className="text-xs text-muted-foreground/60">{t('insights.banner.unlock_one', { default: 'Unlock this insight — early partners join for free.' })}</p>
          </div>
          <Button onClick={handleSubscribe} className="h-9 rounded-full px-5 text-xs font-bold">{t('insights.banner.unlock_prefix', { default: 'Unlock access —' })} <span className="mx-1 line-through opacity-80">€60</span> <span className="font-semibold">{t('common.free', { default: 'Free' })}</span></Button>
        </div>
      )}

       <article className="max-w-2xl">
        <div className="flex items-center gap-3 mb-5">
          {insight.category && (
            <span className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground/50 bg-secondary px-2.5 py-1 rounded-full">
              {CATS[insight.category] || insight.category}
            </span>
          )}
          {insight.read_time && (
            <span className="text-[11px] text-muted-foreground/50 flex items-center gap-1.5">
              <Clock size={11} /> {insight.read_time} {t('insights.ui.min_read', { default: 'min read' })}
            </span>
          )}
        </div>

        <h1 className="text-[clamp(2rem,5vw,3.5rem)] font-black tracking-[-0.04em] leading-[0.88] mt-4 mb-8">{insight.title}</h1>

        {insight.cover_image && (
          <img src={insight.cover_image} alt="" className="w-full rounded-2xl mb-10 object-cover max-h-80" />
        )}

        {subscribed ? (
          <div className="prose prose-sm prose-neutral max-w-none [&_h2]:font-black [&_h2]:tracking-tight [&_p]:text-muted-foreground [&_p]:leading-relaxed [&_strong]:text-foreground">
            <ReactMarkdown>{insight.content || ""}</ReactMarkdown>
          </div>
        ) : (
          <div className="p-4 rounded-xl border border-border/40 bg-secondary/20 text-sm text-muted-foreground">
            {t('insights.ui.sign_in_to_read', { default: 'Sign in and activate membership to read this research.' })}
          </div>
        )}
      </article>
    </motion.div>
  );
}