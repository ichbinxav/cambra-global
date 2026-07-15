// PaymentsResults — dual-mode results page.
//
// TWO reader paths, chosen by URL query param — never both, never fallback:
//   A) ?session=<uuid>   → anonymous form path (getPaymentsGapTeaser)
//                          engine_result.mode === "estimated"
//                          Badge: "PUBLIC PRICING" or "REGIONAL ESTIMATE"
//   B) ?verified=<oid>   → authenticated real-data path
//                          (getPaymentsAnalysisVerified, M3-Chunk 5)
//                          engine_result.mode === "verified"
//                          Badge: "VERIFIED" — the one legitimate use of
//                          the word in the whole app (Decision_Log vocabulary rule)
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
import { ArrowRight, ArrowLeft, Loader2, AlertTriangle, Search, Lock } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";

import PaymentsGapCard from "@/components/paymentsResults/PaymentsGapCard";
import FeeBreakdownCard from "@/components/paymentsResults/FeeBreakdownCard";
import AssumptionsFootnote from "@/components/paymentsResults/AssumptionsFootnote";
import CombinedGapHero from "@/components/paymentsResults/CombinedGapHero";
import OptimizedHero from "@/components/paymentsResults/OptimizedHero";
import ResultsHistory from "@/components/paymentsResults/ResultsHistory";
import RecoveryRoadmap from "@/components/paymentsResults/RecoveryRoadmap";
import PeerBenchmark from "@/components/paymentsResults/PeerBenchmark";
import PaymentsDataInsights from "@/components/paymentsResults/PaymentsDataInsights";
import PaymentsInStoreInsights from "@/components/paymentsResults/PaymentsInStoreInsights";
import CombinedChannelSection from "@/components/paymentsResults/CombinedChannelSection";
import DownloadAuditButton from "@/components/paymentsResults/DownloadAuditButton";
import ActionCenter from "@/components/dashboard/ActionCenter";
import CollectiveModal from "@/components/paymentsResults/CollectiveModal";
import BookCallModal from "@/components/paymentsResults/BookCallModal";
import { buildRecoveryRoadmap } from "@/lib/paymentsRoadmap.js";

// A merchant whose opportunity is this large gets routed to a human call
// instead of the self-serve collective. Either high monthly GMV OR high
// annual savings crosses the threshold.
const CALL_GMV_MONTHLY_EUR = 250000;   // ≥ €250k/mo GMV
const CALL_ANNUAL_SAVINGS_EUR = 25000; // ≥ €25k/yr recoverable

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBJECT_ID = /^[0-9a-f]{24}$/i;

