import { evaluateSlo } from './productionReadiness.ts';
import { sha256Canonical } from './legalExecution.ts';
import {
  runtimeDeploymentIdentity,
  validateRuntimeDeploymentIdentity,
} from './runtimeEvidence.ts';
import {
  SERVICE_LEVEL_MINIMUM_SAMPLE,
  SERVICE_LEVEL_RUNTIME_VERSION,
  SERVICE_LEVEL_TARGETS,
  SERVICE_LEVEL_WINDOW_TOLERANCE_MS,
} from './serviceLevelCatalog.ts';
import { SERVICE_LEVEL_OBSERVATION_VERSION } from './serviceLevelObservation.ts';

export {
  SERVICE_LEVEL_MINIMUM_SAMPLE,
  SERVICE_LEVEL_RUNTIME_VERSION,
  SERVICE_LEVEL_TARGETS,
};

const SHA40 = /^[a-f0-9]{40}$/iu;
const SHA256 = /^[a-f0-9]{64}$/iu;
const TERMINAL_API_STATES = new Set(['SUCCEEDED', 'FAILED', 'EXCLUDED']);
const TERMINAL_SCHEDULER_STATES = new Set(['COMPLETED', 'FAILED']);
const SNAPSHOT_HASH_FIELDS = Object.freeze([
  'snapshot_key', 'slo_key', 'service_class', 'window_from', 'window_to',
  'coverage_epoch', 'sample_count', 'success_count', 'latency_p95_ms',
  'availability_observed', 'availability_target', 'latency_target_ms',
  'status', 'coverage_status', 'coverage_blockers', 'source_entity',
  'source_record_count', 'source_records_hash', 'runtime_identity_hash',
  'git_sha', 'source_tree_hash', 'base44_bundle_hash',
  'deployment_topology_hash', 'scheduler_inventory_hash',
  'methodology_version', 'source_refs', 'calculated_at',
]);

function instant(value: unknown) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function unique(values: unknown[]) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function quantile95(values: number[]) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.max(0, Math.ceil(0.95 * ordered.length) - 1)];
}

function readRuntimeEnv(name: string) {
  try {
    const deno = (globalThis as any)?.Deno;
    if (deno?.env?.get) return deno.env.get(name);
  } catch { /* unavailable outside Deno */ }
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    return typeof value === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
}

export function serviceLevelCoverageEpoch() {
  return String(readRuntimeEnv('CAMBRA_SLO_COVERAGE_EPOCH') || '').trim();
}

function validWindow(target: any, windowFrom: string, windowTo: string) {
  const from = instant(windowFrom), to = instant(windowTo);
  const expected = Number(target.window_days) * 86_400_000;
  return from !== null && to !== null && from < to &&
    Math.abs((to - from) - expected) <= SERVICE_LEVEL_WINDOW_TOLERANCE_MS;
}

function identityBlockers(row: any, expectedHash: string, expectedSha: string) {
  const rowHash = String(
    row?.runtime_identity_hash || row?.details_json?.runtime_identity_hash || '',
  );
  const rowSha = String(
    row?.runtime_git_sha || row?.details_json?.runtime_git_sha || '',
  );
  const blockers: string[] = [];
  if (!SHA256.test(expectedHash) || !SHA40.test(expectedSha)) {
    blockers.push('slo_runtime_identity_expected_invalid');
  }
  if (rowHash !== expectedHash) blockers.push('slo_runtime_identity_mismatch');
  if (rowSha !== expectedSha) blockers.push('slo_runtime_git_sha_mismatch');
  if (
    row?.details_json?.runtime_identity_status &&
    row.details_json.runtime_identity_status !== 'COMPLETE'
  ) blockers.push('slo_source_runtime_identity_incomplete');
  if (
    row?.payload_summary?.runtime_identity_status &&
    row.payload_summary.runtime_identity_status !== 'COMPLETE'
  ) blockers.push('slo_source_runtime_identity_incomplete');
  return blockers;
}

function sourceRefs(row: any) {
  const values = row?.payload_summary?.source_refs;
  return Array.isArray(values) ? values : [];
}

