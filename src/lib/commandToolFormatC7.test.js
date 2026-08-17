// COMMAND-C7 (2026-08-17) — the translation layer C5 declared missing.
//
// Without this, the multi-step loop was Anthropic-only. The tests that matter
// most are the refusals: a response that cannot be parsed must yield NO tool
// call, because inventing one makes the model appear to request something it
// never requested.
import { describe, expect, it } from "vitest";
import {
  readAnthropicCall,
  readCallForProvider,
  readOpenAiCall,
  toAnthropicTools,
  toolResultMessage,
  toolsForProvider,
  toOpenAiTools,
  validateToolSet,
} from "../../base44/shared/commandToolFormat.ts";

const TOOLS = [
  {
    name: "discover_leads",
    description: "Search for outbound leads.",
    input_schema: {
      type: "object",
      properties: { topic: { type: "string" }, limit: { type: "number" } },
      required: ["topic"],
    },
  },
  { name: "system_health_check", description: "Check health." },
];

describe("C7 — one canonical tool shape, projected outward per provider", () => {
  it("projects to the Anthropic shape", () => {
    const [first, second] = toAnthropicTools(TOOLS);
    expect(first).toEqual({
      name: "discover_leads",
      description: "Search for outbound leads.",
      input_schema: TOOLS[0].input_schema,
    });
    // A tool with no declared input still gets a valid object schema.
    expect(second.input_schema).toEqual({ type: "object", properties: {} });
  });

  it("projects to the OpenAI shape", () => {
    const [first] = toOpenAiTools(TOOLS);
    expect(first.type).toBe("function");
    expect(first.name).toBe("discover_leads");
    expect(first.parameters).toEqual(TOOLS[0].input_schema);
    // strict:false is deliberate — strict mode forbids optional properties, and
    // a tool contract must not bend to a wire format.
    expect(first.strict).toBe(false);
  });

  it("drops nothing and invents nothing", () => {
    expect(toAnthropicTools(TOOLS)).toHaveLength(2);
    expect(toOpenAiTools(TOOLS)).toHaveLength(2);
    // An unnamed tool cannot be declared to either provider.
    expect(toAnthropicTools([{ description: "no name" }])).toEqual([]);
  });

  it("routes by provider name and defaults to Anthropic", () => {
    expect(toolsForProvider("openai", TOOLS)[0].type).toBe("function");
    expect(toolsForProvider("anthropic", TOOLS)[0].input_schema).toBeTruthy();
    expect(toolsForProvider("", TOOLS)[0].input_schema).toBeTruthy();
  });

  it("survives a malformed input list", () => {
    expect(toAnthropicTools(null)).toEqual([]);
    expect(toOpenAiTools(undefined)).toEqual([]);
  });
});

describe("C7 — reading an Anthropic response", () => {
  it("reads text and a tool call together", () => {
    const result = readAnthropicCall({
      content: [
        { type: "text", text: "Let me look." },
        { type: "tool_use", id: "toolu_1", name: "discover_leads", input: { topic: "fashion" } },
      ],
    });
    expect(result.text).toBe("Let me look.");
    expect(result.call).toEqual({ name: "discover_leads", input: { topic: "fashion" }, call_id: "toolu_1" });
  });

  it("returns no call when the model just answered", () => {
    const result = readAnthropicCall({ content: [{ type: "text", text: "No tool needed." }] });
    expect(result.call).toBeNull();
    expect(result.text).toBe("No tool needed.");
  });

  it("takes the last tool_use, matching the behaviour that already shipped", () => {
    const result = readAnthropicCall({
      content: [
        { type: "tool_use", id: "a", name: "first_tool", input: {} },
        { type: "tool_use", id: "b", name: "second_tool", input: {} },
      ],
    });
    expect(result.call.name).toBe("second_tool");
  });

  it("defaults a missing input to an empty object rather than undefined", () => {
    const result = readAnthropicCall({ content: [{ type: "tool_use", id: "a", name: "t" }] });
    expect(result.call.input).toEqual({});
  });

  it("returns nothing for an empty or malformed payload", () => {
    expect(readAnthropicCall({}).call).toBeNull();
    expect(readAnthropicCall(null).text).toBe("");
  });
});