// Page-level wrapper that installs the same navy-glass background we use on
// the analyzer, so a user landing directly on this URL (shared link) sees
// the same brand shell.
function ResultsShell({ children }) {
  return (
    <div
      className="relative min-h-screen flex flex-col font-inter overflow-x-hidden"
      style={{
        color: "#ffffff",
        background:
          "linear-gradient(180deg, #0a0a0a 0%, #0b0e1a 25%, #0a0d18 55%, #0b1020 80%, #08090f 100%)",
      }}
    >
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
      <Navbar />
      {/* Container widens on desktop so the results grid has room to breathe.
          Mobile stays visually identical (max-w-2xl equivalent at that size). */}
      <main className="relative z-10 flex-1 max-w-2xl lg:max-w-6xl mx-auto w-full px-5 pt-24 pb-16">
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
            background: "linear-gradient(135deg, #1F4ED8 0%, #2CA7C1 100%)",
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
  // Two mutually-exclusive URL contracts:
  //   ?session=<uuid>   → anonymous form path (estimated)
  //   ?verified=<oid>   → authenticated real-data path (verified)
  // If both are present, verified wins (real data > form data). If neither
  // is present, the page is "invalid" — never a blank screen.
  const verifiedId = params.get("verified") || "";
  const sessionId  = params.get("session") || params.get("anon_session_id") || "";
  const isVerifiedPath = !!verifiedId;

  const [status, setStatus] = useState("loading");
  // 'loading' | 'ready' | 'not_found' | 'invalid' | 'rate_limited' | 'error' | 'unauthorized'
  const [payload, setPayload] = useState(null);
  const [retryAfter, setRetryAfter] = useState(0);
  const [attempt, setAttempt] = useState(0); // manual retry counter
  // Roadmap open state + a ref to scroll to it when the Score CTA is clicked.
  const [roadmapOpen, setRoadmapOpen] = useState(false);
  const roadmapRef = useRef(null);
  // CTA destinations — the collective modal (primary) and book-a-call (high value).
  const [collectiveOpen, setCollectiveOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  // uiContext (margin|rate|score|generic) — set by the CTA that opens a modal,
  // read by CollectiveModal to show a context-adapted subcopy line.
  const [ctaUiContext, setCtaUiContext] = useState("generic");
  // PaymentsRateTable — read once when a result is ready, ONLY to derive the
  // neutral ambition line (marketRange). Public read RLS. Never blocks render.
  const [rateTable, setRateTable] = useState(null);

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
        // DIFF 3 — Authenticated readers first try their OWNED AnalyzerResult
        // (materialized by the claim) and render it UNLOCKED. Base44 is
        // eventually consistent, so right after a claim the row may not be
        // visible yet — retry briefly before falling back to the teaser, so a
        // just-logged-in user never flashes the "create an account" teaser
        // over their own report. Anonymous readers skip this entirely.
        if (isAuthenticated) {
          const delays = [0, 400, 900]; // ~1.3s worst case
          let owned = null;
          for (let i = 0; i < delays.length && !cancelled; i++) {
            if (delays[i]) await new Promise((r) => setTimeout(r, delays[i]));
            const rows = await base44.entities.AnalyzerResult
              .filter({ anon_session_id: sessionId }, "-created_date", 1)
              .catch(() => []);
            if (Array.isArray(rows) && rows[0]) { owned = rows[0]; break; }
          }
          if (cancelled) return;
          // ISSUE 2 FIX (2026-07-13) — already-authenticated user running a
          // NEW analysis. The session is born anonymous (submitPaymentsAnalysis
          // never checks auth) and the login-transition claim in AuthContext
          // does NOT fire (the user was already authenticated → no didAuth
          // transition), so no owned AnalyzerResult ever gets materialized and
          // the page would fall to the locked teaser. If we're authenticated
          // and found no owned row yet, fire the (idempotent) claim right here
          // — we're already authenticated so it succeeds — then retry the read
          // briefly (eventual consistency) so we unlock without a teaser flash.
          // Safe to run alongside AuthContext's claim: claimAnonPaymentsResult
          // is idempotent (owner-check + already_claimed + create-then-verify).
          if (!owned && !cancelled) {
            const claim = await base44.functions
              .invoke("claimAnonPaymentsResult", { anon_session_id: sessionId })
              .catch(() => null);
            const cbody = claim?.data || claim;
            if (cbody?.ok && !cancelled) {
              const retryDelays = [0, 400, 900];
              for (let i = 0; i < retryDelays.length && !cancelled; i++) {
                if (retryDelays[i]) await new Promise((r) => setTimeout(r, retryDelays[i]));
                const rows = await base44.entities.AnalyzerResult
                  .filter({ anon_session_id: sessionId }, "-created_date", 1)
                  .catch(() => []);
                if (Array.isArray(rows) && rows[0]) { owned = rows[0]; break; }
              }
            }
          }
          // Only use the owned row when it actually carries the payments
          // engine_result in its details. LEGACY rows materialized by an older
          // claim (or the pre-pivot scoreEngine path) have a details shape
          // WITHOUT engine_result/input_snapshot — reading them renders the
          // whole page blank (every field resolves to "—"). When that happens
          // we DON'T render the owned row; we fall through to the teaser, which
          // reads the intact PaymentsAnalysisSession and returns the correct
          // shape. The teaser is service-role and works pre- and post-auth.
          if (owned && owned?.details?.engine_result) {
            // Rebuild the SAME view the teaser showed — engine_result verbatim
            // + the exact savings_range (matiz #1: number/range unchanged).
            setPayload({
              ok: true,
              engine_result: owned.details.engine_result,
              engine_version: owned?.details?.engine_version || owned?.savings_model_version || null,
              input_snapshot: owned?.details?.input_snapshot || null,
              owned: true,
            });
            setStatus("ready");
            return;
          }
          // No owned row (or a legacy row without engine_result) → fall through
          // to the teaser, which always returns the correct shape.
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
  }, [sessionId, verifiedId, isVerifiedPath, attempt, isAuthenticated]);

  // Load the rate table once a result is ready — used ONLY for the roadmap's
  // neutral ambition line. Best-effort: failure just omits the ambition copy.
  useEffect(() => {
    if (status !== "ready" || rateTable) return;
    let cancelled = false;
    base44.entities.PaymentsRateTable
      .filter({ active: true }, "-created_date", 200)
      .then((rows) => { if (!cancelled) setRateTable(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setRateTable([]); });
    return () => { cancelled = true; };
  }, [status, rateTable]);

  // Score CTA → open the roadmap and scroll to it.
  const handleScoreCTA = () => {
    setRoadmapOpen(true);
    requestAnimationFrame(() => {
      roadmapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

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

  // ── CTA routing ────────────────────────────────────────────────────────
  // Build the context every destination modal needs (email prefill happens in
  // the modal itself; here we carry the analysis figures + session).
  const buildCtaContext = () => {
    const er = payload?.engine_result;
    const snap = payload?.input_snapshot || {};
    const sid = params.get("session") || params.get("anon_session_id") || "";
    return {
      session_id: sid || undefined,
      gmv_eur_monthly: Number(snap?.monthly_gmv_eur) || undefined,
      annual_savings_eur: Number(er?.annual_savings_eur?.point) || undefined,
      provider_slug: snap?.provider_slug || undefined,
      country: snap?.country || undefined,
      channel: er?.cohort?.channel === "in_store" ? "in_store" : "online",
      uiContext: ctaUiContext,
    };
  };

  // A big-enough opportunity routes to a human call instead of the collective.
  const isHighValue = () => {
    const ctx = buildCtaContext();
    return (
      (isFinite(ctx.gmv_eur_monthly) && ctx.gmv_eur_monthly >= CALL_GMV_MONTHLY_EUR) ||
      (isFinite(ctx.annual_savings_eur) && ctx.annual_savings_eur >= CALL_ANNUAL_SAVINGS_EUR)
    );
  };

  // Open the right destination for a given intent, honoring the segment rules:
  //   • anonymous              → sign up first (destination resumes after login)
  //   • connect_verify         → existing verify flow (dashboard connect)
  //   • high-value opportunity → book a call
  //   • everything else        → the collective modal
  // Map a roadmap route intent → the context-subcopy variant the collective
  // modal shows. margin renegotiation → "margin"; rate move → "rate";
  // everything else keeps the generic collective explanation.
  const intentToUiContext = (intent) =>
    intent === "managed_migration" ? "margin"
    : intent === "collective" ? "rate"
    : "generic";

  const openDestination = (intent) => {
    if (!isAuthenticated) { handleUnlock(); return; }
    setCtaUiContext(intentToUiContext(intent));
    if (intent === "connect_verify") { navigate("/ConnectTools"); return; }
    if (intent === "call" || isHighValue()) { setCallOpen(true); return; }
    setCollectiveOpen(true);
  };

  // Roadmap route CTAs → map the rec's cta_intent to a destination.
  const handleRouteAction = (rec) => openDestination(rec?.cta_intent || "collective");

  // ── loading
  if (status === "loading") {
    return (
      <ResultsShell>
        <div className="mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1"
          style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}
        >
          <Loader2 size={11} className="animate-spin text-cyan-300" />
          <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/60">Loading your audit</span>
        </div>
        <LoadingSkeleton />
      </ResultsShell>
    );
  }

  // ── no session AND no verified id in the URL — the "bare /Results" case.
  //    Authenticated → show the user's own analysis history (server-side,
  //    getMyPaymentsHistory). Anonymous → neutral "run your analysis" prompt,
  //    NOT the scary "this link isn't valid" (there was never a link).
  const hasNoTarget = !verifiedId && !sessionId;
  if (hasNoTarget && (status === "invalid" || status === "not_found")) {
    return (
      <ResultsShell>
        {isAuthenticated ? (
          <ResultsHistory />
        ) : (
          <EmptyState
            title="Run your payments analysis"
            message="See what you're overpaying on payments in about two minutes — no account needed."
            ctaLabel="Start analysis"
            onCta={() => navigate("/Analyzer")}
          />
        )}
      </ResultsShell>
    );
  }

  // ── invalid or missing session id (a target WAS provided but is bad)
  if (status === "invalid" || status === "not_found") {
    return (
      <ResultsShell>
        <EmptyState
          title={status === "invalid" ? "This link isn't valid" : "We couldn't find that audit"}
          message="Your session may have expired, or the link was mistyped. Run a fresh analysis in about two minutes — no account needed."
          ctaLabel="Run your analysis"
          onCta={() => navigate("/Analyzer")}
        />
      </ResultsShell>
    );
  }

  // ── rate limited on read
  if (status === "rate_limited") {
    const mins = Math.max(1, Math.ceil((retryAfter || 60) / 60));
    return (
      <ResultsShell>
        <EmptyState
          icon={AlertTriangle}
          title="Too many reads from your network"
          message={`Try again in about ${mins} minute${mins > 1 ? "s" : ""}. This limit exists to prevent abuse — your audit is safe.`}
          ctaLabel="Retry now"
          onCta={() => setAttempt((n) => n + 1)}
        />
      </ResultsShell>
    );
  }

  // ── generic error
  if (status === "error") {
    return (
      <ResultsShell>
        <EmptyState
          icon={AlertTriangle}
          title="Something went wrong"
          message="We couldn't load your audit. Check your connection and try again."
          ctaLabel="Retry"
          onCta={() => setAttempt((n) => n + 1)}
        />
      </ResultsShell>
    );
  }

  // ── unauthorized (verified path only — verified rows are private)
  if (status === "unauthorized") {
    return (
      <ResultsShell>
        <EmptyState
          icon={Lock}
          title="Sign in to view this audit"
          message="Verified analyses are private to the merchant who ran them. Sign in with the account that connected Stripe."
          ctaLabel="Sign in"
          onCta={() => navigate(`/LoginGate?next=${encodeURIComponent("/Results?verified=" + verifiedId)}`)}
        />
      </ResultsShell>
    );
  }

  // ── ready
  const engineResult = payload?.engine_result;
  // In verified mode there's no input_snapshot (the row was materialized
  // from real Stripe data, not a form). We synthesize a lightweight object
  // from sample_metrics so PaymentsGapCard / footer can read the same
  // fields (country, provider, GMV) without knowing which path produced them.
  const inputSnapshot = isVerifiedPath
    ? {
        // The verified path doesn't carry country in the reader response
        // (see allowlist — Chunk 5). We show the cohort key's region instead,
        // extracted from the engine result — the cohort is what the user's
        // rate is actually being compared against.
        country: engineResult?.cohort?.key?.split("|")?.[2] || null,
        provider_slug: engineResult?.cohort?.key?.split("|")?.[0] || null,
        monthly_gmv_eur: payload?.sample_metrics?.gmv_eur_monthly ?? null,
        avg_ticket_eur: payload?.sample_metrics?.avg_ticket_eur ?? null,
      }
    : payload?.input_snapshot;
  const engineVersion = payload?.engine_version;
  const isVerifiedMode = engineResult?.mode === "verified";
  const measurementWindow = payload?.measurement_window;
  const sampleMetrics = payload?.sample_metrics;
  // M4-TPV Fase 3 — combined submits carry engine_result.combined === true
  // and a per-channel channels[] array. Detect once here and route to the
  // combined hero renderer instead of the single-channel gap card.
  const isCombined = engineResult?.combined === true && Array.isArray(engineResult?.channels);
  // Anonymous readers get the teaser gating (first route visible, rest locked).
  // Owned/verified rows are always fully unlocked.
  const isAnonymous = !isAuthenticated && !payload?.owned;
  // Recovery roadmap — single-channel only (combined has its own hero). Derived
  // purely from engine_result + input_snapshot; rateTable only feeds ambition.
  const roadmap = (!isCombined && engineResult)
    ? buildRecoveryRoadmap(engineResult, inputSnapshot || {}, rateTable)
    : null;
  // M4-refinado (v1.5.0) — classification branches the hero.
  //   single-channel + already_optimized → OptimizedHero + hide primary CTA
  //   single-channel + savings_opportunity/insufficient_data → PaymentsGapCard (unchanged)
  //   combined → CombinedGapHero (which handles per-channel mini-victories itself)
  // The primary "Stop overpaying" CTA is hidden ONLY when the single-channel
  // result is already_optimized — there's nothing to stop paying.
  const classification = engineResult?.classification;
  const isOptimizedSingle = !isCombined && classification === "already_optimized";
  const hidePrimaryCTA = isOptimizedSingle;

  // 1.4 — LAYOUT MODE. The anonymous/estimated single-channel teaser is the
  // conversion hook: it leads with the big figure at FULL WIDTH (hero → CTA →
  // locked breakdown + assumptions stacked BELOW), so nothing competes with
  // the number. Verified mode (and combined/optimized heroes) keep the
  // 2-column grid — the user is already in and wants the "show your work"
  // panel alongside the hero.
  const useStackedTeaserLayout = !isVerifiedMode && !isCombined && !isOptimizedSingle;

  // Action Center (compact) for OWNED single-channel reports — the same "next
  // best step" panel the dashboard shows, driven by the same engine_result.
  // Only for signed-in owners of an estimated single-channel report; anonymous
  // (conversion-first), verified-mode, and combined keep the tuned ctaBlock.
  const showOwnedActionCenter = !isAnonymous && !isVerifiedMode && !isCombined && !hidePrimaryCTA;
  const ownedActionRow = engineResult
    ? { details: { engine_result: engineResult, input_snapshot: inputSnapshot }, verification_status: isVerifiedMode ? "verified" : "estimated", total_savings: Number(engineResult?.annual_savings_eur?.point) || 0 }
    : null;
  const ownedActionCenter = showOwnedActionCenter && ownedActionRow && (
    <ActionCenter
      rows={[ownedActionRow]}
      latest={ownedActionRow}
      inCollective={false}
      onVerify={() => navigate("/ConnectTools")}
      onCall={() => openDestination("call")}
      onCollective={() => openDestination("collective")}
      onAddChannel={() => navigate("/Analyzer")}
      compact
    />
  );

  // Shared CTA block (identical markup in both layouts) — extracted so the
  // stacked teaser layout and the grid layout render the exact same button.
  const ctaBlock = !hidePrimaryCTA && (
    <div
      className="rounded-2xl p-5 md:p-6 flex flex-col md:flex-row md:items-center gap-4"
      style={{
        background:
          "radial-gradient(120% 100% at 100% 0%, rgba(34,211,238,0.12) 0%, transparent 60%), rgba(255,255,255,0.03)",
        border: "1px solid rgba(34,211,238,0.20)",
      }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-cyan-300/90 mb-1.5">Next step</p>
        {isVerifiedMode ? (
          <>
            <p className="text-white font-bold text-[16px] md:text-[18px] leading-tight">
              This gap is measured, not estimated.
            </p>
            <p className="text-[13px] text-white/60 mt-1">
              Head back to your dashboard to review your integrations and start the recovery workflow.
            </p>
          </>
        ) : (
          <>
            <p className="text-white font-bold text-[16px] md:text-[18px] leading-tight">
              Ready to stop overpaying?
            </p>
            <p className="text-[13px] text-white/60 mt-1">
              {isAnonymous
                ? "Create an account, then join the collective to start the recovery."
                : (isHighValue()
                    ? "Your opportunity is large enough for a call — let's talk it through."
                    : "Join the collective — many brands negotiating as one — to start the recovery.")}
            </p>
          </>
        )}
      </div>
      <Button
        onClick={() => {
          if (isVerifiedMode) { navigate("/Dashboard"); return; }
          openDestination("collective");
        }}
        className="h-11 rounded-full px-6 text-sm font-bold gap-2 text-white hover:opacity-90 shrink-0"
        style={{
          background: "linear-gradient(135deg, #1F4ED8 0%, #2CA7C1 100%)",
          boxShadow: "0 0 32px rgba(34,211,238,0.35), 0 12px 32px -12px rgba(34,211,238,0.5)",
        }}
      >
        {isVerifiedMode ? "Go to dashboard" : "Stop overpaying"} <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <ResultsShell>
      {/* Back link + Download audit — desktop shows text, mobile just chevron */}
      <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
        <button
          onClick={() => navigate("/Analyzer")}
          className="inline-flex items-center gap-1.5 text-[12px] text-white/50 hover:text-white transition-colors"
        >
          <ArrowLeft size={12} /> Run a new analysis
        </button>
        <DownloadAuditButton
          engineResult={engineResult}
          inputSnapshot={inputSnapshot}
          rateTable={rateTable}
          brandName={inputSnapshot?.provider_slug || ""}
        />
      </div>

      {useStackedTeaserLayout ? (
        // 1.4 — ESTIMATED TEASER: single column, big figure leads at full
        // width. Order: hero → CTA → locked breakdown → assumptions. On both
        // mobile and desktop the number is ALWAYS first — nothing above it.
        <div className="space-y-5 max-w-3xl mx-auto">
          <PaymentsGapCard
            engineResult={engineResult}
            inputSnapshot={inputSnapshot}
            sampleMetrics={sampleMetrics}
            measurementWindow={measurementWindow}
            compact
            isAnonymous={isAnonymous}
            onScoreCTA={handleScoreCTA}
          />
          {roadmapOpen && roadmap && (
            <div ref={roadmapRef}>
              <RecoveryRoadmap
                roadmap={roadmap}
                isAnonymous={isAnonymous}
                onRouteAction={handleRouteAction}
                onUnlock={handleUnlock}
              />
            </div>
          )}
          <PeerBenchmark engineResult={engineResult} country={inputSnapshot?.country} />
          {/* Phase 1·B — insights shown in the anonymous teaser too, but
              COMPACT: only the 3 highest-punch tiles (total fees · effective
              rate · current-rate decomposed). Keeps the teaser scannable and
              lets the conversion CTA below own the spotlight; the full grid
              unlocks after signup on the owned report. */}
          <PaymentsDataInsights engineResult={engineResult} inputSnapshot={inputSnapshot} compact />
          {ctaBlock}
          {/* Locked breakdown — one of the main signup conversion drivers:
              render the SHAPE, blur the numbers, show a padlock. */}
          <FeeBreakdownCard engineResult={engineResult} locked={!payload?.owned} />
          <AssumptionsFootnote engineResult={engineResult} engineVersion={engineVersion} />
        </div>
      ) : isCombined ? (
        // COMBINED — full depth. Aggregate view on top (CombinedGapHero =
        // combined total + confidence band + per-channel strip), the primary
        // CTA + top-level breakdown, then ONE complete section PER CHANNEL,
        // each reusing the single-channel components fed with THAT channel's
        // own engine_result + input_snapshot. Never mixes figures.
        <div className="space-y-8 max-w-6xl mx-auto">
          <CombinedGapHero engineResult={engineResult} country={inputSnapshot?.country} />
          {ctaBlock}
          <FeeBreakdownCard
            engineResult={engineResult}
            locked={engineResult?.mode !== "verified" && !payload?.owned}
          />
          {/* Per-channel depth — side by side on desktop (lg+) to compare
              online vs in-store, stacked in one column on mobile/tablet. The
              divider becomes the grid gap; a top border separates the block
              from the aggregate view above. */}
          <div
            className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-6"
            style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
          >
            {engineResult.channels.map((ch) => (
              <div key={ch.channel} className="min-w-0">
                <CombinedChannelSection
                  channel={ch.channel}
                  engineResult={ch.engine_result}
                  inputSnapshot={ch.input_snapshot}
                  rateTable={rateTable}
                  isAnonymous={isAnonymous}
                  onRouteAction={handleRouteAction}
                  onUnlock={handleUnlock}
                />
              </div>
            ))}
          </div>
          <AssumptionsFootnote engineResult={engineResult} engineVersion={engineVersion} />
        </div>
      ) : (
        // Verified / optimized single-channel — 2-column grid, unchanged.
        // LEFT = hero + CTA · RIGHT = breakdown + assumptions.
        <div className="grid grid-cols-1 lg:grid-cols-5 lg:gap-6 lg:items-start gap-5">
          <div className="lg:col-span-3 space-y-5">
            {isOptimizedSingle ? (
              <OptimizedHero
                engineResult={engineResult}
                inputSnapshot={inputSnapshot}
                t={t}
                onRerun={() => navigate("/Analyzer")}
              />
            ) : (
              <PaymentsGapCard
                engineResult={engineResult}
                inputSnapshot={inputSnapshot}
                sampleMetrics={sampleMetrics}
                measurementWindow={measurementWindow}
                isAnonymous={isAnonymous}
                onScoreCTA={handleScoreCTA}
              />
            )}
            {roadmapOpen && roadmap && (
              <div ref={roadmapRef}>
                <RecoveryRoadmap
                  roadmap={roadmap}
                  isAnonymous={isAnonymous}
                  onRouteAction={handleRouteAction}
                  onUnlock={handleUnlock}
                />
              </div>
            )}
            {!isOptimizedSingle && (
              <PeerBenchmark engineResult={engineResult} country={inputSnapshot?.country} />
            )}
            <PaymentsDataInsights engineResult={engineResult} inputSnapshot={inputSnapshot} />
            {/* Phase 3 — in-store (TPE) tiles. Self-hides for online/single-online. */}
            <PaymentsInStoreInsights
              engineResult={engineResult}
              inputSnapshot={inputSnapshot}
            />
            {ownedActionCenter || ctaBlock}
          </div>

          <div className="lg:col-span-2 space-y-5">
            <FeeBreakdownCard
              engineResult={engineResult}
              locked={engineResult?.mode !== "verified" && !payload?.owned}
            />
            <AssumptionsFootnote engineResult={engineResult} engineVersion={engineVersion} />
          </div>
        </div>
      )}

      {/* Footer line — snapshot of what produced the number, for transparency.
          Full-width under the grid so it reads as a single closing note.
          Verified mode shows the measurement window ("measured from N charges
          over M days"); estimated mode keeps the "run on X GMV" line. */}
      <div className="pt-6 text-[11px] text-white/35 text-center">
        {isVerifiedMode ? (
          <>
            Measured from {sampleMetrics?.tx_count_charges_90d ?? "—"} charges over {measurementWindow?.days_covered ?? "—"} days ·
            {sampleMetrics?.gmv_eur_monthly ? ` €${Math.round(sampleMetrics.gmv_eur_monthly).toLocaleString("en-US")}/mo GMV ` : " "}·
            {" "}{inputSnapshot?.provider_slug || "—"} · {inputSnapshot?.country || "—"}
          </>
        ) : (
          <>
            Analysis run on {inputSnapshot?.monthly_gmv_eur ? `€${Number(inputSnapshot.monthly_gmv_eur).toLocaleString("en-US")}` : "—"} monthly GMV
            {inputSnapshot?.avg_ticket_eur ? `, €${inputSnapshot.avg_ticket_eur} average ticket` : ""} · {inputSnapshot?.provider_slug || "—"} · {inputSnapshot?.country || "—"}
          </>
        )}
      </div>

      {/* CTA destinations — the collective (primary) and book-a-call (high value). */}
      <CollectiveModal
        open={collectiveOpen}
        onClose={() => setCollectiveOpen(false)}
        context={buildCtaContext()}
        onSwitch={() => { setCollectiveOpen(false); setCallOpen(true); }}
      />
      <BookCallModal
        open={callOpen}
        onClose={() => setCallOpen(false)}
        context={buildCtaContext()}
        onSwitch={() => { setCallOpen(false); setCollectiveOpen(true); }}
      />
    </ResultsShell>
  );
}