// VerificationChecklist — Checkpoint H (2026-08-06).
//
// Extracted from src/pages/Reports.jsx (it was an inline IIFE inside the page)
// and translated. The step logic is unchanged: the same ORDER array, the same
// index comparison, the same baseline/evidence sources.

import { CheckCircle2, Circle, AlertCircle } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";
import { formatLongDate, verificationStatusLabel } from "./reportsLabels";

// The stored progression, in order. Not localized — these are the enum values.
const ORDER = [
  "estimated", "proposed", "evidence_submitted", "under_review",
  "verified", "realized", "invoiced", "paid",
];

export default function VerificationChecklist({ report, baseline, hasBrand }) {
  const { t, lang } = useTranslation();
  const status = report?.verification_status || "estimated";
  const reached = ORDER.indexOf(status);
  const evidenceCount = report?.evidence_count || 0;

  const steps = [
    {
      key: "baseline",
      label: t("rpt_step_baseline"),
      done: !!baseline?.locked,
      hint: baseline?.locked_at ? formatLongDate(baseline.locked_at, lang) : null,
    },
    {
      key: "evidence",
      label: t("rpt_step_evidence"),
      done: reached >= ORDER.indexOf("evidence_submitted"),
      hint: evidenceCount > 0 ? t("rpt_files", { n: evidenceCount }) : null,
    },
    { key: "under_review", label: t("rpt_step_review"),    done: reached >= ORDER.indexOf("under_review") },
    { key: "verified",     label: t("rpt_step_verified"),  done: reached >= ORDER.indexOf("verified") },
    { key: "realized",     label: t("rpt_step_realized"),  done: reached >= ORDER.indexOf("realized") },
  ];

  return (
    <div className="cambra-card p-7 mb-6">
      <div className="relative">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="cc-eyebrow mb-1">{t("rpt_ver_eyebrow")}</p>
            <p className="text-sm font-semibold text-white">{t("rpt_ver_title")}</p>
          </div>
          {report?.verification_status && (
            <span className="text-[11px] px-2 py-1 rounded-full border border-white/15 text-white/75">
              {verificationStatusLabel(t, report.verification_status)}
            </span>
          )}
        </div>

        <ul className="space-y-2">
          {steps.map((s) => (
            <li key={s.key} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <div className="flex items-center gap-3">
                {s.done
                  ? <CheckCircle2 className="w-4 h-4 text-[#2FE0A8]" />
                  : <Circle className="w-4 h-4 text-white/30" />}
                <span className={`text-sm ${s.done ? "font-semibold text-white" : "text-white/65"}`}>{s.label}</span>
                {s.hint && <span className="text-[11px] text-white/55">· {s.hint}</span>}
              </div>
              {!s.done && <AlertCircle className="w-4 h-4 text-white/30" />}
            </li>
          ))}
        </ul>

        {!hasBrand && (
          <p className="text-xs text-white/55 mt-3">{t("rpt_onboarding_hint")}</p>
        )}
      </div>
    </div>
  );
}