function observationWithinWindow(
  started: number | null,
  completed: number | null,
  input: any,
) {
  const from = instant(input.window_from), to = instant(input.window_to);
  return started !== null && completed !== null && from !== null && to !== null &&
    started >= from - SERVICE_LEVEL_WINDOW_TOLERANCE_MS &&
    started <= to + SERVICE_LEVEL_WINDOW_TOLERANCE_MS &&
    completed <= to + SERVICE_LEVEL_WINDOW_TOLERANCE_MS;
}

function apiObservations(target: any, rows: any[], input: any) {
  const blockers: string[] = [];
  const samples: Array<{ success: boolean; latency_ms: number }> = [];
  const selected = rows.filter((row) =>
    row?.slo_key === target.slo_key &&
    row?.endpoint === target.endpoint &&
    row?.observation_version === SERVICE_LEVEL_OBSERVATION_VERSION
  );
  const keys = new Set<string>();
  for (const row of selected) {
    const key = String(row?.observation_key || '');
    if (!key || keys.has(key)) blockers.push('slo_observation_identity_ambiguous');
    keys.add(key);
    blockers.push(...identityBlockers(
      row,
      String(input.runtime_identity_hash || ''),
      String(input.runtime_git_sha || ''),
    ));
    const state = String(row?.observation_state || '');
    if (!TERMINAL_API_STATES.has(state)) {
      blockers.push('slo_observation_nonterminal');
      continue;
    }
    const started = instant(row?.started_at);
    const completed = instant(row?.completed_at);
    const duration = Number(row?.duration_ms);
    const statusCode = Number(row?.status_code);
    if (
      started === null || completed === null || completed < started ||
      !Number.isFinite(duration) || duration < 0 ||
      Math.abs(duration - (completed - started)) > SERVICE_LEVEL_WINDOW_TOLERANCE_MS ||
      !Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599
    ) {
      blockers.push('slo_observation_duration_or_terminal_status_invalid');
      continue;
    }
    if (!observationWithinWindow(started, completed, input)) {
      blockers.push('slo_observation_outside_window');
      continue;
    }
    if (state === 'EXCLUDED') {
      if (
        row?.payload_summary?.eligible !== false ||
        !String(row?.payload_summary?.exclusion_reason || '')
      ) blockers.push('slo_exclusion_receipt_invalid');
      continue;
    }
    const success = state === 'SUCCEEDED';
    if (
      (success && (
        row?.status !== 'success' || statusCode < 200 || statusCode >= 400 ||
        sourceRefs(row).length === 0
      )) ||
      (!success && row?.status !== 'error')
    ) {
      blockers.push('slo_observation_outcome_mismatch');
      continue;
    }
    samples.push({ success, latency_ms: duration });
  }
  return { blockers, samples, selected };
}

function schedulerRows(target: any, rows: any[], input: any) {
  const blockers: string[] = [];
  const samples: Array<{ success: boolean; latency_ms: number; row: any }> = [];
  const selected = rows.filter((row) =>
    row?.record_kind === 'ATTEMPT' && row?.worker_key === target.worker_key
  );
  for (const row of selected) {
    const state = String(row?.status || '');
    if (state === 'DUPLICATE_BLOCKED') {
      if (
        row?.details_json?.duplicate_proven !== true ||
        !String(row?.duplicate_of || '')
      ) blockers.push('slo_scheduler_exclusion_receipt_invalid');
      continue;
    }
    blockers.push(...identityBlockers(
      row,
      String(input.runtime_identity_hash || ''),
      String(input.runtime_git_sha || ''),
    ));
    if (!TERMINAL_SCHEDULER_STATES.has(state)) {
      blockers.push('slo_scheduler_attempt_nonterminal');
      continue;
    }
    const started = instant(row?.started_at);
    const completed = instant(row?.completed_at);
    if (started === null || completed === null || completed < started) {
      blockers.push('slo_scheduler_duration_invalid');
      continue;
    }
    if (!observationWithinWindow(started, completed, input)) {
      blockers.push('slo_scheduler_attempt_outside_window');
      continue;
    }
    samples.push({
      success: state === 'COMPLETED',
      latency_ms: completed - started,
      row,
    });
  }
  return { blockers, samples, selected };
}

