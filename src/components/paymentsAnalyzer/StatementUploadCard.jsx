// StatementUploadCard — Chunk "Fallback universal de facturas" (FASE B).
//
// The Upload-statements extraction path for any PSP without a live verified
// connection. Two honest states, chosen by `extractionLive`:
//
//   • extractionLive === true  → upload live. The merchant can drop a statement
//     now; it feeds the EXISTING processUploadedFile extractor as a first step.
//   • extractionLive === false → COMING SOON. Upload would be a no-op (the
//     extractor gate is closed), so we do NOT offer a file input that does
//     nothing.
//   • extractionLive === null  → loading skeleton (probe in flight).
//
// STYLING (2026-07-30): theme tokens only (bg-card / text-foreground /
// text-muted-foreground) — the previous hardcoded light-mode inks rendered
// black text on dark surfaces (unreadable on mobile /ConnectTools).
//
// SCOPE LOCK: this component only calls processUploadedFile v2
// (single-document extraction) via the SDK. It does NOT assemble a verified
// gap, does NOT average invoices, does NOT touch the engine.

import { useRef, useState } from "react";
import { FileUp, Lock, Clock, Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useTranslation } from "@/lib/i18n.jsx";
import { trackProductEvent } from "@/lib/productAnalytics";

const SUPPORTED_EXTENSIONS = [
  "pdf", "csv", "tsv", "txt", "md", "markdown", "json",
  "xls", "xlsx", "xlsm", "xlsb", "ods", "numbers",
  "doc", "docx", "rtf", "odt", "pages", "ppt", "pptx", "key",
  "png", "jpg", "jpeg", "webp", "gif", "heic", "heif", "tif", "tiff", "bmp",
];
const FILE_ACCEPT = SUPPORTED_EXTENSIONS.map((extension) => `.${extension}`).join(",");

