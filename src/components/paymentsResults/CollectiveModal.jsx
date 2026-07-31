// CollectiveModal — clickwrap-lite "Join the collective" destination.
//
// The PRIMARY destination for recovery CTAs (overpayer + roadmap routes +
// "Stop overpaying" for authenticated users). Captures email (prefilled when
// signed in) + GMV (from the analysis) and records a CollectiveMember via the
// joinCollective backend.
//
// LEGAL-2 (2026-07-31): the DRAFT marker was removed at the founder's
// instruction. The clickwrap checkbox + terms link remain (both required for
// a valid clickwrap); only the "draft / pending legal review" labelling is
// gone. The terms body copy itself is unchanged.
//
// Payments only. No external PSP destinations. Same dark/glass aesthetic as
// the report.

import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useTranslation } from "@/lib/i18n.jsx";
import { X, Users, CheckCircle2, Loader2, ArrowRight } from "lucide-react";

const MONO = "'JetBrains Mono', ui-monospace, monospace";

function eur(n) {
  if (!isFinite(n)) return null;
  return "€" + Math.round(n).toLocaleString("en-US");
}

export default function CollectiveModal({ open, onClose, context = {}, onSwitch }) {
  const { t } = useTranslation();
  const { user, isAuthenticated } = useAuth();
  const [email, setEmail] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | submitting | success | error
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (open && isAuthenticated && user?.email) setEmail(user.email);
  }, [open, isAuthenticated, user]);

  // Reset transient state each time the modal opens.
  useEffect(() => {
    if (open) { setStatus("idle"); setErrorMsg(""); setAccepted(false); }
  }, [open]);

  if (!open) return null;

  const gmv = Number(context?.gmv_eur_monthly);
  const gmvLabel = eur(gmv);
  // Context-adapted subcopy shown ABOVE the generic collective explanation.
  // The CTA that opened the modal passes uiContext (margin|rate|score|generic).
  // Only margin/rate get a tailored line; score/generic keep coll_sub only.
  const ctxLineKey = context?.uiContext === "margin" ? "coll_ctx_margin"
    : context?.uiContext === "rate" ? "coll_ctx_rate"
    : null;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = emailOk && accepted && status !== "submitting";

  const submit = async () => {
    if (!canSubmit) return;
    setStatus("submitting");
    setErrorMsg("");
    try {
      const resp = await base44.functions.invoke("joinCollective", {
        email: email.trim(),
        accepted: true,
        context,
      });
      const b = resp?.data || resp;
      if (b?.ok) { setStatus("success"); return; }
      setErrorMsg(t("coll_error"));
      setStatus("error");
    } catch {
      setErrorMsg(t("coll_error"));
      setStatus("error");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(4,6,12,0.72)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-3xl p-6 md:p-7 overflow-hidden animate-fade-up"
        style={{ background: "#070c16", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 32px 80px -24px rgba(0,0,0,0.8)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* grid overlay */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: "linear-gradient(#0d1a30 1px, transparent 1px), linear-gradient(90deg, #0d1a30 1px, transparent 1px)",
            backgroundSize: "32px 32px", opacity: 0.5,
            maskImage: "radial-gradient(ellipse 90% 80% at 50% 0%, #000 30%, transparent 100%)",
            WebkitMaskImage: "radial-gradient(ellipse 90% 80% at 50% 0%, #000 30%, transparent 100%)",
          }}
        />

        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 text-white/40 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="relative z-10">
          {status === "success" ? (
            <div className="text-center py-4">
              <div
                className="inline-flex items-center justify-center h-14 w-14 rounded-2xl mb-4"
                style={{ background: "rgba(45,212,191,0.10)", border: "1px solid rgba(45,212,191,0.30)" }}
              >
                <CheckCircle2 size={26} className="text-teal-300" />
              </div>
              <h3 className="text-white font-black mb-2" style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", fontSize: 22, letterSpacing: "-0.02em" }}>
                {t("coll_success_title")}
              </h3>
              <p className="text-[14px] text-white/60 leading-snug max-w-xs mx-auto">
                {gmvLabel ? t("coll_success_body", { gmv: gmvLabel.replace("€", "") }) : t("coll_success_body_nogmv")}
              </p>
              <button
                onClick={onClose}
                className="mt-5 inline-flex items-center justify-center h-10 rounded-full px-6 text-sm font-bold text-white hover:opacity-90"
                style={{ background: "linear-gradient(135deg, var(--voltio) 0%, #39C6F0 100%)" }}
              >
                {t("coll_done")}
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1">
                <Users size={14} className="text-cyan-300" />
                <span className="uppercase font-bold" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.2em", color: "#585868" }}>
                  {t("coll_eyebrow")}
                </span>
              </div>
              <h3 className="text-white font-black mb-2" style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", fontSize: 26, letterSpacing: "-0.03em", lineHeight: 1.05 }}>
                {t("coll_title")}
              </h3>
              {ctxLineKey && (
                <p className="text-[13px] font-semibold text-cyan-200/90 leading-snug mb-2">{t(ctxLineKey)}</p>
              )}
              <p className="text-[13px] text-white/55 leading-snug mb-5">{t("coll_sub")}</p>

              {/* Email */}
              <label className="block text-[11px] uppercase tracking-[0.14em] font-bold text-white/50 mb-1.5">{t("coll_email_label")}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("coll_email_ph")}
                className="w-full h-11 rounded-xl px-3.5 text-[14px] text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-cyan-400/40 transition-shadow mb-4"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
              />

              {/* GMV (read-only from analysis) */}
              {gmvLabel && (
                <div className="flex items-center justify-between rounded-xl px-3.5 h-11 mb-5" style={{ background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.20)" }}>
                  <span className="text-[11px] uppercase tracking-[0.14em] font-bold text-white/50">
                    {t("coll_gmv_label")} <span className="text-white/35 normal-case tracking-normal">· {t("coll_gmv_note")}</span>
                  </span>
                  <span className="tabular-nums font-bold text-[15px]" style={{ fontFamily: MONO, color: "#7BD9F0" }}>{gmvLabel}</span>
                </div>
              )}

              <button
                onClick={submit}
                disabled={!canSubmit}
                className="w-full h-12 rounded-full text-sm font-bold text-white inline-flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg, var(--voltio) 0%, #39C6F0 100%)", boxShadow: "0 0 28px rgba(34,211,238,0.30)" }}
              >
                {status === "submitting" ? <><Loader2 size={16} className="animate-spin" /> {t("coll_submitting")}</> : <>{t("coll_submit")} <ArrowRight size={16} /></>}
              </button>

              {status === "error" && <p className="text-[12px] text-red-300 mt-2 text-center">{errorMsg}</p>}

              {/* Clickwrap — required for validity */}
              <div className="mt-4 flex items-start gap-2.5">
                <input
                  id="coll-accept"
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded accent-cyan-400 cursor-pointer"
                />
                <label htmlFor="coll-accept" className="text-[11px] text-white/45 leading-snug cursor-pointer">
                  {t("coll_clickwrap_pre")}{" "}
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setTermsOpen(true); }}
                    className="text-cyan-300/90 underline underline-offset-2 hover:text-cyan-200"
                  >
                    {t("coll_clickwrap_link")}
                  </button>
                </label>
              </div>

              {/* Secondary — discreet link to the call flow. */}
              {onSwitch && (
                <button
                  type="button"
                  onClick={() => onSwitch()}
                  className="mt-4 w-full text-center text-[12px] text-white/45 hover:text-cyan-200 underline underline-offset-2 transition-colors"
                >
                  {t("coll_secondary_call")}
                </button>
              )}
            </>
          )}
        </div>

        {/* Terms sub-sheet */}
        {termsOpen && (
          <div className="absolute inset-0 z-30 p-6 md:p-7 flex flex-col" style={{ background: "#070c16" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <span className="uppercase font-bold" style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", color: "#e8eef7" }}>
                {t("coll_terms_title")}
              </span>
            </div>
            <p className="text-[13px] text-white/60 leading-relaxed flex-1 overflow-y-auto">{t("coll_terms_body")}</p>
            <button
              onClick={() => setTermsOpen(false)}
              className="mt-4 h-10 rounded-full text-sm font-bold text-white/90 shrink-0"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)" }}
            >
              {t("coll_terms_close")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}