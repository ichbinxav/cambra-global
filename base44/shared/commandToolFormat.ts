// COMMAND-C7 (2026-08-17) — tool-format translation between providers.
//
// This is the layer C5 declared missing. Without it the multi-step loop was
// Anthropic-only: the router could route plain prompt->text across both
// providers, but a step that needs tools could not move, because Anthropic
// `tools` / `tool_use` and OpenAI function calling are different wire formats.
//
// The translation is deliberately narrow and total:
//
//  - ONE canonical tool shape (the registry's), projected outward per provider.
//    Nothing is ever translated provider-to-provider directly, so there is no
//    round-trip that can quietly lose a field.
//  - Reading a response is normalised into ONE canonical call shape, so the loop
//    never learns which provider answered.
//  - A response that cannot be parsed yields null, never a guessed tool call.
//    Inventing a tool call from an unparseable response would have the model
//    appear to request something it never requested.

export const COMMAND_TOOL_FORMAT_VERSION = 'command-tool-format-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();

export type CanonicalTool = {
  name: string;
  description: string;
  input_schema: Record<string, any>;
};

export type CanonicalToolCall = {
  name: string;
  input: Record<string, any>;
  /** Provider-side identifier for this call, needed to return its result. */
  call_id: string;
};

/** JSON Schema for a tool that declares no input. */
const EMPTY_SCHEMA = Object.freeze({ type: 'object', properties: {} });

function schemaOf(tool: any): Record<string, any> {
  const schema = tool?.input_schema ?? tool?.parameters;
  if (!schema || typeof schema !== 'object') return { ...EMPTY_SCHEMA };
  return schema;
}

/** Anthropic wire format: `{ name, description, input_schema }`. */
export function toAnthropicTools(tools: any[]): any[] {
  return (Array.isArray(tools) ? tools : [])
    .filter((tool) => text(tool?.name))
    .map((tool) => ({
      name: text(tool.name),
      description: text(tool.description),
      input_schema: schemaOf(tool),
    }));
}

/**
 * OpenAI `/v1/responses` wire format: a flat function tool.
 *
 * `strict: false` is set on purpose. Strict mode requires every property to be
 * listed in `required` and forbids optional fields; the registry's schemas have
 * genuinely optional inputs, and rewriting them to satisfy strict mode would
 * change what the tools accept. A tool contract must not bend to a wire format.
 */
export function toOpenAiTools(tools: any[]): any[] {
  return (Array.isArray(tools) ? tools : [])
    .filter((tool) => text(tool?.name))
    .map((tool) => ({
      type: 'function',
      name: text(tool.name),
      description: text(tool.description),
      parameters: schemaOf(tool),
      strict: false,
    }));
}

/** Projects the canonical tool list into whichever provider is being called. */
export function toolsForProvider(provider: string, tools: any[]): any[] {
  return text(provider).toLowerCase() === 'openai' ? toOpenAiTools(tools) : toAnthropicTools(tools);
}

/**
 * Reads a tool call out of an Anthropic message response.
 *
 * When several tool_use blocks are present the LAST is taken, matching what
 * chatChiefOrchestrator already did — the loop executes one step at a time and
 * changing which block wins would silently change existing behaviour.
 */
export function readAnthropicCall(payload: any): { text: string; call: CanonicalToolCall | null } {
  let body = '';
  let call: CanonicalToolCall | null = null;
  for (const block of Array.isArray(payload?.content) ? payload.content : []) {
    if (block?.type === 'text') body += text(block.text) ? `${text(block.text)}\n` : '';
    if (block?.type === 'tool_use' && text(block?.name)) {
      call = {
        name: text(block.name),
        input: (block.input && typeof block.input === 'object') ? block.input : {},
        call_id: text(block.id),
      };
    }
  }
  return { text: body.trim(), call };
}

/**
 * Reads a tool call out of an OpenAI `/v1/responses` payload.
 *
 * `arguments` arrives as a JSON string. A string that does not parse yields NO
 * call rather than an empty-input call: running a tool with `{}` because we could
 * not read its arguments would execute something nobody asked for.
 */
export function readOpenAiCall(payload: any): { text: string; call: CanonicalToolCall | null; parse_failed?: boolean } {
  const parts: string[] = [];
  let call: CanonicalToolCall | null = null;
  let parseFailed = false;

  const consider = (item: any) => {
    const type = text(item?.type);
    if (type === 'function_call' || type === 'tool_call') {
      const name = text(item?.name) || text(item?.function?.name);
      if (!name) return;
      const raw = item?.arguments ?? item?.function?.arguments;
      let input: Record<string, any> = {};
      if (raw && typeof raw === 'object') input = raw;
      else if (text(raw)) {
        try {
          const parsed = JSON.parse(text(raw));
          input = (parsed && typeof parsed === 'object') ? parsed : {};
        } catch { parseFailed = true; return; }
      }
      call = { name, input, call_id: text(item?.call_id) || text(item?.id) };
      return;
    }
    for (const chunk of Array.isArray(item?.content) ? item.content : []) {
      if (text(chunk?.text)) parts.push(text(chunk.text));
    }
  };

  for (const item of Array.isArray(payload?.output) ? payload.output : []) consider(item);
  // Chat-completions shape, in case the account is pinned to it.
  for (const item of Array.isArray(payload?.choices?.[0]?.message?.tool_calls) ? payload.choices[0].message.tool_calls : []) {
    consider({ ...item, type: 'tool_call' });
  }
  if (!parts.length && text(payload?.output_text)) parts.push(text(payload.output_text));
  if (!parts.length && text(payload?.choices?.[0]?.message?.content)) parts.push(text(payload.choices[0].message.content));

  return { text: parts.join('\n').trim(), call, parse_failed: parseFailed || undefined };
}

/** Normalises either provider's response into the loop's one shape. */
export function readCallForProvider(provider: string, payload: any) {
  return text(provider).toLowerCase() === 'openai'
    ? readOpenAiCall(payload)
    : readAnthropicCall(payload);
}

/**
 * Builds the message that returns a tool result to the model.
 *
 * The two providers disagree on both role and shape, and getting this wrong is
 * silent: the model simply behaves as if the step produced nothing.
 */
export function toolResultMessage(provider: string, input: {
  call_id: string;
  tool_name: string;
  result: unknown;
  is_error?: boolean;
}) {
  const body = typeof input.result === 'string' ? input.result : JSON.stringify(input.result ?? null);
  if (text(provider).toLowerCase() === 'openai') {
    return {
      type: 'function_call_output',
      call_id: text(input.call_id),
      output: body,
    };
  }
  return {
    role: 'user',
    content: [{
      type: 'tool_result',
      tool_use_id: text(input.call_id),
      content: body,
      ...(input.is_error ? { is_error: true } : {}),
    }],
  };
}

/**
 * Reports whether a provider can carry a given tool set at all.
 *
 * A tool whose schema is not an object cannot be declared to either provider, and
 * silently dropping it would make the model unable to request something the
 * registry says exists — with no error anywhere.
 */
export function validateToolSet(tools: any[]) {
  const rejected: Array<{ name: string; reason: string }> = [];
  for (const tool of Array.isArray(tools) ? tools : []) {
    const name = text(tool?.name);
    if (!name) { rejected.push({ name: '(unnamed)', reason: 'tool_name_required' }); continue; }
    const schema = tool?.input_schema ?? tool?.parameters;
    if (schema !== undefined && (typeof schema !== 'object' || schema === null)) {
      rejected.push({ name, reason: 'input_schema_must_be_an_object' });
    }
  }
  return { ok: rejected.length === 0, rejected };
}
