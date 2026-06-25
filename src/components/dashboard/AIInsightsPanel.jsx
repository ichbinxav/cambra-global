import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Sparkles, Loader2, CheckCircle2, Clock, AlertCircle, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "@/lib/i18n.jsx";

/**
 * M8 — AI Insights Panel
 * Shows the last 3 AgentRuns for the current user's brand on the Dashboard.
 * Read-only here — approval happens in admin tools.
 */

const AGENT_LABEL_KEY = {
  payments:       "agent_payments",
  shipping:       "agent_shipping",
  saas:           "agent_saas",
  recommendation: "agent_recommendation",
  general:        "agent_general",
};

const STATUS_CONFIG = {
  running:            { key: "status_running",   icon: Loader2,      cls: "text-blue-700 bg-blue-50 border-blue-200",         spin: true },
  awaiting_approval:  { key: "status_awaiting",  icon: Clock,        cls: "text-amber-700 bg-amber-50 border-amber-200" },
  approved:           { key: "status_approved",  icon: CheckCircle2, cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  rejected:           { key: "status_rejected",  icon: AlertCircle,  cls: "text-rose-700 bg-rose-50 border-rose-200" },
  completed:          { key: "status_completed", icon: CheckCircle2, cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  failed:             { key: "status_failed",    icon: AlertCircle,  cls: "text-rose-700 bg-rose-50 border-rose-200" },
};

function timeAgo(iso, t) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return t("just_now");
  const m = Math.floor(ms / 60_000);
  if (m < 60) return t("minutes_ago", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("hours_ago", { n: h });
  const d = Math.floor(h / 24);
  return t("days_ago", { n: d });
}

function topSummary(run) {
  // Recommendation agent: surface the top recommendation title.
  const out = run.output_json || {};
  if (run.agent_type === "recommendation") {
    const recs = Array.isArray(out.recommendations) ? out.recommendations : [];
    if (recs.length) {
      const top = recs[0];
      const eur = top.expected_saving_eur ? ` · €${Math.round(top.expected_saving_eur).toLocaleString()}/yr` : "";
      return `${top.title}${eur}`;
    }
  }
  // Other agents: the AI summary line.
  if (out.summary) return out.summary;
  // Fallback: first proposed action.
  const first = Array.isArray(run.actions_proposed) ? run.actions_proposed[0] : null;
  if (first?.description) return first.description;
  if (first?.title) return first.title;
  return run.reasoning ? run.reasoning.slice(0, 140) + (run.reasoning.length > 140 ? "…" : "") : "—";
}

export default function AIInsightsPanel() {
  const { t } = useTranslation();
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await base44.auth.me();
        if (cancelled) return;
        setIsAdmin(me?.role === "admin");
        // RLS already scopes to the user's runs; we just take the last 3 by created_date.
        const list = await base44.entities.AgentRun
          .list("-created_date", 3)
          .catch(() => []);
        if (!cancelled) setRuns(list);
      } catch (_) {
        /* silent — panel will show empty state */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-secondary border border-border/60 flex items-center justify-center">
            <Sparkles size={14} className="text-foreground" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 font-semibold">{t("ai_insights")}</p>
            <p className="text-sm font-bold tracking-tight">{t("ai_latest_runs")}</p>
          </div>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">M8 · v1</span>
      </div>

      {loading && (
        <div className="py-6 flex items-center justify-center text-xs text-muted-foreground gap-2">
          <Loader2 size={12} className="animate-spin" /> {t("ai_loading")}
        </div>
      )}

      {!loading && runs.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">
            {t("ai_empty")}
          </p>
          <Link
            to="/Analyzer"
            className="inline-flex items-center gap-1.5 mt-3 h-8 px-4 rounded-full bg-foreground text-background text-xs font-bold"
          >
            {t("ai_open_analyzer")} <ChevronRight size={11} />
          </Link>
        </div>
      )}

      {!loading && runs.length > 0 && (
        <div className="space-y-2.5">
          {runs.map((r) => {
            const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.completed;
            const Icon = cfg.icon;
            const confidencePct = r.confidence != null ? Math.round(r.confidence * 100) : null;
            return (
              <div
                key={r.id}
                className="rounded-xl border border-border/50 bg-background/60 p-3.5 flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary border border-border/60 text-foreground">
                      {AGENT_LABEL_KEY[r.agent_type] ? t(AGENT_LABEL_KEY[r.agent_type]) : r.agent_type}
                    </span>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${cfg.cls}`}>
                      <Icon size={9} className={cfg.spin ? "animate-spin" : ""} />
                      {t(cfg.key)}
                    </span>
                    {confidencePct != null && (
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {t("ai_confidence", { pct: confidencePct })}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground/60 ml-auto">
                      {timeAgo(r.created_at || r.created_date, t)}
                    </span>
                  </div>
                  <p className="text-sm font-medium leading-snug text-foreground truncate">
                    {topSummary(r)}
                  </p>
                  {r.status === "awaiting_approval" && isAdmin && (
                    <Link
                      to={`/admin/recommendations?run=${r.id}`}
                      className="inline-flex items-center gap-1 mt-2 h-7 px-3 rounded-full bg-foreground text-background text-[11px] font-bold"
                    >
                      {t("review_approve")} <ChevronRight size={10} />
                    </Link>
                  )}
                  {r.status === "awaiting_approval" && !isAdmin && (
                    <p className="mt-2 text-[11px] text-muted-foreground/70">
                      {t("ai_pending_review")}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}