// COMMAND-C5 (2026-08-17) — provider routing for CAMBRA Command.
//
// Two providers, chosen by what the STEP needs, never by what a provider
// prefers. Every routing decision — including refusals — is recorded as a
// ModelRouteDecision, because "the model declined to answer" and "we never
// asked" are otherwise indistinguishable after the fact.
//
// The invariant inherited from commercialModelRouter.ts and NOT relaxed here:
//
//   > A non-2xx response is still post-transport. The provider exposes no
//   > reconciliation guarantee for this request, so there is no model fallback.
//
// Adding a second provider does not make post-transport failover safe. Failing
// over after a request has left could double-spend and, for anything with an
// effect, double-act. So this router fails over ONLY pre-transport: a provider
// that is not configured, or that refused before the request went out. Once
// transport starts, an unclear outcome is REVIEW_REQUIRED and the run stops.
//
// The OpenAI adapter here is written fresh rather than extracted from
// processUploadedFile/entry.ts. That file is frozen production evidence code;
// extracting from it would force a freeze update for no functional gain.

import { reservePaidOperation, settlePaidOperation } from './costGovernance.ts';
import { extractAnthropicText } from './anthropicResponse.ts';
// COMMAND-C7: the tool-format translation layer that makes tool-use dual-provider.
import {
  readCallForProvider, toolResultMessage, toolsForProvider, validateToolSet,
} from './commandToolFormat.ts';

export const COMMAND_MODEL_ROUTER_VERSION = 'command-model-router-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();

export const TASK_CLASSES = Object.freeze([
  'PLANNING', 'REASONING', 'DRAFTING', 'EXTRACTION',
  'CLASSIFICATION', 'SUMMARISATION', 'CODE', 'OTHER',
] as const);

export type TaskClass = typeof TASK_CLASSES[number];
export type Provider = 'anthropic' | 'openai';

/**
 * Which provider a task class prefers, and the ordered alternatives.
 *
 * These are routing preferences, not quality claims: EXTRACTION prefers OpenAI
 * because the structured-output path (`text.format.json_schema`, strict) is what
 * the document pipeline already relies on, and CODE/REASONING prefer Anthropic
 * because that is what every existing CAMBRA reasoning path uses today.
 */
export const TASK_CLASS_ROUTES: Record<TaskClass, Provider[]> = Object.freeze({
  PLANNING: ['anthropic', 'openai'],
  REASONING: ['anthropic', 'openai'],
  CODE: ['anthropic', 'openai'],
  DRAFTING: ['anthropic', 'openai'],
  SUMMARISATION: ['anthropic', 'openai'],
  EXTRACTION: ['openai', 'anthropic'],
  CLASSIFICATION: ['openai', 'anthropic'],
  OTHER: ['anthropic', 'openai'],
});

export type RouteOutcome = 'ANSWERED' | 'FAILED_OVER' | 'REFUSED' | 'ERRORED' | 'REVIEW_REQUIRED';
export type RouteReason =
  | 'TASK_CLASS_DEFAULT' | 'EXPLICIT_REQUEST' | 'PRIMARY_UNAVAILABLE_FAILOVER'
  | 'COST_CEILING' | 'CAPABILITY_REQUIRED' | 'EMERGENCY_REFUSAL' | 'NO_PROVIDER_CONFIGURED';

/**
 * Resolves the provider order for a request.
 *
 * An explicit request is honoured only if that provider is configured. A request
 * for an unconfigured provider is NOT silently swapped — the caller asked for
 * something specific, and quietly answering with a different model would make
 * the answer's provenance a lie. It falls through with `PRIMARY_UNAVAILABLE_FAILOVER`
 * so the recorded reason says what happened.
 */
