// ShareResultButton — GROWTH-1 T1 (2026-08-01). Share the result as a branded
// 1080×1080 image, with a MANDATORY preview before anything leaves the device.
//
// WHAT GETS SHARED: efficiency score (when available), the possible fee
// reduction % and the CAMBRA brand. El nombre del comercio SOLO cuando el
// usuario lo activa explícitamente. WHAT NEVER GETS SHARED: savings in euros,
// monthly sales, current provider, the rate paid. (€ + % ⇒ derivable volume.)
//
// The merchant-typed name is read through @/lib/shareBrandName so the raw
// snapshot key never appears on the results surface (same hygiene rule as
// PeerBenchmark in HYGIENE-1).
//
// Share path: Web Share API with the PNG file when available (mobile —
// WhatsApp/Instagram/LinkedIn/Teams/mail native). Desktop fallback: download
// the image + copy the suggested text. The suggested text ALWAYS carries a
// ?ref= tagged link (owner's code when signed in, the generic "share" tag
// otherwise) — never a naked URL.

import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useTranslation } from "@/lib/i18n.jsx";
import { Share2, Download, Copy, Check, X } from "lucide-react";
import { computePaymentsScore } from "@/lib/paymentsScore";
import { renderShareCard, canvasToBlob } from "@/lib/shareCard";
import { getBrandNameFromSnapshot } from "@/lib/shareBrandName";

// Reduction % = point monthly savings ÷ current monthly fees. Derived from
// figures already in the (allowlisted) payload — no new data crosses the wire.
function deriveReductionPct(er, snap) {
  if (!er) return null;
  const sav = Number(er?.monthly_savings_eur?.point);
  let fees = 0;
  if (er.combined && Array.isArray(er.channels)) {
    for (const c of er.channels) {
      const bps = Number(c?.engine_result?.current_effective_bps);
      const gmv = Number(c?.input_snapshot?.monthly_gmv_eur);
      if (isFinite(bps) && isFinite(gmv)) fees += (bps / 10000) * gmv;
    }
  } else {
    const bps = Number(er?.current_effective_bps);
    const gmv = Number(snap?.monthly_gmv_eur);
    if (isFinite(bps) && isFinite(gmv)) fees = (bps / 10000) * gmv;
  }
  if (!isFinite(sav) || sav <= 0 || fees <= 0) return null;
  return Math.max(1, Math.min(99, Math.round((sav / fees) * 100)));
}

export default function ShareResultButton({ engineResult, inputSnapshot, isAuthenticated }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [imgUrl, setImgUrl] = useState("");
  const [includeName, setIncludeName] = useState(false);
  const [copied, setCopied] = useState(false);
  const [refCode, setRefCode] = useState("");
  const blobRef = useRef(null);

  const scoreInfo = computePaymentsScore(engineResult || {});
  const score = scoreInfo.available ? scoreInfo.score : null;
  const reductionPct = deriveReductionPct(engineResult, inputSnapshot);
  const brandName = getBrandNameFromSnapshot(inputSnapshot);

  // Render (and re-render on name toggle) — the preview IS the shared bytes.
  useEffect(() => {
    if (!open || reductionPct === null) return;
    let cancelled = false;
    (async () => {
      const canvas = await renderShareCard({
        score,
        reductionPct,
        brandName: includeName ? brandName : "",
        strings: {
          eyebrow: t("share_img_eyebrow"),
          scoreLabel: t("share_img_score_label"),
          reductionPrefix: t("share_img_reduction_prefix"),
          reductionSuffix: t("share_img_reduction_suffix"),
          cta: t("share_img_cta"),
          site: window.location.host,
        },
      });
      if (cancelled) return;
      blobRef.current = await canvasToBlob(canvas);
      setImgUrl(canvas.toDataURL("image/png"));
    })();
    return () => { cancelled = true; };
  }, [open, includeName, score, reductionPct, brandName, t]);

  // Personal referral code — only for signed-in merchants.
  useEffect(() => {
    if (!open || !isAuthenticated || refCode) return;
    base44.functions.invoke("getMyReferralLink", {})
      .then((r) => { const c = r?.data?.code; if (c) setRefCode(c); })
      .catch(() => { /* falls back to the generic "share" tag */ });
  }, [open, isAuthenticated, refCode]);

  if (reductionPct === null) return null;

  const shareUrl = `${window.location.origin}/Analyzer?ref=${encodeURIComponent(refCode || "share")}`;
  const text = t(score !== null ? "share_suggested_text" : "share_suggested_text_noscore")
    .replace("{score}", `${score}/100`)
    .replace("{pct}", String(reductionPct))
    .replace("{url}", shareUrl);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* clipboard unavailable — the text stays visible in the modal */ }
  };

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = imgUrl;
    a.download = "cambra-audit.png";
    a.click();
  };

  const handleShare = async () => {
    const blob = blobRef.current;
    const file = blob ? new File([blob], "cambra-audit.png", { type: "image/png" }) : null;
    if (file && navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text });
        return;
      } catch { /* user cancelled — no fallback spam */ return; }
    }
    // Desktop fallback: image download + suggested text to clipboard.
    handleDownload();
    handleCopy();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[12px] font-bold transition-colors"
        style={{
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(255,255,255,0.04)",
          color: "rgba(255,255,255,0.85)",
        }}
      >
        <Share2 size={13} /> {t("share_cta")}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 overflow-y-auto"
          style={{ background: "rgba(5,5,12,0.8)", backdropFilter: "blur(8px)" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-md rounded-2xl p-5 my-8"
            style={{
              background: "linear-gradient(180deg, #14112e 0%, #0a0818 100%)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>

            <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-white/60 mb-3">
              {t("share_preview_title")}
            </p>

            {/* Preview — exactly the bytes that get shared. No surprises. */}
            {imgUrl ? (
              <img
                src={imgUrl}
                alt="CAMBRA share card preview"
                className="w-full rounded-xl mb-3"
                style={{ border: "1px solid rgba(255,255,255,0.10)" }}
              />
            ) : (
              <div className="w-full aspect-square rounded-xl mb-3 animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
            )}

            {brandName && (
              <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeName}
                  onChange={(e) => setIncludeName(e.target.checked)}
                  className="h-4 w-4 accent-[#5B4CF5]"
                />
                <span className="text-[12.5px] text-white/80">{t("share_include_name")}</span>
              </label>
            )}

            <p className="text-[11px] leading-relaxed text-white/50 mb-4">{t("share_privacy_note")}</p>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleShare}
                disabled={!imgUrl}
                className="flex-1 min-w-[130px] inline-flex items-center justify-center gap-2 h-11 rounded-full text-[13px] font-bold text-white disabled:opacity-40"
                style={{ background: "var(--g-voltio)", boxShadow: "0 8px 24px -10px rgba(91,76,245,0.6)" }}
              >
                <Share2 size={14} /> {t("share_native")}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                disabled={!imgUrl}
                className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-full text-[12.5px] font-bold text-white/85 disabled:opacity-40"
                style={{ border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)" }}
              >
                <Download size={13} /> {t("share_download")}
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-full text-[12.5px] font-bold text-white/85"
                style={{ border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)" }}
              >
                {copied ? <Check size={13} className="text-emerald-300" /> : <Copy size={13} />}
                {copied ? t("share_copied") : t("share_copy_text")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}