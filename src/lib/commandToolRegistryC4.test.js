// COMMAND-C4 (2026-08-17) — the registry must cover the tools that ACTUALLY
// exist, not a copy of them.
//
// The governance classification lives in commandToolRegistry.ts while the tool
// declarations live in chatChiefOrchestrator. Duplicating 48 schemas would
// guarantee drift, so instead this test parses the real orchestrator source and
// asserts the two sets are equal. Adding a tool without classifying it fails
// here rather than silently defaulting to something permissive.
//
// COMMAND-C7 (2026-08-17): this used to PARSE the orchestrator's source, because
// the declarations were inline in a Deno entry point that could not be imported.
// They now live in a side-effect-free shared module, so the test imports the real
// catalogue instead of scraping text — the assertion is about the actual object
// the model is offered.
import { describe, expect, it } from "vitest";
import {
  AUTONOMOUS_ALLOWED,
  buildToolRegistry,
  EFFECT_CLASSES,
  TOOL_GOVERNANCE,
} from "../../base44/shared/commandToolRegistry.ts";
import { CHAT_TOOLS } from "../../base44/shared/commandToolCatalog.ts";

/** The tools the orchestrator really offers the model. */
function declaredTools() {
  return CHAT_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    risk_level: tool.risk_level,
    bulk_field: tool.bulk_field,
  }));
}

describe("C4 — the registry and the real tool list cannot drift apart", () => {
  const declared = declaredTools();

  it("finds the real tool set", () => {
    expect(declared.length).toBeGreaterThanOrEqual(40);
    expect(declared.map((t) => t.name)).toContain("read_state");
    expect(declared.map((t) => t.name)).toContain("draft_outreach_emails");
  });

  it("classifies every tool the model is offered", () => {
    const built = buildToolRegistry(declared);
    expect(built.unclassified, `unclassified tools: ${built.unclassified.join(", ")}`).toEqual([]);
  });

  it("carries no classification for a tool that no longer exists", () => {
    const built = buildToolRegistry(declared);
    expect(built.orphaned_classifications, `stale entries: ${built.orphaned_classifications.join(", ")}`).toEqual([]);
  });

  it("is complete", () => {
    expect(buildToolRegistry(declared).complete).toBe(true);
  });
});

describe("C4 — the classification itself is coherent", () => {
  const declared = declaredTools();
  const built = buildToolRegistry(declared);

  it("uses only known effect classes", () => {
    for (const tool of built.tools) expect(EFFECT_CLASSES, tool.name).toContain(tool.effect_class);
  });

  it("never marks a pure read as a write", () => {
    for (const tool of built.tools) {
      if (tool.effect_class === "read") expect(tool.read_or_write, tool.name).toBe("READ");
    }
  });

  it("requires a permit domain for everything that is not a pure read", () => {
    for (const tool of built.tools) {
      if (tool.effect_class === "read") expect(tool.permit_domain, tool.name).toBeNull();
      else expect(tool.permit_domain, tool.name).toBeTruthy();
    }
  });

  it("marks every tool the orchestrator rates L3 as always-drafting", () => {
    // L3 is the level the existing gate forces into the Approval queue. The
    // registry must not be more permissive than the gate that already ships.
    for (const tool of built.tools) {
      if (tool.risk_level >= 3) expect(tool.always_drafts, tool.name).toBe(true);
    }
  });

  it("keeps external effects out of autonomous execution", () => {
    expect(AUTONOMOUS_ALLOWED.external_effect).toBe(false);
    // And nothing is classified into it yet, so the guard is a forward guarantee.
    const external = built.tools.filter((tool) => tool.effect_class === "external_effect");
    expect(external.map((t) => t.name)).toEqual([]);
  });

  it("does not classify a send primitive as loop-executable", () => {
    for (const [name, row] of Object.entries(TOOL_GOVERNANCE)) {
      if (/^send_|_send$/.test(name)) {
        expect(AUTONOMOUS_ALLOWED[row.effect_class], name).toBe(false);
      }
    }
  });
});