export function resolveRoute(input: {
  task_class: unknown;
  requested_provider?: unknown;
  configured: { anthropic: boolean; openai: boolean };
}): { order: Provider[]; reason: RouteReason; rejected: Record<string, string> } {
  const taskClass = (TASK_CLASSES as readonly string[]).includes(text(input.task_class).toUpperCase())
    ? text(input.task_class).toUpperCase() as TaskClass
    : 'OTHER';
  const rejected: Record<string, string> = {};
  const available = (provider: Provider) => input.configured?.[provider] === true;
  for (const provider of ['anthropic', 'openai'] as Provider[]) {
    if (!available(provider)) rejected[provider] = 'not_configured';
  }

  const requested = text(input.requested_provider).toLowerCase();
  if (requested === 'anthropic' || requested === 'openai') {
    if (available(requested as Provider)) {
      return { order: [requested as Provider], reason: 'EXPLICIT_REQUEST', rejected };
    }
    // Asked for a provider that is not configured. Fall through to the default
    // order rather than pretending the request was honoured.
    const order = TASK_CLASS_ROUTES[taskClass].filter(available);
    return {
      order,
      reason: order.length ? 'PRIMARY_UNAVAILABLE_FAILOVER' : 'NO_PROVIDER_CONFIGURED',
      rejected,
    };
  }

  const order = TASK_CLASS_ROUTES[taskClass].filter(available);
  return {
    order,
    reason: order.length ? 'TASK_CLASS_DEFAULT' : 'NO_PROVIDER_CONFIGURED',
    rejected,
  };
}

/** Extracts the assistant text from an OpenAI /v1/responses payload. */
export function extractOpenAiText(payload: any): string {
  if (text(payload?.output_text)) return text(payload.output_text);
  const parts: string[] = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const chunk of Array.isArray(item?.content) ? item.content : []) {
      if (text(chunk?.text)) parts.push(text(chunk.text));
    }
  }
  // Older chat-completions shape, in case the account is pinned to it.
  if (!parts.length && text(payload?.choices?.[0]?.message?.content)) {
    parts.push(text(payload.choices[0].message.content));
  }
  return parts.join('\n').trim();
}

export type ProviderCall = {
  ok: boolean;
  /** True the moment the request left the process. Governs whether failover is legal. */
  transport_started: boolean;
  text?: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  http_status?: number;
  error_code?: string;
};

/**
 * The decision record for one routed step. Written for EVERY call, including
 * refusals — `provider_call_performed: false` is the field that distinguishes
 * "refused" from "never asked".
 */
export function buildRouteDecision(input: {
  decision_id: string;
  run_id?: string;
  conversation_id?: string;
  step_key?: string;
  task_class: TaskClass;
  requested_provider?: string;
  selected_provider: Provider | 'none';
  selected_model?: string;
  route_reason: RouteReason;
  route_outcome: RouteOutcome;
  considered: Provider[];
  rejected: Record<string, string>;
  failover_from?: Provider | null;
  failover_reason?: string | null;
  provider_call_performed: boolean;
  emergency_control_revision?: number | null;
  emergency_blocked?: boolean;
  cost_event_id?: string | null;
  input_tokens?: number;
  output_tokens?: number;
  error_code?: string | null;
  now: string;
}) {
  return {
    decision_id: input.decision_id,
    run_id: text(input.run_id),
    conversation_id: text(input.conversation_id),
    step_key: text(input.step_key),
    task_class: input.task_class,
    requested_provider: text(input.requested_provider),
    selected_provider: input.selected_provider,
    selected_model: text(input.selected_model),
    route_reason: input.route_reason,
    route_outcome: input.route_outcome,
    considered_providers: [...input.considered],
    rejected_providers_json: { ...input.rejected },
    failover_from_provider: input.failover_from || '',
    failover_reason: text(input.failover_reason),
    provider_call_performed: input.provider_call_performed === true,
    emergency_control_revision: input.emergency_control_revision ?? null,
    emergency_blocked: input.emergency_blocked === true,
    cost_event_id: text(input.cost_event_id),
    input_tokens: Number(input.input_tokens || 0),
    output_tokens: Number(input.output_tokens || 0),
    error_code: text(input.error_code),
    decided_at: input.now,
    created_at: input.now,
  };
}

