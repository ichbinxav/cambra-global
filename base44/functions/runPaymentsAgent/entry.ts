import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * M8 — runPaymentsAgent
 *
 * AI agent that analyzes payment infrastructure and PROPOSES optimization actions.
 * Never executes anything. requires_approval is always true.
 */

const ENGINE_VERSION = 'm8-payments-agent-1.0';
const AGENT_TYPE = 'payments';

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

  // ── Load context (all brand-scoped) ──────────────────────────
  const [latestResultArr, stripeArr, allNodes, brandArr] = await Promise.all([
    svc.entities.AnalyzerResult.filter({ brand_id }, '-created_date', 1).catch(() => []),
    svc.entities.StripeConnection.filter({ brand_id, connection_status: 'connected' }, '-last_sync_at', 1).catch(() => []),
    svc.entities.InfrastructureNode.filter({ brand_id }).catch(() => []),
    svc.entities.Brand.filter({ id: brand_id }, '-created_date', 1).catch(() => []),
  ]);

  const latestResult = latestResultArr[0] || null;
  const stripe = stripeArr[0] || null;
  const brand = brandArr[0] || null;
  const paymentNodes = allNodes.filter(n => n.node_type === 'payment_provider');

  if (!latestResult && !stripe && paymentNodes.length === 0) {
    return Response.json({ ok: false, error: 'Insufficient payment data — run Analyzer first' }, { status: 200 });
  }

  // Pull benchmark (non-fatal if unavailable)
  let benchmark = null;
  try {
    const benchRes = await base44.functions.invoke('getBenchmarkForReport', {
      brand_id,
      vertical: 'payments',
    });
    benchmark = benchRes?.data || benchRes;
  } catch (_) { /* non-fatal */ }

  // Create the run record up-front so it's discoverable even if AI fails
  const runRecord = await svc.entities.AgentRun.create({
    brand_id,
    agent_type: AGENT_TYPE,
    trigger,
    status: 'running',
    requires_approval: true, // hardcoded — non-negotiable
    engine_version: ENGINE_VERSION,
    created_at: new Date().toISOString(),
    prompt_summary: 'Analyze payment infrastructure vs network benchmark and propose optimization actions.',
    input_json: {
      has_analyzer_result: !!latestResult,
      has_stripe_connection: !!stripe,
      payment_node_count: paymentNodes.length,
    },
  });

  try {
    // ── Numeric context ─────────────────────────────────────────
    const currentRate = stripe?.effective_fee_pct
      ?? latestResult?.details?.payment_current_rate
      ?? null;
    const benchmarkRate = benchmark?.median ?? latestResult?.payment_benchmark ?? null;
    const monthlyVolume = stripe?.monthly_volume ?? null;
    const annualSavingsEstimate = latestResult?.payment_savings ?? null;
    const gapBps = (currentRate != null && benchmarkRate != null)
      ? Math.round((currentRate - benchmarkRate) * 100)
      : null;

    const evidence = [];
    if (latestResult) evidence.push(`AnalyzerResult ${latestResult.id} (confidence: ${latestResult.confidence_level || 'n/a'})`);
    if (stripe) evidence.push(`Live Stripe connection — effective_fee_pct: ${stripe.effective_fee_pct}%, monthly_volume: €${Math.round(stripe.monthly_volume || 0).toLocaleString()}`);
    if (benchmark && benchmark.n) evidence.push(`Network benchmark — median ${benchmark.median}% (n=${benchmark.n})`);
    if (paymentNodes.length) evidence.push(`InfrastructureNodes: ${paymentNodes.map(n => n.provider_name).join(', ')}`);

    // ── Build structured prompt ─────────────────────────────────
    const prompt = `
You are CAMBRA's Payments Infrastructure Agent. Analyze this independent brand's payment setup and propose concrete optimization actions.

YOU MUST follow these rules:
- Never claim guaranteed savings — only estimated.
- Never propose actions that execute without human approval.
- Be specific. Cite real numbers from the context.
- If data is thin, lower your confidence accordingly.

BRAND: ${brand?.name || 'unknown'} (${brand?.country || 'n/a'}, ${brand?.category || 'n/a'})

CONTEXT:
- Current effective payment rate: ${currentRate != null ? currentRate + '%' : 'unknown'}
- Network benchmark median: ${benchmarkRate != null ? benchmarkRate + '%' : 'unknown'}
- Gap: ${gapBps != null ? gapBps + ' bps' : 'unknown'}
- Monthly volume: ${monthlyVolume != null ? '€' + Math.round(monthlyVolume).toLocaleString() : 'unknown'}
- Estimated annual savings (from Analyzer): ${annualSavingsEstimate != null ? '€' + Math.round(annualSavingsEstimate).toLocaleString() : 'unknown'}
- Connected payment providers: ${paymentNodes.map(n => `${n.provider_name} (${n.status})`).join(', ') || 'none detected'}
- Stripe connected: ${stripe ? 'yes (verified)' : 'no'}

Return JSON with these exact fields:
{
  "confidence": <0.0–1.0>,
  "reasoning": "<why these recommendations, citing the numbers above>",
  "summary": "<one-sentence headline insight>",
  "actions_proposed": [
    {
      "action_type": "<switch_provider | renegotiate_rate | enable_local_methods | consolidate_providers | connect_stripe>",
      "description": "<what to do, specific>",
      "expected_saving_eur": <number, annual>,
      "effort": "<low | medium | high>",
      "priority": <1–5, 1=highest>
    }
  ]
}`.trim();

    // ── AI call ─────────────────────────────────────────────────
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

    // ── Validate output rules ───────────────────────────────────
    const confidence = Math.max(0, Math.min(1, Number(aiResponse?.confidence ?? 0.5)));
    const reasoning = String(aiResponse?.reasoning || '').trim() || 'Insufficient AI reasoning — fell back to context-only analysis.';
    const actions_proposed = Array.isArray(aiResponse?.actions_proposed) ? aiResponse.actions_proposed : [];
    if (evidence.length === 0) evidence.push('No structured context available — confidence intentionally low.');

    await svc.entities.AgentRun.update(runRecord.id, {
      status: 'awaiting_approval', // human gate — never auto-executes
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
      summary: aiResponse?.summary || 'Payments infrastructure analysis complete.',
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