import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { callCambraClaude } from '../../shared/commercialModelRouter.ts';
import { internalErrorResponse } from '../../shared/publicErrors.ts';
import { requireCriticalOperation } from '../../shared/criticalExecution.ts';
import { requireExactBrandTask, requireOwnedBrand, tenantOwnershipErrorResponse } from '../../shared/tenantOwnership.ts';

/**
 * Recommendation Engine Agent — Brain B3
 *
 * Design principle (same as B1 & B2): DETERMINISTIC FIRST, AI only explains.
 * Every € savings number comes from (current spend − benchmark spend). Claude
 * never invents amounts; it only writes the human-readable recommendation.
 *
 * Flow:
 *   1. Load latest completed B2 task for this brand → reuse estimates as-is.
 *      We DO NOT recompute spend.
 *   2. For each vertical, compare estimated spend to the scoreEngine benchmark
 *      for the brand's tier+region. If above, that's an opportunity.
 *      savings = current − benchmark, clamped ≥ 0.
 *   3. Score each opportunity with the 4 Bible fields:
 *        - expected_savings (annual €, with `savings_basis` = the math used)
 *        - confidence (high/medium/low — from B2 confidence + data sources)
 *        - effort (low/medium/high — from a per-vertical effort matrix)
 *        - priority = (savings × confidenceWeight) ÷ effortWeight
 *      Plus `evidence`: monthly spend, benchmark, gap, basis pointer to B2.
 *   4. Provider matching: query IntegrationCatalog for live alternatives in
 *      the same category. No catalog match → empty list (we never invent).
 *   5. If ANTHROPIC_API_KEY is set: Claude rewrites action+description in plain
 *      language. Forbidden from changing any € number. Without key → a
 *      deterministic template is used.
 *   6. Write AgentTask (L1, no Approval) so it appears in Activity Log.
 *      Recommendations are also persisted as Recommendation rows for the
 *      existing UI surfaces to pick up.
 *
 * Payload: { brand_id, spend_task_id? }
 * Returns: { ok, task_id, spend_task_id, recommendations, totals, summary, interpretation_status }
 */

const AGENT_NAME = "recommendation_engine";
const TASK_TYPE = "generate_recommendations";
const RISK_LEVEL = 1;
const SCORE_ENGINE_VERSION = "1.0.0"; // mirror of scoreEngine.ENGINE_VERSION.benchmark

// ─── Mirrored from lib/scoreEngine.js — DO NOT diverge ──────────────────────
const EU_COUNTRIES = [
  "France","Germany","Spain","Italy","Netherlands","Belgium","Portugal","Sweden",
  "Denmark","Finland","Norway","Austria","Switzerland","Ireland","Poland",
  "Czech Republic","Romania","Hungary","Greece","Luxembourg","Malta","Cyprus",
  "Slovakia","Slovenia","Croatia","Estonia","Latvia","Lithuania","Bulgaria",
];
const isEU = (c) => EU_COUNTRIES.includes(c);
function getRevenueTier(mr = 0) {
  if (mr >= 500000) return "large";
  if (mr >= 100000) return "mid";
  if (mr >= 30000) return "small";
  return "micro";
}
function getBenchmarks(mr = 0, country = "") {
  const tier = getRevenueTier(mr);
  const eu = isEU(country);
  return {
    tier, eu,
    payment:  ({ micro:{rate: eu?2.4:2.9}, small:{rate: eu?2.2:2.6}, mid:{rate: eu?1.9:2.3}, large:{rate: eu?1.6:1.9} })[tier],
    shipping: ({ micro:{perUnit: eu?5.80:7.20}, small:{perUnit: eu?5.20:6.50}, mid:{perUnit: eu?4.60:5.80}, large:{perUnit: eu?3.90:4.80} })[tier],
    saas:     ({ micro:{pct:0.060}, small:{pct:0.040}, mid:{pct:0.025}, large:{pct:0.015} })[tier],
  };
}

