/**
 * Shared failure semantics for reads and writes that participate in an
 * execution authority decision.  A dependency outage must never look like an
 * empty policy set, a missing approval, or a successful mutation.
 */
export class CriticalExecutionDependencyError extends Error {
  code = "CRITICAL_EXECUTION_DEPENDENCY_UNAVAILABLE";
  operation: string;
  override cause: unknown;

  constructor(operation: string, cause: unknown) {
    super(`critical_execution_dependency_unavailable:${operation}`);
    this.name = "CriticalExecutionDependencyError";
    this.operation = operation;
    this.cause = cause;
  }
}

function report(level: "error" | "warn", operation: string, error: unknown) {
  const record = JSON.stringify({
    event: level === "error"
      ? "critical_execution_dependency_failure"
      : "best_effort_execution_evidence_failure",
    operation,
    error_name: error instanceof Error ? error.name : typeof error,
    observed_at: new Date().toISOString(),
  });
  (level === "error" ? console.error : console.warn)(record);
}

/** Critical read/write: make the authority dependency failure typed and loud. */
export async function requireCriticalOperation(
  operation: string,
  run: () => Promise<any>,
): Promise<any> {
  try {
    return await run();
  } catch (error) {
    report("error", operation, error);
    throw new CriticalExecutionDependencyError(operation, error);
  }
}

/**
 * CAS/retry attempt: the caller still returns a denied result when all attempts
 * fail, but every store failure is observable rather than silently becoming a
 * benign null.
 */
export async function attemptFailClosedOperation(
  operation: string,
  run: () => Promise<any>,
): Promise<any | null> {
  try {
    return await run();
  } catch (error) {
    report("error", operation, error);
    return null;
  }
}

/** Only for non-authoritative telemetry or rollback/compensation evidence. */
export async function bestEffortExecutionEvidence<T>(
  operation: string,
  run: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    report("warn", operation, error);
    return fallback;
  }
}
