import { useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useTranslation } from "@/lib/i18n.jsx";
import { useToast } from "@/components/shared/Toast.jsx";

export const REFERRAL_CODE_PATTERN = /^[A-Za-z0-9_-]{4,24}$/;
export const REFERRAL_STORAGE_KEY = "cambra_ref_code";

const claimAttempts = new Set();

function readReferralCode() {
  try {
    const queryCode = new URLSearchParams(window.location.search).get("ref")?.trim();
    if (queryCode) return queryCode;
    return sessionStorage.getItem(REFERRAL_STORAGE_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

function removeReferralQuery() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("ref")) return;
    url.searchParams.delete("ref");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // The durable server claim matters; URL cleanup is cosmetic.
  }
}

/**
 * Carries an invite code across authentication and claims it exactly once for
 * the signed-in account. It renders no UI; LoginGate and Invite own the visible
 * explanation while the server remains the only eligibility authority.
 */
export default function ReferralAttributionCapture() {
  const { isAuthenticated, isLoadingAuth, user } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const code = readReferralCode();
    if (!code) return;

    if (!REFERRAL_CODE_PATTERN.test(code)) {
      try { sessionStorage.removeItem(REFERRAL_STORAGE_KEY); } catch {}
      removeReferralQuery();
      return;
    }

    try { sessionStorage.setItem(REFERRAL_STORAGE_KEY, code); } catch {}
    if (isLoadingAuth || !isAuthenticated || !user?.email) return;

    const attemptKey = `${String(user.email).toLowerCase()}:${code}`;
    if (claimAttempts.has(attemptKey)) return;
    claimAttempts.add(attemptKey);

    let cancelled = false;
    base44.functions.invoke("getMyReferralStatus", {
      action: "claim_code",
      code,
      source: window.location.pathname.toLowerCase() === "/invite" ? "invite" : "registration",
    }).then((response) => {
      if (cancelled) return;
      const body = response?.data || response;
      if (!body?.ok) {
        claimAttempts.delete(attemptKey);
        try { sessionStorage.removeItem(REFERRAL_STORAGE_KEY); } catch {}
        removeReferralQuery();
        // Owners often open their own invite to preview it before sharing.
        // Keep the server-side refusal, but do not present that safe preview
        // as a broken or expired code.
        if (body?.reason === "self_referral" && window.location.pathname.toLowerCase() === "/invite") return;
        toast.error(t("ref_code_rejected"), t("ref_code_rejected_body"));
        return;
      }

      try {
        sessionStorage.removeItem(REFERRAL_STORAGE_KEY);
        sessionStorage.setItem("cambra_ref_claimed", code);
      } catch {}
      removeReferralQuery();
      toast.success(t("ref_code_applied"), t("ref_code_applied_body"));
    }).catch(() => {
      if (cancelled) return;
      // Keep the pending code after a transport/runtime failure. A temporary
      // outage must not silently destroy valid attribution before the next
      // authenticated page load can retry it.
      claimAttempts.delete(attemptKey);
    });

    return () => { cancelled = true; };
  }, [isAuthenticated, isLoadingAuth, t, toast, user?.email]);

  return null;
}
