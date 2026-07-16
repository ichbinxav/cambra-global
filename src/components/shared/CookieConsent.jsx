import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";

/* CAMBRA — GDPR Cookie Consent.
   Banner appears once when no consent is stored.
   Stores choice in localStorage under "cambra_cookie_consent". */

const STORAGE_KEY = "cambra_cookie_consent";

function readStoredConsent() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.timestamp) return parsed;
    return null;
  } catch {
    return null;
  }
}

function writeConsent(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      necessary: true,
      analytics: !!prefs.analytics,
      marketing: !!prefs.marketing,
      timestamp: new Date().toISOString(),
    }));
  } catch {}
}

export default function CookieConsent() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    // Slight delay so we don't compete with page mount animations.
    const id = setTimeout(() => {
      if (!readStoredConsent()) setVisible(true);
    }, 600);
    return () => clearTimeout(id);
  }, []);

  const acceptAll = useCallback(() => {
    writeConsent({ analytics: true, marketing: true });
    setVisible(false);
    setModalOpen(false);
  }, []);

  const savePreferences = useCallback(() => {
    writeConsent({ analytics, marketing });
    setVisible(false);
    setModalOpen(false);
  }, [analytics, marketing]);

  if (!visible) return null;

  return (
    <>
      {/* Banner */}
      {!modalOpen && (
        <div
          role="dialog"
          aria-live="polite"
          aria-label={t("cookie_modal_title")}
          className="fixed bottom-0 left-0 right-0 z-[100] px-4 pb-4 sm:px-6 sm:pb-6"
          style={{ animation: "cambra-slide-up 320ms ease-out both" }}
        >
          <div
            className="mx-auto max-w-2xl rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4"
            style={{
              background: "rgba(10,10,10,0.95)",
              border: "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              boxShadow: "0 24px 64px -28px rgba(0,0,0,0.6)",
              color: "#ffffff",
            }}
          >
            <p className="flex-1 text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>
              {t("cookie_banner_text")}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setModalOpen(true)}
                className="rounded-full px-4 h-9 text-[12px] font-semibold transition-colors"
                style={{ color: "rgba(255,255,255,0.75)", background: "transparent" }}
              >
                {t("cookie_manage")}
              </button>
              <button
                onClick={acceptAll}
                className="rounded-full px-5 h-9 text-[12px] font-bold bg-white text-black hover:opacity-90 transition-opacity"
              >
                {t("cookie_accept_all")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("cookie_modal_title")}
          className="fixed inset-0 z-[110] flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl p-6 sm:p-7"
            style={{
              background: "#0d0d0d",
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "0 30px 80px -28px rgba(0,0,0,0.7)",
              color: "#ffffff",
              animation: "cambra-fade-up 280ms ease-out both",
            }}
          >
            <button
              onClick={() => setModalOpen(false)}
              aria-label="Close"
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-white/10 transition-colors"
            >
              <X size={16} className="text-white/70" />
            </button>

            <h2 className="text-white font-bold text-[18px] mb-1.5" style={{ letterSpacing: "-0.02em" }}>
              {t("cookie_modal_title")}
            </h2>
            <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.55)", lineHeight: 1.55 }}>
              {t("cookie_modal_sub")}
            </p>

            <div className="mt-5 space-y-2.5">
              <CategoryRow
                title={t("cookie_necessary")}
                desc={t("cookie_necessary_desc")}
                checked={true}
                disabled
                badge={t("cookie_always_on")}
              />
              <CategoryRow
                title={t("cookie_analytics")}
                desc={t("cookie_analytics_desc")}
                checked={analytics}
                onChange={setAnalytics}
              />
              <CategoryRow
                title={t("cookie_marketing")}
                desc={t("cookie_marketing_desc")}
                checked={marketing}
                onChange={setMarketing}
              />
            </div>

            <p className="mt-5 text-[11px]" style={{ color: "rgba(255,255,255,0.32)" }}>
              <Link to="/Privacy" className="underline hover:text-white/70">
                {t("footer_privacy")}
              </Link>
              {"  ·  "}
              <Link to="/Cookies" className="underline hover:text-white/70">
                Cookies
              </Link>
            </p>

            <div className="mt-5 flex flex-col sm:flex-row gap-2 sm:justify-end">
              <button
                onClick={acceptAll}
                className="rounded-full px-5 h-10 text-[13px] font-semibold transition-colors order-2 sm:order-1"
                style={{
                  color: "rgba(255,255,255,0.85)",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                {t("cookie_accept_all")}
              </button>
              <button
                onClick={savePreferences}
                className="rounded-full px-5 h-10 text-[13px] font-bold bg-white text-black hover:opacity-90 transition-opacity order-1 sm:order-2"
              >
                {t("cookie_save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Local keyframes — scoped so we don't depend on tailwind/index.css edits */}
      <style>{`
        @keyframes cambra-slide-up {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes cambra-fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}

/* ── Internal row component ────────────────────────────── */
function CategoryRow({ title, desc, checked, onChange, disabled, badge }) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl p-3.5"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-white text-[13px] font-semibold">{title}</p>
          {badge && (
            <span
              className="text-[9px] uppercase tracking-[0.18em] font-bold px-1.5 py-0.5 rounded-full"
              style={{
                color: "rgba(96,165,250,0.95)",
                background: "rgba(59,130,246,0.10)",
                border: "1px solid rgba(96,165,250,0.25)",
              }}
            >
              {badge}
            </span>
          )}
        </div>
        <p className="mt-1 text-[12px]" style={{ color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>
          {desc}
        </p>
      </div>

      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange?.(!checked)}
      className="relative inline-flex h-6 w-10 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
      style={{
        background: checked ? "#39C6F0" : "rgba(255,255,255,0.15)",
        opacity: disabled ? 0.6 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span
        className="inline-block h-5 w-5 rounded-full bg-white transition-transform"
        style={{
          transform: checked ? "translateX(18px)" : "translateX(2px)",
          marginTop: 2,
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        }}
      />
    </button>
  );
}