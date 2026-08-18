import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import {
  claimSchedulerRun,
  finishSchedulerRun,
  heartbeatSchedulerRun,
  markSchedulerEffectStarted,
  schedulerClaimDeniedResponse,
} from '../../shared/schedulerRun.ts';
import {
  followUpRunBudget,
  isBusinessHour,
  policyIsActive,
  sanitizeExternalText,
} from '../../shared/commercialAutonomy.ts';
import { callCambraClaude } from '../../shared/commercialModelRouter.ts';
import {
  LEGACY_SENDING_PROFILE_RESOLVER_VERSION,
  SENDING_PROFILE_REVIEW_REASON,
  sendingProfileIsValid,
} from '../../shared/commercialActivation.ts';
import {
  commercialFollowUpRecoveryState,
  readCriticalFollowUpCollection,
} from '../../shared/commercialFollowUpRecovery.ts';

export const COMMERCIAL_FOLLOW_UP_WORKER_VERSION = 'commercial-follow-up-worker-v2.0.0';

function parseDraft(text: string) {
  const clean = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function stableFailure(error: unknown) {
  const raw = String(
    (error as { message?: unknown })?.message || error || 'unknown',
  );
  return raw.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 180) || 'unknown';
}

async function draftFollowUp(svc: any, prompt: string, eventKey: string) {
  const result = await callCambraClaude(prompt, {
    tier: 'standard',
    maxTokens: 1200,
    svc,
    eventKey,
    source: 'commercialFollowUpWorker',
  });
  return parseDraft(result.text);
}

