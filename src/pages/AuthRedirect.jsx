import { useEffect } from "react";
import { base44 } from "@/api/base44Client";

/**
 * AuthRedirect — handles BOTH directions:
 * 1. Outbound (no token yet): kicks the user to Base44 login with the "next" URL.
 * 2. Inbound (post-login, has token): restores the pre-login destination
 *    from sessionStorage and navigates there. Falls back to /Dashboard.
 */
export default function AuthRedirect() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextParam = params.get("next");

    // Helper — same-origin safety for stored redirect target.
    const sanitize = (candidate) => {
      if (!candidate) return null;
      if (/^https?:\/\//i.test(candidate)) {
        try {
          const url = new URL(candidate);
          if (url.origin !== window.location.origin) return null;
          return url.pathname + url.search + url.hash;
        } catch {
          return null;
        }
      }
      return candidate.startsWith("/") ? candidate : "/" + candidate;
    };

    // Inbound: if a token is already on the URL or we are authenticated,
    // restore the saved destination. We detect this by checking sessionStorage.
    const stored = (() => {
      try {
        return sessionStorage.getItem("cambra_redirect_after_login");
      } catch {
        return null;
      }
    })();

    // If there is no nextParam AND we have a stored destination, treat as inbound.
    if (!nextParam && stored) {
      const safe = sanitize(stored) || "/Dashboard";
      try {
        sessionStorage.removeItem("cambra_redirect_after_login");
      } catch {}
      window.location.replace(safe);
      return;
    }

    // Outbound — kick to login with the chosen next URL.
    const next =
      nextParam || `${window.location.origin}${sanitize(stored) || "/Dashboard"}`;
    base44.auth.redirectToLogin(next);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="text-center">
        <div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin mx-auto mb-3" />
        <h1 className="text-base font-bold mb-1">Redirecting…</h1>
        <p className="text-sm text-muted-foreground">
          Opening the login window — you'll return automatically.
        </p>
      </div>
    </div>
  );
}