export default function StatementUploadCard({ providerLabel, extractionLive }) {
  const { t } = useTranslation();
  const inputRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | uploading | done | review | error
  const [message, setMessage] = useState("");
  const [fileName, setFileName] = useState("");

  // Loading — capability probe still in flight.
  if (extractionLive === null) {
    return (
      <div className="cambra-paper-card min-h-[430px] animate-pulse p-7 sm:p-8">
        <div className="mb-5 h-14 w-14 rounded-2xl bg-[#EFEDFF]" />
        <div className="mb-3 h-5 w-56 rounded bg-[#E8EAF0]" />
        <div className="h-3 w-72 max-w-full rounded bg-[#F0F1F5]" />
      </div>
    );
  }

  // ── COMING SOON — extractor gate closed. No upload input (it'd be a no-op).
  if (!extractionLive) {
    return (
      <div className="cambra-paper-card min-h-[430px] p-7 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#DEDFF0] bg-[#F1EFFF] text-[#5B4CF5]">
            <Clock size={21} strokeWidth={1.8} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h4 className="text-[20px] font-bold leading-tight tracking-[-.035em] text-[#11182D]">
                {t("su_title_soon", { provider: providerLabel })}
              </h4>
              <span className="inline-flex items-center gap-1 rounded-full border border-[#D9DCE7] bg-[#F7F7FA] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#727A90]">
                <Lock size={8} /> {t("su_badge_soon")}
              </span>
            </div>
            <p className="text-[12px] leading-relaxed text-[#6E778E]">
              {t("su_body_soon", { provider: providerLabel })}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Upload live — extractor is on. Offer a real file input feeding the
  //    existing processUploadedFile as a first step.
  const processFile = async (file) => {
    if (!file) return;
    const extension = String(file.name.split(".").pop() || "").toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(extension) || file.size > 15 * 1024 * 1024) {
      setStatus("error");
      setMessage(t("su_err_unreadable"));
      return;
    }
    setFileName(file.name);
    setStatus("uploading");
    setMessage("");
    const documentType = String(file.name.split(".").pop() || "unknown").toLowerCase().slice(0, 12);
    let documentPersisted = false;
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      trackProductEvent('document_uploaded',{source:'statement_upload',document_type:documentType});
      const createdResponse = await base44.functions.invoke("createDocument", {
        file_url,
        file_name: file.name,
        file_size: file.size,
        category: "statements",
        visibility: "brand_and_admin",
      });
      const createdBody = createdResponse?.data || createdResponse;
      const document = createdBody?.document;
      if (!document?.id) throw new Error("document_not_persisted");
      documentPersisted = true;

      const resp = await base44.functions.invoke("processUploadedFile", {
        file_url,
        file_name: file.name,
      });
      const body = resp?.data || resp;
      if (body?.statement_import_id) {
        await base44.functions.invoke("linkDocument", {
          document_id: document.id,
          target_type: "statement_import",
          target_id: body.statement_import_id,
          is_primary: true,
        }).catch(() => null);
      }
      // The extractor answers 200 EVEN WHEN it understood nothing: an
      // unreadable/unsupported layout comes back as status "format_unknown"
      // with no `error` field. Treat a non-recognized document as an honest
      // failure the merchant can act on.
      if (body?.error || body?.status !== "success" || body?.detected === "unknown" || body?.projection_eligible !== true) {
        trackProductEvent('document_processing_failed',{source:'statement_upload',document_type:documentType,reason_code:'review_or_unknown'});
        setStatus("review");
        setMessage(t("vlt_upload_review"));
        return;
      }
      setStatus("done");
      setMessage(t("su_received"));
    } catch {
      trackProductEvent('document_processing_failed',{source:'statement_upload',reason_code:'upload_or_network'});
      if (documentPersisted) {
        setStatus("review");
        setMessage(t("vlt_upload_review"));
        return;
      }
      setStatus("error");
      setMessage(t("su_err_upload"));
    }
  };

  const handleFile = (event) => {
    processFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleDrop = (event) => {
    event.preventDefault();
    if (status !== "uploading") processFile(event.dataTransfer.files?.[0]);
  };

  return (
    <div className="cambra-paper-card min-h-[430px] p-7 sm:p-8">
      <div className="flex items-start gap-4">
        <div className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#D8D4FF] bg-[#F0EEFF] text-[#5B4CF5]">
          <FileUp size={21} strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#6253F3]">{t("az_entry_upload_badge")}</p>
          <h4 className="mt-1 text-[22px] font-bold leading-tight tracking-[-.035em] text-[#11182D]">{t("su_title_beta", { provider: providerLabel })}</h4>
          <p className="mt-2 text-[12px] leading-relaxed text-[#6E778E]">{t("su_body_beta", { provider: providerLabel })}</p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={FILE_ACCEPT}
        className="hidden"
        onChange={handleFile}
        aria-required="true"
      />

      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        className="mt-7 flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#AAA4DC] bg-gradient-to-br from-[#FCFCFF] to-[#F5F3FF] px-5 py-7 text-center"
      >
        {["done", "review"].includes(status) ? (
          <>
            <span className={`inline-flex h-12 w-12 items-center justify-center rounded-full ${status === "done" ? "bg-[#E4F7ED] text-[#168552]" : "bg-[#FFF4D9] text-[#A66700]"}`}>
              {status === "done" ? <CheckCircle2 size={22} /> : <Clock size={22} />}
            </span>
            <p className={`mt-4 max-w-lg text-[12px] font-semibold leading-relaxed ${status === "done" ? "text-[#2E7655]" : "text-[#8A5B08]"}`}>{message}</p>
            <p className="mt-2 max-w-full truncate font-mono text-[10px] text-[#737B91]">{fileName}</p>
          </>
        ) : (
          <>
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#5B4CF5] shadow-[0_12px_30px_-20px_rgba(91,76,245,.7)]"><FileUp size={21} /></span>
            <label className="mt-4 text-[14px] font-bold text-[#19223B]">{t("az_entry_upload_title")} <span className="text-[#5B4CF5]">*</span></label>
            <p className="mt-1 max-w-xl text-[10.5px] leading-relaxed text-[#7A8296]">PDF · XLS/XLSX · NUMBERS · DOC/DOCX · CSV · MD · PNG/JPG · 15 MB</p>
          </>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={status === "uploading"}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-6 text-[12px] font-bold text-white shadow-[0_18px_34px_-22px_rgba(91,76,245,.9)] transition-[filter,transform] hover:brightness-105 active:translate-y-px disabled:opacity-50"
          style={{ background: "var(--g-voltio)" }}
        >
          {status === "uploading" ? <><Loader2 size={13} className="animate-spin" /> {t("su_reading")}</> : <>{t("su_cta")} <ArrowRight size={13} /></>}
        </button>
      </div>

      {status === "error" && <p role="alert" className="mt-3 text-[11.5px] font-semibold text-red-600">{message}</p>}
    </div>
  );
}
