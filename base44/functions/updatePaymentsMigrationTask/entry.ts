import { safeBestEffort } from "../../shared/bestEffort.ts";
// P9 admin operation: advance/block/retry a migration task with sequential and
// go-live/verification invariants. No merchant can mutate orchestration state.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { sha256Canonical } from "../../shared/legalExecution.ts";
import {
  enforceLegalExecution,
  legalBlockResponse,
} from "../../shared/legalExecutionRuntime.ts";
import {
  assertEmergencyEpochUnchanged,
  captureEmergencyEpoch,
  type EmergencyEpochClaim,
} from "../../shared/operationalControl.ts";
import { requireCriticalOperation } from "../../shared/criticalExecution.ts";
import {
  blockPaymentsMigrationSagaBeforeEffect,
  claimPaymentsMigrationSaga,
  finishPaymentsMigrationSagaStep,
  markPaymentsMigrationReconciliation,
  paymentsMigrationActivationAuthority,
  paymentsMigrationActivationCasFilter,
  paymentsMigrationActivationReadbackMatches,
  paymentsMigrationAuthorityRows,
  paymentsMigrationCasResult,
  paymentsMigrationOperationKey,
  paymentsMigrationSagaState,
  startPaymentsMigrationSagaStep,
  validatePaymentsMigrationReceiptChain,
} from "../../shared/paymentsMigrationSaga.ts";

const VALID = new Set(["pending", "in_progress", "blocked", "done"]);
const PLAN_VERSION = "payments-recover-p9-v1";

class MigrationAuthorityError extends Error {
  status: number;
  constructor(public code: string, status: number) {
    super(code);
    this.name = "MigrationAuthorityError";
    this.status = status;
  }
}

async function readSingleMigrationAuthority(
  entity: any,
  filter: any,
  operation: string,
  codes: {
    missing: string;
    ambiguous: string;
    unavailable: string;
    missingStatus: number;
  },
) {
  let rows: any;
  try {
    rows = await requireCriticalOperation(operation, async () => {
      if (!entity?.filter) throw new Error(`${operation}_filter_unavailable`);
      const observed = await entity.filter(filter, "-created_date", 2);
      if (!Array.isArray(observed)) {
        throw new Error(`${operation}_result_invalid`);
      }
      return observed;
    });
  } catch {
    throw new MigrationAuthorityError(codes.unavailable, 503);
  }
  const decision = paymentsMigrationAuthorityRows(rows);
  if (decision.state === "MISSING") {
    throw new MigrationAuthorityError(codes.missing, codes.missingStatus);
  }
  if (decision.state === "AMBIGUOUS") {
    throw new MigrationAuthorityError(codes.ambiguous, 409);
  }
  if (!decision.ok) throw new MigrationAuthorityError(codes.unavailable, 503);
  return decision.row;
}

function taskAuthorityFilter(task: any) {
  const filter: any = {
    id: task.id,
    status: task.status,
    metadata_json: task.metadata_json || {},
  };
  for (const key of ["updated_date", "revision", "_revision"]) {
    if (Object.prototype.hasOwnProperty.call(task || {}, key)) {
      filter[key] = task[key];
    }
  }
  return filter;
}

async function readTaskAuthority(svc: any, taskId: string, operation: string) {
  return readSingleMigrationAuthority(
    svc.entities.MigrationTask,
    { id: taskId },
    operation,
    {
      missing: "task_not_found",
      ambiguous: "migration_task_authority_ambiguous",
      unavailable: "migration_task_authority_unavailable",
      missingStatus: 404,
    },
  );
}

