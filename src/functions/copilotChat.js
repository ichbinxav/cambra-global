/* global Deno */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const question = body?.question || '';
    const pageTitle = body?.pageTitle || 'this page';
    const pageDescription = body?.pageDescription || '';
    const nextStep = body?.nextStep || '';

    const prompt = `You are Cambra Copilot, a concise in-app assistant for a commerce savings platform. Answer in the same language as the user's question. Be short, clear, and practical. You do two things: 1) explain the current page in simple words, 2) answer the user's free-form question. Current page title: ${pageTitle}. Current page description: ${pageDescription}. Suggested next step: ${nextStep}. User question: ${question}`;

    const answer = await base44.integrations.Core.InvokeLLM({
      prompt,
    });

    return Response.json({ answer });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});