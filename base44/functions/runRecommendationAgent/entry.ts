import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * M8 — runRecommendationAgent
 *
 * Synthesizes ALL infrastructure data into a prioritized recommendation list.
 * Max 5 recommendations, sorted by expected_saving_eur * confidence.
 * Status is ALWAYS awaiting_approval. Recommendations are written only on approval.
 */

const ENGINE_VERSION = 'm8-recommendation-agent-1.0';
const AGENT_TYPE = 'recommendation';
const MAX_RECOMMENDATIONS = 5;

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

  // ── Load ALL context ─────────────────────────────────────────
  const [latestResultArr, existingRecs, latestDiscoveryArr, brandArr, infraNodes] = await Promise.all([
    svc.entities.AnalyzerResult.filter({ brand_id }, '-created_date', 1).catch(() => []),
    svc.entities.Recommendation.filter({ brand_id }, '-created_date', 50).catch(() => []),
    svc.entities.ContinuousDiscoveryRun.filter({ brand_id }, '-started_at', 1).catch(() => []),
    svc.entities.Brand.filter({ id: brand_id }, '-created_date', 1).catch(() => []),
    svc.entities.InfrastructureNode.filter({ brand_id }).catch(() => []),
  ]);

  const latestResult = latestResultArr[0] || null;
  const latestDiscovery = latestDiscoveryArr[0] || null;
  const brand = brandArr[0] || null;

  // Infrastructure graph (best effort)
  let infraGraph = null;
  try {
    const gRes = await base44.functions.invoke('getInfrastructureGraph', { brand_id });
    infraGraph = gRes?.data || gRes;
  } catch (_) { /* non-fatal */ }

  // Benchmarks per vertical (best effort)
  const benchmarks = {};
  for (const v of ['payments', 'shipping', 'saas']) {
    try {
      const r = await base44.functions.invoke('getBenchmarkForReport', { brand_id, vertical: v });
      benchmarks[v] = r?.data || r;
    } catch (_) { benchmarks[v] = null; }
  }

  const runRecord = await svc.entities.AgentRun.create({
    brand_id,
    agent_type: AGENT_TYPE,
    trigger,
    status: 'running',
    requires_approval: true,
    engine_version: ENGINE_VERSION,
    created_at: new Date().toISOString(),
    prompt_summary: 'Synthesize all infrastructure signals into a prioritized recommendation list.',
    input_json: {
      has_analyzer_result: !!latestResult,
      existing_recs_count: existingRecs.length,
      has_discovery_run: !!latestDiscovery,
      infra_node_count: infraNodes.length,
    },
  });

  try {
    const evidence = [];
    if (latestResult) evidence.push(`AnalyzerResult ${latestResult.id} — total: €${Math.round(latestResult.total_savings || 0).toLocaleString()}/yr (confidence: ${latestResult.confidence_level || 'n/a'})`);
    if (infraGraph?.summary) evidence.push(`Infrastructure graph — ${infraNodes.length} nodes mapped`);
    if (latestDiscovery) evidence.push(`Last discovery run — ${latestDiscovery.changes_detected || 0} changes, ${latestDiscovery.nodes_updated || 0} nodes updated`);
    if (existingRecs.length) evidence.push(`${existingRecs.length} existing recommendations on file`);
    for (const v of ['payments', 'shipping', 'saas']) {
      if (benchmarks[v]?.n) evidence.push(`${v} benchmark — median ${benchmarks[v].median} (n=${benchmarks[v].n})`);
    }

    const prompt = `
You are CAMBRA's Recommendation Synthesis Agent. Combine all infrastructure signals for this brand into a prioritized recommendation list.

RULES:
- Never claim guaranteed savings — only estimated.
- Never propose actions that execute without human approval.
- Maximum ${MAX_RECOMMENDATIONS} recommendations. Sort by expected_saving_eur * confidence DESCENDING.
- Each recommendation must cite specific data from the context.
- Cover at minimum: payments, shipping, SaaS — only include verticals where you have evidence.
- If data is thin, lower confidence accordingly.

BRAND: ${brand?.name || 'unknown'} (${brand?.country || 'n/a'}, ${brand?.category || 'n/a'})

ANALYZER (latest):
- Total identified savings: €${Math.round(latestResult?.total_savings || 0).toLocaleString()}/yr
- Payments: €${Math.round(latestResult?.payment_savings || 0).toLocaleString()}/yr
- Shipping: €${Math.round(latestResult?.shipping_savings || 0).toLocaleString()}/yr
- SaaS: €${Math.round(latestResult?.saas_savings || 0).toLocaleString()}/yr
- Infra score: ${latestResult?.infra_score || 'n/a'}/100
- Confidence: ${latestResult?.confidence_level || 'n/a'}

INFRASTRUCTURE: ${infraNodes.length} nodes (${infraNodes.map(n => `${n.provider_name}[${n.node_type}]`).slice(0, 10).join(', ')}${infraNodes.length > 10 ? '…' : ''})

BENCHMARKS:
${['payments', 'shipping', 'saas'].map(v => `- ${v}: ${benchmarks[v]?.median != null ? `median ${benchmarks[v].median} (n=${benchmarks[v].n})` : 'unavailable'}`).join('\n')}

EXISTING RECOMMENDATIONS: ${existingRecs.length} on file (avoid duplicates)

Return JSON:
{
  "confidence": <0.0–1.0 overall>,
  "reasoning": "<why this prioritization, citing numbers>",
  "total_opportunity_eur": <number, sum of estimated savings>,
  "recommendations": [
    {
      "title": "<short, action-oriented>",
      "vertical": "<payments | shipping | saas | general>",
      "expected_saving_eur": <number, annual>,
      "confidence": <0.0–1.0>,
      "effort": "<low | medium | high>",
      "priority": <1–5, 1=highest>,
      "reasoning": "<why this rec, cite numbers>",
      "evidence": ["<data point used>", "..."]
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
          total_opportunity_eur: { type: 'number' },
          recommendations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                vertical: { type: 'string' },
                expected_saving_eur: { type: 'number' },
                confidence: { type: 'number' },
                effort: { type: 'string' },
                priority: { type: 'number' },
                reasoning: { type: 'string' },
                evidence: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
        required: ['confidence', 'reasoning', 'recommendations'],
      },
    });

    // ── Sort + cap to 5 ──────────────────────────────────────────
    const rawRecs = Array.isArray(aiResponse?.recommendations) ? aiResponse.recommendations : [];
    const recommendations = rawRecs
      .map(r => ({
        ...r,
        expected_saving_eur: Number(r.expected_saving_eur || 0),
        confidence: Math.max(0, Math.min(1, Number(r.confidence ?? 0.5))),
      }))
      .sort((a, b) => (b.expected_saving_eur * b.confidence) - (a.expected_saving_eur * a.confidence))
      .slice(0, MAX_RECOMMENDATIONS);

    const overallConfidence = Math.max(0, Math.min(1, Number(aiResponse?.confidence ?? 0.5)));
    const reasoning = String(aiResponse?.reasoning || '').trim() || 'Synthesized from available analyzer and benchmark signals.';
    if (evidence.length === 0) evidence.push('No structured context available — confidence intentionally low.');
    const totalOpportunity = Number(aiResponse?.total_opportunity_eur || recommendations.reduce((s, r) => s + (r.expected_saving_eur || 0), 0));

    await svc.entities.AgentRun.update(runRecord.id, {
      status: 'awaiting_approval',
      output_json: { ...aiResponse, total_opportunity_eur: totalOpportunity, recommendations },
      actions_proposed: recommendations, // recommendations ARE the proposed actions for this agent
      confidence: overallConfidence,
      reasoning,
      evidence,
      model_metadata: { source: 'InvokeLLM', engine_version: ENGINE_VERSION },
    });

    return Response.json({
      ok: true,
      run_id: runRecord.id,
      recommendations,
      total_opportunity_eur: totalOpportunity,
      confidence: overallConfidence,
    });
  } catch (error) {
    await svc.entities.AgentRun.update(runRecord.id, {
      status: 'failed',
      error_message: String(error?.message || error).slice(0, 1000),
    }).catch(() => {});
    return Response.json({ ok: false, error: error?.message || String(error) }, { status: 500 });
  }
});