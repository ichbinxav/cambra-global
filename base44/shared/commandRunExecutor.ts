// COMMAND-C6 (2026-08-17) — durable background executor.
//
// Founder decision: CAMBRA executes on the founder's behalf using ITS OWN
// provider keys (the C5 router). It does NOT access personal Codex, Claude Code
// or ChatGPT accounts — no third-party OAuth flow grants an application a
// consumer session, so that design was not available and was not faked.
//
// What this adds over the C4 loop: the loop runs inside one invocation. A real
// request ("go through the ES pipeline and tell me what needs attention") can
// outlive that. This module makes a run DURABLE: it persists a CommandRun,
// advances it one bounded slice per invocation, and can be resumed or cancelled
// between slices.
//
// It is also where the C1 ledger finally gets a production writer. Every slice
// appends CommandReceipt rows through the loop's appendReceipt hook.
//
// The properties that matter across invocations, not just within one:
//
//  1. Concurrency is compare-and-swap on run_revision. Two workers picking up the
//     same run cannot both advance it.
//  2. Cancellation is honoured BEFORE a slice starts, not after. A cancel that
//     only took effect once the slice finished would not be a cancel.
//  3. The emergency epoch is re-checked at the start of every slice, and a run
//     whose epoch moved does not resume — it goes to REVIEW_REQUIRED. Within a
//     slice the loop already re-reads before every step.
//  4. A slice that ends AWAITING_APPROVAL or REVIEW_REQUIRED does not schedule
//     another. Only a human moves it forward.
//  5. Totals accumulate across slices, so caps bound the WHOLE run and not each
//     slice independently.

import { buildNextReceipt } from './commandReceiptLedger.ts';
import { runCommandLoop, type LoopCaps } from './commandToolLoop.ts';
import type { RegisteredTool } from './commandToolRegistry.ts';

export const COMMAND_RUN_EXECUTOR_VERSION = 'command-run-executor-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();

/** Run states that will never advance again without a human. */
export const TERMINAL_STATES = Object.freeze([
  'COMPLETED', 'PARTIAL', 'CANCELLED', 'FAILED',
] as const);

/** Run states that are waiting on a person, not on a worker. */
export const HUMAN_HELD_STATES = Object.freeze([
  'AWAITING_APPROVAL', 'AWAITING_PERMIT', 'REVIEW_REQUIRED',
] as const);

export function isTerminal(status: unknown) {
  return (TERMINAL_STATES as readonly string[]).includes(text(status).toUpperCase());
}
export function isHumanHeld(status: unknown) {
  return (HUMAN_HELD_STATES as readonly string[]).includes(text(status).toUpperCase());
}

/** Maps a loop outcome onto the durable run status. */
export function runStatusForOutcome(outcome: string): string {
  switch (text(outcome).toUpperCase()) {
    case 'COMPLETED': return 'COMPLETED';
    case 'PARTIAL': return 'RUNNING';        // more work remains; another slice may follow
    case 'AWAITING_APPROVAL': return 'AWAITING_APPROVAL';
    case 'REVIEW_REQUIRED': return 'REVIEW_REQUIRED';
    case 'BLOCKED': return 'FAILED';
    case 'FAILED': return 'FAILED';
    default: return 'REVIEW_REQUIRED';       // an outcome we do not recognise is not a success
  }
}

/**
 * Compare-and-swap on run_revision.
 *
 * Throws rather than returning false: a caller that ignored a lost CAS would
 * carry on believing it owns the run.
 */
