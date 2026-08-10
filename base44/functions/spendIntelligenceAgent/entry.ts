import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

/**
 * Spend Intelligence Agent — Brain B2
 *
 * Design principle (same as B1): DETERMINISTIC FIRST, AI only interprets.
 * All € figures come from scoreEngine benchmarks + deterministic rules.
 * Claude (optional) only writes the human-readable explanation — never the numbers.
 *
 * Flow:
 *   1. Read B1's last completed AgentTask for this brand → reuse its findings.
 *      We DO NOT re-scan the website.
 *   2. Read Brand to get monthly_revenue + country (best-effort; defaults applied).
 *   3. For each detected tool, estimate monthly + annual spend using a rule
 *      bound to a specific scoreEngine benchmark. Each estimate carries `basis`
 *      explaining exactly which benchmark/tier was applied.
 *   4. If ANTHROPIC_API_KEY is set: Claude takes the estimates AS-IS and writes
 *      a plain-language explanation. It is forbidden from changing any number.
 *      Without key → status `skipped_no_key`. Deterministic output still ships.
 *   5. Write an AgentTask (L1, no Approval) so it appears in Activity Log.
 *      The payload is structured so B3 can consume it directly.
 *
 * Payload: { brand_id: string, discovery_task_id?: string }
 * Returns: { ok, task_id, estimates: [...], totals: {...}, summary,
 *            interpretation_status, basis_context }
 *
 * ⚠️ The benchmark tables below MUST stay in sync with lib/scoreEngine.js
 * (getBenchmarks). Deno can't import that file; values are duplicated by
 * necessity. See the same note in functions/getBenchmarkForReport.js.
 */

const AGENT_NAME = "spend_intelligence";
const TASK_TYPE = "estimate_tool_spend";
const RISK_LEVEL = 1;
const SCORE_ENGINE_VERSION = "1.0.0"; // mirror of scoreEngine.ENGINE_VERSION.benchmark

// ─── Mirrored from lib/scoreEngine.js — DO NOT diverge ─────────────────────
const EU_COUNTRIES = [
  "France", "Germany", "Spain", "Italy", "Netherlands", "Belgium", "Portugal",
  "Sweden", "Denmark", "Finland", "Norway", "Austria", "Switzerland", "Ireland",
  "Poland", "Czech Republic", "Romania", "Hungary", "Greece", "Luxembourg",
  "Malta", "Cyprus", "Slovakia", "Slovenia", "Croatia", "Estonia", "Latvia",
  "Lithuania", "Bulgaria",
];
const isEU = (c) => EU_COUNTRIES.includes(c);

function getRevenueTier(monthlyRevenue = 0) {
  if (monthlyRevenue >= 500000) return "large";
  if (monthlyRevenue >= 100000) return "mid";
  if (monthlyRevenue >= 30000) return "small";
  return "micro";
}

// Mirror of scoreEngine.getBenchmarks (v1.0.0)
function getBenchmarks(monthlyRevenue = 0, country = "") {
  const tier = getRevenueTier(monthlyRevenue);
  const eu = isEU(country);
  return {
    tier, eu,
    payment: ({
      micro: { rate: eu ? 2.4 : 2.9 },
      small: { rate: eu ? 2.2 : 2.6 },
      mid:   { rate: eu ? 1.9 : 2.3 },
      large: { rate: eu ? 1.6 : 1.9 },
    })[tier],
    shipping: ({
      micro: { perUnit: eu ? 5.80 : 7.20 },
      small: { perUnit: eu ? 5.20 : 6.50 },
      mid:   { perUnit: eu ? 4.60 : 5.80 },
      large: { perUnit: eu ? 3.90 : 4.80 },
    })[tier],
    saas: ({
      micro: { pct: 0.060 },
      small: { pct: 0.040 },
      mid:   { pct: 0.025 },
      large: { pct: 0.015 },
    })[tier],
  };
}

// ─── Per-vertical share heuristics ─────────────────────────────────────────
// When B1 detects N SaaS tools in the same vertical, total SaaS spend gets
// divided proportionally. These weights are DETERMINISTIC and bounded —
// they don't invent a € figure, they distribute the benchmark-derived total.
const VERTICAL_WEIGHT = {
  saas_commerce: 0.35,
  saas_marketing: 0.25,
  saas_analytics: 0.10,
  saas_support: 0.10,
  saas_finance: 0.10,
  saas_hr: 0.10,
};

