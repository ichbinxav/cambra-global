// DownloadAuditButton — "Download audit (PDF)" trigger.
//
// Generates the audit PDF client-side from the SAME engine_result the report
// already holds (nothing invented, nothing re-fetched). Reused on the report
// and in Documents. Self-disables + hides when there's no engine_result to
// render. rateTable is optional (only feeds the roadmap ambition line).

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Loader2, Lock } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";
import { useAuth } from "@/lib/AuthContext";

export default function DownloadAuditButton({
  engineResult,
  inputSnapshot,
  rateTable = null,
  brandName = "",
  variant = "solid", // "solid" | "ghost"
  className = "",
}) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  if (!engineResult) return null;

  const handleClick = async () => {
    if (busy) return;
    // UX-1 T4 — PDF download is reserved for identified users. Anonymous click
    // routes to signup; the report resumes after login via the session rescue.
    // (No public PDF endpoint exists — the audit PDF is built client-side, and
    // the anonymous teaser payload no longer carries the locked fields.)
    if (!isAuthenticated) {
      const next = window.location.pathname + window.location.search;
      navigate(`/LoginGate?next=${encodeURIComponent(next)}`);
      return;
    }
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
      title={!isAuthenticated ? t("locked_pdf_download") : undefined}
      className={`${base} ${className} hover:brightness-125`}
      style={style}
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : isAuthenticated ? <Download size={15} /> : <Lock size={15} />}
      {busy ? t("pdf_generating") : t("pdf_download_cta")}
    </button>
  );
}