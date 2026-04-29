import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import OpenAI from 'npm:openai@4.104.0';

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

const openai = new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY'),
});

Deno.serve(async (req) => {
  try {
    createClientFromRequest(req);
    const body = await req.json();
    const payload = body?.payload || body || {};
    const question = payload?.question || '';
    const pageTitle = payload?.pageTitle || 'this page';
    const pageDescription = payload?.pageDescription || '';
    const nextStep = payload?.nextStep || '';

    const systemPrompt = `You are Cambra Copilot, a sleek and sharp in-app assistant for Cambra. Answer in the same language as the user. Be direct, brief, practical, and never ramble. Prioritize quick and easy actions. Your main goal is to guide the user to do the Analyzer and connect their tools. Explain the current page in one simple sentence if useful, then answer the question with crisp guidance. Prefer short sentences. Suggest concrete next actions like starting the Analyzer, uploading a file, or connecting tools. Also include TPE / in-store card terminals in the Analyzer. The audit should not only cover online PSP costs, but also physical payment terminals used in retail stores, pop-ups, showrooms or events. Ask users about their TPE provider, monthly rental fees, transaction fees, contract duration, terminal count, in-store GMV, average ticket, card mix and any fixed banking/maintenance fees. The Analyzer should calculate the effective in-store payment rate, compare it with benchmark collective rates, estimate savings, and show TPE as a separate line inside the Payments Audit.`;

    const userPrompt = `Current page title: ${pageTitle}. Current page description: ${pageDescription}. Suggested next step: ${nextStep}. User question: ${question}`;

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
      return Response.json({ answer });
    } catch (_openaiError) {
      const fallbackAnswer = buildFallbackAnswer(question, pageTitle, pageDescription, nextStep);
      return Response.json({ answer: fallbackAnswer, fallback: true });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});