import React, { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useTranslation } from "@/lib/i18n.jsx";
import { safeReturnUrl } from "@/lib/safeRedirect";
import LoginGateBenefits from "@/components/auth/LoginGateBenefits";

/* CAMBRA — Pre-login gate.
   Shown when an unauthenticated user lands on a protected route.
   Single CTA → base44.auth.redirectToLogin(returnUrl).
   Base44 owns the actual login UI (Google / email). */

export default function LoginGate() {
  const { t } = useTranslation();

  // Resolve where to send the user back after login.
  const returnUrl = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromQuery = params.get("next");
      if (fromQuery) return safeReturnUrl(fromQuery, window.location.origin);

      const stored = sessionStorage.getItem("cambra_redirect_after_login");
      if (stored) return safeReturnUrl(stored, window.location.origin);
    } catch {}
    return `${window.location.origin}/Dashboard`;
  }, []);

  // Contextual copy: when the user was heading to Connect Tools (they clicked
  // "Connect Stripe/your PSP"), show connection-specific messaging instead of
  // the generic "your audit is ready" — otherwise the gate looks unrelated to
  // the action they just took.
  const isConnectIntent = /\/ConnectTools|\/ConnectIntegrations/i.test(returnUrl);
  const headline = isConnectIntent ? t("login_gate_connect_headline") : t("login_gate_headline");
  const sub = isConnectIntent ? t("login_gate_connect_sub") : t("login_gate_sub");

  const handleContinue = () => {
    try {
      base44.auth.redirectToLogin(returnUrl);
    } catch {
      // Last-resort fallback — should never happen in practice.
      window.location.href = returnUrl;
    }
  };

  // Keyboard: Enter triggers Continue.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Enter") handleContinue(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
     
  }, [returnUrl]);

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center relative overflow-hidden"
      style={{ background: "#0a0a0a", color: "#ffffff" }}
    >
      {/* Ambient blue glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          width: 720, height: 720, left: "50%", top: "50%",
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(59,130,246,0.22) 0%, transparent 70%)",
          filter: "blur(70px)",
        }}
      />
      {/* Subtle grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(ellipse 90% 80% at 50% 50%, #000 35%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 90% 80% at 50% 50%, #000 35%, transparent 100%)",
          opacity: 0.5,
        }}
      />

      <div className="relative w-full max-w-md px-6 sm:px-8 animate-fade-up">
        {/* Wordmark */}
        <Link
          to="/"
          className="block text-center mb-10 text-white"
          style={{ fontWeight: 900, letterSpacing: "-0.04em", fontSize: 22 }}
          aria-label="CAMBRA"
        >
          CAMBRA
        </Link>

        {/* Headline */}
        <h1
          className="text-white text-center"
          style={{
            fontSize: "clamp(28px, 5vw, 40px)",
            fontWeight: 900,
            letterSpacing: "-0.04em",
            lineHeight: 1.05,
            textShadow: "0 0 40px rgba(59,130,246,0.18)",
          }}
        >
          {headline}
        </h1>

        {/* Subhead */}
        <p
          className="text-center mt-5 text-[15px]"
          style={{ color: "rgba(255,255,255,0.62)", lineHeight: 1.55 }}
        >
          {sub}
        </p>

        {/* UX-1 T5 — what an account unlocks (mirrors the locked report items) */}
        <LoginGateBenefits />

        {/* P0.4 — Base44 exposes one combined auth flow (redirectToLogin).
            Two buttons calling the same handler was misleading. Replaced
            with one honest CTA + supporting text explaining the next screen. */}
        <button
          onClick={handleContinue}
          className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-full bg-white text-black font-bold text-[14px] h-12 px-6 transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          style={{
            boxShadow:
              "0 0 0 1px rgba(255,255,255,0.1), 0 20px 50px -20px rgba(59,130,246,0.6), 0 0 40px rgba(59,130,246,0.25)",
          }}
        >
          {t("login_gate_continue")}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
        <p
          className="text-center mt-3 text-[12px]"
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
          {t("login_gate_continue_sub")}
        </p>

        {/* Footnote */}
        <p
          className="text-center mt-5 text-[12px]"
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
          {t("login_gate_footnote")}
        </p>

        {/* Terms */}
        <p
          className="text-center mt-3 text-[11px]"
          style={{ color: "rgba(255,255,255,0.32)", lineHeight: 1.5 }}
        >
          {t("login_gate_terms")}{" "}
          <Link to="/Terms" className="underline hover:text-white/70 transition-colors">
            {t("login_gate_terms_link")}
          </Link>{" "}
          {t("login_gate_and")}{" "}
          <Link to="/Privacy" className="underline hover:text-white/70 transition-colors">
            {t("login_gate_privacy_link")}
          </Link>
          .
        </p>

        {/* Escape hatch — never trap a user on the gate */}
        <div className="mt-7 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[12px] text-white/40 hover:text-white/75 transition-colors"
          >
            <ArrowLeft size={12} /> {t("login_gate_back")}
          </Link>
        </div>
      </div>
    </div>
  );
}

/* Open-redirect protection now lives in src/lib/safeRedirect.js
   (safeReturnUrl) and is unit-tested in safeRedirect.test.js. */