import { useState, useEffect } from "react";
import { CheckCircle2, Sparkles, Loader2, Zap } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { materializeVerifiedResult } from "@/lib/verifiedMaterializer";
import { useToast } from "@/components/shared/Toast.jsx";

/**
 * VerifiedResultCTA — Chunk 5 of the Integration→Analyzer bridge.
 *
 * ROLE: the CONSUMER. Reads the verified AnalyzerInput produced by
 * `bridgeToAnalyzer` (Chunk 4), and — on explicit user click — MATERIALIZES
 * a verified AnalyzerResult by running the CLIENT-SIDE `calculateSavings` +
 * `computeInfraScore` from `scoreEngine.js` (the same functions the wizard
 * uses — Chunk 2 kept them as the single source of truth).
 *
 * ═══ Design rules (from the plan, verbatim) ═══════════════════════════════
 *
 *   1. Trigger is EXPLICIT (click). We call bridgeToAnalyzer on mount to
 *      READ the verified input's data_confidence, but we NEVER auto-create
 *      an AnalyzerResult. That step needs a human click.
 *
 *   2. The savings engine is imported from '@/lib/scoreEngine' — the exact
 *      same module the estimated wizard imports. Zero duplication.
 *
 *   3. Three UI states driven by `data_confidence`:
 *        insufficient  → positive collecting state, NO materialize button.
 *                        The estimated remains the primary number.
 *        provisional   → materialize button + honest partial-data label.
 *        high          → materialize button + full-authority label.
 *
 *   4. Idempotency: if an AnalyzerResult already exists with the same
 *      input_id + verification_status="verified", we don't create another.
 *      Two clicks = one row.
 *
 * ═══ Frenos (invariants) ══════════════════════════════════════════════════
 *
 *   • Does NOT touch scoreEngine — imports it, does not modify.
 *   • Does NOT touch the estimated flow (Analyzer.jsx wizard is untouched).
 *   • Does NOT create AnalyzerInput — that's Chunk 4's job. This component
 *     only reads what the bridge produced.
 *   • Tenant isolation: all Base44 SDK calls run under the user's session
 *     (no service-role from the client). RLS on AnalyzerInput / Result /
 *     Integration already enforces the boundary.
 *
 * Props:
 *   brand_id             — required, tenant key.
 *   integration_id       — required, the connected Stripe Integration.
 *   currency_prefix      — optional string like "€", defaults to "€".
 *   on_materialized(id)  — optional callback invoked with the AnalyzerResult
 *                          id after a successful materialization (existing or
 *                          newly created). The parent decides where to
 *                          navigate; this component does not navigate.
 */

/* ── Copy (kept inline — 3 short states, no need for a full i18n key set) ── */
const COPY = {
  loading: {
    title: "Checking your Stripe data…",
  },
  error: {
    title: "We couldn't reach your Stripe data",
    body: "Try again in a moment, or continue with your estimated result.",
  },
  insufficient: {
    // Matiz 1 — positive collecting state, never worded as a rejection.
    badge: "Connected",
    title: "Collecting your payment data",
    body: "You’re all set — we’ll turn this into a verified savings figure once you have a bit more Stripe activity. Meanwhile, your estimated result stays your primary number.",
  },
  provisional: {
    badge: "Partial data",
    title: "See your verified savings",
    body: "Verified on partial data — connect more history for higher precision.",
    cta: "See my verified savings",
  },
  high: {
    badge: "Verified",
    title: "See your verified savings",
    body: "Verified on your last 3 months of Stripe activity.",
    cta: "See my verified savings",
  },
};

