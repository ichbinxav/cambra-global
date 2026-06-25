import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * M8 — runShippingAgent
 *
 * AI agent that analyzes shipping infrastructure and PROPOSES optimization actions.
 * Never executes anything. requires_approval is always true.
 */

const ENGINE_VERSION = 'm8-shipping-agent-1.0';
const AGENT_TYPE = 'shipping';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  let body = {};
  try { body = await req.json(); } catch (_) { /* empty body ok */ }
  const { brand_id, trigger = 'manual' } = body || {};
  if (!brand_id) {
    return Response.json({ ok: false, error: 'brand_id required' }, { status: 400 });
  }

  // Auth: admin / service role / brand owner
  let isServiceRole = false;
  let user = null;
  try { user = await base44.auth.me(); } catch (_) { isServiceRole = true; }
  if (!isServiceRole && !user) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const isAdmin = user?.role === 'admin';
  if (!isServiceRole && !isAdmin) {
    const owned = await base44.entities.Brand.filter({ id: brand_id }).catch(() => []);
    if (!owned.length) {
      return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }
  }

  const svc = base44.asServiceRole;

  const [latestResultArr, allNodes, brandArr, latestInputArr] = await Promise.all([
    svc.entities.AnalyzerResult.filter({ brand_id }, '-created_date', 1).catch(() => []),
    svc.entities.InfrastructureNode.filter({ brand_id }).catch(() => []),
    svc.entities.Brand.filter({ id: brand_id }, '-created_date', 1).catch(() => []),
    svc.entities.AnalyzerInput.filter({ brand_id }, '-created_date', 1).catch(() => []),
  ]);

  const latestResult = latestResultArr[0] || null;
  const brand = brandArr[0] || null;
  const latestInput = latestInputArr[0] || null;
  const shippingNodes = allNodes.filter(n => n.node_type === 'shipping_carrier');

  if (!latestResult && shippingNodes.length === 0 && !latestInput) {
    return Response.json({ ok: false, error: 'Insufficient shipping data — run Analyzer first' }, { status: 200 });
  }

  let benchmark = null;
  try {
    const benchRes = await base44.functions.invoke('getBenchmarkForReport', {
      brand_id,
      vertical: 'shipping',
    });
    benchmark = benchRes?.data || benchRes;
  } catch (_) { /* non-fatal */ }

  const runRecord = await svc.entities.AgentRun.create({
    brand_id,
    agent_type: AGENT_TYPE,
    trigger,
    status: 'running',
    requires_approval: true,
    engine_version: ENGINE_VERSION,
    created_at: new Date().toISOString(),
    prompt_summary: 'Analyze shipping infrastructure vs network benchmark and propose carrier optimization actions.',
    input_json: {
      has_analyzer_result: !!latestResult,
      shipping_node_count: shippingNodes.length,
      has_input: !!latestInput,
    },
  });

  try {
    const monthlySpend = latestInput?.monthly_shipping_cost ?? null;
    const monthlyShipments = latestInput?.monthly_shipments ?? null;
    const costPerShipment = (monthlySpend && monthlyShipments)
      ? +(monthlySpend / monthlyShipments).toFixed(2)
      : null;
    const benchmarkPerUnit = benchmark?.median ?? null;
    const annualSavingsEstimate = latestResult?.shipping_savings ?? null;
    const carrier = latestInput?.shipping_provider || shippingNodes[0]?.provider_name || null;

    const evidence = [];
    if (latestResult) evidence.push(`AnalyzerResult ${latestResult.id} (shipping_savings: €${Math.round(latestResult.shipping_savings || 0).toLocaleString()})`);
    if (latestInput) evidence.push(`AnalyzerInput — carrier: ${carrier || 'n/a'}, monthly_spend: €${monthlySpend || 0}, shipments: ${monthlyShipments || 0}`);
    if (benchmark && benchmark.n) evidence.push(`Network shipping benchmark — €${benchmark.median}/shipment (n=${benchmark.n})`);
    if (shippingNodes.length) evidence.push(`Detected carriers: ${shippingNodes.map(n => n.provider_name).join(', ')}`);

    const prompt = `
You are CAMBRA's Shipping & Logistics Infrastructure Agent. Analyze this independent brand's carrier setup and propose concrete optimization actions.

RULES:
- Never claim guaranteed savings — only estimated.
- Never propose actions that execute without human approval.
- Be specific. Cite real numbers from the context.
- Differentiate between carrier rate optimization and 3PL/fulfillment optimization.
- If data is thin, lower confidence.

BRAND: ${brand?.name || 'unknown'} (${brand?.country || 'n/a'})

CONTEXT:
- Primary carrier: ${carrier || 'unknown'}
- Monthly shipping spend: ${monthlySpend != null ? '€' + monthlySpend.toLocaleString() : 'unknown'}
- Monthly shipments: ${monthlyShipments != null ? monthlyShipments.toLocaleString() : 'unknown'}
- Cost per shipment: ${costPerShipment != null ? '€' + costPerShipment : 'unknown'}
- Network benchmark per shipment: ${benchmarkPerUnit != null ? '€' + benchmarkPerUnit : 'unknown'}
- Estimated annual savings (from Analyzer): ${annualSavingsEstimate != null ? '€' + Math.round(annualSavingsEstimate).toLocaleString() : 'unknown'}
- International %: ${latestInput?.intl_pct ?? 'unknown'}%

Return JSON with these exact fields:
{
  "confidence": <0.0–1.0>,
  "reasoning": "<why these recommendations, citing numbers>",
  "summary": "<one-sentence headline insight>",
  "actions_proposed": [
    {
      "action_type": "<switch_carrier | renegotiate_rate | consolidate_shipments | add_regional_carrier | switch_3pl>",
      "description": "<what to do, specific>",
      "expected_saving_eur": <number, annual>,
      "effort": "<low | medium | high>",
      "priority": <1–5, 1=highest>
    }
  ]
}`.trim();

    const aiResponse = await svc.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          confidence: { type: 'number' },
          reasoning: { type: 'string' },
          summary: { type: 'string' },
          actions_proposed: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                action_type: { type: 'string' },
                description: { type: 'string' },
                expected_saving_eur: { type: 'number' },
                effort: { type: 'string' },
                priority: { type: 'number' },
              },
            },
          },
        },
        required: ['confidence', 'reasoning', 'actions_proposed'],
      },
    });

    const confidence = Math.max(0, Math.min(1, Number(aiResponse?.confidence ?? 0.5)));
    const reasoning = String(aiResponse?.reasoning || '').trim() || 'Insufficient AI reasoning — fell back to context-only analysis.';
    const actions_proposed = Array.isArray(aiResponse?.actions_proposed) ? aiResponse.actions_proposed : [];
    if (evidence.length === 0) evidence.push('No structured context available — confidence intentionally low.');

    await svc.entities.AgentRun.update(runRecord.id, {
      status: 'awaiting_approval',
      output_json: aiResponse || {},
      actions_proposed,
      confidence,
      reasoning,
      evidence,
      model_metadata: { source: 'InvokeLLM', engine_version: ENGINE_VERSION },
    });

    return Response.json({
      ok: true,
      run_id: runRecord.id,
      summary: aiResponse?.summary || 'Shipping infrastructure analysis complete.',
      actions_proposed,
      confidence,
    });
  } catch (error) {
    await svc.entities.AgentRun.update(runRecord.id, {
      status: 'failed',
      error_message: String(error?.message || error).slice(0, 1000),
    }).catch(() => {});
    return Response.json({ ok: false, error: error?.message || String(error) }, { status: 500 });
  }
});