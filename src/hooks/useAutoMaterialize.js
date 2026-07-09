/**
 * useAutoMaterialize — 5C (Opción A2).
 *
 * Orquestador de auto-materialización tras un sync manual exitoso.
 *
 * REGLA A2 (documentada en el chat del CTO, 2026-07-08):
 * ─────────────────────────────────────────────────────────────────────────
 *   Cada sync exitoso encadena bridgeToAnalyzer → materializeVerifiedResult
 *   (via 5A). Cada llamada CREA filas nuevas — nunca actualiza in-place.
 *   El frontend siempre lee la más reciente por -created_date.
 *
 *   DEUDA CONOCIDA (A2): las filas verificadas viejas se acumulan (una por
 *   sync exitoso con datos suficientes). No urgente. Invisible para el
 *   usuario porque siempre lee -created_date, 1.
 *   TODO: barrer/limpiar filas históricas — o hacer el bridge idempotente
 *   por brand+integration — ANTES de construir dashboards que agreguen
 *   histórico verificado, o esas filas estorbarán.
 *
 *   Solo aplica al sync MANUAL desde UI (único que existe hoy). Si en el
 *   futuro se añaden syncs background, este hook NO debe dispararse en
 *   ellos sin re-evaluar — ver diagnóstico del 2026-07-08.
 *
 * FRENOS (mismos que 5B):
 * ─────────────────────────────────────────────────────────────────────────
 *   • Solo frontend. Reutiliza `bridgeToAnalyzer` (backend existente) y
 *     `materializeVerifiedResult` (5A, cliente).
 *   • Guardas de 5A intactas: insufficient → no materializa; idempotencia
 *     por input_id se mantiene (aditivo, no destructivo).
 *   • Fallo silencioso hacia el usuario si algo falla: el sync ya se
 *     guardó y el botón manual de 5B queda como fallback. Nunca throw.
 */

import { useCallback, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { materializeVerifiedResult } from "@/lib/verifiedMaterializer";

/** Los tres slugs de Stripe que hoy alimentan el bridge. */
const STRIPE_PROVIDERS = new Set(["stripe", "stripe_self", "stripe_self_test"]);

/**
 * Pure orchestration function. Runs the full 5C (A2) pipeline for a brand
 * and returns the outcome. No React state; the hook wraps this and mirrors
 * the outcome into `useState` so the UI can react.
 *
 * Exported so it can be unit-tested without mounting React.
 *
 * Return shape:
 *   { status: "skipped",      reason: string }
 *   { status: "failed",       reason: string }
 *   { status: "collecting",   activeDays: number, chargeCount: number, reason?: string }
 *   { status: "materialized", resultId: string }
 */
export async function runAutoMaterializePipeline(brandId) {
  if (!brandId) {
    return { status: "skipped", reason: "missing_brand_id" };
  }
  try {
    // 1. Localizar la Integration Stripe conectada del brand. Sin ella,
    //    bridgeToAnalyzer no puede correr — es un skip legítimo, no un fallo.
    const integs = await base44.entities.Integration
      .filter({ brand_id: brandId, status: "connected" }, "-connected_at", 20)
      .catch(() => []);
    const stripeInteg = (integs || []).find(i => STRIPE_PROVIDERS.has(i.provider));
    if (!stripeInteg) {
      return { status: "skipped", reason: "no_stripe_integration" };
    }

    // 2. bridgeToAnalyzer — mismo endpoint que usa 5B.
    const bridgeRes = await base44.functions.invoke("bridgeToAnalyzer", {
      integration_id: stripeInteg.id,
    });
    const bridge = bridgeRes?.data || bridgeRes;
    if (!bridge?.ok) {
      return { status: "failed", reason: bridge?.error || "bridge_failed" };
    }

    // 3. Insufficient → NO materializar. Copia del CTO: "el estimado
    //    remains the primary number until verified reaches meaningful precision".
    if (bridge.data_confidence === "insufficient") {
      return {
        status: "collecting",
        activeDays: bridge.active_days || 0,
        chargeCount: bridge.charge_count || 0,
      };
    }

    // 4. provisional/high → materializar (5A). Idempotencia por input_id
    //    dentro de 5A; cross-input (una fila nueva por sync) es la deuda A2.
    const analyzerInput = await base44.entities.AnalyzerInput.get(bridge.analyzer_input_id);
    if (!analyzerInput) {
      return { status: "failed", reason: "verified_input_not_found" };
    }
    const outcome = await materializeVerifiedResult({
      analyzerInput,
      integrationId: stripeInteg.id,
      dataConfidence: bridge.data_confidence,
      activeDays: bridge.active_days,
      chargeCount: bridge.charge_count,
      entities: base44.entities,
    });

    // A2 patch (2026-07-09): "reused" no longer emitted — "updated" is the
    // new upsert outcome (same id, refreshed payload). Both "created" and
    // "updated" map to the user-facing "materialized" state.
    if (outcome.status === "created" || outcome.status === "updated" || outcome.status === "reused") {
      return { status: "materialized", resultId: outcome.result.id };
    }
    if (outcome.status === "insufficient" || outcome.status === "missing_input") {
      // Defensivo — 5A dijo que no puede materializar aunque bridge dijo que sí.
      return { status: "collecting", reason: outcome.status };
    }
    return { status: "failed", reason: `unexpected_outcome:${outcome.status}` };
  } catch (e) {
    return { status: "failed", reason: e?.message || String(e) };
  }
}

/**
 * React hook. Thin wrapper over `runAutoMaterializePipeline`:
 *   • setState mirrors the outcome so the UI can pintar loading/toast.
 *   • useRef guard prevents re-entry if the button is double-clicked.
 *
 * `state.status` is one of: idle | running | materialized | collecting | skipped | failed.
 */
export function useAutoMaterialize() {
  const [state, setState] = useState({ status: "idle" });
  const runningRef = useRef(false);

  const run = useCallback(async (brandId) => {
    if (runningRef.current) return state;
    runningRef.current = true;
    setState({ status: "running" });
    try {
      const outcome = await runAutoMaterializePipeline(brandId);
      setState(outcome);
      return outcome;
    } finally {
      runningRef.current = false;
    }
  }, [state]);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, run, reset };
}