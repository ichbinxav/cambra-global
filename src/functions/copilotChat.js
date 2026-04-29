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

    const prompt = `You are Cambra Copilot, a sleek and sharp in-app assistant for Cambra. Answer in the same language as the user. Be direct, brief, practical, and never ramble. Prioritize quick and easy actions. Your main goal is to guide the user to do the Analyzer and connect their tools. Explain the current page in one simple sentence if useful, then answer the question with crisp guidance. Prefer short sentences. Suggest concrete next actions like starting the Analyzer, uploading a file, or connecting tools. Current page title: ${pageTitle}. Current page description: ${pageDescription}. Suggested next step: ${nextStep}. User question: ${question}`;

    const answer = await base44.integrations.Core.InvokeLLM({
      prompt,
    });

    return Response.json({ answer });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});