/**
 * Routes one prompt.
 *
 * `callProvider` is injected so the routing logic — which is where the safety
 * properties live — is testable without a network or a live key.
 */
export async function routeModelCall(input: {
  prompt: string;
  task_class: unknown;
  requested_provider?: string;
  configured: { anthropic: boolean; openai: boolean };
  now: () => string;
  newId: () => string;
  callProvider: (provider: Provider, prompt: string) => Promise<ProviderCall>;
  /** Reads the AI-spend emergency posture. Unreadable must block, not pass. */
  readEmergency?: () => Promise<{ available: boolean; blocked: boolean; revision: number | null }>;
  persistDecision?: (row: any) => Promise<any>;
  run_id?: string;
  conversation_id?: string;
  step_key?: string;
}) {
  const now = input.now();
  const taskClass = (TASK_CLASSES as readonly string[]).includes(text(input.task_class).toUpperCase())
    ? text(input.task_class).toUpperCase() as TaskClass
    : 'OTHER';
  const route = resolveRoute({
    task_class: taskClass, requested_provider: input.requested_provider, configured: input.configured,
  });

  const record = async (row: any) => {
    if (input.persistDecision) await input.persistDecision(row).catch(() => null);
    return row;
  };
  const decide = (over: Partial<Parameters<typeof buildRouteDecision>[0]>) => buildRouteDecision({
    decision_id: input.newId(),
    run_id: input.run_id, conversation_id: input.conversation_id, step_key: input.step_key,
    task_class: taskClass,
    requested_provider: input.requested_provider,
    selected_provider: 'none',
    route_reason: route.reason,
    route_outcome: 'REFUSED',
    considered: route.order,
    rejected: route.rejected,
    provider_call_performed: false,
    now,
    ...over,
  } as any);

  // --- emergency posture, before any spend --------------------------------
  let emergencyRevision: number | null = null;
  if (input.readEmergency) {
    const posture = await input.readEmergency();
    emergencyRevision = posture?.revision ?? null;
    if (!posture?.available) {
      const row = await record(decide({
        route_reason: 'EMERGENCY_REFUSAL', route_outcome: 'REFUSED',
        emergency_blocked: true, emergency_control_revision: null,
        error_code: 'emergency_control_unreadable',
      }));
      return { ok: false, decision: row, text: null, blockers: ['emergency_control_unreadable'] };
    }
    if (posture.blocked) {
      // No provider call is made. This is the row the AI-spend coverage test
      // asserts on: refused, with provider_call_performed false.
      const row = await record(decide({
        route_reason: 'EMERGENCY_REFUSAL', route_outcome: 'REFUSED',
        emergency_blocked: true, emergency_control_revision: emergencyRevision,
        error_code: 'ai_spend_emergency_engaged',
      }));
      return { ok: false, decision: row, text: null, blockers: ['ai_spend_emergency_engaged'] };
    }
  }

  if (!route.order.length) {
    const row = await record(decide({
      route_reason: 'NO_PROVIDER_CONFIGURED', route_outcome: 'REFUSED',
      emergency_control_revision: emergencyRevision, error_code: 'no_provider_configured',
    }));
    return { ok: false, decision: row, text: null, blockers: ['no_provider_configured'] };
  }

  // --- attempt providers in order, PRE-TRANSPORT failover only ------------
  let failoverFrom: Provider | null = null;
  let failoverReason: string | null = null;

  for (let index = 0; index < route.order.length; index += 1) {
    const provider = route.order[index];
    let call: ProviderCall;
    try {
      call = await input.callProvider(provider, input.prompt);
    } catch (error: any) {
      // A thrown adapter is treated as post-transport unless it says otherwise.
      // Assuming the request never left would be the optimistic reading, and the
      // optimistic reading is the one that double-spends.
      call = {
        ok: false,
        transport_started: error?.transport_started !== false,
        error_code: text(error?.code || error?.message) || 'provider_threw',
      };
    }

    if (call.ok) {
      const row = await record(decide({
        selected_provider: provider,
        selected_model: call.model,
        route_reason: failoverFrom ? 'PRIMARY_UNAVAILABLE_FAILOVER' : route.reason,
        route_outcome: failoverFrom ? 'FAILED_OVER' : 'ANSWERED',
        failover_from: failoverFrom, failover_reason: failoverReason,
        provider_call_performed: true,
        emergency_control_revision: emergencyRevision,
        input_tokens: call.input_tokens, output_tokens: call.output_tokens,
      }));
      return { ok: true, decision: row, text: call.text || '', blockers: [] };
    }

    if (call.transport_started) {
      // The request left. We cannot know whether it was billed or acted on, so
      // there is no failover and no retry — the same rule the Anthropic-only
      // router already enforced.
      const row = await record(decide({
        selected_provider: provider, selected_model: call.model,
        route_outcome: 'REVIEW_REQUIRED',
        failover_from: failoverFrom, failover_reason: failoverReason,
        // Transport started, so a call WAS performed even though it failed.
        provider_call_performed: true,
        emergency_control_revision: emergencyRevision,
        error_code: call.error_code || `provider_http_${call.http_status || 0}`,
      }));
      return {
        ok: false, decision: row, text: null,
        blockers: ['provider_effect_review_required_no_failover'],
      };
    }

    // Pre-transport failure: nothing left the process, so trying the next
    // provider cannot double anything.
    route.rejected[provider] = call.error_code || 'pre_transport_failure';
    failoverFrom = provider;
    failoverReason = call.error_code || 'pre_transport_failure';
  }

  const row = await record(decide({
    route_outcome: 'ERRORED',
    route_reason: 'PRIMARY_UNAVAILABLE_FAILOVER',
    failover_from: failoverFrom, failover_reason: failoverReason,
    emergency_control_revision: emergencyRevision,
    error_code: 'all_providers_unavailable_pre_transport',
  }));
  return { ok: false, decision: row, text: null, blockers: ['all_providers_unavailable_pre_transport'] };
}

