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

const receiptKey = (email) => [
  "cambra:legal-acceptance",
  String(email || "").trim().toLowerCase(),
  CURRENT_TERMS_VERSION,
  CURRENT_DPA_VERSION,
].join(":");

function hasLocalReceipt(email) {
  try { return Boolean(window.localStorage.getItem(receiptKey(email))); }
  catch { return false; }
}

function saveLocalReceipt(email, acceptanceId) {
  try {
    window.localStorage.setItem(receiptKey(email), JSON.stringify({
      acceptance_id: acceptanceId || null,
      confirmed_at: new Date().toISOString(),
    }));
  } catch { /* The server record remains authoritative. */ }
}

function clearLocalReceipt(email) {
  try { window.localStorage.removeItem(receiptKey(email)); }
  catch { /* Storage may be disabled; the server check still works. */ }
}

export default function LegalAcceptanceGate({ children }) {
  const { t, lang } = useTranslation();
  const [state, setState] = useState("checking"); // checking | accepted | required | submitting
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const me = await base44.auth.me().catch(() => null);
      if (!me) { if (!cancelled) setState("accepted"); return; } // not our gate to close
      const email = String(me.email || "").trim().toLowerCase();
      setUserEmail(email);

      // A server-confirmed receipt prevents a transient read outage from
      // showing the same legal modal again. A definitive server response still
      // wins, so a new legal version correctly requires a fresh acceptance.
      const cached = hasLocalReceipt(email);
      if (cached && !cancelled) setState("accepted");

      let status = null;
      try {
        const response = await base44.functions.invoke("claimAnonPaymentsResult", {
          action: "get_legal_acceptance_status",
        });
        status = response?.data || response;
      } catch { /* Fall back to the legacy self-read below. */ }
      if (cancelled) return;
      if (status?.ok) {
        if (status.accepted) {
          saveLocalReceipt(email, status.acceptance_id);
          setState("accepted");
        } else {
          clearLocalReceipt(email);
          setState("required");
        }
        return;
      }

      const rows = await base44.entities.LegalAcceptance
        .filter({ user_email: email }, "-accepted_at", 10)
        .catch(() => null);
      if (cancelled) return;
      if (Array.isArray(rows)) {
        const already = rows.some(coversCurrentVersions);
        if (already) saveLocalReceipt(email, rows.find(coversCurrentVersions)?.id);
        else clearLocalReceipt(email);
        setState(already ? "accepted" : "required");
        return;
      }
      // If both reads are temporarily unavailable, only a receipt previously
      // written after a successful server acceptance can keep the user moving.
      setState(cached ? "accepted" : "required");
    })();
    return () => { cancelled = true; };
  }, []);

  const submit = useCallback(async () => {
    setError("");
    setState("submitting");
    try {
      // AUDIT LEGAL-04 (2026-08-17): the acceptance record must state the locale the
      // document was DISPLAYED in, not the interface locale. Terms/Privacy/DPA are
      // published in en/fr/es; anything else falls back to English at render time, so the
      // record must reflect that fallback rather than claim the user read a translation
      // that does not exist.
      const PUBLISHED_LEGAL_LOCALES = ["en", "fr", "es"];
      const displayedLocale = PUBLISHED_LEGAL_LOCALES.includes(lang) ? lang : "en";
      const resp = await base44.functions.invoke("claimAnonPaymentsResult", {
        action: "record_legal_acceptance",
        terms_version: CURRENT_TERMS_VERSION,
        dpa_version: CURRENT_DPA_VERSION,
        locale: displayedLocale,
        interface_locale: lang,
      });
      const body = resp?.data || resp;
      if (body?.ok) {
        saveLocalReceipt(userEmail, body.acceptance_id);
        setState("accepted");
        return;
      }
      setError(t("legal_accept_error"));
      setState("required");
    } catch {
      setError(t("legal_accept_error"));
      setState("required");
    }
  }, [lang, t, userEmail]);

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