// ─── Estimation rules (deterministic) ──────────────────────────────────────
// Each rule binds a vertical to a scoreEngine benchmark. Returns:
//   { monthly_spend, basis: <human-readable rule explanation> }
function estimatePaymentSpend(monthlyRevenue, bm, toolCount) {
  // Payments benchmark = effective rate (%) of GMV.
  // Total payment processing cost is split equally across detected providers.
  const totalMonthly = monthlyRevenue * (bm.payment.rate / 100);
  const perTool = toolCount > 0 ? totalMonthly / toolCount : totalMonthly;
  return {
    monthly_spend: Math.round(perTool),
    basis: `payments benchmark ${bm.payment.rate.toFixed(2)}% × monthly GMV €${Math.round(monthlyRevenue).toLocaleString()} ÷ ${toolCount} detected provider(s) [tier=${bm.tier}, region=${bm.eu ? "EU" : "non-EU"}]`,
  };
}

function estimateShippingSpend(monthlyRevenue, bm, toolCount) {
  // Without shipment count, we can't apply the per-unit benchmark directly.
  // Conservative deterministic fallback: shipping spend approximated as
  // 3% of monthly revenue (industry-standard outbound logistics share for SMB
  // ecommerce, used only when shipment count is unknown). Equally split.
  const SHIPPING_REVENUE_SHARE = 0.03;
  const totalMonthly = monthlyRevenue * SHIPPING_REVENUE_SHARE;
  const perTool = toolCount > 0 ? totalMonthly / toolCount : totalMonthly;
  return {
    monthly_spend: Math.round(perTool),
    basis: `shipping share ${(SHIPPING_REVENUE_SHARE * 100).toFixed(1)}% of monthly GMV ÷ ${toolCount} detected carrier(s); benchmark per-shipment €${bm.shipping.perUnit.toFixed(2)} [tier=${bm.tier}, region=${bm.eu ? "EU" : "non-EU"}]`,
  };
}

function estimateSaasSpend(monthlyRevenue, bm, vertical, toolCount, allSaasToolCount) {
  // SaaS benchmark = % of monthly revenue for the WHOLE SaaS stack.
  // We distribute by VERTICAL_WEIGHT, then split equally inside the vertical.
  const totalSaasMonthly = monthlyRevenue * bm.saas.pct;
  const weight = VERTICAL_WEIGHT[vertical] || (1 / Math.max(1, allSaasToolCount));
  const verticalTotal = totalSaasMonthly * weight;
  const perTool = toolCount > 0 ? verticalTotal / toolCount : verticalTotal;
  return {
    monthly_spend: Math.round(perTool),
    basis: `SaaS benchmark ${(bm.saas.pct * 100).toFixed(1)}% of monthly GMV × vertical weight ${(weight * 100).toFixed(0)}% (${vertical}) ÷ ${toolCount} tool(s) in vertical [tier=${bm.tier}]`,
  };
}

