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

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/landing/Navbar";
import { ArrowRight, ArrowLeft, Loader2, AlertTriangle, Search, Lock } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";

import PaymentsGapCard from "@/components/paymentsResults/PaymentsGapCard";
import FeeBreakdownCard from "@/components/paymentsResults/FeeBreakdownCard";
import AssumptionsFootnote from "@/components/paymentsResults/AssumptionsFootnote";
import CombinedGapHero from "@/components/paymentsResults/CombinedGapHero";
import OptimizedHero from "@/components/paymentsResults/OptimizedHero";

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

    // ── PATH A — estimated (anonymous teaser read) — unchanged ─────────
    if (!sessionId) { setStatus("invalid"); return; }
    if (!UUID_V4.test(sessionId)) { setStatus("invalid"); return; }

    let cancelled = false;
    setStatus("loading");
    (async () => {
      try {
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
  }, [sessionId, verifiedId, isVerifiedPath, attempt]);

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

  // ── invalid or missing session id
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
  // M4-refinado (v1.5.0) — classification branches the hero.
  //   single-channel + already_optimized → OptimizedHero + hide primary CTA
  //   single-channel + savings_opportunity/insufficient_data → PaymentsGapCard (unchanged)
  //   combined → CombinedGapHero (which handles per-channel mini-victories itself)
  // The primary "Stop overpaying" CTA is hidden ONLY when the single-channel
  // result is already_optimized — there's nothing to stop paying.
  const classification = engineResult?.classification;
  const isOptimizedSingle = !isCombined && classification === "already_optimized";
  const hidePrimaryCTA = isOptimizedSingle;

  return (
    <ResultsShell>
      {/* Back link — desktop shows text, mobile just chevron */}
      <button
        onClick={() => navigate("/Analyzer")}
        className="mb-6 inline-flex items-center gap-1.5 text-[12px] text-white/50 hover:text-white transition-colors"
      >
        <ArrowLeft size={12} /> Run a new analysis
      </button>

      {/* Desktop layout (≥lg): 2-column grid.
            LEFT  = hero (gap card) + CTA — the emotional payload
            RIGHT = fee breakdown + assumptions — the "show your work"
          On mobile & tablet everything stacks in a single column, unchanged
          from before. `lg:items-start` prevents the grid from stretching
          both columns to the tallest — each card keeps its natural height. */}
      <div className="grid grid-cols-1 lg:grid-cols-5 lg:gap-6 lg:items-start gap-5">
        {/* LEFT column — hero + CTA */}
        <div className="lg:col-span-3 space-y-5">
          {isCombined ? (
            <CombinedGapHero
              engineResult={engineResult}
              country={inputSnapshot?.country}
            />
          ) : isOptimizedSingle ? (
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
            />
          )}

          {/* Primary CTA — content changes per mode.
              Estimated: sign-in wall (form → account → connect).
              Verified: user is already signed in and connected — the next
              step is the recovery workflow, not another signup.
              HIDDEN when the single-channel result is already_optimized —
              nothing to stop, no signup wall to push. */}
          {!hidePrimaryCTA && (
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
                    Create an account to connect your PSP, verify the number, and start the recovery.
                  </p>
                </>
              )}
            </div>
            <Button
              onClick={() => {
                // #1 FIX (2026-07-12) — funnel-critical.
                // Before: `next=/Analyzer` sent the just-signed-up user to an
                // EMPTY analyzer form and their anonymous result was lost. That
                // was the conversion break: user runs anonymous audit → sees
                // the gap → hits "Stop overpaying" → creates account → lands
                // in blank form → confusion → abandons. Now we preserve the
                // current URL (which carries ?session=<anon_session_id>) so
                // after Base44 login the user comes back to THIS SAME Results
                // page, populated with THEIR audit. Reader endpoint
                // (getPaymentsGapTeaser) already runs service-role and accepts
                // the session id regardless of auth state, so the same URL
                // works both before and after login.
                if (isVerifiedMode) {
                  navigate("/Dashboard");
                  return;
                }
                const currentPath =
                  window.location.pathname + window.location.search;
                navigate(`/LoginGate?next=${encodeURIComponent(currentPath)}`);
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
          )}
        </div>

        {/* RIGHT column — breakdown + assumptions */}
        <div className="lg:col-span-2 space-y-5">
          <FeeBreakdownCard engineResult={engineResult} />
          <AssumptionsFootnote engineResult={engineResult} engineVersion={engineVersion} />
        </div>
      </div>

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
    </ResultsShell>
  );
}