// ─── Vertical → Recommendation.vertical enum + catalog category ────────────
const VERTICAL_MAP = {
  payments:        { recVertical: "payments", catalogCategory: "payments" },
  shipping:        { recVertical: "shipping", catalogCategory: "shipping" },
  saas_commerce:   { recVertical: "saas",     catalogCategory: "commerce" },
  saas_marketing:  { recVertical: "saas",     catalogCategory: "marketing" },
  saas_analytics:  { recVertical: "saas",     catalogCategory: "analytics" },
  saas_support:    { recVertical: "saas",     catalogCategory: "support" },
  saas_finance:    { recVertical: "saas",     catalogCategory: "finance" },
  saas_hr:         { recVertical: "saas",     catalogCategory: "hr" },
};

// Per-vertical effort to switch/renegotiate — based on real onboarding complexity
const VERTICAL_EFFORT = {
  payments:       { effort: "medium", weight: 2 },  // PSP migration = checkout + reconciliation
  shipping:       { effort: "low",    weight: 1 },  // carrier swap is usually contractual
  saas_commerce:  { effort: "high",   weight: 3 },  // platform migration is structural
  saas_marketing: { effort: "low",    weight: 1 },
  saas_analytics: { effort: "low",    weight: 1 },
  saas_support:   { effort: "medium", weight: 2 },
  saas_finance:   { effort: "medium", weight: 2 },
  saas_hr:        { effort: "medium", weight: 2 },
};
const CONFIDENCE_WEIGHT = { high: 1.0, medium: 0.7, low: 0.4 };

// ─── Per-vertical opportunity detection (deterministic) ────────────────────
// Returns { hasOpportunity, monthly_spend, benchmark_monthly_spend, annual_savings, savings_basis }
function detectOpportunity(vertical, estimate, monthlyRevenue, bm, toolCount) {
  const current = estimate.estimated_spend_monthly;
  if (current == null || current <= 0 || monthlyRevenue <= 0) {
    return { hasOpportunity: false, reason: "missing current spend or revenue" };
  }

  if (vertical === "payments") {
    // benchmark monthly = (benchmark rate × GMV) ÷ tool count (matches B2 split)
    const benchmarkMonthly = (monthlyRevenue * (bm.payment.rate / 100)) / Math.max(1, toolCount);
    const gapMonthly = Math.max(0, current - benchmarkMonthly);
    return {
      hasOpportunity: gapMonthly > 0,
      monthly_spend: current,
      benchmark_monthly_spend: Math.round(benchmarkMonthly),
      annual_savings: Math.round(gapMonthly * 12),
      savings_basis: `(€${Math.round(current)} current/mo − €${Math.round(benchmarkMonthly)} benchmark/mo at ${bm.payment.rate}% of GMV ÷ ${toolCount} provider(s)) × 12`,
    };
  }

  if (vertical === "shipping") {
    // B2 used 3% of GMV share; benchmark per-unit gives a cap. Use the same share
    // anchor for benchmark comparison so the math stays consistent across B2/B3.
    const benchmarkShare = 0.03 * 0.85; // ~15% headroom achievable via consolidation
    const benchmarkMonthly = (monthlyRevenue * benchmarkShare) / Math.max(1, toolCount);
    const gapMonthly = Math.max(0, current - benchmarkMonthly);
    return {
      hasOpportunity: gapMonthly > 0,
      monthly_spend: current,
      benchmark_monthly_spend: Math.round(benchmarkMonthly),
      annual_savings: Math.round(gapMonthly * 12),
      savings_basis: `(€${Math.round(current)} current/mo − €${Math.round(benchmarkMonthly)} benchmark/mo at ${(benchmarkShare * 100).toFixed(2)}% of GMV ÷ ${toolCount} carrier(s)) × 12; per-shipment target €${bm.shipping.perUnit.toFixed(2)}`,
    };
  }

  if (vertical.startsWith("saas_")) {
    // Compare against the same vertical-weighted SaaS benchmark B2 used.
    const VERTICAL_WEIGHT = {
      saas_commerce: 0.35, saas_marketing: 0.25, saas_analytics: 0.10,
      saas_support: 0.10, saas_finance: 0.10, saas_hr: 0.10,
    };
    const weight = VERTICAL_WEIGHT[vertical] || 0.10;
    // SaaS savings ceiling (matches scoreEngine): 60% of excess, capped at 35% of current.
    const benchmarkMonthly = (monthlyRevenue * bm.saas.pct * weight) / Math.max(1, toolCount);
    const rawGap = Math.max(0, current - benchmarkMonthly);
    const recoverable = Math.min(rawGap * 0.60, current * 0.35);
    return {
      hasOpportunity: recoverable > 0,
      monthly_spend: current,
      benchmark_monthly_spend: Math.round(benchmarkMonthly),
      annual_savings: Math.round(recoverable * 12),
      savings_basis: `(€${Math.round(current)} current/mo − €${Math.round(benchmarkMonthly)} benchmark/mo at ${(bm.saas.pct*100).toFixed(1)}% × vertical weight ${(weight*100).toFixed(0)}% ÷ ${toolCount} tool(s)) × 60% recoverable, capped at 35% of current × 12`,
    };
  }

  return { hasOpportunity: false, reason: `no benchmark rule for vertical "${vertical}"` };
}

