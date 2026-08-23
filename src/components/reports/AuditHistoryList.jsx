// AuditHistoryList — Checkpoint H (2026-08-06).
//
// The audit timeline, extracted from src/pages/Reports.jsx and translated.
// Two fixes beyond plain text: the row dates were rendered in English for every
// merchant (date-fns with no locale), and the badge label came straight from the
// stored enum. Ordering, numbering and the /Results link are unchanged.

import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";
import { formatLongDate, formatTime, historyBadge } from "./reportsLabels";

export default function AuditHistoryList({ results }) {
  const { t, lang, formatCurrency } = useTranslation();
  const count = results.length;
  const legacySummary = ({
    en: "Legacy summary only",
    fr: "Résumé historique uniquement",
    es: "Solo resumen histórico",
  })[lang] || "Legacy summary only";

  return (
    <div className="cambra-card overflow-hidden">
      <div className="px-6 py-5 border-b border-white/[0.08] flex items-center justify-between relative">
        <div>
          <p className="cc-eyebrow mb-1">{t("rpt_hist_eyebrow")}</p>
          <p className="text-base font-black text-white tracking-tight">{t("rpt_hist_title")}</p>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/50">
          {count === 1 ? t("rpt_count_one", { n: count }) : t("rpt_count_many", { n: count })}
        </span>
      </div>

      <div className="divide-y divide-white/[0.06] relative">
        {results.map((r, i) => {
          const badge = historyBadge(t, r.verification_status || "estimated");
          const hasDetail = !!r?.details?.engine_result;
          const row = (
            <div className={`px-6 py-4 flex items-center justify-between transition-colors group ${hasDetail ? "hover:bg-white/[0.04] cursor-pointer" : "cursor-default"}`}>
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/[0.10] flex items-center justify-center text-[11px] font-mono font-bold text-white/70 shrink-0">
                  {String(count - i).padStart(2, "0")}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">{formatLongDate(r.created_date, lang)}</p>
                  <p className="text-[11px] text-white/45 font-mono mt-0.5">
                    {formatTime(r.created_date, lang)} · {hasDetail ? t("rpt_scan_complete") : legacySummary}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                <span className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold ${badge.className}`}>
                  {badge.label}
                </span>
                <div className="text-right">
                  <p className="text-sm font-black tabular-nums tracking-tight text-white">
                    {typeof r.total_savings === "number" ? formatCurrency(r.total_savings, r.currency || "EUR") : "—"}
                    <span className="text-white/40 font-normal">{t("rpt_per_year")}</span>
                  </p>
                  <p className="text-[10px] text-white/45 font-mono">{t("rpt_recovery_potential")}</p>
                </div>
                {hasDetail && <ArrowUpRight size={14} className="text-white/30 group-hover:text-cambra-cyan group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />}
              </div>
            </div>
          );
          return (
            hasDetail
              ? <Link key={r.id} to={`/Results?result=${encodeURIComponent(r.id)}`}>{row}</Link>
              : <div key={r.id}>{row}</div>
          );
        })}
      </div>
    </div>
  );
}
