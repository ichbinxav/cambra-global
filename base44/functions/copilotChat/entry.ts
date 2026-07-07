import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ─── CAMBRA product knowledge base ────────────────────────────────────────
//
// Injected verbatim into the copilot's system prompt so it can answer ANY
// user question about what CAMBRA is, how it works, pricing, verticals,
// data policy, and what to do next — without hallucinating.
// Keep this concise, factual, and aligned with the public Landing / Pricing
// / HowItWorks / Terms pages. When those pages change, update this block.
const CAMBRA_KNOWLEDGE = `
ABOUT CAMBRA
- CAMBRA GLOBAL (SASU, SIREN 105 452 916, France) — economic infrastructure for independent commerce brands.
- Tagline: "Efficient infrastructure for independent commerce."
- Mission: recover margin brands lose on payments, shipping, SaaS and banking, by pooling their volume and negotiating collectively.

WHAT USERS GET
1. Free infrastructure audit (Analyzer) — 5 minutes, no card. Scores payments, shipping, SaaS.
2. Real network benchmarks — how their rates compare to similar brands.
3. AI recommendations — concrete next actions in euros.
4. Savings verification + migration (optional recovery service).

PRICING MODEL — critical to communicate correctly
- Analyzer: FREE during early access. No credit card.
- SaaS optimization: FREE (0% fee, savings stay 100% with the brand).
- Payments & Shipping recovery: 25% of VERIFIED savings, over 24 months.
- Conditional / no-risk: if we don't recover savings, there is no fee.
- NEVER quote 25% in isolation — always add "of verified savings, 24 months, no savings = no fee".

HOW IT WORKS (4 steps)
1. Analyze — quick brand profile + tools used (5 min).
2. Detect — we identify overpayment across payments, shipping, SaaS.
3. Verify — connect accounts (read-only) or upload invoices; we prove savings.
4. Recover — we negotiate with providers, migrate, and track savings monthly.

DATA & SECURITY
- Read-only access to connected accounts (Stripe, Shopify, shipping providers, etc.).
- Encrypted at rest (AES-256-GCM), never shared with third parties.
- GDPR-compliant, data controller = CAMBRA GLOBAL SASU.

TPE / IN-STORE TERMINALS
- The Analyzer also covers physical card terminals (retail, pop-ups, showrooms).
- We ask: TPE provider, terminal count, monthly rental, per-transaction fee, in-store GMV, average ticket, card mix, contract duration, fixed banking/maintenance fees.
- Output: effective in-store payment rate vs collective benchmark + savings estimate.

GOOD NEXT ACTIONS TO SUGGEST
- Run the Analyzer (/Analyzer) — if they haven't done it.
- Connect tools (/ConnectIntegrations) — to move from estimate to verified.
- View Results / Dashboard — if they already ran the audit.
- Sign up (waitlist) — for anonymous visitors ready to recover.

TONE
- Direct, brief, practical. No hype. No jargon.
- Answer in the user's language. Prefer short sentences.
- Always end with a concrete next step.
`;

// ─── Rate limiting (per user, hourly) ─────────────────────────────────────
//
// Copilot calls burn OpenAI credits with each request. Without a per-user
// cap, a single logged-in user (or bot with stolen session) could drain the
// key. This wraps every authenticated call in a rolling 60-minute counter,
// reusing the existing RateLimitCounter entity (same pattern used by
// apiV1 + mcpServer — see those files for the analogous helper).
//
// The default (60 calls / hour / user) is intentionally conservative for a
// chat assistant. Tune with the COPILOT_RATE_LIMIT_PER_HOUR env var — no code
// change needed. NEVER hardcode a higher number here without also changing
// this comment; the ceiling must remain visible.
const DEFAULT_LIMIT_PER_HOUR = 60;

async function checkRateLimit(base44, userId) {
  const envRaw = Deno.env.get('COPILOT_RATE_LIMIT_PER_HOUR');
  const parsed = envRaw ? parseInt(envRaw, 10) : NaN;
  const limit = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LIMIT_PER_HOUR;
  const now = new Date();
  // 60-minute rolling windows aligned to the top of the hour.
  const windowStart = new Date(Math.floor(now.getTime() / 3600000) * 3600000).toISOString();
  const reset = new Date(new Date(windowStart).getTime() + 3600000).toISOString();
  const principalId = `copilot:${userId}`;

  const matches = await base44.asServiceRole.entities.RateLimitCounter.filter({
    principal_id: principalId,
    window_start: windowStart,
  });
  let counter = matches?.[0];
  if (!counter) {
    await base44.asServiceRole.entities.RateLimitCounter.create({
      principal_id: principalId,
      principal_type: 'oauth_token',
      window_start: windowStart,
      count: 1,
      limit_per_minute: limit, // schema field name — reused as the hour cap here
    });
    return { ok: true, remaining: limit - 1, limit, reset };
  }
  if ((counter.count || 0) >= limit) {
    return { ok: false, remaining: 0, limit, reset };
  }
  await base44.asServiceRole.entities.RateLimitCounter.update(counter.id, {
    count: (counter.count || 0) + 1,
  });
  return { ok: true, remaining: limit - (counter.count || 0) - 1, limit, reset };
}

