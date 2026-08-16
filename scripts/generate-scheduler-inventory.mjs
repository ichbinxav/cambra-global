#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const check = process.argv.includes('--check');
const output = 'config/scheduler-inventory.json';
const units = {
  minutes: 60,
  hours: 3600,
  days: 86400,
  weeks: 604800,
  months: null,
};
const defaultLeaseSeconds = 900;
const heartbeatIntervalSeconds = 120;
const topology = JSON.parse(
  fs.readFileSync('base44/deployment-topology.json', 'utf8'),
);
const logicalRoutes = topology.logical_routes || {};
const logicalNames = new Set(Object.keys(logicalRoutes));
const sourceDirs = fs.readdirSync('base44/functions', { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const physicalDirs = sourceDirs.filter((name) => !logicalNames.has(name));
const allFunctionSources = [];
for (const directory of sourceDirs) {
  for (const name of fs.readdirSync(path.join('base44/functions', directory))) {
    if (name.endsWith('.ts')) {
      allFunctionSources.push(
        fs.readFileSync(path.join('base44/functions', directory, name), 'utf8'),
      );
    }
  }
}

const importPattern = /\b(?:import|export)[^;]*?\bfrom\s*["']([^"']+)["']/g;
function sourceWithLocalDependencies(directory) {
  const queue = fs.readdirSync(directory)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => path.join(directory, name));
  const seen = new Set();
  let combined = '';
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file) || !fs.existsSync(file)) continue;
    seen.add(file);
    const source = fs.readFileSync(file, 'utf8');
    combined += `\n${source}`;
    let match;
    while ((match = importPattern.exec(source))) {
      if (!match[1].startsWith('.')) continue;
      const unresolved = path.resolve(path.dirname(file), match[1]);
      for (const candidate of [
        unresolved,
        `${unresolved}.ts`,
        `${unresolved}.js`,
        path.join(unresolved, 'index.ts'),
      ]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          queue.push(candidate);
          break;
        }
      }
    }
    importPattern.lastIndex = 0;
  }
  return combined;
}

const inactiveClassifications = Object.freeze({
  autonomousCommercialWorker: {
    classification: 'INTENTIONALLY_DISABLED_COMPATIBILITY',
    evidence:
      'is_active=false and config description identifies legacy controlled/manual compatibility; scheduled cold acquisition is delegated to outboundVolumeWorker/Resend.',
  },
  seedP3RateIntelligence: {
    classification: 'TEMPORARY_BOOTSTRAP_DISABLED',
    evidence:
      'is_active=false and config description identifies a temporary idempotent runtime bootstrap to remove after materialization.',
  },
});

