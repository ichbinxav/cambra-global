// BookCallModal — "book a call" destination for high-value merchants.
//
// The fallback destination when a merchant's opportunity (GMV or annual
// savings) is large enough to warrant a human conversation instead of the
// self-serve collective. Simple form (name, email, message) → submitCallRequest
// records a Lead. A Calendly URL can be dropped in later via CALENDLY_URL below
// without touching the wiring.
//
// Payments only. Same dark/glass aesthetic as the report.

import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useTranslation } from "@/lib/i18n.jsx";
import { X, PhoneCall, CheckCircle2, Loader2 } from "lucide-react";

const MONO = "'JetBrains Mono', ui-monospace, monospace";
// Placeholder — when a real Calendly link exists, set it here and the modal
// will show a "Pick a time" button that opens it (in addition to recording
// the request). Empty = form-only flow.
const CALENDLY_URL = "";

export default function BookCallModal({ open, onClose, context = {}, onSwitch }) {
  const { t } = useTranslation();
  const { user, isAuthenticated } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("idle"); // idle | submitting | success | error
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (open && isAuthenticated) {
      if (user?.email) setEmail(user.email);
      if (user?.full_name) setName(user.full_name);
    }
  }, [open, isAuthenticated, user]);

  useEffect(() => {
    if (open) { setStatus("idle"); setErrorMsg(""); }
  }, [open]);

  if (!open) return null;

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = emailOk && name.trim().length > 0 && status !== "submitting";

  const submit = async () => {
    if (!canSubmit) return;
    setStatus("submitting");
    setErrorMsg("");
    try {
      const resp = await base44.functions.invoke("submitCallRequest", {
        email: email.trim(),
        name: name.trim(),
        message: message.trim(),
        context,
      });
      const b = resp?.data || resp;
      if (b?.ok) {
        setStatus("success");
        if (CALENDLY_URL) { try { window.open(CALENDLY_URL, "_blank", "noopener"); } catch { /* ignore */ } }
        return;
      }
      setErrorMsg(t("call_error"));
      setStatus("error");
    } catch {
      setErrorMsg(t("call_error"));
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
        <button onClick={onClose} className="absolute top-4 right-4 z-20 text-white/40 hover:text-white transition-colors" aria-label="Close">
          <X size={18} />
        </button>

        <div className="relative z-10">
          {status === "success" ? (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl mb-4" style={{ background: "rgba(45,212,191,0.10)", border: "1px solid rgba(45,212,191,0.30)" }}>
                <CheckCircle2 size={26} className="text-teal-300" />
              </div>
              <h3 className="text-white font-black mb-2" style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", fontSize: 22, letterSpacing: "-0.02em" }}>
                {t("call_success_title")}
              </h3>
              <p className="text-[14px] text-white/60 leading-snug max-w-xs mx-auto">{t("call_success_body")}</p>
              <button onClick={onClose} className="mt-5 inline-flex items-center justify-center h-10 rounded-full px-6 text-sm font-bold text-white hover:opacity-90" style={{ background: "linear-gradient(135deg, var(--voltio) 0%, #39C6F0 100%)" }}>
                {t("coll_done")}
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1">
                <PhoneCall size={14} className="text-cyan-300" />
                <span className="uppercase font-bold" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.2em", color: "#585868" }}>{t("call_eyebrow")}</span>
              </div>
              <h3 className="text-white font-black mb-2" style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", fontSize: 26, letterSpacing: "-0.03em", lineHeight: 1.05 }}>
                {t("call_title")}
              </h3>
              <p className="text-[13px] text-white/55 leading-snug mb-5">{t("call_sub")}</p>

              <label className="block text-[11px] uppercase tracking-[0.14em] font-bold text-white/50 mb-1.5">{t("call_name_label")}</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("call_name_ph")}
                className="w-full h-11 rounded-xl px-3.5 text-[14px] text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-cyan-400/40 mb-4"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
              />

              <label className="block text-[11px] uppercase tracking-[0.14em] font-bold text-white/50 mb-1.5">{t("call_email_label")}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("call_email_ph")}
                className="w-full h-11 rounded-xl px-3.5 text-[14px] text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-cyan-400/40 mb-4"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
              />

              <label className="block text-[11px] uppercase tracking-[0.14em] font-bold text-white/50 mb-1.5">{t("call_msg_label")}</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t("call_msg_ph")}
                rows={3}
                className="w-full rounded-xl px-3.5 py-2.5 text-[14px] text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-cyan-400/40 mb-5 resize-none"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
              />

              <button
                onClick={submit}
                disabled={!canSubmit}
                className="w-full h-12 rounded-full text-sm font-bold text-white inline-flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg, var(--voltio) 0%, #39C6F0 100%)", boxShadow: "0 0 28px rgba(34,211,238,0.30)" }}
              >
                {status === "submitting" ? <><Loader2 size={16} className="animate-spin" /> {t("call_submitting")}</> : t("call_submit")}
              </button>
              {status === "error" && <p className="text-[12px] text-red-300 mt-2 text-center">{errorMsg}</p>}

              {/* Secondary — discreet link to the collective flow. */}
              {onSwitch && (
                <button
                  type="button"
                  onClick={() => onSwitch()}
                  className="mt-4 w-full text-center text-[12px] text-white/45 hover:text-cyan-200 underline underline-offset-2 transition-colors"
                >
                  {t("call_secondary_coll")}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}