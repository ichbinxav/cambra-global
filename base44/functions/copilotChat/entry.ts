import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import OpenAI from 'npm:openai@4.104.0';

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
    const openai = apiKey ? new OpenAI({ apiKey }) : null;
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

    const systemPrompt = `You are Cambra Copilot, a sleek and sharp in-app assistant for Cambra. Answer in the same language as the user. Be direct, brief, practical, and never ramble. Prioritize quick and easy actions. Your main goal is to guide the user to do the Analyzer and connect their tools. Explain the current page in one simple sentence if useful, then answer the question with crisp guidance. Prefer short sentences. Suggest concrete next actions like starting the Analyzer, uploading a file, or connecting tools. Also include TPE / in-store card terminals in the Analyzer. The audit should not only cover online PSP costs, but also physical payment terminals used in retail stores, pop-ups, showrooms or events. Ask users about their TPE provider, monthly rental fees, transaction fees, contract duration, terminal count, in-store GMV, average ticket, card mix and any fixed banking/maintenance fees. The Analyzer should calculate the effective in-store payment rate, compare it with benchmark collective rates, estimate savings, and show TPE as a separate line inside the Payments Audit.${brandInfo}`;

    const userPrompt = `Current page title: ${pageTitle}. Current page description: ${pageDescription}. Suggested next step: ${nextStep}. User question: ${question}`;

    if (!openai) {
      const fallbackAnswer = buildFallbackAnswer(question, pageTitle, pageDescription, nextStep);
      return Response.json({ answer: fallbackAnswer, fallback: true });
    }

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
      });

      const answer = response.choices?.[0]?.message?.content || buildFallbackAnswer(question, pageTitle, pageDescription, nextStep);
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
    } catch (_openaiError) {
      const fallbackAnswer = buildFallbackAnswer(question, pageTitle, pageDescription, nextStep);
      return Response.json({ answer: fallbackAnswer, fallback: true });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});