/**
 * Anthropic adapter. Reports `transport_started` honestly so the router can tell
 * a pre-transport refusal from a post-transport unknown.
 */
export async function anthropicAdapter(svc: any, opts: {
  prompt: string; model: string; apiKey: string; maxTokens?: number; eventKey: string; source: string;
}): Promise<ProviderCall> {
  const reservation = await reservePaidOperation(svc, {
    event_key: `ai:${opts.source}:anthropic:${opts.eventKey}`,
    category: 'ai', provider: 'anthropic', source: opts.source,
  });
  const transport = { started: false };
  try {
    transport.started = true;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': opts.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: opts.model, max_tokens: opts.maxTokens || 2200, messages: [{ role: 'user', content: opts.prompt }] }),
    });
    const data = await response.json().catch(() => ({}));
    const usage = { input_tokens: Number(data?.usage?.input_tokens || 0), output_tokens: Number(data?.usage?.output_tokens || 0) };
    await settlePaidOperation(svc, reservation, { ok: response.ok, usage_json: { model: opts.model, ...usage } });
    if (!response.ok) {
      return { ok: false, transport_started: true, http_status: response.status, model: opts.model, error_code: `anthropic_http_${response.status}` };
    }
    const body = extractAnthropicText(data);
    if (!body) return { ok: false, transport_started: true, model: opts.model, error_code: 'anthropic_response_text_unverified' };
    return { ok: true, transport_started: true, text: body, model: opts.model, ...usage };
  } catch (error: any) {
    await settlePaidOperation(svc, reservation, { ok: false, usage_json: { model: opts.model } }).catch(() => null);
    return { ok: false, transport_started: transport.started, model: opts.model, error_code: text(error?.message) || 'anthropic_unavailable' };
  }
}

/**
 * OpenAI adapter, written for this router.
 *
 * Uses `/v1/responses` with `store: false` — Command prompts contain founder
 * business context and must not be retained by the provider for training or
 * history.
 */