export async function casRun(svc: any, run: any, patch: Record<string, unknown>, operation: string) {
  const expected = Number(run?.run_revision ?? 0);
  let result: any;
  try {
    result = await svc.entities.CommandRun.updateMany(
      { id: run.id, run_revision: expected },
      { ...patch, run_revision: expected + 1, updated_at: patch.updated_at },
    );
  } catch (cause) {
    throw Object.assign(new Error(`${operation}_authority_unavailable`), {
      code: `${operation.toUpperCase()}_AUTHORITY_UNAVAILABLE`, cause,
    });
  }
  const changed = Number(result?.matched_count ?? result?.modified_count ?? result?.count ?? 0);
  if (changed !== 1) {
    throw Object.assign(new Error(`${operation}_revision_conflict`), {
      code: `${operation.toUpperCase()}_REVISION_CONFLICT`, expected,
    });
  }
  return expected + 1;
}

/** Opens a durable run. Does not execute anything. */
export async function startCommandRun(svc: any, input: {
  conversation_id: string;
  requested_by: string;
  request_text: string;
  objective?: string;
  permit?: any | null;
  now: string;
  newId: () => string;
}) {
  const runId = input.newId();
  const created = await svc.entities.CommandRun.create({
    run_id: runId,
    conversation_id: text(input.conversation_id),
    requested_by: text(input.requested_by),
    request_text: text(input.request_text).slice(0, 4000),
    objective: text(input.objective) || text(input.request_text).slice(0, 200),
    status: 'PLANNING',
    permit_id: text(input.permit?.permit_id),
    permit_hash: text(input.permit?.permit_hash),
    agent_task_ids: [],
    steps_completed: 0,
    tool_calls_used: 0,
    cost_minor_used: 0,
    receipt_chain_key: runId,
    last_receipt_hash: '',
    cancellation_requested: false,
    blockers: [],
    run_revision: 0,
    started_at: input.now,
    created_at: input.now,
    updated_at: input.now,
  });
  return created;
}

/**
 * Requests cancellation. Sets the flag rather than killing anything, because a
 * slice may be mid-flight and a paid provider call cannot be un-made. The next
 * slice refuses to start.
 */
export async function requestCancellation(svc: any, run: any, input: { reason: string; now: string }) {
  if (isTerminal(run?.status)) {
    return { ok: false as const, reason: 'run_already_terminal', status: run?.status };
  }
  await casRun(svc, run, {
    cancellation_requested: true,
    cancellation_reason: text(input.reason).slice(0, 300),
    updated_at: input.now,
  }, 'command_run_cancel');
  return { ok: true as const, reason: null, status: run?.status };
}

/**
 * Advances a run by ONE bounded slice.
 *
 * Returns what happened and whether another slice may follow. `may_continue` is
 * false for anything terminal or human-held — a worker that kept going on a
 * REVIEW_REQUIRED run would be working around the escalation.
 */
