import { useEffect } from "react";
import { base44 } from "@/api/base44Client";

/* AuthRedirect — entry point that hands off to Base44 login.
   Honors:
     1. ?next=<url> on the query string
     2. sessionStorage "cambra_redirect_after_login" set by ProtectedRoute
     3. fallback: /Dashboard
   Only same-origin redirects are allowed (open-redirect protection). */

export default function AuthRedirect() {
  useEffect(() => {
    let target = `${window.location.origin}/Dashboard`;
    try {
      const params = new URLSearchParams(window.location.search);
      const fromQuery = params.get("next");
      const fromStorage = sessionStorage.getItem("cambra_redirect_after_login");
      const candidate = fromQuery || fromStorage;
      if (candidate) {
        const safe = sameOriginUrl(candidate);
        if (safe) target = safe;
      }
    } catch {}
    base44.auth.redirectToLogin(target);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="text-center">
        <div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin mx-auto mb-3" />
        <h1 className="text-base font-bold mb-1">Redirecting to sign in…</h1>
        <p className="text-sm text-muted-foreground">
          The login window will open and you'll return automatically.
        </p>
      </div>
    </div>
  );
}

function sameOriginUrl(value) {
  try {
    const origin = window.location.origin;
    if (value.startsWith("/")) return origin + value;
    const u = new URL(value);
    return u.origin === origin ? u.toString() : null;
  } catch {
    return null;
  }
}