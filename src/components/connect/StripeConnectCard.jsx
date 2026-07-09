import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, RefreshCw, LogOut, Clock, Loader2 } from "lucide-react";
import { useToast } from "@/components/shared/Toast.jsx";
import { useTranslation } from "@/lib/i18n.jsx";
import { useAutoMaterialize } from "@/hooks/useAutoMaterialize";

/**
 * M3 — Stripe Connect card.
 * Three states: not_connected · connected · coming_soon (env vars missing).
 */
export default function StripeConnectCard({ redirectAfter, brandId } = {}) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [connection, setConnection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [error, setError] = useState("");
  // 5C (A2) — auto-materialize after successful sync. Failure is silent
  // toward the user: the sync stays saved and the manual 5B button on
  // /Results remains as fallback.
  const { state: autoState, run: runAutoMaterialize } = useAutoMaterialize();

  // FASE 1 — Integration is now the source of truth for "connected" state.
  // We read Integration rows with any of the 3 Stripe provider slugs
  // (stripe / stripe_self / stripe_self_test) scoped to the active brand.
  // StripeConnection (legacy) is only consulted as a fallback for older data.
  const loadConnection = async () => {
    setLoading(true);
    try {
      const filter = { status: "connected" };
      if (brandId) filter.brand_id = brandId;
      const integrations = await base44.entities.Integration.filter(
        filter, "-last_sync_at", 20
      ).catch(() => []);
      const stripeIntegration = integrations.find(i =>
        i.provider === "stripe" || i.provider === "stripe_self" || i.provider === "stripe_self_test"
      );
      if (stripeIntegration) {
        setConnection({
          id: stripeIntegration.id,
          brand_id: stripeIntegration.brand_id,
          last_sync_at: stripeIntegration.last_sync_at,
          provider: stripeIntegration.provider,
        });
      } else {
        // Fallback: legacy StripeConnection (kept while migration completes)
        const list = await base44.entities.StripeConnection.filter(
          { connection_status: "connected" }, "-last_sync_at", 1
        ).catch(() => []);
        setConnection(list[0] || null);
      }
    } catch {
      setConnection(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConnection();

    // FIX 4 — Handle OAuth callback (?code=...) with CSRF state validation
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const returnedState = params.get("state");
    if (code) {
      const savedState = sessionStorage.getItem("stripe_oauth_state");
      if (!returnedState || returnedState !== savedState) {
        setError("OAuth state mismatch — possible CSRF attack. Please try again.");
        // Clean URL so the error doesn't reappear on refresh
        window.history.replaceState({}, "", window.location.pathname);
        return;
      }
      sessionStorage.removeItem("stripe_oauth_state");
      handleOAuthCallback(code);
    }
  }, []);

  const handleOAuthCallback = async (code) => {
    setBusy(true);
    setError("");
    try {
      const res = await base44.functions.invoke("stripeOAuthConnect", { code });
      const data = res?.data || res;
      if (data?.setup_required) {
        setSetupRequired(true);
      } else if (data?.ok) {
        // FIX 4 — translated success toast on successful Stripe connection
        toast.success(t("az_step3_verified"), t("connect_success"));
        window.history.replaceState({}, "", window.location.pathname);
        await loadConnection();
      } else {
        const msg = data?.error || t("connect_error");
        setError(msg);
        toast.error(t("connect_error"), msg);
      }
    } catch (e) {
      const msg = e.message || t("connect_error");
      setError(msg);
      toast.error(t("connect_error"), msg);
    } finally {
      setBusy(false);
    }
  };

  const handleConnect = () => {
    const clientId = import.meta.env.VITE_STRIPE_CLIENT_ID;
    if (!clientId) {
      setSetupRequired(true);
      return;
    }
    // FIX 4 — random per-session state for CSRF protection
    const state = (window.crypto && window.crypto.randomUUID)
      ? window.crypto.randomUUID()
      : `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem("stripe_oauth_state", state);
    // redirectAfter lets callers (e.g. Analyzer Step 3) bring the user back to
    // their own page after Stripe OAuth instead of the default /ConnectTools.
    const redirectPath = redirectAfter || "/ConnectTools";
    const redirectUri = `${window.location.origin}${redirectPath}`;
    const url =
      `https://connect.stripe.com/oauth/authorize` +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&scope=read_only` +
      `&state=${encodeURIComponent(state)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}`;
    window.location.href = url;
  };

  const handleSync = async () => {
    setBusy(true);
    setError("");
    try {
      // FASE 1.5 — Route Sync to the right endpoint based on connection type.
      //   • Integration-backed (stripe / stripe_self / stripe_self_test):
      //     use `dataSyncAgent` with the integration_id. `stripeDataSync`
      //     was written for the legacy StripeConnection entity and returns
      //     404 when no StripeConnection row exists (post-FASE-1 the source
      //     of truth is Integration, so this is now the common case).
      //   • Legacy StripeConnection: fall back to `stripeDataSync` (no
      //     connection.provider present → row came from the legacy filter
      //     branch in loadConnection()).
      // NOTE (deuda documentada): handleDisconnect below still calls
      // `stripeDisconnect` on Integration-backed connections and can 404.
      // Intentionally NOT patched here — separate follow-up.
      const isIntegrationBacked = !!connection?.provider;
      const res = isIntegrationBacked
        ? await base44.functions.invoke("dataSyncAgent", { integration_id: connection.id })
        : await base44.functions.invoke("stripeDataSync", {});
      const data = res?.data || res;
      if (data?.setup_required) setSetupRequired(true);
      else if (!data?.ok) setError(data?.error || "Sync failed");
      await loadConnection();

      // 5C (A2) — encadena bridge → materialize si el sync fue OK.
      // No await bloqueante en un try/catch propio: el sync ya está guardado,
      // un fallo del auto-trigger no debe pintarse como fallo de sync.
      if (data?.ok && connection?.brand_id) {
        const outcome = await runAutoMaterialize(connection.brand_id).catch(() => null);
        if (outcome?.status === "materialized") {
          toast.success(t("auto_verify_ready"));
        } else if (outcome?.status === "collecting") {
          toast.info(t("auto_verify_collecting"));
        }
        // skipped / failed → silencio hacia el usuario. Fallback manual sigue disponible.
      }
    } catch (e) {
      // TEMP DEBUG — revertir tras diagnosticar
      // Surface backend structured error (stage + real message) instead of
      // axios's generic "Request failed with status code 500".
      const backend = e?.response?.data;
      setError(
        backend?.stage
          ? `[${backend.stage}] ${backend.error}`
          : (backend?.error || e.message || "Sync failed")
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    setError("");
    try {
      await base44.functions.invoke("stripeDisconnect", {});
      setConnection(null);
    } catch (e) {
      setError(e.message || "Disconnect failed");
    } finally {
      setBusy(false);
    }
  };

  const stripeColor = "#635BFF";

  const Header = ({ children }) => (
    <div className="flex items-center gap-3 mb-3">
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center font-black shrink-0"
        style={{ background: stripeColor + "18", border: `1px solid ${stripeColor}30` }}
      >
        <span style={{ color: stripeColor }} className="text-[11px]">ST</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground">Stripe</p>
        <p className="text-[11px] text-muted-foreground">{children}</p>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-4">
        <Header>Loading…</Header>
      </div>
    );
  }

  if (setupRequired) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-4">
        <Header>Online payment processing fees & rates</Header>
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary text-[10px] font-semibold text-muted-foreground border border-border/60">
            <Clock size={10} /> Coming soon
          </span>
          <span className="text-[11px] text-muted-foreground">Live data connection launching shortly</span>
        </div>
      </div>
    );
  }

  if (connection) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-card p-4">
        <Header>
          Connected · last sync{" "}
          {connection.last_sync_at
            ? new Date(connection.last_sync_at).toLocaleString()
            : "—"}
        </Header>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-[10px] font-semibold text-emerald-600 border border-emerald-500/20">
            <CheckCircle2 size={10} /> Connected
          </span>
          <button
            onClick={handleSync}
            disabled={busy}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-border/60 text-[11px] font-medium text-foreground hover:border-foreground/40 disabled:opacity-50"
          >
            <RefreshCw size={12} className={busy ? "animate-spin" : ""} />
            Sync now
          </button>
          {autoState.status === "running" && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 size={11} className="animate-spin" />
              {t("auto_verify_running")}
            </span>
          )}
          <button
            onClick={handleDisconnect}
            disabled={busy}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <LogOut size={12} />
            Disconnect
          </button>
        </div>
        {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <Header>Connect read-only access to pull live fees & volumes</Header>
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={handleConnect}
          disabled={busy}
          className="h-9 px-4 rounded-full text-xs font-bold text-white disabled:opacity-50"
          style={{ background: stripeColor }}
        >
          {busy ? "Connecting…" : "Connect Stripe"}
        </button>
        <span className="text-[10px] text-muted-foreground">🔒 Read-only OAuth</span>
      </div>
      {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}