// PaymentsResults — three-path results page.
//
// THREE reader paths, chosen by URL query param — one wins by explicit precedence:
//   A) ?session=<uuid>   → anonymous form path (getPaymentsGapTeaser)
//                          engine_result.mode === "estimated"
//                          Badge: "PUBLIC PRICING" or "REGIONAL ESTIMATE"
//   B) ?verified=<oid>   → authenticated real-data path
//                          (getPaymentsAnalysisVerified, M3-Chunk 5)
//                          engine_result.mode === "verified"
//                          Badge: "VERIFIED" — the one legitimate use of
//                          the word in the whole app (Decision_Log vocabulary rule)
//   C) ?result=<oid>     → authenticated owned estimated result
//                          (getMyPaymentsHistory tenant-scoped detail read)
//
// Renders three cards:
//   1. PaymentsGapCard    — hero: current vs achievable, annual savings RANGE
//   2. FeeBreakdownCard   — interchange / scheme / margin (achievable side only)
//   3. AssumptionsFootnote — always-visible, with regional-fallback banner
//
// States: loading skeleton, session not found (→ /PaymentsAnalyzer),
// network error (retry), rate-limited (soft banner), unauthorized (only in
// verified mode → prompt to sign in). Never a blank screen.
//
// CTA: single primary — "Stop overpaying" → /LoginGate?next=/PaymentsAnalyzer
// on the estimated path. The verified path shows a different CTA (the user
// is already signed in and connected — they need next-steps, not a signup).

import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/landing/Navbar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { ArrowRight, Loader2, AlertTriangle, Search, Lock } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";

import ResultsHistory from "@/components/paymentsResults/ResultsHistory";
import BookCallModal from "@/components/paymentsResults/BookCallModal";
import PaymentsReportExperience from "@/components/paymentsResults/PaymentsReportExperience";
import { PAYMENT_REPORT_VERSIONS } from "@/lib/paymentReportAccess.js";
import { trackProductEvent } from "@/lib/productAnalytics";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBJECT_ID = /^[0-9a-f]{24}$/i;

