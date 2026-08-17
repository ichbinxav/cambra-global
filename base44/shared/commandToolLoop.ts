// COMMAND-C4 (2026-08-17) — the multi-step tool coordinator.
//
// What existed before: chatChiefOrchestrator made ONE model call per turn, took
// at most ONE tool_use block, ran it through the gates, and returned that result
// directly. The tool's output never went back to the model. So "find the ES
// merchants on the worst rates and draft outreach to the top three" was not
// expressible — it needs search -> score -> draft chained, with each step seeing
// the previous result.
//
// This module is that loop, and it is pure: the caller supplies `callModel`,
// `executeTool`, `readEmergency` and `appendReceipt`. That is what makes the
// safety properties below testable without a live model or a database.
//
// The properties that matter, each enforced here and tested:
//
//  1. The emergency epoch is re-read BEFORE EVERY step. A stop engaged halfway
//     through a run halts the run — checking only at the start would let a loop
//     keep acting after the founder pulled the lever.
//  2. A step whose tool is not in the registry is refused, not skipped.
//  3. A tool nobody classified is refused. Unclassified is not a default of safe.
//  4. Anything that reaches a third party can never run inside the loop.
//  5. A tool that always drafts stops the loop and hands back to the human.
//  6. Every step appends a receipt, including refusals. A refused step that left
//     no trace is indistinguishable from a step that never happened.
//  7. Caps on steps, tool calls and cost are enforced, and hitting one ends the
//     run as PARTIAL — never as COMPLETED.
//  8. An ambiguous outcome yields REVIEW_REQUIRED and stops. The loop never
//     retries a step whose effect it could not confirm.

import { AUTONOMOUS_ALLOWED, type EffectClass, type RegisteredTool } from './commandToolRegistry.ts';
import { evaluatePermit } from './founderPermitAuthority.ts';

export const COMMAND_TOOL_LOOP_VERSION = 'command-tool-loop-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();

export type LoopOutcome =
  | 'COMPLETED' | 'PARTIAL' | 'AWAITING_APPROVAL' | 'BLOCKED' | 'REVIEW_REQUIRED' | 'FAILED';

export type LoopStep = {
  index: number;
  tool: string;
  input: any;
  status: 'EXECUTED' | 'REFUSED' | 'HANDED_BACK' | 'ERRORED' | 'AMBIGUOUS';
  reason?: string;
  result_summary?: string;
  receipt_id?: string | null;
};

export type LoopCaps = {
  max_steps: number;
  max_tool_calls: number;
  max_cost_minor: number;
};

export const DEFAULT_CAPS: LoopCaps = Object.freeze({
  max_steps: 8,
  max_tool_calls: 8,
  max_cost_minor: 5_000,
});

/**
 * Decides whether one proposed step may run autonomously.
 *
 * Order matters and is deliberate: registry membership, then classification,
 * then hard controls, then the permit. A tool that does not exist must be
 * refused before we bother asking whether a permit covers it — otherwise a
 * FOUNDER_ROOT permit would appear to authorise a nonexistent tool.
 */
export function authoriseStep(input: {
  toolName: string;
  registry: { tools: RegisteredTool[]; unclassified: string[] };
  emergency: { safe_mode?: boolean; communications_paused?: boolean } | null;
  emergencyAvailable: boolean;
  permit: any | null;
  now: string;
  market?: string;
  /**
   * Optional narrowing of what THIS run may chain, on top of the global
   * AUTONOMOUS_ALLOWED rule. A caller that only wants an observe/analyse chain
   * passes ['read','analysis']; anything else is handed back to the caller's own
   * path rather than executed inside the loop.
   */
  autonomousEffectClasses?: readonly EffectClass[];
}): { allowed: boolean; tool: RegisteredTool | null; reason?: string; hand_back?: boolean } {
  const name = text(input.toolName);
  if (!name) return { allowed: false, tool: null, reason: 'tool_name_required' };

  if ((input.registry?.unclassified || []).includes(name)) {
    return { allowed: false, tool: null, reason: 'tool_unclassified_refused' };
  }
  const tool = (input.registry?.tools || []).find((row) => row.name === name) || null;
  if (!tool) return { allowed: false, tool: null, reason: 'tool_not_in_registry' };

  if (!AUTONOMOUS_ALLOWED[tool.effect_class]) {
    return { allowed: false, tool, reason: 'effect_class_never_autonomous' };
  }
  // A run may narrow further than the global rule. This is NOT a refusal of the
  // tool — it says "not inside this loop", so the caller can still run it through
  // its own gate path. The distinct reason keeps that difference legible.
  const scope = input.autonomousEffectClasses;
  if (scope && !scope.includes(tool.effect_class)) {
    return { allowed: false, tool, reason: 'effect_class_outside_run_scope', hand_back: true };
  }

  // An unreadable emergency control is not an absent one.
  if (!input.emergencyAvailable) {
    return { allowed: false, tool, reason: 'emergency_control_unreadable' };
  }
  if (input.emergency?.safe_mode === true) {
    return { allowed: false, tool, reason: 'safe_mode_engaged' };
  }
  if (input.emergency?.communications_paused === true && tool.permit_domain === 'campaign') {
    return { allowed: false, tool, reason: 'communications_paused' };
  }

  // Pure reads need no permit. Everything else does.
  if (tool.permit_domain === null) return { allowed: true, tool };

  if (!input.permit) return { allowed: false, tool, reason: 'no_founder_permit' };
  const evaluation = evaluatePermit({
    permit: input.permit,
    now: input.now,
    request: {
      domain: tool.permit_domain,
      tool_id: `cambra.tool.${tool.name}`,
      read_or_write: tool.read_or_write,
      effect_class: tool.effect_class,
      market: input.market,
      environment: 'production',
    },
    controls: {
      emergency: input.emergency,
      emergencyAvailable: input.emergencyAvailable,
      suppressionAvailable: true,
      recipient_suppressed: false,
      tenant_matches: true,
      exposes_secret: false,
      market_commercially_eligible: true,
      legal_block: false,
    },
  });
  if (!evaluation.allowed) {
    return { allowed: false, tool, reason: (evaluation.blockers || ['permit_denied'])[0] };
  }

  // Allowed, but a tool that always drafts must hand back rather than continue:
  // the point of a draft is that a human sees it before anything else happens.
  if (tool.always_drafts) return { allowed: true, tool, hand_back: true };
  return { allowed: true, tool };
}

