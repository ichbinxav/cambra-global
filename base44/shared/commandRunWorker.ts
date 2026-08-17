// COMMAND-C7 (2026-08-17) — the scheduled worker that advances durable runs.
//
// C6 shipped `advance` as an admin action and recorded that no scheduler drove
// it. This closes that: runs now progress on their own.
//
// Every safety property already lives inside advanceCommandRun — CAS on
// run_revision, cancellation honoured before a slice, the emergency epoch not
// spanned, budgets bounding the whole run. This worker adds only the sweep, and
// deliberately adds no authority of its own.
//
// Two sweep-level rules that are this module's own:
//
//  1. It advances ONE slice per run per sweep. Draining a run to completion in a
//     single sweep would starve every other run and turn one bad plan into a long
//     uninterruptible burn.
//  2. It never picks up a run that is terminal or held for a human. Those are the
//     states that mean "a person decides next", and a worker that advanced them
//     would be routing around the escalation.

import { advanceCommandRun, isHumanHeld, isTerminal } from './commandRunExecutor.ts';

export const COMMAND_RUN_WORKER_VERSION = 'command-run-worker-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();

/** Statuses a sweep may advance. Anything else is left alone, by name. */
export const SWEEPABLE_STATUSES = Object.freeze(['PLANNING', 'RUNNING'] as const);

/** How many runs one sweep will touch. Bounded so a sweep stays predictable. */
export const MAX_RUNS_PER_SWEEP = 5;

export function isSweepable(run: any) {
  const status = text(run?.status).toUpperCase();
  if (isTerminal(status) || isHumanHeld(status)) return false;
  return (SWEEPABLE_STATUSES as readonly string[]).includes(status);
}

/**
 * Advances up to `MAX_RUNS_PER_SWEEP` eligible runs by one slice each.
 *
 * A run that throws does not abort the sweep: one bad run must not stop every
 * other run from progressing. Each failure is recorded and reported.
 */
export async function sweepCommandRuns(input: {
  svc: any;
  now: () => string;
  sha256: (value: unknown) => Promise<string>;
  registry: Parameters<typeof advanceCommandRun>[0]['registry'];
  caps: Parameters<typeof advanceCommandRun>[0]['caps'];
  slice_max_steps: number;
  callModel: Parameters<typeof advanceCommandRun>[0]['callModel'];
  executeTool: Parameters<typeof advanceCommandRun>[0]['executeTool'];
  readEmergency: Parameters<typeof advanceCommandRun>[0]['readEmergency'];
  readPermit: (run: any) => Promise<{ available: boolean; permit: any | null }>;
  autonomousEffectClasses?: Parameters<typeof advanceCommandRun>[0]['autonomousEffectClasses'];
  maxRuns?: number;
}) {
  const limit = Math.max(1, Number(input.maxRuns ?? MAX_RUNS_PER_SWEEP));
  let candidates: any[] = [];
  try {
    // Oldest first, so a run cannot be starved by newer arrivals.
    candidates = await input.svc.entities.CommandRun.filter(
      { status: { $in: [...SWEEPABLE_STATUSES] } }, 'created_at', limit * 3,
    );
  } catch (error) {
    return {
      version: COMMAND_RUN_WORKER_VERSION,
      ok: false as const,
      // An unreadable queue is reported as unavailable, never as "no work".
      error: 'command_run_queue_unreadable',
      detail: String((error as any)?.message || error).slice(0, 160),
      swept: 0, advanced: 0, skipped: 0, failed: 0, results: [],
    };
  }

  const eligible = (candidates || []).filter(isSweepable).slice(0, limit);
  const results: any[] = [];
  let advanced = 0;
  let skipped = 0;
  let failed = 0;

  for (const run of eligible) {
    const { available, permit } = await input.readPermit(run);
    if (!available) {
      // An unreadable permit is not an absent one; the run waits rather than
      // running with less authority than it was opened with.
      skipped += 1;
      results.push({ run_id: run.run_id, outcome: 'SKIPPED', reason: 'founder_permit_unreadable' });
      continue;
    }
    try {
      const result = await advanceCommandRun({
        svc: input.svc, run, registry: input.registry, permit,
        caps: input.caps, slice_max_steps: input.slice_max_steps,
        now: input.now, sha256: input.sha256,
        callModel: input.callModel, executeTool: input.executeTool,
        readEmergency: input.readEmergency,
        autonomousEffectClasses: input.autonomousEffectClasses,
        market: (Array.isArray(run.market_scope) ? run.market_scope : [])[0],
      });
      if (result.advanced) advanced += 1; else skipped += 1;
      results.push({
        run_id: run.run_id,
        outcome: result.advanced ? 'ADVANCED' : 'SKIPPED',
        status: result.status,
        reason: (result as any).reason || null,
        receipts_written: (result as any).receipts_written ?? 0,
      });
    } catch (error: any) {
      // A lost CAS means another worker or an admin owns this slice. That is
      // healthy contention, not a failure of the run.
      const conflict = text(error?.code).includes('REVISION_CONFLICT');
      if (conflict) skipped += 1; else failed += 1;
      results.push({
        run_id: run.run_id,
        outcome: conflict ? 'SKIPPED' : 'FAILED',
        reason: conflict ? 'advanced_elsewhere' : String(error?.message || error).slice(0, 160),
      });
    }
  }

  return {
    version: COMMAND_RUN_WORKER_VERSION,
    ok: true as const,
    swept: eligible.length,
    // Runs that exist but were not touched this sweep, so a queue backing up is visible.
    queued_not_swept: Math.max(0, (candidates || []).filter(isSweepable).length - eligible.length),
    advanced, skipped, failed, results,
    external_send_performed: false,
  };
}