export async function advanceCommandRun(input: {
  svc: any;
  run: any;
  registry: { tools: RegisteredTool[]; unclassified: string[] };
  permit: any | null;
  /** Caps for the WHOLE run. The slice budget is derived from what is left. */
  caps: LoopCaps;
  slice_max_steps: number;
  now: () => string;
  sha256: (value: unknown) => Promise<string>;
  callModel: Parameters<typeof runCommandLoop>[0]['callModel'];
  executeTool: Parameters<typeof runCommandLoop>[0]['executeTool'];
  readEmergency: Parameters<typeof runCommandLoop>[0]['readEmergency'];
  autonomousEffectClasses?: Parameters<typeof runCommandLoop>[0]['autonomousEffectClasses'];
  market?: string;
}) {
  const { svc, run } = input;
  const now = input.now();

  if (isTerminal(run?.status)) {
    return { advanced: false, may_continue: false, status: run.status, reason: 'run_already_terminal' };
  }
  if (isHumanHeld(run?.status)) {
    return { advanced: false, may_continue: false, status: run.status, reason: 'run_held_for_human' };
  }

  // --- cancellation is honoured BEFORE the slice ---------------------------
  if (run?.cancellation_requested === true) {
    await casRun(svc, run, {
      status: 'CANCELLED', completed_at: now, updated_at: now,
      blockers: [...(run.blockers || []), 'cancelled_by_founder'],
    }, 'command_run_cancelled');
    return { advanced: false, may_continue: false, status: 'CANCELLED', reason: 'cancelled_before_slice' };
  }

  // --- the epoch a resumed run was authorised under must still hold --------
  const posture = await input.readEmergency();
  if (!posture?.available) {
    await casRun(svc, run, {
      status: 'REVIEW_REQUIRED', updated_at: now,
      blockers: [...(run.blockers || []), 'emergency_control_unreadable'],
    }, 'command_run_blocked');
    return { advanced: false, may_continue: false, status: 'REVIEW_REQUIRED', reason: 'emergency_control_unreadable' };
  }
  const priorRevision = run?.emergency_control_revision;
  if (priorRevision !== null && priorRevision !== undefined && Number(priorRevision) !== Number(posture.revision)) {
    // The rules changed between slices. A resumed run cannot span that boundary.
    await casRun(svc, run, {
      status: 'REVIEW_REQUIRED', updated_at: now,
      blockers: [...(run.blockers || []), 'emergency_epoch_changed_between_slices'],
    }, 'command_run_epoch_changed');
    return { advanced: false, may_continue: false, status: 'REVIEW_REQUIRED', reason: 'emergency_epoch_changed_between_slices' };
  }

  // --- budget left for the whole run, not per slice ------------------------
  const usedCalls = Number(run.tool_calls_used || 0);
  const usedCost = Number(run.cost_minor_used || 0);
  const remainingCalls = Math.max(0, input.caps.max_tool_calls - usedCalls);
  const remainingCost = Math.max(0, input.caps.max_cost_minor - usedCost);
  if (remainingCalls === 0 || remainingCost === 0) {
    await casRun(svc, run, {
      status: 'PARTIAL', completed_at: now, updated_at: now,
      blockers: [...(run.blockers || []), remainingCalls === 0 ? 'run_tool_call_budget_exhausted' : 'run_cost_budget_exhausted'],
    }, 'command_run_partial');
    return { advanced: false, may_continue: false, status: 'PARTIAL', reason: 'run_budget_exhausted' };
  }

  // Claim the slice before doing any work, so a second worker loses the CAS.
  const claimedRevision = await casRun(svc, run, {
    status: 'RUNNING',
    emergency_control_revision: posture.revision,
    updated_at: now,
  }, 'command_run_claim');
  const claimed = { ...run, run_revision: claimedRevision, status: 'RUNNING' };

  // --- the receipt writer: this is what makes the C1 ledger live ----------
  //
  // AUDIT P1-SHARED-002 (2026-08-17) — this was `.catch(() => [])`, the ONLY such swallow left in
  // base44/shared. The tip of the tamper-evident receipt chain — the row `buildNextReceipt` hashes
  // as `previous` — became null on any read failure, and buildNextReceipt then wrote the next
  // receipt as if the chain restarted (previous_receipt_hash: null, sequence: 1). A failed read
  // broke the chain SILENTLY. verifyReceiptChain would later flag duplicate_sequence, but the
  // founder-facing read in commandRunAdminCore.ts:126-139 had already trusted the value written.
  //
  // Fail-closed: a read failure on the chain tip stops the run rather than mutating history. Same
  // rule applies when last_receipt_hash names a row that no longer exists.
  let previousReceipt: any = null;
  if (text(run.last_receipt_hash)) {
    let found: any[];
    try {
      found = await svc.entities.CommandReceipt.filter(
        { chain_key: text(run.receipt_chain_key), receipt_hash: text(run.last_receipt_hash) },
        '-sequence', 1,
      );
    } catch (error: any) {
      return {
        ok: false as const,
        error: 'receipt_chain_tip_unreadable',
        reason: 'The tip of the receipt chain could not be read, so appending would restart the chain and hide the failure. The run cannot advance until this read succeeds.',
        run_id: text(run.id),
        chain_key: text(run.receipt_chain_key),
        expected_previous_hash: text(run.last_receipt_hash),
        read_error: String(error?.message || error).slice(0, 300),
        history_mutated: false,
      } as any;
    }
    previousReceipt = found?.[0] || null;
    if (!previousReceipt) {
      // The tip WAS declared but the row is gone. Appending would silently rewrite history.
      return {
        ok: false as const,
        error: 'receipt_chain_tip_missing',
        reason: 'run.last_receipt_hash names a receipt that does not exist. Refusing to advance rather than writing as if the chain restarted.',
        run_id: text(run.id),
        chain_key: text(run.receipt_chain_key),
        expected_previous_hash: text(run.last_receipt_hash),
        history_mutated: false,
      } as any;
    }
  }
  let receiptsWritten = 0;

  const appendReceipt = async (receipt: any) => {
    const built = await buildNextReceipt(input.sha256, {
      previous: previousReceipt,
      chain_key: text(run.receipt_chain_key) || text(run.run_id),
      now: input.now(),
      receipt: {
        ...receipt,
        run_id: text(run.run_id),
        conversation_id: text(run.conversation_id),
        actor: text(run.requested_by),
        permit_id: text(run.permit_id),
        permit_hash: text(run.permit_hash),
        emergency_control_revision: posture.revision,
      },
    });
    if (!built.ok) {
      // A receipt the ledger refuses to build is a defect worth surfacing, not
      // swallowing: the step happened and we could not record it truthfully.
      console.error(JSON.stringify({ event: 'command_receipt_rejected', run_id: run.run_id, error: built.error }));
      return null;
    }
    try {
      const stored = await svc.entities.CommandReceipt.create(built.receipt);
      previousReceipt = built.receipt;
      receiptsWritten += 1;
      return { receipt_id: stored?.receipt_id || built.receipt.receipt_id };
    } catch (error) {
      console.error(JSON.stringify({ event: 'command_receipt_unpersisted', run_id: run.run_id, error: String((error as any)?.message || error).slice(0, 160) }));
      return null;
    }
  };

  // --- run one slice ------------------------------------------------------
  const loop = await runCommandLoop({
    request: text(run.request_text),
    registry: input.registry,
    permit: input.permit,
    autonomousEffectClasses: input.autonomousEffectClasses,
    caps: {
      max_steps: Math.min(input.slice_max_steps, remainingCalls),
      max_tool_calls: remainingCalls,
      max_cost_minor: remainingCost,
    },
    now: input.now,
    callModel: input.callModel,
    executeTool: input.executeTool,
    readEmergency: input.readEmergency,
    appendReceipt,
    market: input.market,
  });

  const status = runStatusForOutcome(loop.outcome);
  const executed = loop.steps.filter((step: any) => step.status === 'EXECUTED').length;
  const finished = isTerminal(status) || isHumanHeld(status);

  await casRun(svc, claimed, {
    status,
    steps_completed: Number(run.steps_completed || 0) + loop.steps.length,
    tool_calls_used: usedCalls + executed,
    cost_minor_used: usedCost + Number(loop.cost_minor_used || 0),
    last_receipt_hash: previousReceipt ? text(previousReceipt.receipt_hash) : text(run.last_receipt_hash),
    blockers: [...new Set([...(run.blockers || []), ...(loop.blockers || [])])],
    final_result_json: finished ? { outcome: loop.outcome, assistant_text: loop.assistant_text } : {},
    completed_at: finished ? now : undefined,
    updated_at: now,
  }, 'command_run_advance');

  return {
    advanced: true,
    // COMPLETED / held / terminal all stop here. Only RUNNING continues.
    may_continue: status === 'RUNNING',
    status,
    outcome: loop.outcome,
    steps_this_slice: loop.steps.length,
    tool_calls_this_slice: executed,
    receipts_written: receiptsWritten,
    blockers: loop.blockers,
    assistant_text: loop.assistant_text,
    // Never claimed here; only a domain receipt proves an external effect.
    external_effect_performed: false,
  };
}
