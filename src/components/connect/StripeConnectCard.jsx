import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, RefreshCw, LogOut, Clock, Sparkles, Loader2, LockKeyhole, ShieldCheck, Power } from "lucide-react";
import { useToast } from "@/components/shared/Toast.jsx";
import { useTranslation } from "@/lib/i18n.jsx";
import { trackProductEvent } from "@/lib/productAnalytics";
import { ProviderLogoSvg } from "@/components/paymentsAnalyzer/providerLogos";
// M3-Chunk 6 — Verified analysis is an EXPLICIT user action, not an
// automatic post-sync side effect (the auto-materialize cadena was retired
// in the payments-only cutover, see Decision_Log 2026-07-09). After the
// merchant syncs Stripe, they get a "Run verified analysis" button that
// invokes computeStripeVerifiedGap and navigates to /Results?verified=<id>.
// This keeps the user in control of when the compute (2-8s + credit cost)
// runs, and mirrors the mental model of the anonymous funnel (form →
// explicit submit → results page).

/**
 * M3 — Stripe Connect card.
 * Three states: not_connected · connected · coming_soon (env vars missing).
 */
/** @param {{ redirectAfter?: string, brandId?: string }} [props] */
export default function StripeConnectCard({ redirectAfter = undefined, brandId = undefined } = {}) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [connection, setConnection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [error, setError] = useState("");
  // Verified-analysis action state — kept separate from `busy` so the sync/
  // disconnect buttons don't get disabled while the compute is running (and
  // vice-versa). We show a distinct spinner + message ("Measuring your real
  // rates from Stripe…") because the wait is meaningful (2-8s) and users
  // deserve to know what's happening rather than seeing a blank spinner.
  const [computing, setComputing] = useState(false);
  const connectedTrackedRef = useRef(false);

  // FASE 1 — Integration is now the source of truth for "connected" state.
  // We read Integration rows with any of the 3 Stripe provider slugs
  // (stripe / stripe_self / stripe_self_test) scoped to the active brand.
  // StripeConnection (legacy) is only consulted as a fallback for older data.
  const loadConnection = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("getIntegrationStatus", brandId ? { brand_id: brandId } : {});
      const data = res?.data || res;
      const stripe = (data?.integrations || []).find(i => i.integration_id === "stripe" && i.is_connected);
      setConnection(stripe?.connection_id ? {
        id: stripe.connection_id,
        brand_id: data.brand_id,
        last_sync_at: stripe.last_sync_at,
        provider: stripe.connection_kind === "integration" ? stripe.connection_provider : null,
      } : null);
      if(stripe?.connection_id&&!connectedTrackedRef.current){connectedTrackedRef.current=true;trackProductEvent('integration_connected',{source:'stripe_connect_card',provider:'stripe'});}
    } catch {
      setConnection(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConnection();
    // NOTE: the OAuth callback (?state&code) is NO LONGER handled here.
    // System A (oauthConnector) owns the whole handshake: the callback lands
    // on /IntegrationsCallback, which invokes oauthConnector mode:"callback".
    // That page exchanges the code, encrypts + stores the token in
    // Integration, captures the account country, then bounces back to
    // redirect_after. This card only kicks off mode:"start". The legacy
    // stripeOAuthConnect (system B) + its sessionStorage CSRF dance are
    // retired — the anti-CSRF is now the server-side OAuthState row.
  }, []);

  // System A — kick off Stripe Connect OAuth via the generic engine.
  // oauthConnector mode:"start" creates the anti-CSRF OAuthState row
  // (server-side, bound to brand_id + user), builds the authorize_url with
  // the LIVE STRIPE_CLIENT_ID, and returns it. We just open it. The redirect
  // URI is fixed server-side to {APP_DOMAIN}/IntegrationsCallback — it does
  // NOT vary per caller, which is why redirect_after (not redirect_uri)
  // carries the "bring me back here" intent through the OAuthState row.
  const handleConnect = async () => {
    if (busy) return; // double-submit guard (CONSOLIDATE-1 T2)
    if (!brandId) {
      setError("Missing brand context — please refresh the page.");
      return;
    }
    setBusy(true);
    setError("");
    trackProductEvent('integration_started',{source:'stripe_connect_card',provider:'stripe'});
    try {
      const res = await base44.functions.invoke("oauthConnector", {
        mode: "start",
        provider: "stripe",
        brand_id: brandId,
        redirect_after: redirectAfter || "/ConnectStripe",
      });
      const data = res?.data || res;
      // 503 when STRIPE_CLIENT_ID isn't configured — surface the coming-soon state.
      if (data?.error && /not configured|missing STRIPE_CLIENT_ID/i.test(data.error)) {
        trackProductEvent('integration_failed',{source:'stripe_connect_card',provider:'stripe',reason_code:'configuration_required'});
        setSetupRequired(true);
        return;
      }
      if (!data?.ok || !data.authorize_url) {
        trackProductEvent('integration_failed',{source:'stripe_connect_card',provider:'stripe',reason_code:'start_rejected'});
        const msg = data?.error || t("connect_error");
        setError(msg);
        toast.error(t("connect_error"), msg);
        return;
      }
      // Full-page redirect to connect.stripe.com. Stripe bounces back to
      // /IntegrationsCallback?state&code, which completes the handshake.
      window.location.href = data.authorize_url;
    } catch (e) {
      trackProductEvent('integration_failed',{source:'stripe_connect_card',provider:'stripe',reason_code:'network'});
      const msg = e?.message || t("connect_error");
      setError(msg);
      toast.error(t("connect_error"), msg);
    } finally {
      setBusy(false);
    }
  };

  const handleSync = async () => {
    if (busy) return; // double-submit guard (CONSOLIDATE-1 T2)
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
      // Chunk 6 CUTOVER — auto-materialize removed; Fase 6 rebuilds it.
    } catch (e) {
      setError(e.message || "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  // M3-Chunk 6 — Explicit "Run verified analysis" action.
  //
  // Contract:
  //   - Requires an Integration-backed Stripe connection (legacy StripeConnection
  //     alone can't reach the bridge — Chunk 4 sealed it against Integration).
  //   - Reused rows (idempotency hit) are TRANSPARENT to the user: same UX,
  //     same navigation. computeStripeVerifiedGap returns reused:true with
  //     the same verified_id, and we route to /Results?verified=<id> either
  //     way. The results page decides what to show.
  //   - Navigation ALWAYS targets the canonical `/Results` (not the alias
  //     `/PaymentsResults`) — <Navigate replace> on the alias strips the
  //     query string, which is exactly the bug analyzerResultsHandoff.test.js
  //     locks against for `?session=`. Same rule for `?verified=`.
  const handleRunVerifiedAnalysis = async () => {
    if (computing) return;
    if (!connection?.brand_id) {
      setError("Missing brand context — please refresh the page.");
      return;
    }
    setComputing(true);
    setError("");
    try {
      const res = await base44.functions.invoke("computeStripeVerifiedGap", {
        brand_id: connection.brand_id,
      });
      const data = res?.data || res;
      if (!data?.ok || !data.verified_id) {
        const msg = data?.error || "We couldn't run the verified analysis. Please try again.";
        setError(msg);
        toast.error("Verified analysis failed", msg);
        setComputing(false);
        return;
      }
      // CANONICAL route only — never navigate to /PaymentsResults (alias
      // that drops the query string via <Navigate replace>).
      navigate(`/Results?verified=${encodeURIComponent(data.verified_id)}`);
    } catch (e) {
      const msg = e?.message || "We couldn't reach the verified-analysis service.";
      setError(msg);
      toast.error("Verified analysis failed", msg);
      setComputing(false);
    }
  };

  const handleDisconnect = async () => {
    if (busy) return; // double-submit guard (CONSOLIDATE-1 T2)
    setBusy(true);
    setError("");
    try {
      // BUG-5 fix (2026-07-12) — Single unified path.
      //
      // Empirical repro showed BOTH previous branches failed for the
      // real-world case (service-owned rows):
      //   - Branch A (`Integration.update` as user) → RLS "Permission denied
      //     for update operation on Integration entity" (write is admin-only
      //     per schema).
      //   - Branch B (legacy `stripeDisconnect`) → 500 "Authentication
      //     required to view users" from base44.auth.me() inside the fn.
      //
      // `stripeConnectionDisconnect` runs the M3-sealed ownership check
      // (contact_email / created_by / admin) and does the write with
      // asServiceRole. Dual-row: it disconnects the Integration row AND
      // any legacy StripeConnection rows for the same brand_id in one call,
      // so we no longer branch on connection.provider here.
      const payload = { brand_id: connection?.brand_id };
      if (connection?.provider) payload.integration_id = connection.id;
      const res = await base44.functions.invoke("stripeConnectionDisconnect", payload);
      const data = res?.data || res;
      if (data && data.ok === false) {
        setError(data.error || "Disconnect failed");
        return;
      }
      setConnection(null);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "Disconnect failed");
    } finally {
      setBusy(false);
    }
  };

  const Header = ({ children }) => (
    <div className="flex items-center gap-4">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-[#635BFF]/20 bg-[#635BFF]/10">
        <span className="text-[#635BFF]"><ProviderLogoSvg slug="stripe" size={30} /></span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#6253F3]">{t("az_entry_connect_badge")}</p>
        <p className="mt-1 text-[22px] font-bold tracking-[-.035em] text-[#11182D]">Stripe</p>
        <p className="mt-1 text-[11px] text-[#727B92]">{children}</p>
      </div>
    </div>
  );

  if (loading) {
    return <div className="cambra-paper-card h-full min-h-[430px] p-7 sm:p-8"><Header>{t("sc_loading")}</Header></div>;
  }

  if (setupRequired) {
    return (
      <div className="cambra-paper-card h-full min-h-[430px] p-7 sm:p-8">
        <Header>{t("sc_desc")}</Header>
        <div className="mt-8 flex items-center justify-between gap-3 rounded-2xl border border-[#E0E3EC] bg-[#F7F7FB] p-5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D8DCE8] bg-white px-3 py-1.5 text-[10px] font-semibold text-[#66708A]"><Clock size={10} /> {t("sc_coming_soon")}</span>
          <span className="text-right text-[11px] text-[#737B91]">{t("sc_coming_soon_sub")}</span>
        </div>
      </div>
    );
  }

  if (connection) {
    const canRunVerified = !!connection?.provider;
    return (
      <div className="cambra-paper-card h-full min-h-[430px] p-7 sm:p-8">
        <Header>
          {t("sc_connected_last_sync")} {connection.last_sync_at ? new Date(connection.last_sync_at).toLocaleString() : "—"}
        </Header>
        <div className="mt-7 grid gap-3 border-y border-[#E7E9EF] py-5 sm:grid-cols-3">
          <div className="flex items-center gap-3 text-[11px] font-semibold text-[#3B4661]"><span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EFEDFF] text-[#5B4CF5]"><LockKeyhole size={15} /></span>{t("sc_readonly")}</div>
          <div className="flex items-center gap-3 text-[11px] font-semibold text-[#3B4661]"><span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ECF8F2] text-[#188555]"><Clock size={15} /></span>{t("sc_connected_last_sync")}</div>
          <div className="flex items-center gap-3 text-[11px] font-semibold text-[#3B4661]"><span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ECF8F2] text-[#188555]"><CheckCircle2 size={15} /></span>{t("sc_connected")}</div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-700"><CheckCircle2 size={10} /> {t("sc_connected")}</span>
          <button onClick={handleSync} disabled={busy || computing} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#DDE0E9] bg-white px-3 text-[11px] font-bold text-[#303A55] hover:border-[#AAA3F7] disabled:opacity-50">
            <RefreshCw size={12} className={busy ? "animate-spin" : ""} /> {t("sc_sync_now")}
          </button>
          <button onClick={handleDisconnect} disabled={busy || computing} className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[11px] font-semibold text-[#737B90] hover:text-[#222C47] disabled:opacity-50">
            <LogOut size={12} /> {t("sc_disconnect")}
          </button>
        </div>

        {canRunVerified && (
          <div className="mt-6 flex flex-col items-start justify-between gap-5 rounded-2xl border border-[#5B4CF5]/20 bg-gradient-to-br from-[#F1EFFF] to-[#EEF9FC] p-5 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-[13px] font-bold text-[#172039]"><Sparkles size={14} className="text-[#5B4CF5]" /> {t("sc_run_title")}</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-[#69728A]">{computing ? t("sc_run_computing") : t("sc_run_sub")}</p>
            </div>
            <button onClick={handleRunVerifiedAnalysis} disabled={computing || busy} style={{ background: "var(--g-voltio)" }} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-5 text-[11px] font-bold text-white disabled:opacity-60">
              {computing ? <><Loader2 size={12} className="animate-spin" /> {t("sc_running")}</> : t("sc_run")}
            </button>
          </div>
        )}
        {error && <p role="alert" className="mt-3 text-[11px] text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="cambra-paper-card h-full min-h-[430px] p-7 sm:p-8">
      <Header>{t("sc_subtitle_connect")}</Header>
      <div className="mt-7 border-t border-[#E6E8EF] pt-6">
        <h3 className="text-[17px] font-bold tracking-[-.025em] text-[#121A31]">{t("az_entry_connect_title")}</h3>
        <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-[#6B748B]">{t("az_entry_connect_body")}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            { icon: LockKeyhole, text: t("trust_sec_b1_t") },
            { icon: ShieldCheck, text: t("sec_chip_2") },
            { icon: Power, text: t("trust_sec_b4_t") },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3 rounded-xl border border-[#E5E7EE] bg-[#FAFAFC] px-3 py-3 text-[10.5px] font-semibold text-[#45506A]"><Icon size={14} className="shrink-0 text-[#5B4CF5]" /> {text}</div>
          ))}
        </div>
        <button onClick={handleConnect} disabled={busy || !brandId} style={{ background: "var(--g-voltio)" }} className="mt-6 inline-flex min-h-[52px] w-full items-center justify-center rounded-xl px-5 text-[13px] font-bold text-white shadow-[0_18px_36px_-22px_rgba(91,76,245,.9)] disabled:opacity-50">
          {busy ? t("sc_connecting") : !brandId ? t("sc_setting_up") : t("sc_connect")}
        </button>
        <span className="mt-3 flex items-center justify-center gap-1.5 text-[10px] font-semibold text-[#7A8296]"><LockKeyhole size={11} /> {t("sc_readonly")}</span>
      </div>
      {error && <p role="alert" className="mt-3 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
