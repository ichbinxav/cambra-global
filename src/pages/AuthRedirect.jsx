import { useEffect } from "react";
import { base44 } from "@/api/base44Client";
import LoadingScreen from "@/components/shared/LoadingScreen";
import { isSameOriginUrl } from "@/lib/safeRedirect";
import { useLanguage } from "@/lib/i18n.jsx";

/* AuthRedirect — entry point that hands off to Base44 login.
   Honors:
     1. ?next=<url> on the query string
     2. sessionStorage "cambra_redirect_after_login" set by ProtectedRoute
     3. fallback: /Dashboard
   Only same-origin redirects are allowed (open-redirect protection). */

export default function AuthRedirect() {
  const { t } = useLanguage();
  useEffect(() => {
    let target = `${window.location.origin}/Dashboard`;
    try {
      const params = new URLSearchParams(window.location.search);
      const fromQuery = params.get("next");
      const fromStorage = sessionStorage.getItem("cambra_redirect_after_login");
      const candidate = fromQuery || fromStorage;
      if (candidate) {
        const safe = isSameOriginUrl(candidate, window.location.origin);
        if (safe) target = safe;
      }
    } catch {}
    base44.auth.redirectToLogin(target);
  }, []);

  return (
    <LoadingScreen
      label={t("auth_redirecting")}
      sublabel={t("auth_redirecting_sub")}
    />
  );
}

/* Open-redirect protection now lives in src/lib/safeRedirect.js
   (isSameOriginUrl) and is unit-tested in safeRedirect.test.js. */