export async function openAiAdapter(svc: any, opts: {
  prompt: string; model: string; apiKey: string; maxTokens?: number; eventKey: string; source: string;
}): Promise<ProviderCall> {
  const reservation = await reservePaidOperation(svc, {
    event_key: `ai:${opts.source}:openai:${opts.eventKey}`,
    category: 'ai', provider: 'openai', source: opts.source,
  });
  const transport = { started: false };
  try {
    transport.started = true;
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opts.model, store: false, temperature: 0,
        max_output_tokens: opts.maxTokens || 2200,
        input: [{ role: 'user', content: opts.prompt }],
      }),
    });
    const data = await response.json().catch(() => ({}));
    const usage = {
      input_tokens: Number(data?.usage?.input_tokens || 0),
      output_tokens: Number(data?.usage?.output_tokens || 0),
    };
    await settlePaidOperation(svc, reservation, { ok: response.ok, usage_json: { model: opts.model, ...usage } });
    if (!response.ok) {
      return { ok: false, transport_started: true, http_status: response.status, model: opts.model, error_code: `openai_http_${response.status}` };
    }
    const body = extractOpenAiText(data);
    if (!body) return { ok: false, transport_started: true, model: opts.model, error_code: 'openai_response_text_unverified' };
    return { ok: true, transport_started: true, text: body, model: opts.model, ...usage };
  } catch (error: any) {
    await settlePaidOperation(svc, reservation, { ok: false, usage_json: { model: opts.model } }).catch(() => null);
    return { ok: false, transport_started: transport.started, model: opts.model, error_code: text(error?.message) || 'openai_unavailable' };
  }
}

/**
 * COMMAND-C5 — a drop-in for plain prompt->text callers that were pinned to
 * Anthropic via `callCambraClaude`.
 *
 * It resolves configuration from the environment, routes by task class, persists
 * the ModelRouteDecision, and returns `{ text, model, provider, decision }`.
 *
 * Note on the emergency gate: both adapters call `reservePaidOperation` with
 * `category: 'ai'`, which maps onto the `paid_discovery` emergency capability, so
 * a safe-mode row already blocks the spend inside the adapter. The optional
 * `readEmergency` here is an EARLIER refusal — it avoids reserving at all — not
 * the only line of defence.
 *
 * Callers needing tool-use (Anthropic `tools` / OpenAI function calling) must NOT
 * use this: the two providers' tool formats differ and no translation layer
 * exists yet. Those callers stay on their provider-specific path.
 */
export async function callCambraModel(prompt: string, opts: {
  svc: any;
  task_class?: TaskClass | string;
  requested_provider?: string;
  maxTokens?: number;
  eventKey: string;
  source: string;
  run_id?: string;
  conversation_id?: string;
  step_key?: string;
}) {
  if (!opts?.svc) throw new Error('cost_service_context_required');
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') || '';
  const openAiKey = Deno.env.get('OPENAI_API_KEY') || '';
  const anthropicModel = Deno.env.get('ANTHROPIC_OPUS_MODEL') || 'claude-opus-5';
  const openAiModel = Deno.env.get('OPENAI_COMMAND_MODEL') || 'gpt-4.1';

  const routed = await routeModelCall({
    prompt,
    task_class: opts.task_class || 'REASONING',
    requested_provider: opts.requested_provider,
    configured: { anthropic: Boolean(anthropicKey), openai: Boolean(openAiKey) },
    now: () => new Date().toISOString(),
    newId: () => crypto.randomUUID(),
    run_id: opts.run_id, conversation_id: opts.conversation_id, step_key: opts.step_key,
    callProvider: (provider, body) => provider === 'anthropic'
      ? anthropicAdapter(opts.svc, {
        prompt: body, model: anthropicModel, apiKey: anthropicKey,
        maxTokens: opts.maxTokens, eventKey: opts.eventKey, source: opts.source,
      })
      : openAiAdapter(opts.svc, {
        prompt: body, model: openAiModel, apiKey: openAiKey,
        maxTokens: opts.maxTokens, eventKey: opts.eventKey, source: opts.source,
      }),
    persistDecision: async (row) => {
      // The decision row is evidence, not a precondition. A failed write must not
      // fail the answer, but it must also not be silent.
      try { return await opts.svc.entities.ModelRouteDecision.create(row); }
      catch (error) {
        console.error(JSON.stringify({ event: 'model_route_decision_unpersisted', source: opts.source, error: String((error as any)?.message || error).slice(0, 160) }));
        return null;
      }
    },
  });

  if (!routed.ok) {
    throw Object.assign(new Error(routed.blockers[0] || 'model_route_failed'), {
      code: routed.decision?.route_outcome === 'REVIEW_REQUIRED'
        ? 'PROVIDER_EFFECT_REVIEW_REQUIRED' : 'MODEL_ROUTE_REFUSED',
      review_required: routed.decision?.route_outcome === 'REVIEW_REQUIRED',
      automatic_retry_blocked: true,
      decision: routed.decision,
    });
  }
  return {
    text: routed.text || '',
    model: routed.decision.selected_model,
    provider: routed.decision.selected_provider,
    decision: routed.decision,
  };
}