// Page-level wrapper that installs the same navy-glass background we use on
// the analyzer, so a user landing directly on this URL (shared link) sees
// the same brand shell.
//
// Authenticated readers get the workspace SIDEBAR (same as Dashboard/Analyzer/
// Vault/Account) so /Results feels like part of the app. Anonymous readers
// (shared teaser links, pre-signup) keep the public Navbar — they have no
// workspace to navigate to. `withSidebar` is decided by the caller from the
// auth state.
function ResultsShell({ children, withSidebar = false }) {
  const backdrop = (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          opacity: 0.3,
          maskImage: "radial-gradient(ellipse 90% 70% at 50% 25%, #000 35%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 70% at 50% 25%, #000 35%, transparent 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed z-0"
        style={{
          width: 700, height: 700, left: "50%", top: 80, transform: "translateX(-50%)",
          background: "radial-gradient(circle, rgba(59,130,246,0.14) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />
    </>
  );

  // ── Authenticated layout — workspace sidebar + main content ──────────────
  if (withSidebar) {
    return (
      <div
        className="dark relative min-h-screen flex font-inter overflow-x-hidden"
        style={{
          color: "#ffffff",
          background:
            "linear-gradient(180deg, #0a0a0a 0%, #0b0e1a 25%, #0a0d18 55%, #0b1020 80%, #0E0E1A 100%)",
        }}
      >
        {backdrop}
        <DashboardSidebar />
        <main className="relative z-10 flex-1 min-w-0 pt-14 lg:pt-0">
          <div className="relative max-w-6xl mx-auto w-full px-5 lg:px-8 pt-8 pb-40 lg:pb-16">
            {children}
          </div>
        </main>
      </div>
    );
  }

  // ── Anonymous layout — public navbar (shared teaser link) ────────────────
  return (
    <div
      className="relative min-h-screen flex flex-col font-inter overflow-x-hidden"
      style={{
        color: "#ffffff",
        background:
          "linear-gradient(180deg, #0a0a0a 0%, #0b0e1a 25%, #0a0d18 55%, #0b1020 80%, #0E0E1A 100%)",
      }}
    >
      {backdrop}
      <Navbar />
      {/* Container widens on desktop so the results grid has room to breathe.
          Mobile stays visually identical (max-w-2xl equivalent at that size). */}
      {/* pb bumped on mobile so the fixed cookie banner (bottom-0, ~120px on
          phones) never overlaps the last content / primary CTA. Desktop keeps
          the tighter pb-16 (the banner is a centered pill, no overlap risk). */}
      <main className="relative z-10 flex-1 max-w-2xl lg:max-w-6xl mx-auto w-full px-5 pt-24 pb-40 lg:pb-16">
        {children}
      </main>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-6 w-32 rounded-full bg-white/5" />
      <div className="h-64 rounded-3xl bg-white/[0.03] border border-white/5" />
      <div className="h-48 rounded-2xl bg-white/[0.03] border border-white/5" />
      <div className="h-32 rounded-2xl bg-white/[0.02] border border-white/5" />
    </div>
  );
}

function EmptyState({ title, message, ctaLabel, onCta, icon: Icon = Search }) {
  return (
    <div className="pt-8 text-center">
      <div
        className="inline-flex items-center justify-center h-14 w-14 rounded-2xl mb-5"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}
      >
        <Icon size={22} className="text-white/60" />
      </div>
      <h1
        className="text-white mb-2"
        style={{
          fontFamily: "'Space Grotesk', 'Inter', sans-serif",
          fontSize: "clamp(24px, 4vw, 32px)",
          fontWeight: 900,
          letterSpacing: "-0.03em",
        }}
      >
        {title}
      </h1>
      <p className="text-[14px] text-white/55 max-w-md mx-auto mb-6">{message}</p>
      {ctaLabel && (
        <Button
          onClick={onCta}
          className="h-11 rounded-full px-6 text-sm font-bold gap-2 text-white hover:opacity-90"
          style={{
            background: "linear-gradient(135deg, var(--voltio) 0%, #39C6F0 100%)",
            boxShadow: "0 0 32px rgba(34,211,238,0.35), 0 12px 32px -12px rgba(34,211,238,0.5)",
          }}
        >
          {ctaLabel} <ArrowRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export default function PaymentsResults() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [params] = useSearchParams();
  // Three mutually-exclusive URL contracts:
  //   ?session=<uuid>   → anonymous form path (estimated)
  //   ?verified=<oid>   → authenticated real-data path (verified)
  //   ?result=<oid>     → authenticated owned estimate from history
  // Precedence is verified > result > session. If none is present, the page
  // shows history for an authenticated user and a neutral prompt otherwise.
  const verifiedId = params.get("verified") || "";
  const resultId = params.get("result") || "";
  const sessionId  = params.get("session") || params.get("anon_session_id") || "";
  const isVerifiedPath = !!verifiedId;
  const isOwnedResultPath = !isVerifiedPath && !!resultId;

  const [status, setStatus] = useState("loading");
  // 'loading' | 'ready' | 'not_found' | 'invalid' | 'rate_limited' | 'error' | 'unauthorized'
  const [payload, setPayload] = useState(null);
  const [retryAfter, setRetryAfter] = useState(0);
  const [attempt, setAttempt] = useState(0); // manual retry counter
  const [callOpen, setCallOpen] = useState(false);
  const [reportAccess, setReportAccess] = useState(null);
  const [unlockStatus, setUnlockStatus] = useState("idle");
  const [leaveStatus, setLeaveStatus] = useState("idle");
  // PaymentsRateTable — read once when a result is ready, ONLY to derive the
  // neutral ambition line (marketRange). Public read RLS. Never blocks render.
  const [rateTable, setRateTable] = useState(null);
  const resultsTrackedRef = useRef(false);

  useEffect(() => {
    setReportAccess(null);
    setUnlockStatus("idle");
    setLeaveStatus("idle");

    if(status==='ready'&&!resultsTrackedRef.current){resultsTrackedRef.current=true;trackProductEvent('results_viewed',{source:'payments_results',mode:isVerifiedPath?'verified':isOwnedResultPath?'owned':'estimated'});}
  },[status,isVerifiedPath,isOwnedResultPath]);

  useEffect(() => {
    // ── PATH B — verified (authenticated real-data read) ───────────────
    if (isVerifiedPath) {
      if (!OBJECT_ID.test(verifiedId)) { setStatus("invalid"); return; }
      let cancelled = false;
      setStatus("loading");
      (async () => {
        try {
          const resp = await base44.functions.invoke("getPaymentsAnalysisVerified", { verified_id: verifiedId });
          if (cancelled) return;
          const body = resp?.data || resp;
          if (body?.error === "Unauthorized") { setStatus("unauthorized"); return; }
          if (body?.error === "invalid_verified_id" || body?.error === "invalid_input") { setStatus("invalid"); return; }
          if (body?.error === "not_found" || !body?.ok) { setStatus("not_found"); return; }
          setPayload(body);
          setStatus("ready");
        } catch {
          if (!cancelled) setStatus("error");
        }
      })();
      return () => { cancelled = true; };
    }

    // ── PATH C — owned estimate selected from authenticated history ─────
    if (isOwnedResultPath) {
      if (!isAuthenticated) { setStatus("unauthorized"); return; }
      if (!OBJECT_ID.test(resultId)) { setStatus("invalid"); return; }
      let cancelled = false;
      setPayload(null);
      setStatus("loading");
      (async () => {
        try {
          const resp = await base44.functions.invoke("getMyPaymentsHistory", { result_id: resultId });
          if (cancelled) return;
          const body = resp?.data || resp;
          if (body?.error === "Unauthorized") { setStatus("unauthorized"); return; }
          if (body?.error === "invalid_result_id") { setStatus("invalid"); return; }
          if (body?.error === "not_found" || !body?.ok) { setStatus("not_found"); return; }
          setPayload(body);
          setStatus("ready");
        } catch (error) {
          if (cancelled) return;
          const body = error?.response?.data || error?.data || null;
          if (body?.error === "Unauthorized") { setStatus("unauthorized"); return; }
          if (body?.error === "invalid_result_id") { setStatus("invalid"); return; }
          if (body?.error === "not_found") { setStatus("not_found"); return; }
          setStatus("error");
        }
      })();
      return () => { cancelled = true; };
    }

    // ── PATH A — estimated (anonymous teaser read) ─────────────────────
    if (!sessionId) { setStatus("invalid"); return; }
    if (!UUID_V4.test(sessionId)) { setStatus("invalid"); return; }

    // Session-id persistence for the post-signup rescue (AuthContext Layer B).
    //
    // CRITICAL: only persist while the user is ANONYMOUS. The rescue exists
    // for one purpose — carry the anonymous session id across Base44's signup
    // redirect so a freshly-created user who lands on "/" gets bounced back to
    // their populated report. Once the user is AUTHENTICATED and already
    // viewing /Results, re-writing the pending id keeps the rescue armed
    // forever: on the very next navigation to "/" (or when Base44 returns the
    // user to the root), AuthContext detects the still-present id and force-
    // replaces the URL back to /Results — which is exactly the "Results then
    // redirects to the landing" loop the user reported.
    //
    // So: anonymous → persist (arm the rescue). Authenticated → CLEAR both
    // channels (disarm it — the handoff is done, we're here).
    if (isAuthenticated) {
      try { localStorage.removeItem("cambra_pending_anon_session"); } catch { /* ignore */ }
      try { document.cookie = "cambra_anon_session=; Max-Age=0; Path=/; SameSite=Lax"; } catch { /* ignore */ }
    } else {
      // Two channels because Base44's SIGNUP branch can drop from_url AND the
      // return leg may occur in a different tab/context (OAuth popup), where
      // the origin tab's localStorage isn't shared:
      //   1) localStorage       — same-tab, same-profile (LOGIN path).
      //   2) cambra_anon_session cookie (same-origin, path=/, 30min, Lax)
      //      — survives cross-tab returns, OAuth popups (SIGNUP path).
      try {
        localStorage.setItem("cambra_pending_anon_session", sessionId);
      } catch { /* localStorage unavailable — cookie still applies */ }
      try {
        document.cookie =
          `cambra_anon_session=${encodeURIComponent(sessionId)}; ` +
          `Max-Age=1800; Path=/; SameSite=Lax`;
      } catch { /* document.cookie unavailable — localStorage still applies */ }
    }

    let cancelled = false;
    setStatus("loading");
    (async () => {
      try {
        // Authentication establishes ownership, but does not itself accept the
        // collective mandate. The full report remains locked until the owner
        // makes the separate, versioned, one-click acceptance below.
        if (isAuthenticated) {
          await base44.functions
            .invoke("claimAnonPaymentsResult", { anon_session_id: sessionId })
            .catch(() => null);
          if (cancelled) return;
          const accessResponse = await base44.functions
            .invoke("claimAnonPaymentsResult", {
              action: "payment_report_status",
              anon_session_id: sessionId,
            })
            .catch(() => null);
          const accessBody = accessResponse?.data || accessResponse;
          if (accessBody?.ok && accessBody?.report_access) {
            setReportAccess(accessBody.report_access);
            if (accessBody.report_access.unlocked) {
              const reportResponse = await base44.functions.invoke("claimAnonPaymentsResult", {
                action: "payment_report_read",
                anon_session_id: sessionId,
              });
              if (cancelled) return;
              const reportBody = reportResponse?.data || reportResponse;
              if (reportBody?.ok && reportBody?.engine_result) {
                setPayload(reportBody);
                setReportAccess(reportBody.report_access || accessBody.report_access);
                setStatus("ready");
                return;
              }
            }
          }
        }
        const resp = await base44.functions.invoke("getPaymentsGapTeaser", { anon_session_id: sessionId });
        if (cancelled) return;
        const body = resp?.data || resp;
        if (body?.error === "rate_limited") {
          setRetryAfter(Number(body.retry_after_seconds) || 0);
          setStatus("rate_limited");
          return;
        }
        if (body?.error === "invalid_session_id") { setStatus("invalid"); return; }
        if (body?.error === "not_found" || !body?.ok) { setStatus("not_found"); return; }
        setPayload(body);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, verifiedId, resultId, isVerifiedPath, isOwnedResultPath, attempt, isAuthenticated]);

  // Load the rate table once a result is ready — used ONLY for the roadmap's
  // neutral ambition line. Best-effort: failure just omits the ambition copy.
  useEffect(() => {
    if (status !== "ready" || rateTable) return;
    let cancelled = false;
    base44.entities.PaymentsRateTable
      .filter({ active: true }, "-created_date", 5000)
      .then((rows) => { if (!cancelled) setRateTable(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setRateTable([]); });
    return () => { cancelled = true; };
  }, [status, rateTable]);

  // Anonymous unlock → route to signup, preserving the session so the report
  // (and the full plan) come back populated after login.
  const handleUnlock = () => {
    try {
      const search = new URLSearchParams(window.location.search);
      const sid = search.get("session") || search.get("anon_session_id");
      if (sid) {
        try { localStorage.setItem("cambra_pending_anon_session", sid); } catch { /* cookie fallback */ }
        try { document.cookie = `cambra_anon_session=${encodeURIComponent(sid)}; Max-Age=1800; Path=/; SameSite=Lax`; } catch { /* url fallback */ }
      }
    } catch { /* url fallback */ }
    const currentPath = window.location.pathname + window.location.search;
    navigate(`/LoginGate?next=${encodeURIComponent(currentPath)}`);
  };

  const handleReportUnlock = async () => {
    if (!isAuthenticated) { handleUnlock(); return; }
    if (!UUID_V4.test(sessionId) || unlockStatus === "working") return;
    setUnlockStatus("working");
    try {
      const acceptedResponse = await base44.functions.invoke("claimAnonPaymentsResult", {
        action: "payment_report_accept",
        anon_session_id: sessionId,
        accepted: true,
        versions: PAYMENT_REPORT_VERSIONS,
      });
      const accepted = acceptedResponse?.data || acceptedResponse;
      if (!accepted?.ok) throw new Error(accepted?.error || "payment_report_accept_failed");
      const reportResponse = await base44.functions.invoke("claimAnonPaymentsResult", {
        action: "payment_report_read",
        anon_session_id: sessionId,
      });
      const report = reportResponse?.data || reportResponse;
      if (!report?.ok || !report?.engine_result) throw new Error("payment_report_read_failed");
      setPayload(report);
      setReportAccess(report.report_access || accepted.report_access);
      setUnlockStatus("success");
      trackProductEvent("payment_report_unlocked", { source: "payments_results" });
    } catch {
      setUnlockStatus("error");
    }
  };

  const handleReportLeave = async () => {
    if (!isAuthenticated || !UUID_V4.test(sessionId) || leaveStatus === "working") return;
    setLeaveStatus("working");
    try {
      const response = await base44.functions.invoke("claimAnonPaymentsResult", {
        action: "payment_report_leave",
        anon_session_id: sessionId,
      });
      const body = response?.data || response;
      if (!body?.ok || !body?.report_access) throw new Error("payment_report_leave_failed");
      setReportAccess(body.report_access);
      setLeaveStatus("success");
      trackProductEvent("payment_report_pool_left", { source: "payments_results" });
    } catch {
      setLeaveStatus("error");
    }
  };

  // The call request receives only the analysis context already visible to the
  // authenticated merchant. It never carries the report acceptance snapshot.
  const buildCtaContext = () => {
    const er = payload?.engine_result;
    const snap = payload?.input_snapshot || {};
    const sid = params.get("session") || params.get("anon_session_id") || "";
    const channelGmv = Array.isArray(snap.channels)
      ? snap.channels.reduce((sum, channel) => sum + (Number(channel?.monthly_gmv_eur) || 0), 0)
      : Number(snap?.monthly_gmv_eur) || 0;
    return {
      session_id: sid || undefined,
      gmv_eur_monthly: channelGmv || undefined,
      annual_savings_eur: Number(er?.annual_savings_eur?.point ?? er?.total_annual_savings_eur?.point) || undefined,
      provider_slug: snap?.provider_slug || undefined,
      country: snap?.country || undefined,
      channel: er?.cohort?.channel === "in_store" ? "in_store" : "online",
    };
  };

  // ── loading
  if (status === "loading") {
    return (
      <ResultsShell withSidebar={isAuthenticated}>
        <div className="mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1"
          style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}
        >
          <Loader2 size={11} className="animate-spin text-cyan-300" />
          <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/60">{t("res_loading")}</span>
        </div>
        <LoadingSkeleton />
      </ResultsShell>
    );
  }

  // ── no target id in the URL — the "bare /Results" case.
  //    Authenticated → show the user's own analysis history (server-side,
  //    getMyPaymentsHistory). Anonymous → neutral "run your analysis" prompt,
  //    NOT the scary "this link isn't valid" (there was never a link).
  const hasNoTarget = !verifiedId && !resultId && !sessionId;
  if (hasNoTarget && (status === "invalid" || status === "not_found")) {
    return (
      <ResultsShell withSidebar={isAuthenticated}>
        {isAuthenticated ? (
          <ResultsHistory />
        ) : (
          <EmptyState
            title={t("res_run_title")}
            message={t("res_run_msg")}
            ctaLabel={t("res_run_cta")}
            onCta={() => navigate("/Analyzer")}
          />
        )}
      </ResultsShell>
    );
  }

  // ── invalid or missing session id (a target WAS provided but is bad)
  if (status === "invalid" || status === "not_found") {
    return (
      <ResultsShell withSidebar={isAuthenticated}>
        <EmptyState
          title={t(status === "invalid" ? "res_invalid_title" : "res_notfound_title")}
          message={t("res_stale_msg")}
          ctaLabel={t("res_rerun_cta")}
          onCta={() => navigate("/Analyzer")}
        />
      </ResultsShell>
    );
  }

  // ── rate limited on read
  if (status === "rate_limited") {
    const mins = Math.max(1, Math.ceil((retryAfter || 60) / 60));
    return (
      <ResultsShell withSidebar={isAuthenticated}>
        <EmptyState
          icon={AlertTriangle}
          title={t("res_rate_title")}
          message={t("res_rate_msg", { mins })}
          ctaLabel={t("res_retry_now")}
          onCta={() => setAttempt((n) => n + 1)}
        />
      </ResultsShell>
    );
  }

  // ── generic error
  if (status === "error") {
    return (
      <ResultsShell withSidebar={isAuthenticated}>
        <EmptyState
          icon={AlertTriangle}
          title={t("res_err_title")}
          message={t("res_err_msg")}
          ctaLabel={t("res_retry")}
          onCta={() => setAttempt((n) => n + 1)}
        />
      </ResultsShell>
    );
  }

  // ── unauthorized (verified and owned-result paths are private)
  if (status === "unauthorized") {
    const privateTarget = isOwnedResultPath
      ? `/Results?result=${resultId}`
      : `/Results?verified=${verifiedId}`;
    return (
      <ResultsShell>
        <EmptyState
          icon={Lock}
          title={t("res_auth_title")}
          message={t("res_auth_msg")}
          ctaLabel={t("res_auth_cta")}
          onCta={() => navigate(`/LoginGate?next=${encodeURIComponent(privateTarget)}`)}
        />
      </ResultsShell>
    );
  }

  // ── ready
  const engineResult = payload?.engine_result;
  // Verified results are measured from connected data and do not carry the
  // original manual input snapshot. Keep the existing, evidence-based bridge.
  const inputSnapshot = isVerifiedPath
    ? {
        country: engineResult?.cohort?.key?.split("|")?.[2] || null,
        provider_slug: engineResult?.cohort?.key?.split("|")?.[0] || null,
        monthly_gmv_eur: payload?.sample_metrics?.gmv_eur_monthly ?? null,
        avg_ticket_eur: payload?.sample_metrics?.avg_ticket_eur ?? null,
      }
    : payload?.input_snapshot || {};
  const isVerifiedMode = engineResult?.mode === "verified";
  const experiencePayload = { ...payload, input_snapshot: inputSnapshot };

  return (
    <>
      <PaymentsReportExperience
        payload={experiencePayload}
        isAuthenticated={isAuthenticated}
        isVerifiedMode={isVerifiedMode}
        isOwnedResultPath={isOwnedResultPath}
        reportAccess={reportAccess}
        unlockStatus={unlockStatus}
        leaveStatus={leaveStatus}
        rateTable={rateTable}
        onBack={() => navigate("/Analyzer")}
        onCreateAccount={handleUnlock}
        onUnlock={handleReportUnlock}
        onLeave={handleReportLeave}
        onViewStatus={() => navigate("/Dashboard")}
        onBookReview={() => setCallOpen(true)}
      />
      <BookCallModal
        open={callOpen}
        onClose={() => setCallOpen(false)}
        context={buildCtaContext()}
      />
    </>
  );
}
