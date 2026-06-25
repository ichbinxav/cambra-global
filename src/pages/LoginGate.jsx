import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useTranslation } from "@/lib/i18n.jsx";
import BrandGlyph from "@/components/shared/BrandGlyph";

export default function LoginGate() {
  const { t } = useTranslation();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const nextParam = params.get("next");
      if (nextParam) {
        sessionStorage.setItem("cambra_redirect_after_login", nextParam);
      }
    } catch (e) { /* noop */ }
  }, []);

  function resolveNextUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      const nextParam = params.get("next");
      const stored = sessionStorage.getItem("cambra_redirect_after_login");
      const candidate = nextParam || stored || "/Dashboard";

      if (/^https?:\/\//i.test(candidate)) {
        try {
          const url = new URL(candidate);
          if (url.origin !== window.location.origin) {
            return window.location.origin + "/Dashboard";
          }
          return candidate;
        } catch (e) {
          return window.location.origin + "/Dashboard";
        }
      }
      const prefix = candidate.startsWith("/") ? "" : "/";
      return window.location.origin + prefix + candidate;
    } catch (e) {
      return window.location.origin + "/Dashboard";
    }
  }

  function handleContinue() {
    setRedirecting(true);
    const returnUrl = resolveNextUrl();
    try {
      base44.auth.redirectToLogin(returnUrl);
    } catch (e) {
      window.location.href = "/auth/start?next=" + encodeURIComponent(returnUrl);
    }
  }

  return (
    <div
      className="relative min-h-screen flex items-center justify-center overflow-hidden px-6"
      style={{ background: "#0a0a0a" }}
    >
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 720,
          height: 720,
          left: "50%",
          top: "42%",
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle, rgba(34,211,238,0.10) 0%, rgba(31,78,216,0.06) 40%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage:
            "radial-gradient(ellipse 80% 60% at 50% 50%, #000 30%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 50% 50%, #000 30%, transparent 80%)",
        }}
      />

      <div className="relative w-full max-w-md animate-fade-up">
        <div className="flex flex-col items-center mb-10">
          <div className="h-10 w-10 text-white mb-4">
            <BrandGlyph className="h-10 w-10" />
          </div>
          <div
            className="text-white"
            style={{
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              fontWeight: 800,
              letterSpacing: "0.32em",
              fontSize: 13,
            }}
          >
            CAMBRA
          </div>
        </div>

        <h1
          className="text-center text-white mb-3"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(28px, 4.5vw, 38px)",
            fontWeight: 900,
            letterSpacing: "-0.035em",
            lineHeight: 1.1,
          }}
        >
          {t("login_gate_headline")}
        </h1>

        <p
          className="text-center mb-8"
          style={{
            fontSize: 14,
            lineHeight: 1.55,
            color: "rgba(255,255,255,0.62)",
            fontWeight: 500,
          }}
        >
          {t("login_gate_sub")}
        </p>

        <button
          type="button"
          onClick={handleContinue}
          disabled={redirecting}
          className="w-full sm:max-w-xs sm:mx-auto sm:block inline-flex items-center justify-center gap-2 rounded-full h-12 px-6 font-bold text-[14px] transition-all hover:translate-y-[-1px] disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            background: "#ffffff",
            color: "#0a0f1e",
            boxShadow:
              "0 0 0 1px rgba(255,255,255,0.1), 0 18px 40px -16px rgba(34,211,238,0.45)",
          }}
        >
          {redirecting ? (
            <span className="inline-block h-4 w-4 rounded-full border-2 border-[#0a0f1e]/30 border-t-[#0a0f1e] animate-spin" />
          ) : (
            t("login_gate_cta")
          )}
        </button>

        <p
          className="mt-5 text-center"
          style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}
        >
          {t("login_gate_footnote")}
        </p>

        <p
          className="mt-6 text-center"
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.35)",
            lineHeight: 1.5,
          }}
        >
          {t("login_gate_terms")}{" "}
          <Link to="/Terms" className="underline hover:text-white/60 transition-colors">
            {t("login_gate_terms_link")}
          </Link>{" "}
          {t("login_gate_and")}{" "}
          <Link to="/Privacy" className="underline hover:text-white/60 transition-colors">
            {t("login_gate_privacy_link")}
          </Link>
          .
        </p>
      </div>
    </div>
  );
}