/**
 * COMMAND-C7 — a tool-capable routed call.
 *
 * C5 shipped `callCambraModel` for plain prompt->text and said explicitly that
 * tool-use callers had to stay provider-specific, because the two wire formats
 * differ. commandToolFormat.ts closes that, so this exists: the loop can now take
 * a tool-calling step on either provider and never learn which answered.
 *
 * Conversation state stays PROVIDER-NATIVE and is rebuilt per call from the
 * canonical history. Translating an accumulated transcript between formats on
 * every turn is where a field gets silently dropped; rebuilding from one
 * canonical source cannot drift.
 */
export async function routeToolCall(input: {
  svc: any;
  /** Canonical history: user text plus prior (call, result) pairs. */
  history: Array<
    | { kind: 'user'; text: string }
    | { kind: 'assistant'; text: string; call?: { name: string; input: any; call_id: string } | null }
    | { kind: 'tool_result'; call_id: string; tool_name: string; result: unknown; is_error?: boolean }
  >;
  tools: any[];
  system?: string;
  task_class?: TaskClass | string;
  requested_provider?: string;
  maxTokens?: number;
  eventKey: string;
  source: string;
  run_id?: string;
  conversation_id?: string;
  step_key?: string;
  readEmergency?: Parameters<typeof routeModelCall>[0]['readEmergency'];
}) {
  if (!input?.svc) throw new Error('cost_service_context_required');
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') || '';
  const openAiKey = Deno.env.get('OPENAI_API_KEY') || '';
  const anthropicModel = Deno.env.get('ANTHROPIC_STANDARD_MODEL') || 'claude-sonnet-5';
  const openAiModel = Deno.env.get('OPENAI_COMMAND_MODEL') || 'gpt-4.1';

  const toolSet = validateToolSet(input.tools);
  if (!toolSet.ok) {
    // A tool the wire format cannot carry must be reported. Dropping it would
    // make the model unable to request something the registry says exists, with
    // no error anywhere.
    throw Object.assign(new Error('tool_set_not_declarable'), {
      code: 'TOOL_SET_NOT_DECLARABLE', rejected: toolSet.rejected,
    });
  }

  /** Rebuilds the provider-native transcript from canonical history. */
  const transcriptFor = (provider: Provider) => {
    if (provider === 'openai') {
      const rows: any[] = [];
      for (const entry of input.history) {
        if (entry.kind === 'user') rows.push({ role: 'user', content: entry.text });
        else if (entry.kind === 'assistant') {
          if (text(entry.text)) rows.push({ role: 'assistant', content: entry.text });
          if (entry.call) {
            rows.push({
              type: 'function_call', call_id: entry.call.call_id,
              name: entry.call.name, arguments: JSON.stringify(entry.call.input ?? {}),
            });
          }
        } else rows.push(toolResultMessage('openai', entry));
      }
      return rows;
    }
    const rows: any[] = [];
    for (const entry of input.history) {
      if (entry.kind === 'user') rows.push({ role: 'user', content: entry.text });
      else if (entry.kind === 'assistant') {
        const content: any[] = [];
        if (text(entry.text)) content.push({ type: 'text', text: entry.text });
        if (entry.call) {
          content.push({
            type: 'tool_use', id: entry.call.call_id,
            name: entry.call.name, input: entry.call.input ?? {},
          });
        }
        if (content.length) rows.push({ role: 'assistant', content });
      } else rows.push(toolResultMessage('anthropic', entry));
    }
    return rows;
  };

  let answered: { provider: Provider; payload: any } | null = null;

  const routed = await routeModelCall({
    prompt: '',   // the transcript carries the request; no flat prompt is sent
    task_class: input.task_class || 'PLANNING',
    requested_provider: input.requested_provider,
    configured: { anthropic: Boolean(anthropicKey), openai: Boolean(openAiKey) },
    now: () => new Date().toISOString(),
    newId: () => crypto.randomUUID(),
    run_id: input.run_id, conversation_id: input.conversation_id, step_key: input.step_key,
    readEmergency: input.readEmergency,
    callProvider: async (provider) => {
      const reservation = await reservePaidOperation(input.svc, {
        event_key: `ai:${input.source}:${provider}:tools:${input.eventKey}`,
        category: 'ai', provider, source: input.source,
      });
      const transport = { started: false };
      const model = provider === 'anthropic' ? anthropicModel : openAiModel;
      try {
        transport.started = true;
        const response = provider === 'anthropic'
          ? await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
              model, max_tokens: input.maxTokens || 2200,
              ...(text(input.system) ? { system: input.system } : {}),
              tools: toolsForProvider('anthropic', input.tools),
              messages: transcriptFor('anthropic'),
            }),
          })
          : await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: { Authorization: `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model, store: false, temperature: 0,
              max_output_tokens: input.maxTokens || 2200,
              ...(text(input.system) ? { instructions: input.system } : {}),
              tools: toolsForProvider('openai', input.tools),
              input: transcriptFor('openai'),
            }),
          });
        const data = await response.json().catch(() => ({}));
        const usage = {
          input_tokens: Number(data?.usage?.input_tokens || 0),
          output_tokens: Number(data?.usage?.output_tokens || 0),
        };
        await settlePaidOperation(input.svc, reservation, { ok: response.ok, usage_json: { model, ...usage } });
        if (!response.ok) {
          return { ok: false, transport_started: true, http_status: response.status, model, error_code: `${provider}_http_${response.status}` };
        }
        answered = { provider, payload: data };
        return { ok: true, transport_started: true, model, text: '', ...usage };
      } catch (error: any) {
        await settlePaidOperation(input.svc, reservation, { ok: false, usage_json: { model } }).catch(() => null);
        return { ok: false, transport_started: transport.started, model, error_code: text(error?.message) || `${provider}_unavailable` };
      }
    },
    persistDecision: async (row) => {
      try { return await input.svc.entities.ModelRouteDecision.create(row); }
      catch (error) {
        console.error(JSON.stringify({ event: 'model_route_decision_unpersisted', source: input.source, error: String((error as any)?.message || error).slice(0, 160) }));
        return null;
      }
    },
  });

  if (!routed.ok || !answered) {
    throw Object.assign(new Error(routed.blockers[0] || 'model_route_failed'), {
      code: routed.decision?.route_outcome === 'REVIEW_REQUIRED'
        ? 'PROVIDER_EFFECT_REVIEW_REQUIRED' : 'MODEL_ROUTE_REFUSED',
      review_required: routed.decision?.route_outcome === 'REVIEW_REQUIRED',
      automatic_retry_blocked: true,
      decision: routed.decision,
    });
  }

  const read = readCallForProvider(answered.provider, answered.payload);
  return {
    text: read.text,
    call: read.call,
    // Surfaced so a caller can tell "the model chose not to use a tool" from
    // "we could not read the tool it chose".
    tool_parse_failed: (read as any).parse_failed === true,
    provider: answered.provider,
    model: routed.decision.selected_model,
    decision: routed.decision,
  };
}