function schedulerAgentTaskObservations(
  target: any,
  schedulerInput: any[],
  taskInput: any[],
  input: any,
) {
  const scheduler = schedulerRows(target, schedulerInput, input);
  const blockers = [...scheduler.blockers];
  const tasks = taskInput.filter((row) =>
    row?.agent_name === target.agent_name && row?.task_type === target.task_type
  );
  const schedulerById = new Map(
    scheduler.samples.map((sample) => [String(sample.row?.id || ''), sample]),
  );
  const linked = new Map<string, any[]>();
  for (const task of tasks) {
    const refs = Array.isArray(task?.source_refs_json) ? task.source_refs_json : [];
    const schedulerRefs = refs.filter((ref: any) => ref?.type === 'SchedulerRun');
    if (schedulerRefs.length !== 1) {
      blockers.push('slo_company_task_scheduler_reference_invalid');
      continue;
    }
    const schedulerId = String(schedulerRefs[0]?.id || '');
    if (!schedulerById.has(schedulerId)) {
      blockers.push('slo_company_task_orphan');
      continue;
    }
    linked.set(schedulerId, [...(linked.get(schedulerId) || []), task]);
  }
  const samples: Array<{ success: boolean; latency_ms: number }> = [];
  for (const schedulerSample of scheduler.samples) {
    const id = String(schedulerSample.row?.id || '');
    const matches = linked.get(id) || [];
    if (matches.length !== 1) {
      blockers.push(matches.length === 0
        ? 'slo_company_scheduler_task_missing'
        : 'slo_company_scheduler_task_ambiguous');
      continue;
    }
    const task = matches[0];
    const taskState = String(task?.status || '');
    if (!['completed', 'failed'].includes(taskState)) {
      blockers.push('slo_company_task_nonterminal');
      continue;
    }
    const taskStarted = instant(task?.started_at);
    const taskCompleted = instant(task?.completed_at);
    if (
      taskStarted === null || taskCompleted === null ||
      taskCompleted < taskStarted
    ) {
      blockers.push('slo_company_task_duration_invalid');
      continue;
    }
    if (!observationWithinWindow(taskStarted, taskCompleted, input)) {
      blockers.push('slo_company_task_outside_window');
      continue;
    }
    if (!schedulerSample.success && taskState === 'completed') {
      blockers.push('slo_company_scheduler_task_outcome_mismatch');
      continue;
    }
    samples.push({
      success: schedulerSample.success && taskState === 'completed',
      latency_ms: Math.max(
        schedulerSample.latency_ms,
        taskCompleted - taskStarted,
      ),
    });
  }
  return {
    blockers,
    samples,
    selected: [...scheduler.selected, ...tasks],
  };
}

function normalizeSourceRows(target: any, rows: any) {
  if (target.source_kind === 'SCHEDULER_AGENT_TASK_COMPOSITE') {
    return {
      scheduler: Array.isArray(rows?.SchedulerRun) ? rows.SchedulerRun : [],
      tasks: Array.isArray(rows?.AgentTask) ? rows.AgentTask : [],
    };
  }
  return { rows: Array.isArray(rows) ? rows : [] };
}

