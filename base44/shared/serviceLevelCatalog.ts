export const SERVICE_LEVEL_RUNTIME_VERSION = 'service-level-runtime-2.0.0';
export const SERVICE_LEVEL_WINDOW_DAYS = 30;
export const SERVICE_LEVEL_MINIMUM_SAMPLE = 20;
export const SERVICE_LEVEL_WINDOW_TOLERANCE_MS = 5_000;
export const SERVICE_LEVEL_FRESHNESS_MS = 36 * 60 * 60 * 1000;

/**
 * Immutable SLO contract. Persisted rows are measurements, never authority for
 * their own target, source, window or methodology.
 */
export const SERVICE_LEVEL_TARGETS = Object.freeze([
  Object.freeze({
    slo_key: 'analyzer_submission',
    service_class: 'USER_FACING',
    availability_target: 0.995,
    latency_p95_ms: 5_000,
    window_days: SERVICE_LEVEL_WINDOW_DAYS,
    source_entity: 'ApiActivityLog',
    source_kind: 'API_ACTIVITY_OBSERVATION',
    endpoint: 'submitPaymentsAnalysis',
  }),
  Object.freeze({
    slo_key: 'document_extraction',
    service_class: 'ASYNCHRONOUS',
    availability_target: 0.99,
    latency_p95_ms: 90_000,
    window_days: SERVICE_LEVEL_WINDOW_DAYS,
    source_entity: 'ApiActivityLog',
    source_kind: 'API_ACTIVITY_OBSERVATION',
    endpoint: 'processUploadedFile',
  }),
  Object.freeze({
    slo_key: 'commercial_send',
    service_class: 'ASYNCHRONOUS',
    availability_target: 0.995,
    latency_p95_ms: 10_000,
    window_days: SERVICE_LEVEL_WINDOW_DAYS,
    source_entity: 'ApiActivityLog',
    source_kind: 'API_ACTIVITY_OBSERVATION',
    endpoint: 'commercialSendMessage',
  }),
  Object.freeze({
    slo_key: 'billing_reconciliation',
    service_class: 'ASYNCHRONOUS',
    availability_target: 0.999,
    latency_p95_ms: 300_000,
    window_days: SERVICE_LEVEL_WINDOW_DAYS,
    source_entity: 'SchedulerRun',
    source_kind: 'SCHEDULER_ATTEMPT',
    worker_key: 'reconcileRecoverBilling',
  }),
  Object.freeze({
    slo_key: 'company_orchestrator',
    service_class: 'ASYNCHRONOUS',
    availability_target: 0.99,
    latency_p95_ms: 300_000,
    window_days: SERVICE_LEVEL_WINDOW_DAYS,
    source_entity: 'SchedulerRun+AgentTask',
    source_kind: 'SCHEDULER_AGENT_TASK_COMPOSITE',
    worker_key: 'autonomousCompanyOrchestrator',
    agent_name: 'autonomous_company_orchestrator',
    task_type: 'p8_company_coordination',
  }),
]);

export const SERVICE_LEVEL_TARGET_BY_KEY = new Map(
  SERVICE_LEVEL_TARGETS.map((target) => [target.slo_key, target]),
);