async function advanceNextMigrationTask(
  svc: any,
  input: {
    committed_task: any;
    next_task: any;
    receipt_hash: string;
    epoch: EmergencyEpochClaim;
  },
) {
  if (!input.next_task) return { ok: true, no_next_task: true };
  await assertEmergencyEpochUnchanged(
    svc,
    input.epoch,
    "before:next_migration_task_start",
  );
  const next = await readTaskAuthority(
    svc,
    String(input.next_task.id || ""),
    "payments_migration_next_task_fresh_authority_read",
  );
  const startKey = `payments-next-task:${await sha256Canonical({
    version: "payments-migration-next-task-start-v1",
    committed_task_id: input.committed_task.id,
    next_task_id: next.id,
    receipt_hash: input.receipt_hash,
  })}`;
  const priorMarker = next?.metadata_json?.next_task_start_authority || {};
  if (
    ["in_progress", "blocked", "done"].includes(String(next.status || "")) &&
    priorMarker.version === "payments-migration-next-task-start-v1" &&
    priorMarker.start_key === startKey &&
    priorMarker.committed_task_id === input.committed_task.id &&
    priorMarker.receipt_hash === input.receipt_hash
  ) {
    await assertEmergencyEpochUnchanged(
      svc,
      input.epoch,
      "after:next_migration_task_start_replay",
    );
    return { ok: true, replay: true, next_task: next };
  }
  if (next.status !== "pending") {
    return {
      ok: false,
      error: "next_migration_task_authority_conflict",
      review_required: true,
      next_task: next,
    };
  }
  const transitionAt = new Date().toISOString();
  const slaDays = Number(next?.metadata_json?.sla_days || 3);
  const due = new Date();
  due.setUTCDate(due.getUTCDate() + slaDays);
  const patch = {
    status: "in_progress",
    updated_at: transitionAt,
    due_date: due.toISOString().slice(0, 10),
    metadata_json: {
      ...(next.metadata_json || {}),
      next_task_start_authority: {
        version: "payments-migration-next-task-start-v1",
        start_key: startKey,
        committed_task_id: input.committed_task.id,
        receipt_hash: input.receipt_hash,
        started_at: transitionAt,
      },
    },
  };
  let result: any = null;
  let writeError = "";
  try {
    result = await svc.entities.MigrationTask.updateMany(
      taskAuthorityFilter(next),
      { $set: patch },
    );
  } catch (error: any) {
    writeError = String(error?.message || error).slice(0, 300);
  }
  const decision = paymentsMigrationCasResult(result);
  let observed: any = null;
  let readError = "";
  try {
    observed = await readTaskAuthority(
      svc,
      next.id,
      "payments_migration_next_task_start_readback",
    );
  } catch (error: any) {
    readError = String(error?.code || error?.message || error).slice(0, 300);
  }
  const observedMarker = observed?.metadata_json?.next_task_start_authority ||
    {};
  const startObserved = observed?.status === "in_progress" &&
    observed?.updated_at === transitionAt &&
    observed?.due_date === patch.due_date &&
    observedMarker.start_key === startKey &&
    observedMarker.committed_task_id === input.committed_task.id &&
    observedMarker.receipt_hash === input.receipt_hash;
  if (!startObserved) {
    return {
      ok: false,
      error: "next_migration_task_start_requires_reconciliation",
      review_required: true,
      automatic_retry_blocked: observed?.status !== "pending",
      next_task: observed || next,
      evidence: {
        cas_counters: decision.counters,
        cas_ambiguous: decision.ambiguous,
        write_error: writeError || null,
        read_error: readError || null,
      },
    };
  }
  try {
    await assertEmergencyEpochUnchanged(
      svc,
      input.epoch,
      "after:next_migration_task_start",
    );
  } catch (error: any) {
    const blockedAt = new Date().toISOString();
    const blockedPatch = {
      status: "blocked",
      blocked_reason: "emergency_epoch_changed_after_task_start",
      updated_at: blockedAt,
      metadata_json: {
        ...(observed.metadata_json || {}),
        ambiguity_state: "REVIEW_REQUIRED",
        automatic_retry_blocked: true,
      },
    };
    let containedResult: any = null;
    try {
      containedResult = await svc.entities.MigrationTask.updateMany(
        taskAuthorityFilter(observed),
        { $set: blockedPatch },
      );
    } catch (_) {
      containedResult = null;
    }
    const containedDecision = paymentsMigrationCasResult(containedResult);
    let containedObserved = false;
    try {
      const row = await readTaskAuthority(
        svc,
        next.id,
        "payments_migration_next_task_containment_readback",
      );
      containedObserved = row?.status === "blocked" &&
        row?.updated_at === blockedAt &&
        row?.metadata_json?.ambiguity_state === "REVIEW_REQUIRED";
    } catch (_) {
      containedObserved = false;
    }
    return {
      ok: false,
      error: error?.message || "emergency_control_epoch_changed",
      review_required: true,
      automatic_retry_blocked: true,
      locally_contained: containedDecision.exactly_one && containedObserved,
      next_task: observed,
    };
  }
  return {
    ok: true,
    replay: !decision.exactly_one,
    reconciled_after_ambiguous_cas: decision.ambiguous,
    next_task: observed,
  };
}