export function evaluateServiceLevelRows(
  target: any,
  rows: any,
  input: any = {},
) {
  const windowTo = String(input.window_to || new Date().toISOString());
  const windowToMs = instant(windowTo);
  const windowFrom = String(input.window_from || (
    windowToMs === null ? '' : new Date(
      windowToMs - Number(target.window_days) * 86_400_000,
    ).toISOString()
  ));
  const windowFromMs = instant(windowFrom);
  const blockers: string[] = [];
  if (input.coverage_status !== 'COMPLETE') {
    blockers.push(...(input.coverage_blockers || ['slo_source_coverage_incomplete']));
  }
  if (!validWindow(target, windowFrom, windowTo)) blockers.push('slo_window_invalid');
  const epoch = String(input.coverage_epoch || '');
  const epochMs = instant(epoch);
  if (epochMs === null) blockers.push('slo_coverage_epoch_missing_or_invalid');
  else if (
    windowFromMs === null ||
    epochMs > windowFromMs + SERVICE_LEVEL_WINDOW_TOLERANCE_MS
  ) blockers.push('slo_coverage_epoch_does_not_cover_window');

  const normalized = normalizeSourceRows(target, rows);
  let observed: any;
  if (target.source_kind === 'API_ACTIVITY_OBSERVATION') {
    observed = apiObservations(target, normalized.rows, input);
  } else if (target.source_kind === 'SCHEDULER_ATTEMPT') {
    observed = schedulerRows(target, normalized.rows, input);
  } else if (target.source_kind === 'SCHEDULER_AGENT_TASK_COMPOSITE') {
    observed = schedulerAgentTaskObservations(
      target,
      normalized.scheduler,
      normalized.tasks,
      input,
    );
  } else {
    observed = {
      blockers: ['slo_source_adapter_unknown'],
      samples: [],
      selected: [],
    };
  }
  blockers.push(...observed.blockers);
  const uniqueBlockers = unique(blockers);
  const sample = {
    sample_count: observed.samples.length,
    success_count: observed.samples.filter((row: any) => row.success).length,
    latency_p95_ms: quantile95(
      observed.samples.map((row: any) => row.latency_ms),
    ),
  };
  const evaluation = uniqueBlockers.length
    ? { status: 'UNKNOWN', met: false, reason_code: uniqueBlockers[0] }
    : evaluateSlo(target, sample);
  const measuredStatus = evaluation.status === 'INSUFFICIENT_EVIDENCE'
    ? 'UNKNOWN'
    : evaluation.status;
  const availability = sample.sample_count
    ? sample.success_count / sample.sample_count
    : null;
  return {
    slo_key: target.slo_key,
    service_class: target.service_class,
    window_from: windowFrom,
    window_to: windowTo,
    coverage_epoch: epoch,
    sample_count: sample.sample_count,
    success_count: sample.success_count,
    latency_p95_ms: sample.latency_p95_ms,
    availability_observed: availability,
    availability_target: target.availability_target,
    latency_target_ms: target.latency_p95_ms,
    status: uniqueBlockers.length ? 'UNKNOWN' : measuredStatus,
    coverage_status: uniqueBlockers.length
      ? (input.coverage_status === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'INCOMPLETE')
      : 'COMPLETE',
    coverage_blockers: uniqueBlockers,
    source_entity: target.source_entity,
    source_record_count: observed.selected.length,
    methodology_version: SERVICE_LEVEL_RUNTIME_VERSION,
  };
}

function sourceQuery(target: any, windowFrom: string, windowTo: string) {
  const common = { created_date: { $gte: windowFrom, $lte: windowTo } };
  if (target.source_kind === 'API_ACTIVITY_OBSERVATION') {
    return {
      ...common,
      slo_key: target.slo_key,
      observation_version: SERVICE_LEVEL_OBSERVATION_VERSION,
    };
  }
  if (target.source_kind === 'SCHEDULER_ATTEMPT') {
    return { ...common, record_kind: 'ATTEMPT', worker_key: target.worker_key };
  }
  if (target.source_kind === 'SCHEDULER_AGENT_TASK_COMPOSITE') {
    return { ...common, record_kind: 'ATTEMPT', worker_key: target.worker_key };
  }
  return common;
}