describe("C7 — reading an OpenAI response", () => {
  it("parses a function_call with JSON-string arguments", () => {
    const result = readOpenAiCall({
      output: [{ type: "function_call", call_id: "call_1", name: "discover_leads", arguments: '{"topic":"fashion","limit":5}' }],
    });
    expect(result.call).toEqual({
      name: "discover_leads", input: { topic: "fashion", limit: 5 }, call_id: "call_1",
    });
  });

  it("accepts arguments that already arrived as an object", () => {
    const result = readOpenAiCall({
      output: [{ type: "function_call", id: "call_2", name: "t", arguments: { a: 1 } }],
    });
    expect(result.call.input).toEqual({ a: 1 });
  });

  it("yields NO call when the arguments do not parse — never a guessed empty call", () => {
    const result = readOpenAiCall({
      output: [{ type: "function_call", call_id: "call_3", name: "discover_leads", arguments: "{not json" }],
    });
    // Running the tool with {} would execute something nobody asked for.
    expect(result.call).toBeNull();
    expect(result.parse_failed).toBe(true);
  });

  it("reads plain text when no tool was requested", () => {
    expect(readOpenAiCall({ output: [{ content: [{ text: "just an answer" }] }] }).text)
      .toBe("just an answer");
    expect(readOpenAiCall({ output_text: "short form" }).text).toBe("short form");
  });

  it("reads the chat-completions tool_calls shape", () => {
    const result = readOpenAiCall({
      choices: [{ message: { content: "", tool_calls: [{ id: "c1", function: { name: "t", arguments: '{"x":1}' } }] } }],
    });
    expect(result.call).toEqual({ name: "t", input: { x: 1 }, call_id: "c1" });
  });

  it("returns nothing for an empty payload", () => {
    expect(readOpenAiCall({}).call).toBeNull();
    expect(readOpenAiCall(null).text).toBe("");
  });
});

describe("C7 — the loop never learns which provider answered", () => {
  it("normalises both providers into the same shape", () => {
    const fromAnthropic = readCallForProvider("anthropic", {
      content: [{ type: "tool_use", id: "toolu_1", name: "discover_leads", input: { topic: "es" } }],
    });
    const fromOpenAi = readCallForProvider("openai", {
      output: [{ type: "function_call", call_id: "call_1", name: "discover_leads", arguments: '{"topic":"es"}' }],
    });
    expect(Object.keys(fromAnthropic.call).sort()).toEqual(Object.keys(fromOpenAi.call).sort());
    expect(fromAnthropic.call.name).toBe(fromOpenAi.call.name);
    expect(fromAnthropic.call.input).toEqual(fromOpenAi.call.input);
  });
});

describe("C7 — returning a tool result", () => {
  it("uses the Anthropic tool_result shape", () => {
    const message = toolResultMessage("anthropic", {
      call_id: "toolu_1", tool_name: "discover_leads", result: { rows: 3 },
    });
    expect(message.role).toBe("user");
    expect(message.content[0].type).toBe("tool_result");
    expect(message.content[0].tool_use_id).toBe("toolu_1");
    expect(message.content[0].content).toBe('{"rows":3}');
  });

  it("uses the OpenAI function_call_output shape", () => {
    const message = toolResultMessage("openai", {
      call_id: "call_1", tool_name: "discover_leads", result: { rows: 3 },
    });
    expect(message.type).toBe("function_call_output");
    expect(message.call_id).toBe("call_1");
    expect(message.output).toBe('{"rows":3}');
  });

  it("marks an Anthropic error result so the model is not misled", () => {
    const message = toolResultMessage("anthropic", {
      call_id: "t", tool_name: "x", result: "it failed", is_error: true,
    });
    expect(message.content[0].is_error).toBe(true);
  });

  it("passes a string result through without double-encoding it", () => {
    expect(toolResultMessage("openai", { call_id: "c", tool_name: "t", result: "plain" }).output)
      .toBe("plain");
  });
});

describe("C7 — a tool that cannot be declared is reported, not dropped", () => {
  it("accepts a well-formed set", () => {
    expect(validateToolSet(TOOLS)).toEqual({ ok: true, rejected: [] });
  });

  it("rejects an unnamed tool", () => {
    expect(validateToolSet([{ description: "x" }]).rejected)
      .toEqual([{ name: "(unnamed)", reason: "tool_name_required" }]);
  });

  it("rejects a non-object schema instead of silently discarding the tool", () => {
    const result = validateToolSet([{ name: "t", input_schema: "a string" }]);
    expect(result.ok).toBe(false);
    expect(result.rejected[0]).toEqual({ name: "t", reason: "input_schema_must_be_an_object" });
  });
});
