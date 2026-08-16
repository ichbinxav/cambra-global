import { sha256Canonical } from './legalExecution.ts';
import {
  runtimeDeploymentIdentity,
  validateRuntimeDeploymentIdentity,
} from './runtimeEvidence.ts';

export const SERVICE_LEVEL_OBSERVATION_VERSION =
  'service-level-observation-1.0.0';

export type ServiceLevelOutcome =
  | 'SUCCEEDED'
  | 'FAILED'
  | 'EXCLUDED';

type ObservedResult = {
  response: Response;
  outcome?: ServiceLevelOutcome;
  reason?: string;
  source_refs?: Array<Record<string, unknown>>;
};

function text(value: unknown, limit = 300) {
  return String(value || '').trim().slice(0, limit);
}

function requestId(req: Request) {
  return text(
    req.headers.get('x-request-id') ||
      req.headers.get('x-correlation-id') ||
      `slo-request:${crypto.randomUUID()}`,
    300,
  );
}

function asObservedResult(value: Response | ObservedResult): ObservedResult {
  return value instanceof Response ? { response: value } : value;
}

function automaticOutcome(response: Response): ServiceLevelOutcome {
  if (response.status >= 200 && response.status < 400) return 'SUCCEEDED';
  if (response.status >= 500) return 'FAILED';
  return 'EXCLUDED';
}

export function excludedServiceLevelResult(
  response: Response,
  reason: string,
): ObservedResult {
  return { response, outcome: 'EXCLUDED', reason: text(reason, 160) };
}

export function serviceLevelResult(
  response: Response,
  input: Omit<ObservedResult, 'response'> = {},
): ObservedResult {
  return { response, ...input };
}

async function runtimeBinding(environment: string) {
  const identity = runtimeDeploymentIdentity();
  const validation = validateRuntimeDeploymentIdentity(identity, {
    environment,
  });
  return {
    identity,
    identity_hash: await sha256Canonical(identity),
    identity_status: validation.status,
    identity_blockers: validation.blockers,
  };
}

export async function beginServiceLevelObservation(
  svc: any,
  req: Request,
  input: {
    slo_key: string;
    endpoint: string;
    environment?: string;
    workload_key?: string;
    payload_summary?: Record<string, unknown>;
  },
) {
  const startedAt = new Date().toISOString();
  const binding = await runtimeBinding(input.environment || 'production');
  const observationKey =
    `slo:${text(input.slo_key, 80)}:${crypto.randomUUID()}`;
  const receipt = {
    observation_key: observationKey,
    observation_version: SERVICE_LEVEL_OBSERVATION_VERSION,
    observation_state: 'STARTED',
    slo_key: text(input.slo_key, 80),
    workload_key: text(input.workload_key, 300),
    endpoint: text(input.endpoint, 300),
    method: text(req.method || 'POST', 20),
    status: 'error',
    status_code: 500,
    duration_ms: 0,
    request_id: requestId(req),
    started_at: startedAt,
    runtime_identity_hash: binding.identity_hash,
    runtime_git_sha: binding.identity.git_sha,
    payload_summary: {
      ...(input.payload_summary || {}),
      eligible: true,
      runtime_identity_status: binding.identity_status,
      runtime_identity_blockers: binding.identity_blockers,
      source_refs: [],
    },
  };
  let created: any;
  try {
    created = await svc.entities.ApiActivityLog.create(receipt);
  } catch (error: any) {
    throw Object.assign(new Error('slo_observation_start_failed'), {
      code: 'SLO_OBSERVATION_START_FAILED',
      cause: text(error?.message || error, 180),
    });
  }
  if (!created?.id) {
    throw Object.assign(new Error('slo_observation_start_missing_id'), {
      code: 'SLO_OBSERVATION_START_FAILED',
    });
  }
  return {
    ...receipt,
    ...created,
    observation_key: observationKey,
    started_at: startedAt,
    runtime_identity_hash: binding.identity_hash,
    runtime_git_sha: binding.identity.git_sha,
  };
}

export async function finishServiceLevelObservation(
  svc: any,
  observation: any,
  input: {
    outcome: ServiceLevelOutcome;
    status_code: number;
    reason?: string;
    source_refs?: Array<Record<string, unknown>>;
  },
) {
  if (!observation?.id) throw new Error('slo_observation_receipt_required');
  const completedAt = new Date().toISOString();
  const started = Date.parse(String(observation.started_at || ''));
  const completed = Date.parse(completedAt);
  const duration = Number.isFinite(started) && completed >= started
    ? completed - started
    : 0;
  const statusCode = Number.isInteger(input.status_code)
    ? input.status_code
    : 500;
  try {
    const updated = await svc.entities.ApiActivityLog.update(observation.id, {
      observation_state: input.outcome,
      status: input.outcome === 'SUCCEEDED' ? 'success' : 'error',
      status_code: statusCode,
      duration_ms: duration,
      completed_at: completedAt,
      error_message: input.outcome === 'FAILED'
        ? text(input.reason || 'service_level_operation_failed', 300)
        : '',
      payload_summary: {
        ...(observation.payload_summary || {}),
        eligible: input.outcome !== 'EXCLUDED',
        exclusion_reason: input.outcome === 'EXCLUDED'
          ? text(input.reason || 'request_not_slo_eligible', 160)
          : '',
        source_refs: Array.isArray(input.source_refs)
          ? input.source_refs.slice(0, 12)
          : [],
      },
    });
    return updated || null;
  } catch {
    // STARTED is deliberately a conservative, non-terminal observation. If the
    // terminal write is lost, source coverage becomes INCOMPLETE rather than
    // silently dropping a failed or ambiguous request from the denominator.
    return null;
  }
}

export async function observeServiceLevelRequest(
  svc: any,
  req: Request,
  input: Parameters<typeof beginServiceLevelObservation>[2],
  handler: () => Promise<Response | ObservedResult>,
) {
  const observation = await beginServiceLevelObservation(svc, req, input);
  try {
    const value = asObservedResult(await handler());
    const outcome = value.outcome || automaticOutcome(value.response);
    await finishServiceLevelObservation(svc, observation, {
      outcome,
      status_code: value.response.status,
      reason: value.reason,
      source_refs: value.source_refs,
    });
    return value.response;
  } catch (error: any) {
    await finishServiceLevelObservation(svc, observation, {
      outcome: 'FAILED',
      status_code: Number.isInteger(error?.status) ? error.status : 500,
      reason: text(error?.code || error?.message || error, 300),
    });
    throw error;
  }
}