/**
 * Runs the coordinator.
 *
 * `callModel` returns `{ text, tool }` where `tool` is `{ name, input }` or null
 * when the model is done. `executeTool` returns
 * `{ ok, summary, cost_minor, ambiguous, source_refs }`.
 */
export async function runCommandLoop(input: {
  request: string;
  registry: { tools: RegisteredTool[]; unclassified: string[] };
  permit: any | null;
  caps?: Partial<LoopCaps>;
  now: () => string;
  callModel: (context: { request: string; history: LoopStep[] }) => Promise<{ text?: string; tool?: { name: string; input: any } | null }>;
  executeTool: (call: { name: string; input: any }) => Promise<{ ok: boolean; summary?: string; cost_minor?: number; ambiguous?: boolean; source_refs?: string[] }>;
  readEmergency: () => Promise<{ available: boolean; control: any | null; revision: number | null }>;
  /** Narrows what this run may chain; see authoriseStep. */
  autonomousEffectClasses?: readonly EffectClass[];
  appendReceipt?: (receipt: {
    kind: string; state: string; tool_id: string; step_key: string;
    external_effect_performed: boolean; source_refs: string[]; note?: string;
  }) => Promise<{ receipt_id?: string } | null>;
  market?: string;
}) {
  const caps: LoopCaps = { ...DEFAULT_CAPS, ...(input.caps || {}) };
  const steps: LoopStep[] = [];
  let outcome: LoopOutcome = 'COMPLETED';
  let blockers: string[] = [];
  let costMinor = 0;
  let finalText = '';

  // The epoch captured before the run. Any change means the founder (or a
  // guard) altered the rules mid-run, and a run cannot span that boundary.
  //
  // Declared before the read so the unreadable-control path can still report it
  // as null rather than throwing on a temporal dead zone.
  let openingRevision: number | null = null;
  const opening = await input.readEmergency();
  if (!opening.available) {
    return finish('BLOCKED', ['emergency_control_unreadable']);
  }
  openingRevision = opening.revision;

  const receipt = async (step: LoopStep, extra: { external?: boolean; refs?: string[]; note?: string } = {}) => {
    if (!input.appendReceipt) return null;
    const written = await input.appendReceipt({
      kind: step.status === 'EXECUTED' ? 'EFFECT' : (step.status === 'REFUSED' ? 'ESCALATION' : 'DECISION'),
      // A refusal is OBSERVED: we know for certain that we refused.
      state: step.status === 'AMBIGUOUS' ? 'REVIEW_REQUIRED' : 'OBSERVED',
      tool_id: `cambra.tool.${step.tool}`,
      step_key: `${step.index}`,
      external_effect_performed: extra.external === true,
      source_refs: extra.refs || [],
      note: extra.note || step.reason,
    }).catch(() => null);
    step.receipt_id = written?.receipt_id || null;
    return written;
  };

  function finish(result: LoopOutcome, reasons: string[] = []) {
    return {
      version: COMMAND_TOOL_LOOP_VERSION,
      outcome: result,
      steps,
      blockers: [...new Set([...blockers, ...reasons])],
      tool_calls_used: steps.filter((step) => step.status === 'EXECUTED').length,
      cost_minor_used: costMinor,
      assistant_text: finalText,
      // Never claimed by the loop itself; only a domain receipt can prove one.
      external_effect_performed: false,
      emergency_control_revision: openingRevision,
    };
  }

  for (let index = 1; index <= caps.max_steps; index += 1) {
    // --- 1. re-read the emergency control BEFORE the step ----------------
    const current = await input.readEmergency();
    if (!current.available) return finish('BLOCKED', ['emergency_control_unreadable']);
    if (current.revision !== openingRevision) {
      // The rules changed underneath us. Stopping is the only honest move:
      // we cannot know whether the remaining plan is still authorised.
      return finish('REVIEW_REQUIRED', ['emergency_epoch_changed_mid_run']);
    }

    // --- 2. ask the model what to do next --------------------------------
    let proposal: { text?: string; tool?: { name: string; input: any } | null };
    try {
      proposal = await input.callModel({ request: input.request, history: steps });
    } catch (error) {
      return finish('FAILED', [`model_call_failed:${error instanceof Error ? error.message : 'unknown'}`]);
    }
    finalText = text(proposal?.text) || finalText;
    const call = proposal?.tool;
    if (!call || !text(call.name)) return finish(outcome);

    // --- 3. authorise -----------------------------------------------------
    const decision = authoriseStep({
      toolName: call.name, registry: input.registry,
      emergency: current.control, emergencyAvailable: current.available,
      permit: input.permit, now: input.now(), market: input.market,
      autonomousEffectClasses: input.autonomousEffectClasses,
    });

    if (!decision.allowed && decision.hand_back) {
      // Out of this run's scope, not forbidden. The caller runs it through its
      // own gates; the loop stops here so nothing is executed twice.
      const step: LoopStep = {
        index, tool: text(call.name), input: call.input,
        status: 'HANDED_BACK', reason: decision.reason,
      };
      steps.push(step);
      await receipt(step);
      const handed = finish('AWAITING_APPROVAL', [decision.reason || 'outside_run_scope']);
      return { ...handed, hand_back_tool: { name: text(call.name), input: call.input } };
    }

    if (!decision.allowed) {
      const step: LoopStep = { index, tool: text(call.name), input: call.input, status: 'REFUSED', reason: decision.reason };
      steps.push(step);
      await receipt(step);
      blockers.push(decision.reason || 'refused');
      // A refusal ends the run: continuing would mean silently working around
      // the thing that was just refused.
      return finish('BLOCKED', []);
    }

    if (decision.hand_back) {
      const step: LoopStep = {
        index, tool: decision.tool!.name, input: call.input,
        status: 'HANDED_BACK', reason: 'tool_always_drafts_human_review_required',
      };
      steps.push(step);
      await receipt(step);
      return finish('AWAITING_APPROVAL', ['human_review_required']);
    }

    // --- 4. caps ----------------------------------------------------------
    const executed = steps.filter((row) => row.status === 'EXECUTED').length;
    if (executed >= caps.max_tool_calls) return finish('PARTIAL', ['max_tool_calls_reached']);

    // --- 5. execute -------------------------------------------------------
    let result: Awaited<ReturnType<typeof input.executeTool>>;
    try {
      result = await input.executeTool({ name: decision.tool!.name, input: call.input });
    } catch (error) {
      const step: LoopStep = {
        index, tool: decision.tool!.name, input: call.input, status: 'ERRORED',
        reason: error instanceof Error ? error.message : 'tool_failed',
      };
      steps.push(step);
      await receipt(step);
      return finish('FAILED', ['tool_execution_failed']);
    }

    costMinor += Number(result?.cost_minor || 0);

    if (result?.ambiguous === true) {
      // We do not know whether the effect landed. Retrying could double it;
      // declaring success could be a lie. Escalate and stop.
      const step: LoopStep = {
        index, tool: decision.tool!.name, input: call.input, status: 'AMBIGUOUS',
        reason: 'effect_outcome_unconfirmed',
      };
      steps.push(step);
      await receipt(step, { refs: result?.source_refs });
      return finish('REVIEW_REQUIRED', ['effect_outcome_unconfirmed_no_retry']);
    }

    const step: LoopStep = {
      index, tool: decision.tool!.name, input: call.input,
      status: result?.ok ? 'EXECUTED' : 'ERRORED',
      reason: result?.ok ? undefined : 'tool_reported_failure',
      result_summary: text(result?.summary).slice(0, 400),
    };
    steps.push(step);
    await receipt(step, { refs: result?.source_refs });

    if (!result?.ok) return finish('FAILED', ['tool_reported_failure']);

    if (costMinor >= caps.max_cost_minor) return finish('PARTIAL', ['max_cost_reached']);
  }

  // Ran out of steps with the model still wanting more.
  return finish('PARTIAL', ['max_steps_reached']);
}