function buildFallbackAnswer(question, pageTitle, pageDescription, nextStep) {
  const q = (question || '').toLowerCase();
  if (q.includes('tpe') || q.includes('terminal') || q.includes('datáfono') || q.includes('card machine')) {
    return `Estás en ${pageTitle}. ${pageDescription} Para el TPE, dinos solo lo básico: proveedor, cuántos terminales usas, cuánto pagas al mes, cuánto vendes en tienda y qué comisión te cobran. Siguiente paso recomendado: ${nextStep || 'completa el análisis.'}`;
  }
  if (q.includes('shipping') || q.includes('envío')) {
    return `Estás en ${pageTitle}. ${pageDescription} Para envíos, comparte tu gasto mensual y número de envíos. Siguiente paso recomendado: ${nextStep || 'continúa con el análisis.'}`;
  }
  if (q.includes('payment') || q.includes('pago') || q.includes('psp')) {
    return `Estás en ${pageTitle}. ${pageDescription} Para pagos online, comparte proveedor y comisión aproximada. Siguiente paso recomendado: ${nextStep || 'continúa con el análisis.'}`;
  }
  return `Estás en ${pageTitle}. ${pageDescription} Te guío paso a paso con respuestas cortas. Siguiente paso recomendado: ${nextStep || 'continúa.'}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // ── Authorization gate ──
    // Reject anonymous/unauthenticated callers. Without this, any traffic that
    // reaches the function URL would burn OpenAI credits — the gate the copilot
    // never had.
    let user;
    try {
      user = await base44.auth.me();
    } catch {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Per-user rate limit ──
    const rl = await checkRateLimit(base44, user.id);
    if (!rl.ok) {
      return Response.json(
        {
          error: 'Rate limit exceeded — try again later.',
          limit: rl.limit,
          reset: rl.reset,
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(rl.limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rl.reset,
          },
        },
      );
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY') || '';
    const body = await req.json();
    const payload = body?.payload || body || {};
    const question = payload?.question || '';
    const pageTitle = payload?.pageTitle || 'this page';
    const pageDescription = payload?.pageDescription || '';
    const nextStep = payload?.nextStep || '';
    const brandContext = payload?.brandContext || null;

    const brandInfo = brandContext
      ? `\n\nBrand context: ${brandContext.brandName || "Unknown"} (${brandContext.country || "EU"}), category: ${brandContext.category || "unknown"}, infra score: ${brandContext.infraScore ?? "not analyzed yet"}, estimated savings: €${Math.round(brandContext.totalSavings || 0)}/yr, data source: ${brandContext.dataSource || "manual"}.`
      : "";

    const systemPrompt = `You are Cambra Copilot — the in-app assistant for CAMBRA. You know the product deeply (see knowledge base below) and answer any user question about it: what CAMBRA does, how it works, pricing, security, verticals, and next steps.

Rules:
- Answer in the same language as the user.
- Be direct, brief, practical. No hype, no jargon, no rambling. Short sentences.
- Ground every answer in the knowledge base — never invent features, prices, or claims.
- Always end with one concrete next action (e.g. "Run the Analyzer", "Connect your Stripe", "Upload an invoice").
- If the user asks pricing: quote the FULL rule — "Analyzer is free · SaaS savings 0% fee · Payments & Shipping = 25% of verified savings over 24 months, no savings no fee". Never quote 25% alone.
- If unsure, say so and point to /Contact or /Help.

${CAMBRA_KNOWLEDGE}
${brandInfo}`;

    const userPrompt = `Current page title: ${pageTitle}. Current page description: ${pageDescription}. Suggested next step: ${nextStep}. User question: ${question}`;

    if (!apiKey) {
      const fallbackAnswer = buildFallbackAnswer(question, pageTitle, pageDescription, nextStep);
      return Response.json({ answer: fallbackAnswer, fallback: true });
    }

    // Direct fetch to OpenAI (same pattern as founderCopilotAgent → Anthropic).
    // The npm:openai SDK swallows errors silently inside Deno's runtime;
    // fetch gives us real error surfaces + zero package resolution overhead.
    try {
      const oaRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.4,
        }),
      });
      const data = await oaRes.json();
      if (!oaRes.ok) {
        console.error('OpenAI error', oaRes.status, data?.error?.message || data);
        const fallbackAnswer = buildFallbackAnswer(question, pageTitle, pageDescription, nextStep);
        return Response.json({ answer: fallbackAnswer, fallback: true, upstream_error: data?.error?.message || `HTTP ${oaRes.status}` });
      }
      const answer = data?.choices?.[0]?.message?.content || buildFallbackAnswer(question, pageTitle, pageDescription, nextStep);
      return Response.json(
        { answer },
        {
          headers: {
            'X-RateLimit-Limit': String(rl.limit),
            'X-RateLimit-Remaining': String(rl.remaining),
            'X-RateLimit-Reset': rl.reset,
          },
        },
      );
    } catch (openaiError) {
      console.error('OpenAI fetch failed', openaiError?.message);
      const fallbackAnswer = buildFallbackAnswer(question, pageTitle, pageDescription, nextStep);
      return Response.json({ answer: fallbackAnswer, fallback: true });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});