async function callClaude(prompt) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Claude API error: ${data?.error?.message || res.statusText}`);
  return data?.content?.[0]?.text || "";
}

function safeParseJSON(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
  try { return JSON.parse(cleaned); } catch { /* fallthrough */ }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch { /* fallthrough */ } }
  return null;
}

Deno.serve(async (req) => {
  let task = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { brand_id, discovery_task_id } = body;
    if (!brand_id) return Response.json({ ok: false, error: "Missing brand_id" }, { status: 400 });

    // Open AgentTask (L1, no Approval) — visible in Activity Log
    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id,
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: RISK_LEVEL,
      input_summary: `Spend estimation for brand ${brand_id}`,
      started_at: new Date().toISOString(),
    });

    // ── 1. Load B1 output — reuse, do NOT re-scan ─────────────────────────
    let discoveryTask = null;
    if (discovery_task_id) {
      const rows = await base44.asServiceRole.entities.AgentTask
        .filter({ id: discovery_task_id }).catch(() => []);
      discoveryTask = rows[0] || null;
    }
    if (!discoveryTask) {
      const rows = await base44.asServiceRole.entities.AgentTask
        .filter({ brand_id, agent_name: "discovery_tech_stack", status: "completed" }, "-created_date", 1)
        .catch(() => []);
      discoveryTask = rows[0] || null;
    }
    if (!discoveryTask) {
      const err = "No completed discovery_tech_stack task found for this brand. Run B1 first.";
      await base44.asServiceRole.entities.AgentTask.update(task.id, {
        status: "failed", error: err, completed_at: new Date().toISOString(),
      });
      return Response.json({ ok: false, error: err, task_id: task.id }, { status: 400 });
    }

    const b1Findings = discoveryTask.output_payload_json?.findings || [];
    if (b1Findings.length === 0) {
      await base44.asServiceRole.entities.AgentTask.update(task.id, {
        status: "completed",
        output_summary: "No tools detected by B1 — nothing to estimate.",
        output_payload_json: {
          discovery_task_id: discoveryTask.id,
          estimates: [],
          totals: { monthly: 0, annual: 0 },
          basis_context: null,
        },
        completed_at: new Date().toISOString(),
      });
      return Response.json({
        ok: true, task_id: task.id,
        estimates: [], totals: { monthly: 0, annual: 0 },
        summary: "No tools detected by B1 — nothing to estimate.",
        interpretation_status: "skipped_no_findings",
      });
    }

    // ── 2. Load brand context ─────────────────────────────────────────────
    // Revenue lives on AnalyzerInput (canonical source used by Dashboard/Results).
    // Brand only stores a coarse `annual_revenue` range — used as fallback.
    let brand = null;
    try {
      brand = await base44.asServiceRole.entities.Brand.get(brand_id);
    } catch { /* brand may not exist; we fall back to defaults */ }
    const country = brand?.country || "";

    let monthlyRevenue = 0;
    let revenueSource = "none";
    try {
      const inputs = await base44.asServiceRole.entities.AnalyzerInput
        .filter({ brand_id }, "-created_date", 1);
      if (inputs?.[0]?.monthly_revenue) {
        monthlyRevenue = Math.max(0, Number(inputs[0].monthly_revenue) || 0);
        revenueSource = "AnalyzerInput.monthly_revenue";
      }
    } catch { /* no inputs */ }

    // Fallback: derive a conservative monthly revenue from Brand.annual_revenue range
    if (monthlyRevenue <= 0 && brand?.annual_revenue) {
      const RANGE_MIDPOINT_MONTHLY = {
        under_500k: 21000,    // ~€250K/yr midpoint
        "500k_1m": 62500,     // ~€750K/yr
        "1m_5m": 250000,      // ~€3M/yr
        "5m_20m": 1041000,    // ~€12.5M/yr
        "20m_plus": 2500000,  // ~€30M/yr lower-bound estimate
      };
      const fallback = RANGE_MIDPOINT_MONTHLY[brand.annual_revenue];
      if (fallback) {
        monthlyRevenue = fallback;
        revenueSource = `Brand.annual_revenue range "${brand.annual_revenue}" → midpoint estimate`;
      }
    }

    const bm = getBenchmarks(monthlyRevenue, country);

    // ── 3. Deterministic estimation ───────────────────────────────────────
    // Group findings by vertical to apply per-vertical splitting rules.
    const byVertical = {};
    for (const f of b1Findings) {
      const v = f.vertical || "other";
      (byVertical[v] = byVertical[v] || []).push(f);
    }
    const allSaasToolCount = Object.entries(byVertical)
      .filter(([v]) => v.startsWith("saas_"))
      .reduce((acc, [, arr]) => acc + arr.length, 0);

    const estimates = [];
    for (const [vertical, items] of Object.entries(byVertical)) {
      for (const f of items) {
        let est = null;
        if (monthlyRevenue <= 0) {
          // Honest: without revenue we can't anchor any benchmark.
          est = {
            monthly_spend: null,
            basis: "no monthly revenue available (neither AnalyzerInput nor Brand.annual_revenue) — cannot anchor any scoreEngine benchmark.",
          };
        } else if (vertical === "payments") {
          est = estimatePaymentSpend(monthlyRevenue, bm, items.length);
        } else if (vertical === "shipping") {
          est = estimateShippingSpend(monthlyRevenue, bm, items.length);
        } else if (vertical.startsWith("saas_")) {
          est = estimateSaasSpend(monthlyRevenue, bm, vertical, items.length, allSaasToolCount);
        } else {
          est = {
            monthly_spend: null,
            basis: `vertical "${vertical}" has no scoreEngine benchmark — skipped.`,
          };
        }

        const monthly = est.monthly_spend;
        const annual = monthly == null ? null : monthly * 12;
        // Confidence: derived from B1's confidence + whether we have revenue.
        const b1Conf = Number(f.confidence) || 0;
        let confidence = "low";
        if (monthly != null && b1Conf >= 0.9) confidence = "medium";
        if (monthly != null && b1Conf >= 0.9 && monthlyRevenue >= 30000) confidence = "high";

        estimates.push({
          tool: f.tool,
          vertical,
          matched_catalog_id: f.matched_catalog_id || null,
          estimated_spend_monthly: monthly,
          estimated_spend_annual: annual,
          basis: est.basis,
          confidence,
          source: "scoreEngine_v" + SCORE_ENGINE_VERSION,
          detection_confidence: b1Conf,
        });
      }
    }

    const totalMonthly = estimates.reduce((a, e) => a + (e.estimated_spend_monthly || 0), 0);
    const totals = { monthly: Math.round(totalMonthly), annual: Math.round(totalMonthly * 12) };

    const basis_context = {
      monthly_revenue: monthlyRevenue,
      monthly_revenue_source: revenueSource,
      country: country || null,
      tier: bm.tier,
      region: bm.eu ? "EU" : "non-EU",
      score_engine_version: SCORE_ENGINE_VERSION,
      benchmarks_used: {
        payments_rate_pct: bm.payment.rate,
        shipping_per_unit_eur: bm.shipping.perUnit,
        saas_pct_of_revenue: bm.saas.pct,
      },
    };

    // ── 4. AI explanation (optional, never touches numbers) ───────────────
    let interpretation = null;
    let interpretation_status = "skipped_no_key";
    const hasKey = !!Deno.env.get("ANTHROPIC_API_KEY");

    if (hasKey && estimates.length > 0) {
      const prompt = [
        "You are CAMBRA's spend explainer.",
        "",
        "STRICT RULES — VIOLATIONS WILL BE REJECTED:",
        "1. You may ONLY explain the numbers provided. NEVER change any € figure.",
        "2. NEVER invent additional tools, costs, or savings.",
        "3. If a figure is null, say it cannot be estimated and explain why using the `basis`.",
        "4. Be concise: a 2-3 line summary and one short sentence per tool.",
        "",
        "Return ONLY JSON with shape:",
        '{ "summary": "<string>", "explanations": [{ "tool": "<string>", "explanation": "<string>" }] }',
        "",
        "BASIS CONTEXT:",
        JSON.stringify(basis_context, null, 2),
        "",
        "ESTIMATES (DETERMINISTIC — do not change numbers):",
        JSON.stringify(estimates, null, 2),
      ].join("\n");

      try {
        const text = await callClaude(prompt);
        const parsed = safeParseJSON(text);
        if (parsed) {
          const allowed = new Set(estimates.map(e => e.tool));
          const cleanExplanations = Array.isArray(parsed.explanations)
            ? parsed.explanations.filter(x => x && allowed.has(x.tool))
            : [];
          interpretation = {
            summary: typeof parsed.summary === "string" ? parsed.summary : "",
            explanations: cleanExplanations,
          };
          interpretation_status = cleanExplanations.length > 0 ? "ok" : "empty_after_validation";
        } else {
          interpretation_status = "parse_failed";
        }
      } catch (e) {
        interpretation_status = `error: ${e.message}`;
      }
    } else if (!hasKey) {
      interpretation_status = "skipped_no_key";
    }

    // ── 5. Persist task output ────────────────────────────────────────────
    const summary = interpretation?.summary
      || `Estimated ~€${totals.monthly.toLocaleString()}/mo (€${totals.annual.toLocaleString()}/yr) across ${estimates.length} tool(s) using scoreEngine v${SCORE_ENGINE_VERSION} benchmarks.`;

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "completed",
      output_summary: summary,
      output_payload_json: {
        discovery_task_id: discoveryTask.id,
        basis_context,
        estimates,
        totals,
        interpretation,
        interpretation_status,
        engine: {
          deterministic: "scoreEngine v" + SCORE_ENGINE_VERSION + " (mirrored)",
          interpreter: hasKey ? "anthropic/claude-sonnet-4-5" : "none",
        },
      },
      completed_at: new Date().toISOString(),
    });

    return Response.json({
      ok: true,
      task_id: task.id,
      discovery_task_id: discoveryTask.id,
      basis_context,
      estimates,
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
      } catch { /* swallow */ }
    }
    return Response.json({ ok: false, error: error.message, task_id: task?.id || null }, { status: 500 });
  }
});