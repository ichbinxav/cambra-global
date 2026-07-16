import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, RefreshCw, LogOut, Clock, Sparkles, Loader2 } from "lucide-react";
import { useToast } from "@/components/shared/Toast.jsx";
import { useTranslation } from "@/lib/i18n.jsx";
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
export default function StripeConnectCard({ redirectAfter, brandId } = {}) {
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
    if (!brandId) {
      setError("Missing brand context — please refresh the page.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await base44.functions.invoke("oauthConnector", {
        mode: "start",
        provider: "stripe",
        brand_id: brandId,
        redirect_after: redirectAfter || "/ConnectTools",
      });
      const data = res?.data || res;
      // 503 when STRIPE_CLIENT_ID isn't configured — surface the coming-soon state.
      if (data?.error && /not configured|missing STRIPE_CLIENT_ID/i.test(data.error)) {
        setSetupRequired(true);
        return;
      }
      if (!data?.ok || !data.authorize_url) {
        const msg = data?.error || t("connect_error");
        setError(msg);
        toast.error(t("connect_error"), msg);
        return;
      }
      // Full-page redirect to connect.stripe.com. Stripe bounces back to
      // /IntegrationsCallback?state&code, which completes the handshake.
      window.location.href = data.authorize_url;
    } catch (e) {
      const msg = e?.message || t("connect_error");
      setError(msg);
      toast.error(t("connect_error"), msg);
    } finally {
      setBusy(false);
    }
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
    // Verified analysis is only reachable through the Integration-backed
    // path (Chunk 4 explicitly uses base44.entities.Integration.filter to
    // find the Stripe row; a legacy-only StripeConnection returns 404
    // no_stripe_integration). We surface the button only when it will work.
    const canRunVerified = !!connection?.provider;
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
            disabled={busy || computing}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-border/60 text-[11px] font-medium text-foreground hover:border-foreground/40 disabled:opacity-50"
          >
            <RefreshCw size={12} className={busy ? "animate-spin" : ""} />
            Sync now
          </button>
          <button
            onClick={handleDisconnect}
            disabled={busy || computing}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <LogOut size={12} />
            Disconnect
          </button>
        </div>

        {/* Verified analysis — primary post-sync action.
            Full-width block so it doesn't get lost among the utility buttons
            above. The "Run" call is where CAMBRA's real product value lands:
            it measures the merchant's actual effective rate from real Stripe
            data (canonical fees ÷ net volume over the last 90d) and shows
            the VERIFIED badge over that number on /Results. */}
        {canRunVerified && (
          <div
            className="mt-3 rounded-xl p-3 flex items-center justify-between gap-3"
            style={{
              background:
                "linear-gradient(135deg, rgba(34,211,238,0.08) 0%, rgba(31,78,216,0.06) 100%)",
              border: "1px solid rgba(34,211,238,0.30)",
            }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                <Sparkles size={11} className="text-cyan-500" />
                Run verified analysis
              </p>
              <p className="text-[10.5px] text-muted-foreground mt-0.5">
                {computing
                  ? "Measuring your real rates from Stripe…"
                  : "Measure your effective rate from real Stripe data (last 90 days)."}
              </p>
            </div>
            <button
              onClick={handleRunVerifiedAnalysis}
              disabled={computing || busy}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[11px] font-bold text-white disabled:opacity-60 shrink-0"
              style={{
                background: "linear-gradient(135deg, #5B4CF5 0%, #39C6F0 100%)",
                boxShadow: "0 6px 20px -8px rgba(34,211,238,0.55)",
              }}
            >
              {computing ? (
                <>
                  <Loader2 size={12} className="animate-spin" /> Running…
                </>
              ) : (
                <>Run</>
              )}
            </button>
          </div>
        )}

        {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <Header>Connect read-only access to pull live fees & volumes</Header>
      <div className="flex items-center justify-between gap-3">
        {/* Timing guard: brandId resolves asynchronously in the parent
            (ConnectTools does auth.me() → Brand.filter). Disabling until it's
            present prevents the "Missing brand context — please refresh"
            error from a click that lands before the brand is resolved. */}
        <button
          onClick={handleConnect}
          disabled={busy || !brandId}
          className="h-9 px-4 rounded-full text-xs font-bold text-white disabled:opacity-50"
          style={{ background: stripeColor }}
        >
          {busy ? "Connecting…" : !brandId ? "Loading…" : "Connect Stripe"}
        </button>
        <span className="text-[10px] text-muted-foreground">🔒 Read-only OAuth</span>
      </div>
      {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}