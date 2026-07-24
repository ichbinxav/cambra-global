// DownloadAuditButton — "Download audit (PDF)" trigger.
//
// Generates the audit PDF client-side from the SAME engine_result the report
// already holds (nothing invented, nothing re-fetched). Reused on the report
// and in Documents. Self-disables + hides when there's no engine_result to
// render. rateTable is optional (only feeds the roadmap ambition line).

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";

export default function DownloadAuditButton({
  engineResult,
  inputSnapshot,
  rateTable = null,
  brandName = "",
  variant = "solid", // "solid" | "ghost"
  className = "",
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  if (!engineResult) return null;

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // BACKLOG-1 T4 — jsPDF + PDF builder cargados SOLO al pulsar exportar,
      // fuera del bundle inicial. El spinner existente cubre la carga del chunk.
      const { downloadPaymentsAuditPdf } = await import("@/lib/paymentsAuditPdf.js");
      // Yield a frame so the spinner paints before the (synchronous) jsPDF build.
      await new Promise((r) => requestAnimationFrame(r));
      downloadPaymentsAuditPdf({ engineResult, inputSnapshot, rateTable, brandName }, t);
    } finally {
      setBusy(false);
    }
  };

  const base =
    "inline-flex items-center justify-center gap-2 h-10 rounded-full px-5 text-sm font-bold transition-all disabled:opacity-50";
  const style =
    variant === "ghost"
      ? {
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.14)",
          color: "#ffffff",
        }
      : {
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.16)",
          color: "#ffffff",
        };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className={`${base} ${className} hover:brightness-125`}
      style={style}
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
      {busy ? t("pdf_generating") : t("pdf_download_cta")}
    </button>
  );
}