// ─── Action templates (deterministic, used when Claude is not available) ──
function defaultAction(vertical, toolName) {
  if (vertical === "payments")       return `Renegotiate ${toolName} rate or compare alternative PSPs`;
  if (vertical === "shipping")       return `Consolidate ${toolName} volume or compare alternative carriers`;
  if (vertical === "saas_commerce")  return `Review ${toolName} plan tier and unused features`;
  if (vertical === "saas_marketing") return `Audit ${toolName} usage; cancel unused seats or downgrade tier`;
  if (vertical === "saas_analytics") return `Review ${toolName} plan; many free/lower tiers cover SMB needs`;
  if (vertical === "saas_support")   return `Audit ${toolName} seats and ticket volume; right-size plan`;
  if (vertical === "saas_finance")   return `Review ${toolName} subscription against actual usage`;
  if (vertical === "saas_hr")        return `Review ${toolName} headcount licenses and unused modules`;
  return `Review ${toolName} contract`;
}

async function callClaude(svc, prompt, eventKey) { return (await callCambraClaude(prompt, { tier:'standard', maxTokens:2000, svc, eventKey, source:'recommendationEngineAgent' })).text; }
function safeParseJSON(t) {
  if (!t) return null;
  const c = t.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
  try { return JSON.parse(c); } catch(error){safeBestEffort(error,{operation:'recommendationEngineAgent',fallback:null,severity:'secondary'})}
  const m = c.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch(error){safeBestEffort(error,{operation:'recommendationEngineAgent',fallback:null,severity:'secondary'})} }
  return null;
}