export default function VerifiedResultCTA({
  brand_id,
  integration_id,
  on_materialized,
}) {
  const { toast } = useToast();

  // Bridge state
  const [loading, setLoading] = useState(true);
  const [bridgeError, setBridgeError] = useState(null);
  const [bridge, setBridge] = useState(null);
  // bridge shape (subset we use):
  //   { analyzer_input_id, data_confidence: "insufficient"|"provisional"|"high",
  //     data_confidence_label, active_days, charge_count, assumptions }

  // Materialize state
  const [materializing, setMaterializing] = useState(false);
  const [materializedId, setMaterializedId] = useState(null);
  const [materializeError, setMaterializeError] = useState(null);

  // ── Step A: read the verified AnalyzerInput status (no side effects on
  // AnalyzerResult). bridgeToAnalyzer is aditivo: it creates at most one
  // AnalyzerInput row per call and never touches Results. Safe to invoke on
  // mount as a read of "what would we materialize?".
  useEffect(() => {
    if (!integration_id) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const resp = await base44.functions.invoke("bridgeToAnalyzer", { integration_id });
        const payload = resp?.data || resp;
        if (cancelled) return;
        if (!payload?.ok) {
          setBridgeError(payload?.error || "Bridge failed");
        } else {
          setBridge(payload);
        }
      } catch (e) {
        if (!cancelled) setBridgeError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [integration_id]);

  // ── Step B: on explicit click, materialize a verified AnalyzerResult.
  //
  // ⚠️  ZERO logic here — the whole materialization is delegated to
  // `materializeVerifiedResult` (Chunk 5A), the pure, test-covered module.
  // This component is pure UI: it invokes 5A, translates the returned
  // status into a visual state, and never recomputes savings.
  const handleMaterialize = async () => {
    if (!bridge?.analyzer_input_id || materializing) return;
    setMaterializing(true);
    setMaterializeError(null);
    try {
      // Load the AnalyzerInput row that bridgeToAnalyzer produced. This is
      // the ONE remaining SDK call the UI needs — to hand 5A the row it
      // will feed into the shared engine. Idempotency, engine call, and
      // AnalyzerResult creation all live inside 5A.
      const inputRow = await base44.entities.AnalyzerInput.get(bridge.analyzer_input_id);
      if (!inputRow) throw new Error("Verified input row not found");

      const outcome = await materializeVerifiedResult({
        analyzerInput: inputRow,
        integrationId: integration_id,
        dataConfidence: bridge.data_confidence,
        activeDays: bridge.active_days,
        chargeCount: bridge.charge_count,
        entities: base44.entities,
      });

      // 5A returns one of four statuses. Map each to a UI signal.
      // "insufficient" and "missing_input" should never reach here because
      // the button is only rendered for provisional/high — but we handle
      // them defensively so an unexpected input state doesn't crash the UI.
      if (outcome.status === "created" || outcome.status === "reused") {
        setMaterializedId(outcome.result.id);
        toast.success(outcome.status === "created"
          ? "Verified savings ready"
          : "Verified savings already available");
        if (typeof on_materialized === "function") on_materialized(outcome.result.id);
      } else if (outcome.status === "insufficient") {
        setMaterializeError("Not enough Stripe activity yet to compute a verified result.");
      } else if (outcome.status === "missing_input") {
        setMaterializeError("Your verified input is missing required fields — reconnect Stripe to refresh.");
      } else {
        setMaterializeError("Unexpected verification state.");
      }
    } catch (e) {
      setMaterializeError(e?.message || String(e));
    } finally {
      setMaterializing(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Loader2 size={11} className="animate-spin" />
        <span>{COPY.loading.title}</span>
      </div>
    );
  }

  if (bridgeError) {
    return (
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
        <p className="text-[11px] font-bold text-amber-700 mb-0.5">{COPY.error.title}</p>
        <p className="text-[11px] text-muted-foreground">{COPY.error.body}</p>
      </div>
    );
  }

  if (!bridge) return null;

  // ── State 1: insufficient — the brand-new-account case (mine right now).
  // No button. Positive framing. Estimated remains primary.
  if (bridge.data_confidence === "insufficient") {
    return (
      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 flex flex-col gap-1.5">
        <div className="inline-flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
            <CheckCircle2 size={9} /> {COPY.insufficient.badge}
          </span>
          <span className="text-[11px] font-bold">{COPY.insufficient.title}</span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug">{COPY.insufficient.body}</p>
        <p className="text-[10px] text-muted-foreground/70 tabular-nums">
          {bridge.charge_count} charge{bridge.charge_count === 1 ? "" : "s"} · {bridge.active_days} active day{bridge.active_days === 1 ? "" : "s"}
        </p>
      </div>
    );
  }

  // ── States 2 + 3: provisional / high — button visible.
  const isHigh = bridge.data_confidence === "high";
  const copy = isHigh ? COPY.high : COPY.provisional;
  const badgeCls = isHigh
    ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
    : "bg-blue-500/10 text-blue-700 border-blue-500/30";

  return (
    <div className="flex flex-col gap-2">
      <div className="inline-flex items-center gap-1.5 flex-wrap">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${badgeCls}`}>
          {isHigh ? <CheckCircle2 size={9} /> : <Sparkles size={9} />}
          {copy.badge}
        </span>
        <span className="text-[11px] text-muted-foreground leading-tight">{copy.body}</span>
      </div>
      {materializedId ? (
        <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
          <CheckCircle2 size={11} />
          <span>Verified savings ready</span>
        </div>
      ) : (
        <button
          onClick={handleMaterialize}
          disabled={materializing}
          className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-full bg-foreground text-background text-xs font-bold hover:opacity-90 disabled:opacity-50 self-start min-h-[44px] sm:min-h-0"
        >
          {materializing ? (
            <><Loader2 size={11} className="animate-spin" /> Verifying…</>
          ) : (
            <><Zap size={11} /> {copy.cta}</>
          )}
        </button>
      )}
      {materializeError && (
        <p className="text-[11px] text-red-600">Couldn’t verify: {materializeError}</p>
      )}
    </div>
  );
}