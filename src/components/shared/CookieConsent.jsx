import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";

const STORAGE_KEY = "cambra_cookie_consent";

function readConsent() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeConsent(consent) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...consent, timestamp: new Date().toISOString() })
    );
  } catch {}
}

/**
 * Toggle switch — minimal, dark theme.
 */
function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className="relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      style={{
        background: checked ? "#22d3ee" : "rgba(255,255,255,0.15)",
      }}
    >
      <span
        className="inline-block h-5 w-5 rounded-full bg-white transition-transform"
        style={{
          transform: checked ? "translateX(22px)" : "translateX(2px)",
          marginTop: 2,
          boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
        }}
      />
    </button>
  );
}

/**
 * CookieConsent — GDPR-compliant banner + preferences modal.
 * Only renders if no consent has been stored yet (or user opens prefs again).
 */
export default function CookieConsent() {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [prefs, setPrefs] = useState({
    necessary: true,
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    const stored = readConsent();
    if (!stored) {
      // Defer one tick so banner can slide in.
      const id = setTimeout(() => setShow(true), 300);
      return () => clearTimeout(id);
    }
  }, []);

  const acceptAll = () => {
    writeConsent({ necessary: true, analytics: true, marketing: true });
    setShow(false);
    setShowModal(false);
  };

  const savePrefs = () => {
    writeConsent({
      necessary: true,
      analytics: prefs.analytics,
      marketing: prefs.marketing,
    });
    setShow(false);
    setShowModal(false);
  };

  if (!show && !showModal) return null;

  return (
    <>
      {/* Banner */}
      {show && !showModal && (
        <div
          role="dialog"
          aria-label="Cookie consent"
          className="fixed left-0 right-0 z-[200] px-4 sm:px-6 pb-4 sm:pb-6"
          style={{
            bottom: 0,
            animation: "cambraSlideUp 300ms ease-out",
          }}
        >
          <div
            className="mx-auto max-w-2xl rounded-2xl overflow-hidden"
            style={{
              background: "rgba(10,10,10,0.95)",
              border: "1px solid rgba(255,255,255,0.10)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              boxShadow: "0 24px 60px -20px rgba(0,0,0,0.6)",
            }}
          >
            <div className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
              <p
                className="text-[13px] text-white/75 flex-1 leading-snug"
                style={{ fontWeight: 500 }}
              >
                {t("cookie_banner_text")}{" "}
                <Link
                  to="/Cookies"
                  className="underline hover:text-white transition-colors"
                >
                  {t("footer_privacy")}
                </Link>
                .
              </p>
              <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                <button
                  type="button"
                  onClick={() => setShowModal(true)}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center h-9 px-4 rounded-full text-[12px] font-bold transition-colors hover:bg-white/5"
                  style={{
                    color: "rgba(255,255,255,0.75)",
                    border: "1px solid rgba(255,255,255,0.14)",
                  }}
                >
                  {t("cookie_manage")}
                </button>
                <button
                  type="button"
                  onClick={acceptAll}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center h-9 px-5 rounded-full text-[12px] font-bold transition-all hover:translate-y-[-1px]"
                  style={{
                    background: "#ffffff",
                    color: "#0a0f1e",
                  }}
                >
                  {t("cookie_accept_all")}
                </button>
              </div>
            </div>
          </div>
          <style>{`
            @keyframes cambraSlideUp {
              from { opacity: 0; transform: translateY(20px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </div>
      )}

      {/* Preferences modal */}
      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("cookie_modal_title")}
          className="fixed inset-0 z-[210] flex items-center justify-center p-4 sm:p-6"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl overflow-hidden animate-fade-up"
            style={{
              background:
                "linear-gradient(180deg, rgba(13,18,36,0.98) 0%, rgba(6,8,15,0.98) 100%)",
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "0 30px 80px -30px rgba(0,0,0,0.7)",
            }}
          >
            {/* close */}
            <button
              type="button"
              onClick={() => setShowModal(false)}
              aria-label="Close"
              className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-white/55 hover:text-white hover:bg-white/5 transition-colors"
            >
              <X size={16} />
            </button>

            <div className="p-6 sm:p-7">
              {/* Header */}
              <h2
                className="text-white mb-2"
                style={{
                  fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                  fontSize: 20,
                  fontWeight: 800,
                  letterSpacing: "-0.025em",
                }}
              >
                {t("cookie_modal_title")}
              </h2>
              <p className="text-[13px] text-white/55 mb-6 leading-snug">
                {t("cookie_modal_sub")}
              </p>

              {/* Categories */}
              <div className="space-y-4">
                {/* Necessary */}
                <div
                  className="rounded-xl p-4"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-white text-[13px] font-bold">
                          {t("cookie_necessary")}
                        </h3>
                        <span
                          className="text-[9px] uppercase tracking-[0.18em] font-bold px-1.5 py-0.5 rounded"
                          style={{
                            background: "rgba(34,211,238,0.10)",
                            color: "#22d3ee",
                            border: "1px solid rgba(34,211,238,0.25)",
                          }}
                        >
                          {t("cookie_always_on")}
                        </span>
                      </div>
                      <p className="text-[12px] text-white/55 leading-snug">
                        {t("cookie_necessary_desc")}
                      </p>
                    </div>
                    <Toggle checked={true} onChange={() => {}} disabled />
                  </div>
                </div>

                {/* Analytics */}
                <div
                  className="rounded-xl p-4"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white text-[13px] font-bold mb-1">
                        {t("cookie_analytics")}
                      </h3>
                      <p className="text-[12px] text-white/55 leading-snug">
                        {t("cookie_analytics_desc")}
                      </p>
                    </div>
                    <Toggle
                      checked={prefs.analytics}
                      onChange={(v) => setPrefs((p) => ({ ...p, analytics: v }))}
                    />
                  </div>
                </div>

                {/* Marketing */}
                <div
                  className="rounded-xl p-4"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white text-[13px] font-bold mb-1">
                        {t("cookie_marketing")}
                      </h3>
                      <p className="text-[12px] text-white/55 leading-snug">
                        {t("cookie_marketing_desc")}
                      </p>
                    </div>
                    <Toggle
                      checked={prefs.marketing}
                      onChange={(v) => setPrefs((p) => ({ ...p, marketing: v }))}
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-6 flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={savePrefs}
                  className="flex-1 inline-flex items-center justify-center h-11 px-5 rounded-full text-[13px] font-bold transition-all hover:translate-y-[-1px]"
                  style={{ background: "#ffffff", color: "#0a0f1e" }}
                >
                  {t("cookie_save")}
                </button>
                <button
                  type="button"
                  onClick={acceptAll}
                  className="flex-1 inline-flex items-center justify-center h-11 px-5 rounded-full text-[13px] font-bold transition-colors hover:bg-white/5"
                  style={{
                    color: "rgba(255,255,255,0.85)",
                    border: "1px solid rgba(255,255,255,0.16)",
                  }}
                >
                  {t("cookie_accept_all")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}