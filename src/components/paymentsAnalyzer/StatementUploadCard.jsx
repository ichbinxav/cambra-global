// StatementUploadCard — Chunk "Fallback universal de facturas" (FASE B).
//
// The Upload-statements verification path for any PSP without a live verified
// connection. Two honest states, chosen by `extractionLive`:
//
//   • extractionLive === true  → BETA upload. The merchant can drop a statement
//     now; it feeds the EXISTING processUploadedFile extractor as a first step.
//     Copy: "Verified from statements — in beta". We are explicit that the
//     verified GAP isn't produced instantly yet (the multi-invoice assembly
//     engine is future work, operator condition #3) — the upload starts the
//     process, our team is looped in.
//
//   • extractionLive === false → COMING SOON. Upload would be a no-op (the
//     extractor gate is closed), so we do NOT offer a file input that does
//     nothing. Copy: "Coming soon — get notified". Records interest, nothing
//     promised.
//
//   • extractionLive === null  → loading skeleton (probe in flight).
//
// SCOPE LOCK: this component only calls the EXISTING processUploadedFile
// (single-document first step) via the SDK. It does NOT assemble a verified
// gap, does NOT average invoices, does NOT touch the engine. That assembly is
// the deferred future chunk.

import { useRef, useState } from "react";
import { FileUp, Lock, Clock, Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function StatementUploadCard({ providerLabel, extractionLive }) {
  const inputRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | uploading | done | error
  const [message, setMessage] = useState("");

  // Loading — capability probe still in flight. Neutral skeleton so we never
  // flash the wrong (dishonest) copy before we know the flag state.
  if (extractionLive === null) {
    return (
      <div
        className="rounded-2xl p-4 animate-pulse"
        style={{ background: "#ffffff", border: "1px solid var(--linea)" }}
      >
        <div className="h-9 w-9 rounded-lg bg-black/5 mb-3" />
        <div className="h-3 w-40 bg-black/5 rounded mb-2" />
        <div className="h-2.5 w-56 bg-black/5 rounded" />
      </div>
    );
  }

  // ── COMING SOON — extractor gate closed. No upload input (it'd be a no-op).
  if (!extractionLive) {
    return (
      <div
        className="rounded-2xl p-4"
        style={{ background: "#ffffff", border: "1px solid var(--linea)" }}
      >
        <div className="flex items-start gap-3">
          <div
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg shrink-0"
            style={{ background: "rgba(12,12,22,0.03)", border: "1px solid var(--linea)", color: "var(--gris-1)" }}
          >
            <Clock size={16} strokeWidth={1.8} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-[14px] font-bold leading-tight" style={{ color: "var(--ink)", fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}>
                Upload your {providerLabel} statements
              </h4>
              <span
                className="text-[9px] uppercase tracking-[0.14em] font-bold px-1.5 py-0.5 rounded-full inline-flex items-center gap-1"
                style={{ background: "rgba(12,12,22,0.03)", color: "var(--gris-1)", border: "1px solid var(--linea)" }}
              >
                <Lock size={8} /> Coming soon
              </span>
            </div>
            <p className="text-[12px] leading-relaxed" style={{ color: "var(--gris-1)" }}>
              Verified analysis from your last 3 {providerLabel} statements is coming soon. For now, your estimate above is instant and needs no upload.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── BETA upload — extractor is live. Offer a real file input feeding the
  //    existing processUploadedFile as a first step. Honest about "in beta".
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("uploading");
    setMessage("");
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      // First step only — feeds the EXISTING extractor. We do NOT assemble a
      // verified gap here (deferred chunk). The response tells us whether the
      // extractor recognized the document; we surface an honest message.
      const resp = await base44.functions.invoke("processUploadedFile", {
        file_url,
        file_name: file.name,
      });
      const body = resp?.data || resp;
      if (body?.error) {
        setStatus("error");
        setMessage("We couldn't read that file. Try a PDF or CSV export of your statement.");
        return;
      }
      setStatus("done");
      setMessage(
        "Statement received. Our team reviews the extraction before it becomes a verified number — you'll be notified when it's ready."
      );
    } catch {
      setStatus("error");
      setMessage("Upload failed. Please check your connection and try again.");
    }
  };

  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: "rgba(91,76,245,0.04)", border: "1px solid rgba(91,76,245,0.22)" }}
    >
      <div className="flex items-start gap-3">
        <div
          className="inline-flex items-center justify-center h-9 w-9 rounded-lg shrink-0"
          style={{ background: "rgba(12,12,22,0.03)", border: "1px solid var(--linea)", color: "#5A49D6" }}
        >
          <FileUp size={16} strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-[14px] font-bold leading-tight" style={{ color: "var(--ink)", fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}>
              Upload your last 3 {providerLabel} statements
            </h4>
            <span
              className="text-[9px] uppercase tracking-[0.14em] font-bold px-1.5 py-0.5 rounded-full inline-flex items-center gap-1"
              style={{ background: "rgba(91,76,245,0.10)", color: "#5A49D6", border: "1px solid rgba(91,76,245,0.28)" }}
            >
              In beta
            </span>
          </div>
          <p className="text-[12px] leading-relaxed mb-3" style={{ color: "var(--gris-1)" }}>
            Verified from statements — in beta. Drop a {providerLabel} statement (PDF or CSV) to start. We read the fees and
            begin turning your estimate into a verified number; it isn't instant yet.
          </p>

          {status === "done" ? (
            <div className="flex items-start gap-2 text-[12px] text-emerald-700">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
              <span>{message}</span>
            </div>
          ) : (
            <>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.csv,.png,.jpg,.jpeg,.xlsx"
                className="hidden"
                onChange={handleFile}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={status === "uploading"}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[12px] font-bold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                style={{ background: "var(--g-voltio)", border: "1px solid rgba(91,76,245,0.4)" }}
              >
                {status === "uploading" ? (
                  <><Loader2 size={12} className="animate-spin" /> Reading…</>
                ) : (
                  <>Upload a statement <ArrowRight size={12} /></>
                )}
              </button>
              {status === "error" && (
                <p className="mt-2 text-[11.5px] text-red-600">{message}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}