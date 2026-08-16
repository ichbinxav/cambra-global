import { updatedExactlyOne } from "./approvalResolutionSaga.ts";
import { sha256 } from "./intelligenceCore.ts";
import { terminalDiscoveryStatus } from "./discoveryV2Planner.ts";

export const DISCOVERY_RUN_LEASE_MS = 90_000;

const text = (value: any) => String(value ?? "").trim();
const at = (milliseconds = Date.now()) => new Date(milliseconds).toISOString();

function error(code: string, status = 409) {
  const value: any = new Error(code);
  value.code = code;
  value.status = status;
  return value;
}

export function discoveryLeaseActive(run: any, nowMs = Date.now()) {
  const expiry = Date.parse(text(run?.lease_expires_at));
  return Boolean(
    run?.lease_owner && Number.isFinite(expiry) && expiry > nowMs,
  );
}

export async function acceptedDiscoveryPlanHash(plan: any) {
  return sha256({
    engine_version: plan?.engine_version,
    source_capability_version: plan?.source_capability_version,
    configuration: plan?.configuration,
    selected_source: plan?.selected_source,
    filter_execution_contract: plan?.filter_execution_contract,
    source_partitions: plan?.source_partitions,
    cost: plan?.cost,
    stages: plan?.stages,
  });
}

/**
 * One stage owner at a time. An expired lease after a declared material
 * provider effect is not replayed automatically; it becomes NEEDS_REVIEW.
 */
export async function claimDiscoveryRun(
  service: any,
  run: any,
  owner: string,
  nowMs = Date.now(),
) {
  if (!run) throw error("discovery_run_not_found", 404);
  if (terminalDiscoveryStatus(run.status)) {
    return { acquired: false, terminal: true, run };
  }
  if (discoveryLeaseActive(run, nowMs) && run.lease_owner !== owner) {
    return { acquired: false, in_progress: true, run };
  }
  const checkpoint = run.checkpoint_json || {};
  if (
    !discoveryLeaseActive(run, nowMs) &&
    checkpoint.stage === run.current_stage &&
    checkpoint.effect_status === "STARTED" &&
    checkpoint.material_effect === true
  ) {
    const revision = Number(run.run_revision || 0);
    const changed = await service.entities.DiscoveryExecutionRun.updateMany(
      { id: run.id, run_revision: revision },
      {
        $set: {
          status: "NEEDS_REVIEW",
          current_stage: "COMPLETE",
          stop_reason: "AMBIGUOUS_MATERIAL_STAGE_EFFECT",
          completed_at: at(nowMs),
          lease_owner: "",
          lease_expires_at: "",
          stage_attempt_token: "",
          run_revision: revision + 1,
          actual_stages_json: [...(run.actual_stages_json || []), {
            stage: run.current_stage,
            status: "NEEDS_REVIEW",
            at: at(nowMs),
            started_at: run.stage_started_at || null,
            attempt: run.stage_attempt || null,
            paid: true,
          }],
          errors_json: [...(run.errors_json || []), {
            code: "AMBIGUOUS_MATERIAL_STAGE_EFFECT",
            stage: run.current_stage,
            at: at(nowMs),
          }],
        },
      },
    );
    const observed = updatedExactlyOne(changed)
      ? await service.entities.DiscoveryExecutionRun.get(run.id)
      : await service.entities.DiscoveryExecutionRun.get(run.id);
    return { acquired: false, review_required: true, run: observed };
  }
  const revision = Number(run.run_revision || 0);
  const token = `discovery-stage:${crypto.randomUUID()}`;
  const changed = await service.entities.DiscoveryExecutionRun.updateMany(
    { id: run.id, run_revision: revision, current_stage: run.current_stage },
    {
      $set: {
        status: run.status === "QUEUED" ? "RUNNING" : run.status,
        run_revision: revision + 1,
        lease_owner: owner,
        lease_expires_at: at(nowMs + DISCOVERY_RUN_LEASE_MS),
        heartbeat_at: at(nowMs),
        stage_attempt: Number(run.stage_attempt || 0) + 1,
        stage_attempt_token: token,
        stage_started_at: at(nowMs),
      },
    },
  );
  if (!updatedExactlyOne(changed)) {
    return {
      acquired: false,
      in_progress: true,
      run: await service.entities.DiscoveryExecutionRun.get(run.id),
    };
  }
  return {
    acquired: true,
    run: await service.entities.DiscoveryExecutionRun.get(run.id),
    owner,
    token,
    revision: revision + 1,
    stage: run.current_stage,
  };
}

function owned(claim: any) {
  return {
    id: claim.run.id,
    run_revision: claim.revision,
    lease_owner: claim.owner,
    stage_attempt_token: claim.token,
    current_stage: claim.stage,
  };
}

export async function assertDiscoveryClaimActive(service: any, claim: any) {
  const observed = await service.entities.DiscoveryExecutionRun.get(
    claim.run.id,
  );
  if (
    !observed ||
    Number(observed.run_revision) !== Number(claim.revision) ||
    observed.lease_owner !== claim.owner ||
    observed.stage_attempt_token !== claim.token ||
    observed.current_stage !== claim.stage ||
    observed.stop_requested === true ||
    terminalDiscoveryStatus(observed.status)
  ) throw error("discovery_stage_fence_lost");
  return observed;
}