Deno.serve(async (req) => {
  let svc: any = null;
  let claim: any = null;
  let task: any = null;
  let executionOk = false;
  let response: Response;

  try {
    const base44 = createClientFromRequest(req);
    const body = await req.clone().json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response as Response;
    svc = base44.asServiceRole;
    claim = await claimSchedulerRun(svc, req, {
      worker_key: 'commercialFollowUpWorker',
      cadence_seconds: 3600,
    });
    const rejected = schedulerClaimDeniedResponse(claim);
    if (rejected) return rejected;
    claim = await markSchedulerEffectStarted(svc, claim);
    const startRejected = schedulerClaimDeniedResponse(claim);
    if (startRejected) return startRejected;

    const now = new Date();
    const manualOverride = gate.isAdmin && body?.manual_override === true;
    task = await svc.entities.AgentTask.create({
      brand_id: '_platform',
      agent_name: 'commercial_followup_worker',
      task_type: 'due_followups',
      status: 'running',
      requires_approval: false,
      risk_level: 3,
      input_summary: 'Due acquisition/provider follow-up sweep',
      started_at: now.toISOString(),
    });

    // Request one extra row. Hitting the cap is UNKNOWN, never an empty or
    // complete queue, because a recovery supervisor must not report a partial
    // batch as a completed recovery.
    const dueFollowups = await readCriticalFollowUpCollection<any>(
      'CommunicationThread.due_followups',
      101,
      () =>
        svc.entities.CommunicationThread.filter(
          {
            status: 'awaiting_counterparty',
            automation_paused: false,
            next_action_at: { $lte: now.toISOString() },
          },
          'next_action_at',
          101,
        ),
    );
    const dueReplies = await readCriticalFollowUpCollection<any>(
      'CommunicationThread.due_replies',
      101,
      () =>
        svc.entities.CommunicationThread.filter(
          {
            status: 'awaiting_cambra',
            automation_paused: false,
            next_action_at: { $lte: now.toISOString() },
          },
          'next_action_at',
          101,
        ),
    );
    const due = [...dueReplies, ...dueFollowups]
      .filter((thread: any, index: number, all: any[]) =>
        all.findIndex((candidate) => candidate.id === thread.id) === index
      );

    let sent = 0;
    let closed = 0;
    let skipped = 0;
    let deferred = 0;
    let pendingWindow = 0;
    let examined = 0;
    const failures: any[] = [];
    const runBudget = followUpRunBudget(gate.isAdmin, body?.max_sends);

    for (const thread of due) {
      // Untouched threads keep next_action_at and remain due for a future pass.
      if (sent >= runBudget) {
        deferred = Math.max(0, due.length - examined);
        break;
      }
      examined += 1;

      const profileKey = String(thread.sending_profile_key || '').trim();
      const profileRows = profileKey
        ? await readCriticalFollowUpCollection<any>(
          `OutboundSendingProfile:${profileKey}`,
          2,
          () =>
            svc.entities.OutboundSendingProfile.filter(
              { profile_key: profileKey },
              '-created_date',
              2,
            ),
        )
        : [];
      if (profileRows.length > 1) {
        throw new Error(`sending_profile_authority_ambiguous:${thread.id}`);
      }
      const sendingProfile = profileRows[0] || null;
      if (!sendingProfileIsValid(sendingProfile)) {
        const resolutionReason = profileKey ? 'runtime_profile_invalid_or_missing' : 'runtime_profile_missing';
        await svc.entities.CommunicationThread.update(thread.id, {
          sending_profile_key: profileKey || null,
          automation_paused: true,
          pause_reason: SENDING_PROFILE_REVIEW_REASON,
          sending_profile_resolution_status: 'REVIEW_REQUIRED',
          sending_profile_resolution_reason: resolutionReason,
          sending_profile_resolver_version: LEGACY_SENDING_PROFILE_RESOLVER_VERSION,
          sending_profile_resolved_at: new Date().toISOString(),
          sending_profile_resolved_by: 'commercial_followup_worker',
        });
        failures.push({
          thread_id: thread.id,
          error: SENDING_PROFILE_REVIEW_REASON,
          reason: resolutionReason,
        });
        skipped += 1;
        continue;
      }

      const policies = await readCriticalFollowUpCollection<any>(
        `CommercialPolicy:${thread.policy_key}:${thread.policy_version}`,
        2,
        () =>
          svc.entities.CommercialPolicy.filter(
            {
              policy_key: thread.policy_key,
              version: thread.policy_version,
              status: 'active',
            },
            '-approved_at',
            2,
          ),
      );
      if (policies.length > 1) {
        throw new Error(`commercial_policy_authority_ambiguous:${thread.id}`);
      }
      const policy = policies[0] && policyIsActive(policies[0]) ? policies[0] : null;
      if (!policy) {
        failures.push({
          thread_id: thread.id,
          error: 'commercial_policy_authority_missing',
        });
        skipped += 1;
        continue;
      }
      if (!manualOverride && !isBusinessHour(policy, now)) {
        skipped += 1;
        pendingWindow += 1;
        continue;
      }

      const messages = await readCriticalFollowUpCollection<any>(
        `CommunicationMessage:${thread.id}`,
        31,
        () =>
          svc.entities.CommunicationMessage.filter(
            { thread_id: thread.id },
            '-created_date',
            31,
          ),
      );
      const lastInbound = messages.find((message: any) => message.direction === 'inbound');
      const lastOutbound = messages.find((message: any) => message.direction === 'outbound');
      if (
        lastInbound && (!lastOutbound ||
          Date.parse(lastInbound.received_at || lastInbound.created_date || 0) >
            Date.parse(lastOutbound.sent_at || lastOutbound.created_date || 0))
      ) {
        const internal = Deno.env.get('INTERNAL_CALL_SECRET') || '';
        let invoked: any;
        try {
          invoked = await svc.functions.invoke('commercialReplyAgent', {
            thread_id: thread.id,
            message_id: lastInbound.id,
            internal_secret: internal,
          });
        } catch (error) {
          failures.push({ thread_id: thread.id, error: stableFailure(error) });
          continue;
        }
        const result = invoked?.data || invoked;
        if (result?.ok !== true) {
          failures.push({
            thread_id: thread.id,
            error: result?.error || 'reply_processing_ambiguous',
          });
        } else {
          skipped += 1;
        }
        continue;
      }

      const followups = messages.filter((message: any) =>
        message.direction === 'outbound' &&
        message.raw_event_json?.followup_step
      ).length;
      const max = Math.max(0, Math.min(Number(policy.max_followups || 0), 5));
      if (followups >= max) {
        await svc.entities.CommunicationThread.update(thread.id, {
          status: 'closed',
          automation_paused: true,
          pause_reason: 'followup_sequence_complete',
          next_action_at: null,
        });
        closed += 1;
        continue;
      }

      const step = followups + 1;
      const transcript = [...messages].reverse().slice(-8).map((
        message: any,
      ) => ({
        direction: message.direction,
        subject: message.subject,
        text: String(message.text_body || '').slice(0, 1800),
      }));
      const prompt = [
        `Write follow-up #${step} for CAMBRA ${thread.engine}.`,
        'Use the actual thread. Do not invent facts, savings, fees, provider answers, people or authority. Keep the same language. No “just following up”, no fake urgency, no generic enthusiasm. Max 60 words. For provider negotiation, ask only for the pending pricing/clarification/contract response; never accept anything. Return ONLY JSON {"subject":"...","body":"..."}.',
        'THREAD:',
        JSON.stringify(transcript),
      ].join('\n');
      const draft = await draftFollowUp(
        svc,
        prompt,
        `followup:${thread.id}:${step}:${thread.policy_version}`,
      );
      if (!draft?.subject || !draft?.body) {
        failures.push({ thread_id: thread.id, error: 'draft_unparseable' });
        continue;
      }

      const intervals = Array.isArray(policy.followup_intervals_hours) ? policy.followup_intervals_hours : [];
      const nextHours = Number(
        intervals[step] || intervals[intervals.length - 1] || 120,
      );
      const next = new Date(Date.now() + Math.max(24, nextHours) * 3600000)
        .toISOString();
      const internal = Deno.env.get('INTERNAL_CALL_SECRET') || '';
      let invoked: any;
      try {
        invoked = await svc.functions.invoke('commercialSendMessage', {
          thread_id: thread.id,
          action: 'follow_up',
          classification: 'follow_up',
          subject: sanitizeExternalText(draft.subject, 300),
          text: sanitizeExternalText(draft.body, 5000),
          agent_name: 'commercial_followup_worker',
          idempotency_key: `followup:${thread.id}:${step}:${thread.policy_version}`,
          next_action_at: step >= max ? null : next,
          internal_secret: internal,
        });
      } catch (error) {
        failures.push({ thread_id: thread.id, error: stableFailure(error) });
        continue;
      }
      const result = invoked?.data || invoked;
      if (result?.ok !== true || !result?.message_id) {
        failures.push({
          thread_id: thread.id,
          error: result?.error || 'send_result_ambiguous',
        });
        continue;
      }

      let created: any;
      try {
        created = await svc.entities.CommunicationMessage.get(
          result.message_id,
        );
      } catch {
        throw new Error(`sent_message_verification_unavailable:${thread.id}`);
      }
      if (!created || created.thread_id !== thread.id) {
        throw new Error(`sent_message_verification_ambiguous:${thread.id}`);
      }
      await svc.entities.CommunicationMessage.update(created.id, {
        raw_event_json: {
          ...(created.raw_event_json || {}),
          followup_step: step,
        },
      });
      if (step >= max) {
        await svc.entities.CommunicationThread.update(thread.id, {
          next_action_at: null,
        });
      }
      sent += 1;
    }

    const recovery = commercialFollowUpRecoveryState(
      failures,
      deferred + pendingWindow,
    );
    const recoveryComplete = recovery.recovery_complete;
    const workerSucceeded = failures.length === 0;
    const workerComplete = workerSucceeded && recoveryComplete;
    const output = {
      worker_version: COMMERCIAL_FOLLOW_UP_WORKER_VERSION,
      ...recovery,
      due: due.length,
      sent,
      closed,
      skipped,
      deferred,
      pending_window: pendingWindow,
      run_budget: runBudget,
      failures: failures.slice(0, 20),
    };
    await svc.entities.AgentTask.update(task.id, {
      status: workerComplete ? 'completed' : workerSucceeded ? 'waiting_input' : 'failed',
      output_summary:
        `Due follow-ups: ${sent} sent, ${closed} closed, ${skipped} skipped, ${deferred} deferred, ${failures.length} failed`,
      output_payload_json: output,
      ...(!workerSucceeded ? { error: 'commercial_followup_recovery_degraded' } : {}),
      ...(workerComplete || !workerSucceeded
        ? { completed_at: new Date().toISOString() }
        : {}),
    });
    // A partial queue sweep is useful evidence for the supervisor, but it is
    // not a healthy/complete scheduler terminal state.
    executionOk = workerComplete;
    response = Response.json(
      { ok: workerSucceeded, task_id: task.id, ...output },
      workerSucceeded ? undefined : { status: 503 },
    );
  } catch (error) {
    executionOk = false;
    const failure = stableFailure(error);
    console.error('commercialFollowUpWorker failed', failure);
    if (svc && task?.id) {
      try {
        await svc.entities.AgentTask.update(task.id, {
          status: 'failed',
          error: 'commercial_followup_failed',
          output_summary: 'Commercial follow-up failed closed; recovery completeness is UNKNOWN',
          output_payload_json: {
            worker_version: COMMERCIAL_FOLLOW_UP_WORKER_VERSION,
            data_complete: false,
            recovery_status: 'UNKNOWN',
            recovery_complete: false,
            failure,
          },
          completed_at: new Date().toISOString(),
        });
      } catch (persistenceError) {
        console.error(
          'commercialFollowUpWorker failure persistence failed',
          stableFailure(persistenceError),
        );
      }
    }
    response = Response.json({
      ok: false,
      error: 'commercial_followup_failed',
      data_complete: false,
      recovery_status: 'UNKNOWN',
      recovery_complete: false,
      task_id: task?.id || null,
    }, { status: 500 });
  }

  if (svc && claim?.allowed) {
    const heartbeat = await heartbeatSchedulerRun(svc, claim)
      .catch(() => ({
        ok: false,
        reason: 'scheduler_final_heartbeat_unavailable',
      }));
    const finished = await finishSchedulerRun(
      svc,
      claim,
      {
        worker_key: 'commercialFollowUpWorker',
        heartbeat_status: heartbeat?.reason || 'OK',
      },
      executionOk && heartbeat?.ok === true,
    );
    if (!heartbeat?.ok || !finished?.ok) {
      return Response.json({
        ok: false,
        error: 'scheduler_execution_evidence_ambiguous',
        data_complete: false,
        recovery_status: 'UNKNOWN',
        recovery_complete: false,
        review_required: true,
        reason: heartbeat?.reason || finished?.reason ||
          'scheduler_finalize_unknown',
        run_key: claim.run_key,
        task_id: task?.id || null,
      }, { status: 503 });
    }
  }
  return response!;
});