Deno.serve(async (req) => {
  let task = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok:false, error:"Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { brand_id, spend_task_id } = body;
    if (!brand_id) return Response.json({ ok:false, error:"Missing brand_id" }, { status: 400 });

    await requireOwnedBrand(base44.asServiceRole, user, brand_id);

    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id,
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: RISK_LEVEL,
      input_summary: `Recommendations for brand ${brand_id}`,
      started_at: new Date().toISOString(),
    });

    // ── 1. Load B2 output — reuse, do NOT recompute ──────────────────────
    let spendTask = null;
    if (spend_task_id) {
      spendTask = await requireExactBrandTask(base44.asServiceRole, spend_task_id, {
        brandId: brand_id,
        agentName: 'spend_intelligence',
        status: 'completed',
      });
    }
    if (!spendTask) {
      const rows = await requireCriticalOperation(
        'recommendation_spend_task_read',
        () => base44.asServiceRole.entities.AgentTask
          .filter({ brand_id, agent_name: "spend_intelligence", status: "completed" }, "-created_date", 2),
      );
      spendTask = rows[0] || null;
    }
    if (!spendTask) {
      const err = "No completed spend_intelligence task found for this brand. Run B2 first.";
      await base44.asServiceRole.entities.AgentTask.update(task.id, {
        status: "failed", error: err, completed_at: new Date().toISOString(),
      });
      return Response.json({ ok:false, error: err, task_id: task.id }, { status: 400 });
    }

    const b2 = spendTask.output_payload_json || {};
    const estimates = Array.isArray(b2.estimates) ? b2.estimates : [];
    const basisCtx = b2.basis_context || {};
    const monthlyRevenue = Number(basisCtx.monthly_revenue) || 0;
    const country = basisCtx.country || "";
    const bm = getBenchmarks(monthlyRevenue, country);

    // ── 2-3. Detect opportunities + score (deterministic) ────────────────
    // Group by vertical to count tools-per-vertical (matches B2 splitting)
    const toolCountByVertical = {};
    for (const e of estimates) {
      toolCountByVertical[e.vertical] = (toolCountByVertical[e.vertical] || 0) + 1;
    }

    // ── 4. Pre-load catalog providers (one query for all verticals) ──────
    const catalog = await requireCriticalOperation(
      'recommendation_catalog_read',
      () => base44.asServiceRole.entities.IntegrationCatalog.list("-priority", 500),
    );
    const catalogByCategory = {};
    for (const c of catalog) {
      (catalogByCategory[c.category] = catalogByCategory[c.category] || []).push(c);
    }

    const opportunities = [];
    for (const est of estimates) {
      const vmap = VERTICAL_MAP[est.vertical];
      if (!vmap) continue;
      const op = detectOpportunity(est.vertical, est, monthlyRevenue, bm, toolCountByVertical[est.vertical]);
      if (!op.hasOpportunity) continue;

      const confidence = est.confidence || "low";
      const effortDef = VERTICAL_EFFORT[est.vertical] || { effort: "medium", weight: 2 };
      const cw = CONFIDENCE_WEIGHT[confidence] ?? 0.4;
      // priority = (annual_savings × confidence_weight) ÷ effort_weight
      const priority = Math.round((op.annual_savings * cw) / effortDef.weight);

      // Suggested providers: live alternatives in same category, exclude current tool
      const candidates = (catalogByCategory[vmap.catalogCategory] || [])
        .filter(c => c.status === "live")
        .filter(c => (c.name || "").toLowerCase() !== (est.tool || "").toLowerCase())
        .slice(0, 3)
        .map(c => ({
          integration_id: c.integration_id,
          name: c.name,
          value_unlock: c.value_unlock || null,
        }));

      opportunities.push({
        vertical: est.vertical,
        rec_vertical: vmap.recVertical,
        current_tool: est.tool,
        matched_catalog_id: est.matched_catalog_id || null,
        action: defaultAction(est.vertical, est.tool),
        expected_savings: op.annual_savings,
        confidence,
        effort: effortDef.effort,
        priority,
        evidence: {
          monthly_spend: op.monthly_spend,
          benchmark_monthly_spend: op.benchmark_monthly_spend,
          gap_monthly: Math.max(0, op.monthly_spend - op.benchmark_monthly_spend),
          savings_basis: op.savings_basis,
          spend_basis: est.basis,
          score_engine_version: SCORE_ENGINE_VERSION,
          tier: basisCtx.tier,
          region: basisCtx.region,
          source_spend_task_id: spendTask.id,
        },
        suggested_providers: candidates,
      });
    }

    // Sort by priority desc
    opportunities.sort((a, b) => b.priority - a.priority);

    const totals = {
      annual_savings: opportunities.reduce((a, o) => a + o.expected_savings, 0),
      opportunity_count: opportunities.length,
    };

    // ── 5. AI rewrite — numbers locked ───────────────────────────────────
    let interpretation_status = "skipped_no_key";
    const hasKey = !!Deno.env.get("ANTHROPIC_API_KEY");

    if (hasKey && opportunities.length > 0) {
      const prompt = [
        "You are CAMBRA's recommendation copywriter.",
        "",
        "STRICT RULES — VIOLATIONS WILL BE REJECTED:",
        "1. NEVER change any € number, confidence, effort, or priority.",
        "2. NEVER invent new opportunities, providers, or tools.",
        "3. Only rewrite the `action` (1 line, imperative) and `description` (2 lines max).",
        "4. Reference the evidence (current vs benchmark spend) when relevant.",
        "",
        'Return ONLY JSON: { "rewrites": [{ "current_tool": "<exact>", "action": "<string>", "description": "<string>" }] }',
        "",
        "OPPORTUNITIES (deterministic — never change numbers):",
        JSON.stringify(opportunities.map(o => ({
          current_tool: o.current_tool, vertical: o.vertical,
          expected_savings: o.expected_savings, evidence: o.evidence,
        })), null, 2),
      ].join("\n");
      try {
        const text = await callClaude(base44.asServiceRole, prompt, task?.id || crypto.randomUUID());
        const parsed = safeParseJSON(text);
        const allowed = new Set(opportunities.map(o => o.current_tool));
        const rewrites = parsed && Array.isArray(parsed.rewrites)
          ? parsed.rewrites.filter(r => r && allowed.has(r.current_tool))
          : [];
        if (rewrites.length > 0) {
          for (const o of opportunities) {
            const r = rewrites.find(x => x.current_tool === o.current_tool);
            if (r) {
              if (typeof r.action === "string") o.action = r.action;
              if (typeof r.description === "string") o.description = r.description;
            }
          }
          interpretation_status = "ok";
        } else {
          interpretation_status = parsed ? "empty_after_validation" : "parse_failed";
        }
      } catch (e) {
        interpretation_status = `error: ${e.message}`;
      }
    }

    // Fill description with deterministic template where Claude didn't
    for (const o of opportunities) {
      if (!o.description) {
        o.description = `You spend ~€${o.evidence.monthly_spend.toLocaleString()}/mo on ${o.current_tool} (${o.vertical}). Network benchmark for ${o.evidence.tier}/${o.evidence.region} brands is ~€${o.evidence.benchmark_monthly_spend.toLocaleString()}/mo. Estimated recoverable: €${o.expected_savings.toLocaleString()}/yr.`;
      }
    }

    // ── 6. Persist Recommendation rows for existing UI surfaces ──────────
    // We mirror the deterministic output into Recommendation entities so the
    // existing /admin/recommendations + dashboard surfaces see them.
    const nowIso = new Date().toISOString();
    const persistedRecIds = [];
    for (const o of opportunities) {
      try {
        const rec = await base44.asServiceRole.entities.Recommendation.create({
          brand_id,
          vertical: o.rec_vertical,
          type: "opportunity_ranking",
          title: `Save ~€${o.expected_savings.toLocaleString()}/yr on ${o.current_tool}`,
          description: o.description,
          expected_benefit: `€${o.expected_savings.toLocaleString()}/yr`,
          action_required: o.action,
          effort_level: o.effort,
          score_json: {
            priority: o.priority,
            confidence: o.confidence,
            evidence: o.evidence,
            suggested_providers: o.suggested_providers,
            source: `recommendation_engine v${SCORE_ENGINE_VERSION}`,
            source_spend_task_id: spendTask.id,
          },
          reasons: [o.evidence.savings_basis],
          status: "active",
          generated_at: nowIso,
        });
        persistedRecIds.push(rec.id);
      } catch (e) {
        // non-fatal: agent task output still ships in payload
      }
    }

    const summary = totals.opportunity_count === 0
      ? "No opportunities detected — current spend is at or below benchmark."
      : `${totals.opportunity_count} opportunity/ies · ~€${totals.annual_savings.toLocaleString()}/yr potential savings using scoreEngine v${SCORE_ENGINE_VERSION}.`;

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "completed",
      output_summary: summary,
      output_payload_json: {
        spend_task_id: spendTask.id,
        basis_context: basisCtx,
        recommendations: opportunities,
        persisted_recommendation_ids: persistedRecIds,
        totals,
        interpretation_status,
        engine: {
          deterministic: `scoreEngine v${SCORE_ENGINE_VERSION} (mirrored)`,
          interpreter: hasKey ? "anthropic/claude-sonnet-4-5" : "none",
        },
      },
      completed_at: new Date().toISOString(),
    });

    return Response.json({
      ok: true,
      task_id: task.id,
      spend_task_id: spendTask.id,
      recommendations: opportunities,
      persisted_recommendation_ids: persistedRecIds,
      totals,
      summary,
      interpretation_status,
    });
  } catch (error) {
    if (task?.id) {
      try {
        const base44 = createClientFromRequest(req);
        await base44.asServiceRole.entities.AgentTask.update(task.id, {
          status: "failed", error: error.message, completed_at: new Date().toISOString(),
        });
      } catch(error){safeBestEffort(error,{operation:'recommendationEngineAgent',fallback:null,severity:'secondary'})}
    }
    const tenantError = tenantOwnershipErrorResponse(error);
    if (tenantError) return tenantError;
    return internalErrorResponse(error, 'recommendationEngineAgent');
  }
});