export async function readSloSourceWindow(
  entity: any,
  target: any,
  windowFrom: string,
  windowTo: string,
  input: any = {},
) {
  if (!entity?.filter) {
    return {
      ok: false,
      rows: [],
      coverage_status: 'UNAVAILABLE',
      blockers: [`slo_${target.slo_key}_source_unavailable`],
      error: 'entity_filter_unavailable',
    };
  }
  const pageSize = Math.max(1, Math.min(1_000, Number(input.page_size || 500)));
  const maxPages = Math.max(1, Math.min(1_000, Number(input.max_pages || 200)));
  const rows: any[] = [];
  const seen = new Set<string>();
  for (let page = 0; page < maxPages; page++) {
    let values: any;
    try {
      values = await entity.filter(
        input.query || sourceQuery(target, windowFrom, windowTo),
        'created_date',
        pageSize,
        page * pageSize,
      );
    } catch (error: any) {
      return {
        ok: false,
        rows,
        coverage_status: 'UNAVAILABLE',
        blockers: [`slo_${target.slo_key}_source_unavailable`],
        error: String(error?.message || error).slice(0, 180),
      };
    }
    if (!Array.isArray(values)) {
      return {
        ok: false,
        rows,
        coverage_status: 'UNAVAILABLE',
        blockers: [`slo_${target.slo_key}_source_invalid`],
      };
    }
    for (const row of values) {
      const id = String(row?.id || '');
      if (!id || seen.has(id)) {
        return {
          ok: false,
          rows,
          coverage_status: 'INCOMPLETE',
          blockers: [`slo_${target.slo_key}_pagination_ambiguous`],
        };
      }
      seen.add(id);
      rows.push(row);
    }
    if (values.length < pageSize) {
      return { ok: true, rows, coverage_status: 'COMPLETE', blockers: [] };
    }
  }
  return {
    ok: false,
    rows,
    coverage_status: 'INCOMPLETE',
    blockers: [`slo_${target.slo_key}_page_limit_reached`],
  };
}

function snapshotHashPayload(row: any) {
  return Object.fromEntries(
    SNAPSHOT_HASH_FIELDS
      .filter((field) => row?.[field] !== undefined)
      .map((field) => [field, row[field]]),
  );
}

export async function verifyServiceLevelSnapshot(row: any) {
  const expected = await sha256Canonical(snapshotHashPayload(row || {}));
  const blockers: string[] = [];
  if (!SHA256.test(String(row?.snapshot_hash || ''))) {
    blockers.push('slo_snapshot_hash_invalid');
  } else if (String(row.snapshot_hash).toLowerCase() !== expected) {
    blockers.push('slo_snapshot_hash_mismatch');
  }
  return {
    ok: blockers.length === 0,
    blockers,
    expected_hash: expected,
  };
}

async function persistExactSnapshot(svc: any, payload: any) {
  let existing: any;
  try {
    existing = await svc.entities.ServiceLevelSnapshot.filter(
      { snapshot_key: payload.snapshot_key },
      '-calculated_at',
      2,
    );
  } catch {
    throw new Error('service_level_snapshot_read_unavailable');
  }
  if (!Array.isArray(existing)) {
    throw new Error('service_level_snapshot_read_unavailable');
  }
  if (existing.length > 1) {
    throw new Error('service_level_snapshot_authority_ambiguous');
  }
  if (existing[0]) return existing[0];
  const created = await svc.entities.ServiceLevelSnapshot.create(payload);
  let post: any;
  try {
    post = await svc.entities.ServiceLevelSnapshot.filter(
      { snapshot_key: payload.snapshot_key },
      '-calculated_at',
      2,
    );
  } catch {
    throw new Error('service_level_snapshot_post_create_read_unavailable');
  }
  if (
    !Array.isArray(post) || post.length !== 1 ||
    String(post[0]?.id || '') !== String(created?.id || '')
  ) throw new Error('service_level_snapshot_create_ambiguous');
  return post[0];
}

