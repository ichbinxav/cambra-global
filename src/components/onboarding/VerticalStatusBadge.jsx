import { CheckCircle2, AlertCircle, Circle } from "lucide-react";

/**
 * Vertical status badge for onboarding modules (Payments / Shipping / SaaS).
 *
 * Reads the shape returned by getOnboardingStatus / computeVerticalStatus:
 *   { completeness: 0-100, readiness: 0-100, missing_fields: string[] }
 *
 * Three states, matching the existing StepGrid "DONE" visual language:
 *  - complete  (green)  → completeness >= 70 AND readiness >= 70
 *  - partial   (amber)  → any data present
 *  - empty     (grey)   → nothing filled yet
 */
export default function VerticalStatusBadge({ status }) {
  const completeness = Number(status?.completeness || 0);
  const readiness = Number(status?.readiness || 0);
  const missing = Array.isArray(status?.missing_fields) ? status.missing_fields : [];

  let state;
  if (completeness >= 70 && readiness >= 70) state = "complete";
  else if (completeness > 0) state = "partial";
  else state = "empty";

  const config = {
    complete: {
      Icon: CheckCircle2,
      label: "Complete",
      className: "bg-[#2FE0A8]/15 border-[#2FE0A8]/35 text-[#0a8250]",
    },
    partial: {
      Icon: AlertCircle,
      label: "In progress",
      className: "bg-amber-500/10 border-amber-500/30 text-amber-700",
    },
    empty: {
      Icon: Circle,
      label: "Not started",
      className: "bg-secondary border-border/50 text-muted-foreground",
    },
  }[state];

  const Icon = config.Icon;

  return (
    <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-[0.12em] ${config.className}`}>
      <Icon className="w-3 h-3" />
      <span>{config.label}</span>
      {state !== "empty" && (
        <span className="tabular-nums opacity-70 normal-case tracking-normal">
          · {completeness}%
        </span>
      )}
      {state === "partial" && missing.length > 0 && (
        <span className="opacity-60 normal-case tracking-normal font-normal">
          · {missing.length} field{missing.length === 1 ? "" : "s"} left
        </span>
      )}
    </div>
  );
}