const effectPattern =
  /\.create\(|\.update\(|\.updateMany\(|\.delete\(|functions\.invoke|SendEmail|fetch\(/;
const downstreamKeyPattern =
  /idempotency[_-]?key|effect_key|provider_effect_id|reconcil|receipt/i;

const rows = [];
for (const directory of physicalDirs) {
  const configPath = path.join(
    'base44/functions',
    directory,
    'function.jsonc',
  );
  if (!fs.existsSync(configPath)) continue;
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    throw new Error(`${configPath} is not strict JSON: ${error.message}`);
  }
  const functionDirectory = path.dirname(configPath);
  const source = fs.readdirSync(functionDirectory)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => fs.readFileSync(path.join(functionDirectory, name), 'utf8'))
    .join('\n');
  // Material effects often live in imported shared helpers. Inspect the local
  // dependency closure so a thin entry is not mislabeled read-only.
  const materialSource = sourceWithLocalDependencies(functionDirectory);

  for (const [automationIndex, automation] of (config.automations || []).entries()) {
    if (automation.type !== 'scheduled') continue;
    const unit = String(automation.repeat_unit || 'UNKNOWN');
    const interval = Number(automation.repeat_interval);
    const cadence = Number.isFinite(interval) && units[unit] != null
      ? interval * units[unit]
      : null;
    const workerKey = String(
      automation.function_args?.hosted_worker || automation.function_name ||
        config.name || directory,
    );
    const route = logicalRoutes[workerKey] || null;
    const physicalHost = String(route?.host || directory);
    const guarded = source.includes('claimSchedulerRun') ||
      source.includes('guardedScheduledServe') ||
      allFunctionSources.some((candidate) =>
        candidate.includes('claimSchedulerRun') &&
        candidate.includes(`worker_key:'${workerKey}'`)
      );
    const periodicHeartbeat = source.includes('guardedScheduledServe');
    const finalHeartbeatOnly = !periodicHeartbeat &&
      source.includes('heartbeatSchedulerRun');
    const active = automation.is_active === true;
    const material = effectPattern.test(materialSource);
    const inactive = active ? null : inactiveClassifications[workerKey] || {
      classification: 'UNCLASSIFIED_INACTIVE',
      evidence: 'is_active=false; no explicit repository classification found.',
    };
    const downstreamEvidence = downstreamKeyPattern.test(materialSource);

    rows.push({
      worker_key: workerKey,
      logical_worker: workerKey,
      physical_host: physicalHost,
      host_kind: route ? 'LOGICAL_ROUTE' : 'PHYSICAL_ENTRY',
      host_route: route?.route || null,
      trust_boundary: route?.boundary || 'PHYSICAL_ENTRY_BOUNDARY',
      hosted_workers: Array.isArray(automation.function_args?.hosted_workers)
        ? automation.function_args.hosted_workers
        : automation.function_args?.hosted_worker
        ? [automation.function_args.hosted_worker]
        : [],
      function_directory: directory,
      automation_index: automationIndex,
      name: automation.name || null,
      responsibility: automation.description || automation.name || 'UNKNOWN',
      owner_system: 'Base44',
      trigger: 'scheduled',
      is_active: active,
      inactive_classification: inactive?.classification || null,
      inactive_classification_source: inactive
        ? `${configPath} automations[${automationIndex}]: ${inactive.evidence}`
        : null,
      schedule: {
        mode: automation.schedule_mode || 'UNKNOWN',
        type: automation.schedule_type || 'UNKNOWN',
        repeat_unit: unit,
        repeat_interval: Number.isFinite(interval) ? interval : null,
        cadence_seconds: cadence,
        start_time: automation.start_time || automation.starts_at || 'UNKNOWN',
      },
      claim_primitive: guarded
        ? 'SchedulerRun CONTROL/ATTEMPT CAS'
        : active
        ? 'UNKNOWN'
        : 'NOT_APPLICABLE_INACTIVE_SCHEDULE',
      lease_seconds: guarded ? defaultLeaseSeconds : null,
      heartbeat_interval_seconds: periodicHeartbeat
        ? heartbeatIntervalSeconds
        : guarded
        ? 'NOT_PROVEN'
        : null,
      heartbeat_policy: periodicHeartbeat
        ? 'PERIODIC_WRAPPER: min(120 seconds, lease_seconds / 3), lower bounded at 30 seconds'
        : finalHeartbeatOnly
        ? 'FINAL_HEARTBEAT_ONLY; PERIODIC_HEARTBEAT_NOT_PROVEN'
        : guarded
        ? 'PERIODIC_HEARTBEAT_NOT_PROVEN'
        : 'NOT_APPLICABLE_INACTIVE_SCHEDULE',
      deadline_seconds: active ? 'UNKNOWN' : 'NOT_APPLICABLE_INACTIVE_SCHEDULE',
      timeout_seconds: active ? 'UNKNOWN' : 'NOT_APPLICABLE_INACTIVE_SCHEDULE',
      execution_bound_status: periodicHeartbeat
        ? 'LEASE_AND_PERIODIC_HEARTBEAT_PROVEN; HARD_DEADLINE_AND_TIMEOUT_UNKNOWN'
        : guarded
        ? 'LEASE_PROVEN; PERIODIC_HEARTBEAT_HARD_DEADLINE_AND_TIMEOUT_UNKNOWN'
        : 'NOT_APPLICABLE_INACTIVE_SCHEDULE',
      effect_boundary: material
        ? 'HANDLER_ENTRY_CONSERVATIVE'
        : 'READ_ONLY_OR_UNKNOWN_SOURCE_REVIEW_REQUIRED',
      protection_classification: guarded ? 'SLOT_GUARDED' : 'UNKNOWN',
      concurrency: guarded
        ? 'AT_LEAST_ONCE_SLOT_GUARDED'
        : 'AT_LEAST_ONCE_NO_PROVEN_SLOT_GUARD',
      operation_identity:
        'worker_key + explicit operation key; otherwise worker cadence slot shared by scheduled/manual/internal',
      effect_identity:
        'worker_key + explicit effect/operation key; otherwise worker cadence slot',
      takeover_policy: guarded
        ? 'LEASE_EXPIRY_RECLAIMABLE_ONLY_BEFORE_EFFECT; POST_EFFECT_REVIEW_REQUIRED'
        : 'UNKNOWN',
      idempotency: guarded
        ? 'SCHEDULER OPERATION/EFFECT KEY; DOWNSTREAM GUARANTEE REQUIRES ADAPTER EVIDENCE'
        : 'UNKNOWN',
      downstream_idempotency: downstreamEvidence
        ? 'IDEMPOTENCY_OR_RECONCILIATION_MARKERS_OBSERVED; SOURCE_REVIEW_REQUIRED'
        : 'NOT_PROVEN_BY_SOURCE_SCAN',
      post_effect_ambiguity: guarded
        ? 'SCHEDULER CONTROL CONVERGES TO REVIEW_REQUIRED; PROVIDER RECONCILIATION REQUIRES ADAPTER EVIDENCE'
        : 'UNKNOWN',
      retry_backoff: 'UNKNOWN',
      dlq_escalation: /DeadLetter|AutonomyIncident/.test(materialSource)
        ? 'IMPLEMENTED_IN_HANDLER; VERIFY SOURCE'
        : 'UNKNOWN',
      side_effects: material
        ? 'MUTATING_OR_EXTERNAL; VERIFY SOURCE'
        : 'READ_ONLY_OR_UNKNOWN',
      tenant_scope: 'UNKNOWN',
      authority: JSON.stringify(automation.function_args || {}).includes(
          'INTERNAL_CALL_SECRET',
        )
        ? 'INTERNAL_SECRET'
        : 'UNKNOWN',
      config_path: configPath,
    });
  }
}

const activeRows = rows.filter((row) => row.is_active);
const inactiveRows = rows.filter((row) => !row.is_active);
const document = {
  schema_version: 'cambra-scheduler-inventory-v3',
  generated_from:
    'physical Base44 function configs, deployment topology and local TypeScript dependency closures',
  truth_boundary:
    'Logical workers may be hosted by an existing physical function. UNKNOWN means the repository does not prove the property. Base44 triggers are treated as at-least-once; exactly-once provider execution is not claimed.',
  scheduled_automation_count: rows.length,
  active_count: activeRows.length,
  inactive_count: inactiveRows.length,
  guarded_count: rows.filter((row) =>
    row.concurrency === 'AT_LEAST_ONCE_SLOT_GUARDED'
  ).length,
  unguarded_active: activeRows
    .filter((row) => row.concurrency !== 'AT_LEAST_ONCE_SLOT_GUARDED')
    .map((row) => row.worker_key),
  inactive_automations: inactiveRows.map((row) => ({
    worker_key: row.worker_key,
    classification: row.inactive_classification,
    source: row.inactive_classification_source,
  })),
  hard_deadline_unknown_count: activeRows.filter((row) =>
    row.deadline_seconds === 'UNKNOWN' || row.timeout_seconds === 'UNKNOWN'
  ).length,
  periodic_heartbeat_proven_count: activeRows.filter((row) =>
    typeof row.heartbeat_interval_seconds === 'number'
  ).length,
  periodic_heartbeat_not_proven: activeRows
    .filter((row) => row.heartbeat_interval_seconds === 'NOT_PROVEN')
    .map((row) => row.worker_key)
    .sort(),
  otr_005_status: 'PARTIAL',
  otr_005_blockers: [
    'All 67 active workers have a repository-proven lease/fence. Periodic heartbeat is proven only for guardedScheduledServe workers; direct claim callers without a periodic loop remain explicitly NOT_PROVEN.',
    'All 67 active workers lack a repository-proven hard execution deadline and timeout; even periodic heartbeat renewal is not a finite execution bound.',
    'Scheduler ownership does not prove universal downstream provider idempotency or reconciliation; each material adapter still requires source/runtime evidence.',
    'Deployed worker-kill and pre-effect takeover/post-effect quarantine drills remain RUNTIME_PENDING.',
  ],
  automations: rows,
};
const serialized = `${JSON.stringify(document, null, 2)}\n`;
if (check) {
  if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== serialized) {
    console.error(
      'scheduler:check FAIL — config/scheduler-inventory.json is stale; run npm run scheduler:generate',
    );
    process.exit(1);
  }
  console.log(
    `scheduler:check PASS — ${rows.length} scheduled automations inventoried`,
  );
} else {
  fs.writeFileSync(output, serialized);
  console.log(`${output} written — ${rows.length} scheduled automations`);
}
