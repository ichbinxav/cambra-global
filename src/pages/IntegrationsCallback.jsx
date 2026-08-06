import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import LoadingScreen from "@/components/shared/LoadingScreen";
import { useLanguage } from "@/lib/i18n.jsx";

/**
 * OAuth callback landing page for the generic connector engine.
 * Reads ?state= and ?code= from the URL, forwards them to oauthConnector
 * mode=callback, then bounces to redirect_after (or /ConnectIntegrations).
 *
 * No business logic — pure router for the OAuth handshake.
 */
export default function IntegrationsCallback() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const state = params.get("state");
        const code = params.get("code");
        if (!state || !code) {
          setError("Missing state or code in callback URL.");
          return;
        }
        const res = await base44.functions.invoke("oauthConnector", {
          mode: "callback",
          state,
          code,
        });
        const data = res?.data || res;
        if (!data?.ok) {
          setError(data?.error || "Callback failed.");
          return;
        }
        const target = data.redirect_after || "/ConnectIntegrations";
        navigate(target, { replace: true });
      } catch (err) {
        setError(err?.message || "Callback failed.");
      }
    })();
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-black mb-2">{t("cb_error_title")}</h1>
          <p className="text-sm text-muted-foreground mb-6">{error}</p>
          <button
            onClick={() => navigate("/ConnectIntegrations")}
            className="inline-flex items-center justify-center h-10 px-5 rounded-full bg-foreground text-background text-sm font-bold"
          >
            {t("cb_back")}
          </button>
        </div>
      </div>
    );
  }
  return <LoadingScreen label={t("cb_completing")} />;
}