async function readTargetSources(
  svc: any,
  target: any,
  windowFrom: string,
  windowTo: string,
) {
  if (target.source_kind !== 'SCHEDULER_AGENT_TASK_COMPOSITE') {
    return readSloSourceWindow(
      svc.entities?.[target.source_entity],
      target,
      windowFrom,
      windowTo,
    );
  }
  const [scheduler, tasks] = await Promise.all([
    readSloSourceWindow(
      svc.entities?.SchedulerRun,
      target,
      windowFrom,
      windowTo,
    ),
    readSloSourceWindow(
      svc.entities?.AgentTask,
      target,
      windowFrom,
      windowTo,
      {
        query: {
          created_date: { $gte: windowFrom, $lte: windowTo },
          agent_name: target.agent_name,
          task_type: target.task_type,
        },
      },
    ),
  ]);
  return {
    ok: scheduler.ok && tasks.ok,
    rows: { SchedulerRun: scheduler.rows, AgentTask: tasks.rows },
    coverage_status: scheduler.coverage_status === 'UNAVAILABLE' ||
        tasks.coverage_status === 'UNAVAILABLE'
      ? 'UNAVAILABLE'
      : scheduler.coverage_status === 'COMPLETE' &&
          tasks.coverage_status === 'COMPLETE'
      ? 'COMPLETE'
      : 'INCOMPLETE',
    blockers: [...scheduler.blockers, ...tasks.blockers],
  };
}

export async function produceServiceLevelSnapshots(svc: any, input: any = {}) {
  const now = String(input.observed_at || new Date().toISOString());
  if (instant(now) === null) throw new Error('service_level_observed_at_invalid');
  const identity = runtimeDeploymentIdentity();
  const identityValidation = validateRuntimeDeploymentIdentity(identity, {
    environment: String(input.environment || 'production'),
  });
  const identityHash = await sha256Canonical(identity);
  const coverageEpoch = serviceLevelCoverageEpoch();
  const snapshots: any[] = [];
  for (const target of SERVICE_LEVEL_TARGETS) {
    const windowFrom = new Date(
      Date.parse(now) - target.window_days * 86_400_000,
    ).toISOString();
    const read = await readTargetSources(svc, target, windowFrom, now);
    const measurement = evaluateServiceLevelRows(target, read.rows, {
      window_from: windowFrom,
      window_to: now,
      coverage_epoch: coverageEpoch,
      coverage_status: identityValidation.ok
        ? read.coverage_status
        : 'INCOMPLETE',
      coverage_blockers: [...read.blockers, ...identityValidation.blockers],
      runtime_identity_hash: identityHash,
      runtime_git_sha: identity.git_sha,
    });
    const sourceRecordsHash = await sha256Canonical(read.rows);
    const measurementHash = await sha256Canonical({
      target,
      measurement,
      source_records_hash: sourceRecordsHash,
      runtime_identity_hash: identityHash,
    });
    const payload: any = {
      ...measurement,
      snapshot_key:
        `slo:${target.slo_key}:${now}:${identityHash.slice(0, 16)}:${measurementHash.slice(0, 16)}`,
      source_records_hash: sourceRecordsHash,
      runtime_identity_hash: identityHash,
      git_sha: identity.git_sha,
      source_tree_hash: identity.source_tree_hash,
      base44_bundle_hash: identity.base44_bundle_hash,
      deployment_topology_hash: identity.deployment_topology_hash,
      scheduler_inventory_hash: identity.scheduler_inventory_hash,
      source_refs: [
        `source-records-sha256:${sourceRecordsHash}`,
        `measurement-sha256:${measurementHash}`,
      ],
      calculated_at: now,
    };
    if (payload.latency_p95_ms === null) delete payload.latency_p95_ms;
    if (payload.availability_observed === null) {
      delete payload.availability_observed;
    }
    payload.snapshot_hash = await sha256Canonical(snapshotHashPayload(payload));
    const persisted = await persistExactSnapshot(svc, payload);
    const integrity = await verifyServiceLevelSnapshot(persisted);
    snapshots.push({
      ...persisted,
      snapshot_integrity: integrity.ok ? 'VERIFIED' : 'BLOCKED',
      snapshot_integrity_blockers: integrity.blockers,
    });
  }
  return {
    snapshots,
    runtime_identity: identity,
    runtime_identity_hash: identityHash,
    identity_validation: identityValidation,
    coverage_epoch: coverageEpoch,
    version: SERVICE_LEVEL_RUNTIME_VERSION,
  };
}