const ALLOWED: Record<string, Set<string>> = {
  pending: new Set(["in_progress"]),
  in_progress: new Set(["blocked", "done"]),
  blocked: new Set(["in_progress"]),
  done: new Set(),
};

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch((error: any) =>
      safeBestEffort(error, {
        operation: "updatePaymentsMigrationTask",
        fallback: null,
        severity: "critical",
      })
    );
    if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (me.role !== "admin") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const taskId = String(body?.task_id || "");
    const nextStatus = String(body?.status || "");
    const note = String(body?.note || "").trim();
    const merchantRequired = body?.merchant_required === true;
    const merchantMessage = body?.merchant_message_i18n &&
        typeof body.merchant_message_i18n === "object"
      ? body.merchant_message_i18n
      : null;
    const merchantMessageComplete = !!merchantMessage &&
      ["en", "fr", "es"].every((lang) =>
        typeof merchantMessage?.[lang] === "string" &&
        merchantMessage[lang].trim().length >= 3
      );
    if (!taskId || !VALID.has(nextStatus)) {
      return Response.json({ error: "task_id and valid status required" }, {
        status: 400,
      });
    }
    if (nextStatus === "blocked" && note.length < 3) {
      return Response.json({ error: "blocker_note_required" }, { status: 400 });
    }
    if (
      nextStatus === "blocked" && merchantRequired && !merchantMessageComplete
    ) {
      return Response.json({ error: "merchant_blocker_requires_en_fr_es" }, {
        status: 400,
      });
    }

    const svc = base44.asServiceRole;
    let migrationEpoch: EmergencyEpochClaim | null = null;
    const task: any = await readTaskAuthority(
      svc,
      taskId,
      "payments_migration_task_authority_read",
    );
    if (task?.metadata_json?.plan_version !== PLAN_VERSION) {
      return Response.json({ error: "not_p9_task" }, { status: 409 });
    }
    if (
      task.status === "done" && nextStatus === "done" &&
      task.step_name === "go_live"
    ) {
      const priorState = paymentsMigrationSagaState(task);
      const priorChain = await validatePaymentsMigrationReceiptChain(task);
      const originalFrom = String(priorState?.result?.task_from_status || "");
      const storedTaskAuthority = priorState?.result?.task_authority_snapshot;
      const storedActivationAuthority = priorState?.result
        ?.activation_authority_snapshot;
      const storedMandateAuthority = priorState?.result
        ?.mandate_authority_snapshot;
      const storedApprovalId = String(priorState?.result?.approval_id || "");
      const storedEvidenceNote = String(
        priorState?.result?.evidence_note || "",
      );
      if (
        (body?.approval_id && String(body.approval_id) !== storedApprovalId) ||
        (note && note !== storedEvidenceNote)
      ) {
        return Response.json({
          error: "payments_migration_go_live_replay_binding_conflict",
          review_required: true,
          automatic_retry_blocked: true,
        }, { status: 409 });
      }
      const replayPayloadHash = await sha256Canonical({
        task_id: task.id,
        from: originalFrom,
        to: nextStatus,
        activation_id: task.deal_activation_id,
        approval_id: storedApprovalId,
        evidence_note: storedEvidenceNote,
        task_authority_snapshot: storedTaskAuthority,
        activation_authority_snapshot: storedActivationAuthority,
        mandate_authority_snapshot: storedMandateAuthority,
      });
      const replayOperationKey = await paymentsMigrationOperationKey({
        task_id: task.id,
        activation_id: task.deal_activation_id,
        from_status: originalFrom,
        to_status: nextStatus,
        payload_hash: replayPayloadHash,
      });
      if (
        storedTaskAuthority && storedActivationAuthority &&
        storedMandateAuthority &&
        priorChain.ok && priorState.phase === "COMMITTED" &&
        priorState.operation_key === replayOperationKey &&
        priorState.result?.material_payload_hash === replayPayloadHash
      ) {
        let replayEpoch: EmergencyEpochClaim;
        try {
          replayEpoch = await captureEmergencyEpoch(svc, "migrations");
        } catch (error: any) {
          return Response.json({
            error: error?.message || "emergency_control_paused:migrations",
            idempotent_effect_replay: true,
            next_task_reconciled: false,
          }, { status: 409 });
        }
        let replayInventory: any[];
        try {
          replayInventory = await requireCriticalOperation(
            "payments_migration_replay_task_inventory_read",
            () =>
              svc.entities.MigrationTask.filter(
                { deal_activation_id: task.deal_activation_id },
                "order",
                101,
              ),
          );
        } catch (_) {
          return Response.json({
            error: "payments_migration_task_inventory_unavailable",
            idempotent_effect_replay: true,
            next_task_reconciled: false,
          }, { status: 503 });
        }
        if (!Array.isArray(replayInventory) || replayInventory.length >= 101) {
          return Response.json({
            error: "payments_migration_task_inventory_incomplete",
            idempotent_effect_replay: true,
            next_task_reconciled: false,
          }, { status: 409 });
        }
        const replayNext = replayInventory
          .filter((row) => row?.metadata_json?.plan_version === PLAN_VERSION)
          .find((row) =>
            Number(row.order || 0) > Number(task.order || 0) &&
            !["done", "canceled"].includes(String(row.status || ""))
          );
        const followup = await advanceNextMigrationTask(svc, {
          committed_task: task,
          next_task: replayNext,
          receipt_hash: priorState.receipt_head,
          epoch: replayEpoch,
        });
        if (!followup.ok) {
          return Response.json({
            error: followup.error,
            idempotent_effect_replay: true,
            next_task_reconciled: false,
            next_task_id: followup.next_task?.id || null,
            review_required: followup.review_required === true,
            automatic_retry_blocked: followup.automatic_retry_blocked === true,
            locally_contained: followup.locally_contained === true,
          }, { status: 409 });
        }
        return Response.json({
          ok: true,
          idempotent_replay: true,
          task_id: task.id,
          status: "done",
          receipt_hash: priorState.receipt_head,
          next_task_id: followup.next_task?.id || null,
          next_task_reconciled: true,
        });
      }
      return Response.json({
        error: "payments_migration_go_live_replay_binding_conflict",
        review_required: true,
        automatic_retry_blocked: true,
      }, { status: 409 });
    }
    const allowed = ALLOWED[task.status] || new Set();
    if (!allowed.has(nextStatus)) {
      return Response.json({
        error: "invalid_task_transition",
        from: task.status,
        to: nextStatus,
      }, { status: 409 });
    }
    if (nextStatus === "done" && note.length < 3) {
      return Response.json({ error: "completion_evidence_note_required" }, {
        status: 400,
      });
    }
    if (nextStatus === "in_progress" || nextStatus === "done") {
      try {
        migrationEpoch = await captureEmergencyEpoch(svc, "migrations");
      } catch (error: any) {
        return Response.json({
          error: error?.message || "emergency_control_paused:migrations",
        }, { status: 409 });
      }
    }
    const activation: any = await readSingleMigrationAuthority(
      svc.entities.DealActivation,
      { id: task.deal_activation_id },
      "payments_migration_activation_authority_read",
      {
        missing: "payments_activation_not_found",
        ambiguous: "payments_activation_authority_ambiguous",
        unavailable: "payments_activation_authority_unavailable",
        missingStatus: 404,
      },
    );
    if (activation.vertical !== "payments") {
      return Response.json({ error: "payments_activation_not_found" }, {
        status: 404,
      });
    }
    if (!["migrating", "live"].includes(activation.status)) {
      return Response.json({
        error: "migration_activation_not_operational",
        activation_status: activation.status,
      }, { status: 409 });
    }
    const activeMandate: any = await readSingleMigrationAuthority(
      svc.entities.Mandate,
      { deal_activation_id: activation.id, status: "active" },
      "payments_migration_active_mandate_authority_read",
      {
        missing: "active_mandate_required",
        ambiguous: "active_mandate_authority_ambiguous",
        unavailable: "active_mandate_authority_unavailable",
        missingStatus: 409,
      },
    );
    if (
      !String(activation.brand_id || "") ||
      !String(activation.provider_id || "") ||
      String(activeMandate.deal_activation_id || "") !==
        String(activation.id || "") ||
      String(activeMandate.brand_id || "") !==
        String(activation.brand_id || "") ||
      String(activeMandate.provider_id || "") !==
        String(activation.provider_id || "")
    ) {
      return Response.json({
        error: "payments_migration_material_authority_binding_mismatch",
        material_effects_fail_closed: true,
      }, { status: 409 });
    }

    let allTasks: any[];
    try {
      allTasks = await requireCriticalOperation(
        "payments_migration_task_inventory_read",
        () =>
          svc.entities.MigrationTask.filter(
            { deal_activation_id: activation.id },
            "order",
            101,
          ),
      );
    } catch {
      return Response.json({
        error: "payments_migration_task_inventory_unavailable",
        material_effects_fail_closed: true,
      }, { status: 503 });
    }
    if (!Array.isArray(allTasks) || allTasks.length >= 101) {
      return Response.json({
        error: "payments_migration_task_inventory_incomplete",
        material_effects_fail_closed: true,
      }, { status: 409 });
    }
    const tasks = allTasks.filter((t) =>
      t?.metadata_json?.plan_version === PLAN_VERSION && t.status !== "canceled"
    );
    if (nextStatus === "in_progress" || nextStatus === "done") {
      const earlier = tasks.filter((t) =>
        Number(t.order || 0) < Number(task.order || 0) && t.status !== "done"
      );
      if (earlier.length) {
        return Response.json({
          error: "earlier_tasks_incomplete",
          task_ids: earlier.map((t) => t.id),
        }, { status: 409 });
      }
    }
    if (nextStatus === "done") {
      if (task.step_name === "go_live" && activation.status !== "migrating") {
        return Response.json({
          error: "go_live_requires_migrating",
          activation_status: activation.status,
        }, { status: 409 });
      }
      if (task.step_name === "verify_savings") {
        if (
          !activation.conditions_activated_at ||
          !activation.first_measurement_month
        ) {
          return Response.json({
            error: "conditions_activation_evidence_required",
          }, { status: 409 });
        }
        const reports = await svc.entities.MonthlySavingsReport.filter(
          { deal_activation_id: activation.id },
          "-month",
          50,
        ).catch((error: any) =>
          safeBestEffort(error, {
            operation: "updatePaymentsMigrationTask",
            fallback: [],
            severity: "critical",
          })
        );
        const verified = (reports || []).find((r: any) =>
          String(r.month || "") >=
            String(activation.first_measurement_month || "") &&
          r.measurement_mode === "fully_verified" &&
          ["verified", "realized"].includes(r.verification_status) &&
          Number.isFinite(Number(r.savings)) &&
          Number(r.savings) > 0
        );
        if (!verified) {
          return Response.json({
            error: "verified_real_savings_report_required",
          }, { status: 409 });
        }
      }
    }

    const taskAuthoritySnapshot = {
      version: "payments-migration-task-authority-v1",
      id: String(task.id || ""),
      deal_activation_id: String(task.deal_activation_id || ""),
      step_name: String(task.step_name || ""),
      status: String(task.status || ""),
      order: Number(task.order || 0),
      updated_date: task.updated_date || null,
      revision: task.revision ?? task._revision ?? null,
      metadata_hash: await sha256Canonical(task.metadata_json || {}),
    };
    const activationAuthoritySnapshot = paymentsMigrationActivationAuthority(
      activation,
    );
    const mandateAuthoritySnapshot = {
      version: "payments-migration-mandate-authority-v1",
      id: String(activeMandate.id || ""),
      deal_activation_id: String(activeMandate.deal_activation_id || ""),
      brand_id: String(activeMandate.brand_id || ""),
      provider_id: String(activeMandate.provider_id || ""),
      status: String(activeMandate.status || ""),
      updated_date: activeMandate.updated_date || null,
      revision: activeMandate.revision ?? activeMandate._revision ?? null,
      acceptance_snapshot_hash: String(
        activeMandate.acceptance_snapshot_hash || "",
      ),
    };
    let materialPayloadHash = "";
    let legalDecision: any = null;
    if (nextStatus === "done" && task.step_name === "go_live") {
      if (!activationAuthoritySnapshot.revision_authority_available) {
        return Response.json({
          error: "payments_activation_revision_authority_unavailable",
          material_effects_fail_closed: true,
        }, { status: 409 });
      }
      materialPayloadHash = await sha256Canonical({
        task_id: task.id,
        from: task.status,
        to: nextStatus,
        activation_id: activation.id,
        approval_id: String(body?.approval_id || ""),
        evidence_note: note,
        task_authority_snapshot: taskAuthoritySnapshot,
        activation_authority_snapshot: activationAuthoritySnapshot,
        mandate_authority_snapshot: mandateAuthoritySnapshot,
      });
      try {
        legalDecision = await enforceLegalExecution(svc, {
          requested_action: "AUTHORIZE_MIGRATION",
          merchant_id: activation.brand_id,
          provider_id: activation.provider_id || null,
          case_id: activation.id,
          deal_activation_id: activation.id,
          mandate_id: activeMandate.id,
          approval_id: body?.approval_id || null,
          material_payload_hash: materialPayloadHash,
          actor: {
            id: String(me.email || "admin"),
            type: "HUMAN_ADMIN",
            tool: "updatePaymentsMigrationTask",
            allowed_actions: ["AUTHORIZE_MIGRATION"],
          },
        });
      } catch (error) {
        const response = legalBlockResponse(error);
        if (response) return response;
        throw error;
      }
    }

    const now = new Date().toISOString();
    const retryCount = Number(task?.metadata_json?.retry_count || 0) +
      (task.status === "blocked" && nextStatus === "in_progress" ? 1 : 0);
    const taskPatch = {
      status: nextStatus,
      updated_at: now,
      completed_at: nextStatus === "done" ? now : undefined,
      blocked_reason: nextStatus === "blocked" ? note : "",
      requires_brand_input: nextStatus === "blocked" ? merchantRequired : false,
      metadata_json: {
        ...(task.metadata_json || {}),
        retry_count: retryCount,
        last_note: note || undefined,
        last_actor: me.email,
        last_transition_at: now,
        // Customer-safe copy is deliberately separated from internal notes.
        // A merchant blocker is publishable only when EN/FR/ES are all present.
        merchant_blocker_i18n: nextStatus === "blocked" && merchantRequired
          ? {
            en: merchantMessage.en.trim(),
            fr: merchantMessage.fr.trim(),
            es: merchantMessage.es.trim(),
          }
          : null,
      },
    };
    const goLiveTransition = nextStatus === "done" &&
      task.step_name === "go_live";
    let goLiveReceiptHash = "";
    if (goLiveTransition) {
      const operationKey = await paymentsMigrationOperationKey({
        task_id: task.id,
        activation_id: activation.id,
        from_status: task.status,
        to_status: nextStatus,
        payload_hash: materialPayloadHash,
      });
      const claim = await claimPaymentsMigrationSaga(svc, task, {
        operation_key: operationKey,
      });
      if (claim.replay) {
        const replayState = paymentsMigrationSagaState(claim.task);
        return Response.json({
          ok: true,
          idempotent_replay: true,
          task_id: taskId,
          status: "done",
          receipt_hash: replayState.receipt_head || null,
        });
      }
      if (claim.in_progress) {
        return Response.json({
          error: "payments_migration_go_live_in_progress",
          automatic_retry_blocked: true,
        }, { status: 409 });
      }
      if (!claim.acquired || claim.review_required) {
        return Response.json({
          error: "payments_migration_go_live_reconciliation_required",
          review_required: true,
          automatic_retry_blocked: true,
        }, { status: 409 });
      }
      let sagaTask = claim.task;
      const attemptToken = paymentsMigrationSagaState(sagaTask).attempt_token;
      try {
        await assertEmergencyEpochUnchanged(
          svc,
          migrationEpoch!,
          "before:payments_migration_go_live",
        );
      } catch (error: any) {
        await blockPaymentsMigrationSagaBeforeEffect(svc, sagaTask, {
          operation_key: operationKey,
          attempt_token: attemptToken,
          blocker: "emergency_epoch_changed_before_go_live",
        });
        return Response.json({
          error: error?.message || "emergency_control_epoch_changed",
          review_required: true,
          automatic_retry_blocked: true,
          provider_effect_started: false,
        }, { status: 409 });
      }
      sagaTask = await startPaymentsMigrationSagaStep(svc, sagaTask, {
        operation_key: operationKey,
        attempt_token: attemptToken,
        step_key: "activate_payments_go_live",
      });
      let liveClaim: any;
      try {
        liveClaim = await svc.entities.DealActivation.updateMany(
          paymentsMigrationActivationCasFilter(activationAuthoritySnapshot),
          { $set: { status: "live", last_updated: now } },
        );
      } catch (error: any) {
        const evidence = {
          blocker: "activation_go_live_write_outcome_unknown",
          error: String(error?.message || error).slice(0, 300),
          activation_id: activation.id,
        };
        try {
          await finishPaymentsMigrationSagaStep(svc, sagaTask, {
            operation_key: operationKey,
            attempt_token: attemptToken,
            step_key: "activate_payments_go_live",
            result: evidence,
            terminal_phase: "RECONCILING",
            task_patch: {
              ...taskPatch,
              status: "blocked",
              completed_at: "",
              blocked_reason: evidence.blocker,
            },
          });
        } catch (_) {
          const freshTask = await readTaskAuthority(
            svc,
            taskId,
            "payments_migration_go_live_unknown_task_read",
          );
          await markPaymentsMigrationReconciliation(
            svc,
            freshTask,
            evidence.blocker,
            evidence,
          );
        }
        return Response.json({
          error: evidence.blocker,
          review_required: true,
          automatic_retry_blocked: true,
        }, { status: 409 });
      }
      const liveDecision = paymentsMigrationCasResult(liveClaim);
      let observedActivation: any;
      try {
        observedActivation = await readSingleMigrationAuthority(
          svc.entities.DealActivation,
          { id: activation.id },
          "payments_migration_go_live_activation_readback",
          {
            missing: "payments_activation_disappeared_after_go_live",
            ambiguous: "payments_activation_readback_ambiguous",
            unavailable: "payments_activation_readback_unavailable",
            missingStatus: 409,
          },
        );
      } catch (error: any) {
        const result = {
          blocker: "activation_go_live_readback_requires_reconciliation",
          activation_id: activation.id,
          cas_counters: liveDecision.counters,
          readback_error: String(
            error?.code || "payments_activation_readback_unavailable",
          ),
          activation_authority_snapshot: activationAuthoritySnapshot,
        };
        try {
          await finishPaymentsMigrationSagaStep(svc, sagaTask, {
            operation_key: operationKey,
            attempt_token: attemptToken,
            step_key: "activate_payments_go_live",
            result,
            terminal_phase: "RECONCILING",
            task_patch: {
              ...taskPatch,
              status: "blocked",
              completed_at: "",
              blocked_reason: result.blocker,
            },
          });
        } catch (_) {
          const freshTask = await readTaskAuthority(
            svc,
            taskId,
            "payments_migration_readback_failure_task_authority_read",
          );
          await markPaymentsMigrationReconciliation(
            svc,
            freshTask,
            result.blocker,
            result,
          );
        }
        return Response.json({
          error: result.blocker,
          review_required: true,
          automatic_retry_blocked: true,
        }, { status: 409 });
      }
      const liveReadbackMatches = paymentsMigrationActivationReadbackMatches(
        observedActivation,
        activationAuthoritySnapshot,
        "live",
      );
      if (!liveDecision.exactly_one || !liveReadbackMatches) {
        const ambiguous = liveDecision.ambiguous ||
          observedActivation?.status === "live";
        const result = {
          blocker: ambiguous
            ? "activation_go_live_outcome_requires_reconciliation"
            : "activation_changed_concurrently",
          activation_id: activation.id,
          expected_status: "live",
          observed_status: observedActivation?.status || "unknown",
          cas_counters: liveDecision.counters,
          activation_authority_match: liveReadbackMatches,
          activation_authority_snapshot: activationAuthoritySnapshot,
        };
        await finishPaymentsMigrationSagaStep(svc, sagaTask, {
          operation_key: operationKey,
          attempt_token: attemptToken,
          step_key: "activate_payments_go_live",
          result,
          terminal_phase: ambiguous ? "RECONCILING" : "BLOCKED",
          task_patch: {
            ...taskPatch,
            status: "blocked",
            completed_at: "",
            blocked_reason: result.blocker,
          },
        });
        return Response.json({
          error: result.blocker,
          activation_status: result.observed_status,
          review_required: ambiguous,
          automatic_retry_blocked: ambiguous,
        }, { status: 409 });
      }
      try {
        await assertEmergencyEpochUnchanged(
          svc,
          migrationEpoch!,
          "after:payments_migration_go_live",
        );
      } catch (error: any) {
        let containmentResult: any;
        const liveAuthoritySnapshot = paymentsMigrationActivationAuthority(
          observedActivation,
        );
        try {
          containmentResult = await svc.entities.DealActivation.updateMany(
            paymentsMigrationActivationCasFilter(liveAuthoritySnapshot),
            {
              $set: {
                status: "paused",
                last_updated: new Date().toISOString(),
              },
            },
          );
        } catch (_) {
          containmentResult = null;
        }
        const containmentDecision = paymentsMigrationCasResult(
          containmentResult,
        );
        let containedActivation: any = null;
        let containmentReadbackError = "";
        try {
          containedActivation = await readSingleMigrationAuthority(
            svc.entities.DealActivation,
            { id: activation.id },
            "payments_migration_go_live_containment_readback",
            {
              missing: "payments_activation_missing_after_containment",
              ambiguous: "payments_activation_containment_readback_ambiguous",
              unavailable:
                "payments_activation_containment_readback_unavailable",
              missingStatus: 409,
            },
          );
        } catch (readError: any) {
          containmentReadbackError = String(
            readError?.code ||
              "payments_activation_containment_readback_unavailable",
          );
        }
        const contained = containmentDecision.exactly_one &&
          paymentsMigrationActivationReadbackMatches(
            containedActivation,
            liveAuthoritySnapshot,
            "paused",
          );
        const result = {
          blocker: "emergency_epoch_changed_after_go_live",
          activation_id: activation.id,
          effect_status: "live_observed",
          compensation_status: contained
            ? "paused_confirmed"
            : "reconciliation_required",
          containment_counters: containmentDecision.counters,
          observed_status: containedActivation?.status || "unknown",
          containment_readback_error: containmentReadbackError || null,
          activation_authority_snapshot: activationAuthoritySnapshot,
        };
        await finishPaymentsMigrationSagaStep(svc, sagaTask, {
          operation_key: operationKey,
          attempt_token: attemptToken,
          step_key: "activate_payments_go_live",
          result,
          terminal_phase: contained ? "BLOCKED" : "RECONCILING",
          task_patch: {
            ...taskPatch,
            status: "blocked",
            completed_at: "",
            blocked_reason: result.blocker,
          },
        });
        return Response.json({
          error: error?.message || "emergency_control_epoch_changed",
          review_required: true,
          locally_contained: contained,
          automatic_retry_blocked: true,
        }, { status: 409 });
      }
      const receiptResult = {
        task_from_status: task.status,
        activation_id: activation.id,
        activation_from: "migrating",
        activation_to: "live",
        activation_observed: true,
        cas_counters: liveDecision.counters,
        material_payload_hash: materialPayloadHash,
        task_authority_snapshot: taskAuthoritySnapshot,
        activation_authority_snapshot: activationAuthoritySnapshot,
        mandate_authority_snapshot: mandateAuthoritySnapshot,
        approval_id: String(body?.approval_id || ""),
        evidence_note: note,
        legal_authority_snapshot_id: String(
          legalDecision?.authority_snapshot_id || "",
        ),
        legal_authority_snapshot_hash: String(
          legalDecision?.authority_snapshot_hash || "",
        ),
        emergency_control_revision: Number(
          migrationEpoch?.control_revision || 0,
        ),
      };
      try {
        sagaTask = await finishPaymentsMigrationSagaStep(svc, sagaTask, {
          operation_key: operationKey,
          attempt_token: attemptToken,
          step_key: "activate_payments_go_live",
          result: receiptResult,
          terminal_phase: "COMMITTED",
          task_patch: taskPatch,
        });
      } catch (error: any) {
        const freshTask = await readTaskAuthority(
          svc,
          taskId,
          "payments_migration_go_live_receipt_failure_readback",
        );
        const freshState = paymentsMigrationSagaState(freshTask);
        const freshChain = await validatePaymentsMigrationReceiptChain(
          freshTask,
        );
        if (
          freshState.phase !== "COMMITTED" ||
          freshState.operation_key !== operationKey || !freshChain.ok
        ) {
          await markPaymentsMigrationReconciliation(
            svc,
            freshTask,
            "activation_live_receipt_commit_failed",
            { error: String(error?.message || error).slice(0, 300) },
          );
          return Response.json({
            error: "activation_live_receipt_commit_failed",
            review_required: true,
            automatic_retry_blocked: true,
          }, { status: 409 });
        }
        sagaTask = freshTask;
      }
      goLiveReceiptHash = paymentsMigrationSagaState(sagaTask).receipt_head;
      await svc.entities.OperationalLog.create({
        deal_activation_id: activation.id,
        brand_id: activation.brand_id || "",
        provider_id: activation.provider_id || "",
        event_type: "go_live",
        message: "Payments migration went live",
        data_json: {
          task_id: taskId,
          receipt_hash: goLiveReceiptHash,
          operation_key: operationKey,
        },
        actor_email: me.email,
        created_at: now,
      }).catch((error: any) =>
        safeBestEffort(error, {
          operation: "updatePaymentsMigrationTask",
          fallback: null,
          severity: "critical",
        })
      );
    } else {
      if (migrationEpoch) {
        try {
          await assertEmergencyEpochUnchanged(
            svc,
            migrationEpoch,
            "before:migration_task_transition",
          );
        } catch (error: any) {
          return Response.json({
            error: error?.message || "emergency_control_epoch_changed",
            review_required: true,
          }, { status: 409 });
        }
      }
      let claimed: any;
      try {
        claimed = await svc.entities.MigrationTask.updateMany(
          taskAuthorityFilter(task),
          { $set: taskPatch },
        );
      } catch (_) {
        const observed = await readTaskAuthority(
          svc,
          taskId,
          "payments_migration_task_transition_unknown_readback",
        );
        return Response.json({
          error: "task_transition_outcome_requires_reconciliation",
          review_required: true,
          automatic_retry_blocked: true,
          transition_observed: observed?.status === nextStatus,
        }, { status: 409 });
      }
      const taskTransitionDecision = paymentsMigrationCasResult(claimed);
      const transitionedTask = await readTaskAuthority(
        svc,
        taskId,
        "payments_migration_task_transition_readback",
      );
      const taskTransitionObserved = transitionedTask?.status === nextStatus &&
        transitionedTask?.updated_at === now;
      if (!taskTransitionDecision.exactly_one || !taskTransitionObserved) {
        const ambiguous = taskTransitionDecision.ambiguous ||
          taskTransitionObserved;
        return Response.json({
          error: ambiguous
            ? "task_transition_outcome_requires_reconciliation"
            : "task_changed_concurrently",
          review_required: ambiguous,
          automatic_retry_blocked: ambiguous,
          cas_counters: taskTransitionDecision.counters,
        }, { status: 409 });
      }
      if (migrationEpoch) {
        try {
          await assertEmergencyEpochUnchanged(
            svc,
            migrationEpoch,
            "after:migration_task_transition",
          );
        } catch (error: any) {
          const containmentTime = new Date().toISOString();
          const containmentPatch = {
            status: "blocked",
            completed_at: "",
            updated_at: containmentTime,
            blocked_reason: "emergency_epoch_changed_during_task_transition",
            metadata_json: {
              ...(transitionedTask.metadata_json || {}),
              ambiguity_state: "REVIEW_REQUIRED",
              automatic_retry_blocked: true,
            },
          };
          let containmentResult: any = null;
          try {
            containmentResult = await svc.entities.MigrationTask.updateMany(
              taskAuthorityFilter(transitionedTask),
              { $set: containmentPatch },
            );
          } catch (_) {
            containmentResult = null;
          }
          const containmentDecision = paymentsMigrationCasResult(
            containmentResult,
          );
          let containmentObserved = false;
          try {
            const row = await readTaskAuthority(
              svc,
              taskId,
              "payments_migration_task_containment_readback",
            );
            containmentObserved = row?.status === "blocked" &&
              row?.updated_at === containmentTime &&
              row?.metadata_json?.ambiguity_state === "REVIEW_REQUIRED";
          } catch (_) {
            containmentObserved = false;
          }
          const contained = containmentDecision.exactly_one &&
            containmentObserved;
          return Response.json({
            error: error?.message || "emergency_control_epoch_changed",
            review_required: true,
            locally_contained: contained,
            automatic_retry_blocked: true,
          }, { status: 409 });
        }
      }
    }

    if (nextStatus === "done") {
      const next = tasks.find((t) =>
        Number(t.order || 0) > Number(task.order || 0) && t.status === "pending"
      );
      if (next) {
        const followup = await advanceNextMigrationTask(svc, {
          committed_task: task,
          next_task: next,
          receipt_hash: goLiveReceiptHash,
          epoch: migrationEpoch!,
        });
        if (!followup.ok) {
          return Response.json({
            error: followup.error,
            committed_task_id: taskId,
            next_task_id: followup.next_task?.id || next.id,
            review_required: followup.review_required === true,
            automatic_retry_blocked: followup.automatic_retry_blocked === true,
            locally_contained: followup.locally_contained === true,
          }, { status: 409 });
        }
      }
    }

    await svc.entities.OperationalLog.create({
      deal_activation_id: activation.id,
      brand_id: activation.brand_id || "",
      provider_id: activation.provider_id || "",
      event_type: "task_updated",
      message: `${task.step_name}: ${task.status} → ${nextStatus}`,
      data_json: {
        task_id: taskId,
        from: task.status,
        to: nextStatus,
        note: note || null,
        merchant_required: merchantRequired,
        merchant_message_locales: merchantRequired ? ["en", "fr", "es"] : [],
        retry_count: retryCount,
      },
      actor_email: me.email,
      created_at: now,
    }).catch((error: any) =>
      safeBestEffort(error, {
        operation: "updatePaymentsMigrationTask",
        fallback: null,
        severity: "critical",
      })
    );

    return Response.json({
      ok: true,
      task_id: taskId,
      status: nextStatus,
      receipt_hash: goLiveReceiptHash || null,
    });
  } catch (error) {
    if (error instanceof MigrationAuthorityError) {
      return Response.json({
        error: error.code,
        material_effects_fail_closed: true,
      }, { status: error.status });
    }
    console.error("updatePaymentsMigrationTask failed", error);
    return Response.json({ error: "migration_task_update_failed" }, {
      status: 500,
    });
  }
}
