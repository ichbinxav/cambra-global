// COMMAND-C6 (2026-08-17) — admin surface for durable runs.
//
// Hosted as a logical route (the physical function quota is exhausted), same
// pattern as commandConversationCore. Four actions: start, status, cancel and
// advance.
//
// `advance` is exposed deliberately rather than left to a scheduler: it makes the
// executor usable the day it ships instead of waiting on a new scheduled
// automation, and every safety property is enforced inside advanceCommandRun, not
// by whoever calls it. A scheduler can be added later and will call exactly this.

import { readRuntimeSource } from './runtimeSourceRead.ts';
import { buildToolRegistry } from './commandToolRegistry.ts';
import {
  advanceCommandRun, isHumanHeld, isTerminal, requestCancellation, startCommandRun,
} from './commandRunExecutor.ts';

export const COMMAND_RUN_ADMIN_VERSION = 'command-run-admin-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();
const json = (body: unknown, status = 200) => Response.json(body as any, { status });

/** Caps for a whole run. Bounded deliberately low until runs are exercised. */
export const RUN_CAPS = Object.freeze({
  max_steps: 24,
  max_tool_calls: 24,
  max_cost_minor: 20_000,
});
export const SLICE_MAX_STEPS = 4;

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function handleCommandRunAction(
  user: any,
  body: any,
  svc: any,
  deps: {
    now?: () => string;
    newId?: () => string;
    declaredTools?: any[];
    callModel?: any;
    executeTool?: any;
  } = {},
) {
  const action = text(body?.action);
  const actor = text(user?.email) || text(user?.id);
  if (!actor) return json({ error: 'unidentified_actor' }, 401);
  const now = deps.now || (() => new Date().toISOString());
  const newId = deps.newId || (() => `run_${crypto.randomUUID()}`);

  const readRun = async (runId: string) => {
    const read = await readRuntimeSource<any[]>({
      source: 'command_run',
      read: () => svc.entities.CommandRun.filter({ run_id: runId, requested_by: actor }, '-created_at', 1),
      fallback: [],
    });
    return read;
  };

  const readPermit = async (run: any) => {
    const permitId = text(run?.permit_id);
    if (!permitId) return { available: true, permit: null };
    const read = await readRuntimeSource<any>({
      source: 'command_run_permit',
      read: () => svc.entities.FounderPermit.filter({ permit_id: permitId }, '-created_at', 1).then((rows: any[]) => rows?.[0] || null),
      fallback: null,
    });
    // An unreadable permit is not an absent one: it must not be treated as
    // "no permit needed".
    return { available: read.status !== 'UNAVAILABLE', permit: read.value };
  };

  const readEmergency = async () => {
    try {
      const rows = await svc.entities.EmergencyControl.filter({ control_key: 'global' }, '-updated_date', 1);
      const control = rows?.[0] || null;
      if (!control) return { available: false, control: null, revision: null };
      return { available: true, control, revision: Number(control.control_revision ?? 0) };
    } catch { return { available: false, control: null, revision: null }; }
  };

  if (action === 'start') {
    const request = text(body?.request_text);
    if (!request) return json({ error: 'request_text_required' }, 400);
    const conversationId = text(body?.conversation_id);
    if (!conversationId) return json({ error: 'conversation_id_required' }, 400);

    // A run is opened against a permit if one is supplied; a run with no permit
    // can still do pure reads, and the loop refuses everything else.
    let permit: any = null;
    if (text(body?.permit_id)) {
      const read = await readRuntimeSource<any>({
        source: 'command_run_start_permit',
        read: () => svc.entities.FounderPermit.filter({ permit_id: text(body.permit_id), status: 'ACTIVE' }, '-created_at', 1).then((rows: any[]) => rows?.[0] || null),
        fallback: null,
      });
      if (read.status === 'UNAVAILABLE') return json({ error: 'founder_permit_unreadable' }, 503);
      if (!read.value) return json({ error: 'founder_permit_not_found_or_inactive' }, 409);
      permit = read.value;
    }

    const created = await startCommandRun(svc, {
      conversation_id: conversationId, requested_by: actor,
      request_text: request, objective: text(body?.objective),
      permit, now: now(), newId,
    });
    return json({
      ok: true, run: created,
      // Opening a run executes nothing.
      steps_run: 0, external_send_performed: false,
    }, 201);
  }

  if (action === 'status') {
    const runId = text(body?.run_id);
    if (!runId) return json({ error: 'run_id_required' }, 400);
    const read = await readRun(runId);
    if (read.status === 'UNAVAILABLE') return json({ error: 'command_run_unreadable' }, 503);
    const run = (read.value || [])[0];
    if (!run) return json({ error: 'command_run_not_found' }, 404);

    const receipts = await readRuntimeSource<any[]>({
      source: 'command_run_receipts',
      read: () => svc.entities.CommandReceipt.filter({ chain_key: text(run.receipt_chain_key) }, 'sequence', 200),
      fallback: [],
    });
    return json({
      ok: true,
      run,
      terminal: isTerminal(run.status),
      held_for_human: isHumanHeld(run.status),
      receipt_count: (receipts.value || []).length,
      // Stated rather than implied: a receipt list we could not read is not an
      // empty chain.
      receipts_readable: receipts.status !== 'UNAVAILABLE',
      external_send_performed: false,
    });
  }

  if (action === 'cancel') {
    const runId = text(body?.run_id);
    if (!runId) return json({ error: 'run_id_required' }, 400);
    const read = await readRun(runId);
    if (read.status === 'UNAVAILABLE') return json({ error: 'command_run_unreadable' }, 503);
    const run = (read.value || [])[0];
    if (!run) return json({ error: 'command_run_not_found' }, 404);

    const result = await requestCancellation(svc, run, {
      reason: text(body?.reason) || 'cancelled_by_founder', now: now(),
    });
    if (!result.ok) return json({ error: result.reason, status: result.status }, 409);
    return json({
      ok: true, run_id: runId,
      // Honest about what a cancel does: it stops the NEXT slice.
      note: 'Cancellation recorded. A slice already in flight is not killed — a paid provider call cannot be un-made. The next slice will refuse to start.',
      external_send_performed: false,
    });
  }

  if (action === 'advance') {
    const runId = text(body?.run_id);
    if (!runId) return json({ error: 'run_id_required' }, 400);
    if (!deps.callModel || !deps.executeTool) {
      return json({ error: 'executor_transport_not_configured' }, 503);
    }
    const read = await readRun(runId);
    if (read.status === 'UNAVAILABLE') return json({ error: 'command_run_unreadable' }, 503);
    const run = (read.value || [])[0];
    if (!run) return json({ error: 'command_run_not_found' }, 404);

    const { available, permit } = await readPermit(run);
    if (!available) return json({ error: 'founder_permit_unreadable' }, 503);

    const registry = buildToolRegistry(deps.declaredTools || []);
    try {
      const result = await advanceCommandRun({
        svc, run, registry, permit,
        caps: RUN_CAPS, slice_max_steps: SLICE_MAX_STEPS,
        now, sha256,
        callModel: deps.callModel, executeTool: deps.executeTool,
        readEmergency,
        autonomousEffectClasses: ['read', 'analysis'],
        market: (Array.isArray(run.market_scope) ? run.market_scope : [])[0],
      });
      return json({ ok: true, ...result, external_send_performed: false });
    } catch (error: any) {
      // A lost CAS means another worker owns this slice. That is not an error the
      // founder caused, and it must not read as a failed run.
      if (text(error?.code).includes('REVISION_CONFLICT')) {
        return json({ error: 'command_run_advanced_elsewhere', run_id: runId }, 409);
      }
      throw error;
    }
  }

  return json({ error: 'command_run_action_not_implemented', action }, 400);
}
