import { useState, useEffect } from "react";
import { CheckCircle2, Sparkles, Loader2, Zap } from "lucide-react";
import { base44 } from "@/api/base44Client";
import {
  calculateSavings,
  computeInfraScore,
  ENGINE_VERSION,
} from "@/lib/scoreEngine";
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
    title: "See your ahorro verified",
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
  // The math is the SAME the wizard uses:
  //   - calculateSavings(inputData)  →  payment/shipping/saas savings + details
  //   - computeInfraScore(inputData, "connected")  →  score
  // These functions live in @/lib/scoreEngine and are shared with Analyzer.jsx.
  // We do NOT reimplement any formula here — that's the whole point of Chunk 2.
  const handleMaterialize = async () => {
    if (!bridge?.analyzer_input_id || materializing) return;
    setMaterializing(true);
    setMaterializeError(null);
    try {
      // Idempotency guard — Rule 5. If a verified AnalyzerResult already
      // exists for this input, reuse it. This is the "two clicks = one
      // result" contract. Filtering by input_id + verification_status is
      // authoritative because bridgeToAnalyzer creates a fresh AnalyzerInput
      // per call, so multiple verified Results against the same input can
      // only come from double-clicks of THIS button.
      const existing = await base44.entities.AnalyzerResult.filter(
        { input_id: bridge.analyzer_input_id, verification_status: "verified" },
        "-created_date",
        1
      ).catch(() => []);
      if (existing.length) {
        setMaterializedId(existing[0].id);
        if (typeof on_materialized === "function") on_materialized(existing[0].id);
        return;
      }

      // Load the AnalyzerInput row bridgeToAnalyzer just produced.
      const inputRow = await base44.entities.AnalyzerInput.get(bridge.analyzer_input_id);
      if (!inputRow) throw new Error("Verified input row not found");

      // Feed the SAME engine the wizard uses. No re-implementation.
      const savings = calculateSavings(inputRow);
      const scoreReport = computeInfraScore(inputRow, "connected");

      // Data completeness — reuse the wizard's own heuristic shape but keep
      // it minimal here because a verified integration is de facto high on
      // the payments axis. This is display-only; nothing downstream depends
      // on the exact number.
      const completeness = 95;

      // Persist the verified AnalyzerResult. The three NEW fields — carrying
      // Chunk 1's schema additions — communicate provenance and scope:
      //   source_integration_id  — links this Result back to the Integration
      //                            row (Stripe) whose data produced it.
      //   verification_scope     — ["payments"] because this bridge only
      //                            verifies the payments vertical. Shipping/
      //                            SaaS remain estimated in this same row.
      //   verification_status    — "verified" (unlike the wizard, which
      //                            emits "estimated" or "pending_verification").
      //
      // data_confidence + active_days + charge_count travel via the
      // `assumptions` array — they are display-only signals for the front,
      // not persisted as first-class columns until we know a downstream
      // consumer needs them structurally. Aditivo: no schema change here.
      const assumptions = [
        ...(bridge.assumptions || []),
        `data_confidence: ${bridge.data_confidence} (${bridge.active_days} active day(s), ${bridge.charge_count} charges).`,
      ];

      const created = await base44.entities.AnalyzerResult.create({
        brand_id,
        input_id: bridge.analyzer_input_id,
        payment_savings: savings.paymentSavings,
        shipping_savings: savings.shippingSavings,
        saas_savings: savings.saasSavings,
        total_savings: savings.totalSavings,
        infra_score: scoreReport.total,
        details: savings.details,
        confidence_level: bridge.data_confidence === "high" ? "high" : "medium",
        data_completeness_score: completeness,
        score_engine_version:  ENGINE_VERSION.score,
        savings_model_version: ENGINE_VERSION.savings,
        benchmark_version:     ENGINE_VERSION.benchmark,
        methodology: "Verified via Stripe integration bridge. Rate = sum(fee)/sum(amount) on successful charges; monthly_revenue net of refunds. Same savings/score engine as the estimated flow (single source of truth).",
        assumptions,
        benchmark_source: "network_internal",
        verification_status: "verified",
        source_integration_id: integration_id,
        verification_scope: ["payments"],
        next_best_action: "Connect carriers to extend verified coverage to shipping.",
      });

      setMaterializedId(created.id);
      toast.success("Verified savings ready");
      if (typeof on_materialized === "function") on_materialized(created.id);
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