export async function markDiscoveryMaterialEffect(
  service: any,
  claim: any,
  detail: any,
) {
  const observed = await assertDiscoveryClaimActive(service, claim);
  const changed = await service.entities.DiscoveryExecutionRun.updateMany(
    owned(claim),
    {
      $set: {
        checkpoint_json: {
          ...(observed.checkpoint_json || {}),
          stage: claim.stage,
          material_effect: true,
          effect_status: "STARTED",
          attempt_token: claim.token,
          started_at: at(),
          ...detail,
        },
        heartbeat_at: at(),
        lease_expires_at: at(Date.now() + DISCOVERY_RUN_LEASE_MS),
      },
    },
  );
  if (!updatedExactlyOne(changed)) throw error("discovery_stage_fence_lost");
}

export async function checkpointDiscoveryMaterialEffect(
  service: any,
  claim: any,
  receipt: any,
) {
  const observed = await assertDiscoveryClaimActive(service, claim);
  const previous = observed.checkpoint_json || {};
  const partitionKey = text(receipt?.partition_key);
  const changed = await service.entities.DiscoveryExecutionRun.updateMany(
    owned(claim),
    {
      $set: {
        checkpoint_json: {
          ...previous,
          stage: claim.stage,
          material_effect: true,
          effect_status: "RECEIPT_PERSISTED",
          attempt_token: claim.token,
          receipt,
          partition_receipts: partitionKey
            ? {
              ...(previous.partition_receipts || {}),
              [partitionKey]: receipt,
            }
            : previous.partition_receipts || {},
          completed_at: at(),
        },
        heartbeat_at: at(),
        lease_expires_at: at(Date.now() + DISCOVERY_RUN_LEASE_MS),
      },
    },
  );
  if (!updatedExactlyOne(changed)) {
    throw error("discovery_checkpoint_fence_lost");
  }
}

export async function commitDiscoveryStage(
  service: any,
  claim: any,
  patch: any,
) {
  const observed = await assertDiscoveryClaimActive(service, claim);
  const terminal = terminalDiscoveryStatus(patch.status);
  const nextRevision = Number(claim.revision) + 1;
  const previousStages = Array.isArray(observed.actual_stages_json)
    ? observed.actual_stages_json
    : [];
  const requestedStages = Array.isArray(patch.actual_stages_json)
    ? patch.actual_stages_json
    : null;
  let historicalStageChanged = false;
  if (requestedStages && requestedStages.length >= previousStages.length) {
    for (let index = 0; index < previousStages.length; index += 1) {
      if (
        await sha256(previousStages[index]) !==
          await sha256(requestedStages[index])
      ) {
        historicalStageChanged = true;
        break;
      }
    }
  }
  if (
    requestedStages &&
    (requestedStages.length < previousStages.length ||
      historicalStageChanged ||
      requestedStages.length > previousStages.length + 1)
  ) throw error("discovery_stage_history_must_be_append_only");
  let durableStages = requestedStages ? requestedStages : previousStages;
  if (durableStages.length === previousStages.length) {
    durableStages = [...durableStages, {
      stage: claim.stage,
      status: ["FAILED", "NEEDS_REVIEW"].includes(String(patch.status || ""))
        ? patch.status
        : "COMPLETED",
      at: patch.completed_at || at(),
      paid: observed.checkpoint_json?.material_effect === true,
    }];
  }
  if (durableStages.length > previousStages.length) {
    const lastIndex = durableStages.length - 1;
    durableStages = durableStages.map((item: any, index: number) =>
      index === lastIndex
        ? {
          ...item,
          started_at: item?.started_at || observed.stage_started_at || null,
          attempt: item?.attempt ?? observed.stage_attempt ?? null,
        }
        : item
    );
  }
  const changed = await service.entities.DiscoveryExecutionRun.updateMany(
    owned(claim),
    {
      $set: {
        ...patch,
        actual_stages_json: durableStages,
        run_revision: nextRevision,
        lease_owner: "",
        lease_expires_at: "",
        heartbeat_at: at(),
        stage_attempt_token: "",
        checkpoint_json: terminal
          ? {
            ...(observed.checkpoint_json || {}),
            stage: claim.stage,
            effect_status: "COMMITTED",
            committed_at: at(),
            terminal: true,
          }
          : {
            ...(observed.checkpoint_json || {}),
            stage: claim.stage,
            effect_status: "COMMITTED",
            committed_at: at(),
            next_stage: patch.current_stage,
          },
      },
    },
  );
  if (!updatedExactlyOne(changed)) {
    throw error("discovery_stage_commit_fence_lost");
  }
  return service.entities.DiscoveryExecutionRun.get(claim.run.id);
}

export async function requestDiscoveryStop(service: any, run: any) {
  if (terminalDiscoveryStatus(run?.status)) return run;
  const revision = Number(run.run_revision || 0);
  const changed = await service.entities.DiscoveryExecutionRun.updateMany(
    { id: run.id, run_revision: revision },
    {
      $set: {
        stop_requested: true,
        stop_reason: "FOUNDER_STOP_REQUESTED",
        run_revision: revision + 1,
      },
    },
  );
  if (!updatedExactlyOne(changed)) {
    throw error("discovery_stop_changed_concurrently");
  }
  return service.entities.DiscoveryExecutionRun.get(run.id);
}
