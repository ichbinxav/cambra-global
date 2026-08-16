// LegalAcceptanceGate — DPA-1 (2026-08-16).
//
// WHAT WAS BROKEN. The platform had no acceptance mechanism at all. LoginGate
// showed a passive line ("by continuing you accept our Terms and Privacy
// Policy") — browsewrap — and nothing was ever recorded. Nobody could answer
// "which version of which document did this customer accept, and when?".
//
// WHY THE GATE LIVES HERE, NOT ON LoginGate. Authentication is hosted by
// Base44 and leaves the app, so a checkbox on LoginGate could only store an
// intention in localStorage and hope it survived the round-trip. The first
// authenticated in-app render is the earliest point where the acceptance can
// be bound to a real identity and persisted with server-observed evidence —
// so that is where it is collected, for every entry path, not just the claim.
//
// FAIL CLOSED. If the evidence cannot be persisted, the user does NOT get in
// and sees the error. A phantom acceptance — the user believing they accepted
// while no record exists — is the exact failure this feature prevents.
//
// The gate is deliberately silent while it checks (renders nothing) so it does
// not flash over the app for the overwhelming majority who already accepted.

import React from "react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useTranslation } from "@/lib/i18n.jsx";
import {
  CURRENT_DPA_VERSION,
  CURRENT_TERMS_VERSION,
  coversCurrentVersions,
} from "@/lib/legalVersions";

export default function LegalAcceptanceGate({ children }) {
  const { t, lang } = useTranslation();
  const [state, setState] = useState("checking"); // checking | accepted | required | submitting
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const me = await base44.auth.me().catch(() => null);
      if (!me) { if (!cancelled) setState("accepted"); return; } // not our gate to close
      const rows = await base44.entities.LegalAcceptance
        .filter({ user_email: String(me.email || "").toLowerCase() }, "-accepted_at", 10)
        .catch(() => null);
      if (cancelled) return;
      // A read failure must not lock a paying customer out of the product:
      // the WRITE is what fails closed, not the read. An unreadable history
      // simply means we ask again — re-accepting is idempotent server-side.
      const already = Array.isArray(rows) && rows.some(coversCurrentVersions);
      setState(already ? "accepted" : "required");
    })();
    return () => { cancelled = true; };
  }, []);

  const submit = useCallback(async () => {
    setError("");
    setState("submitting");
    try {
      const resp = await base44.functions.invoke("claimAnonPaymentsResult", {
        action: "record_legal_acceptance",
        terms_version: CURRENT_TERMS_VERSION,
        dpa_version: CURRENT_DPA_VERSION,
        locale: lang,
      });
      const body = resp?.data || resp;
      if (body?.ok) { setState("accepted"); return; }
      setError(t("legal_accept_error"));
      setState("required");
    } catch {
      setError(t("legal_accept_error"));
      setState("required");
    }
  }, [lang, t]);

  if (state === "checking") return null;
  if (state === "accepted") return children;

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-16" style={{ background: "#0E0E1A" }}>
      <div
        className="w-full max-w-lg rounded-2xl p-7"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}
      >
        <p className="text-[10px] uppercase tracking-[0.22em] font-bold mb-2" style={{ color: "var(--voltio-2)" }}>
          {t("legal_accept_eyebrow")}
        </p>
        <h1 className="text-xl font-black mb-3" style={{ letterSpacing: "-0.02em" }}>{t("legal_accept_title")}</h1>
        <p className="text-[13px] leading-relaxed mb-5" style={{ color: "rgba(255,255,255,0.7)" }}>
          {t("legal_accept_body")}
        </p>

        <label className="flex items-start gap-3 mb-5 cursor-pointer">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-describedby="legal-accept-links"
          />
          <span className="text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.85)" }}>
            {t("legal_accept_checkbox")}
          </span>
        </label>

        <p id="legal-accept-links" className="text-[12px] mb-6 flex flex-wrap gap-x-4 gap-y-1">
          <Link to="/Terms" target="_blank" className="underline" style={{ color: "var(--voltio-2)" }}>{t("footer_terms")}</Link>
          <Link to="/Privacy" target="_blank" className="underline" style={{ color: "var(--voltio-2)" }}>{t("footer_privacy")}</Link>
          <Link to="/Dpa" target="_blank" className="underline" style={{ color: "var(--voltio-2)" }}>{t("footer_dpa")}</Link>
          <Link to="/Subprocessors" target="_blank" className="underline" style={{ color: "var(--voltio-2)" }}>{t("footer_subprocessors")}</Link>
        </p>

        {/* The exact versions being accepted are shown, not hidden behind the
            links — the record stores these strings and the user can see them. */}
        <p className="text-[11px] mb-5" style={{ color: "rgba(255,255,255,0.45)" }}>
          {t("legal_accept_versions", { terms: CURRENT_TERMS_VERSION, dpa: CURRENT_DPA_VERSION })}
        </p>

        {error && (
          <p role="alert" className="text-[12px] mb-4 rounded-lg px-3 py-2" style={{ color: "#FCA5A5", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={!checked || state === "submitting"}
          onClick={submit}
          className="w-full h-11 rounded-full font-semibold text-sm transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: "var(--voltio)", color: "#fff" }}
        >
          {state === "submitting" ? t("legal_accept_saving") : t("legal_accept_cta")}
        </button>
      </div>
    </div>
  );
}
