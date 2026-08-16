export const SUPERVISOR_OBSERVATION_VERSION = "supervisor-observation-v1.0.0";

export type SupervisorDependencyAvailability =
  | "COMPLETE"
  | "UNAVAILABLE"
  | "AMBIGUOUS";
export type SupervisorObservationState =
  | "OBSERVED"
  | "EMPTY"
  | "UNKNOWN"
  | "ERROR";

export type SupervisorDependency<T = unknown> = {
  dependency: string;
  availability: SupervisorDependencyAvailability;
  observation_state: SupervisorObservationState;
  count: number | null;
  rows: T[];
  error_code: string | null;
  reason: string | null;
};

type CollectionOptions = {
  /** A bounded detection query is ambiguous when it fills its entire page. */
  limit?: number;
  /** Existence queries are complete as soon as one matching row is observed. */
  mode?: "BOUNDED_SET" | "EXISTENCE";
};

function dependencyErrorCode(error: unknown) {
  const name = String((error as { name?: unknown })?.name || "Error")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
  return name
    ? `DEPENDENCY_READ_FAILED_${name.toUpperCase()}`
    : "DEPENDENCY_READ_FAILED";
}

function logDependencyFailure(dependency: string, error: unknown) {
  console.error(JSON.stringify({
    level: "error",
    event: "supervisor_dependency_read_failed",
    dependency: String(dependency).slice(0, 180),
    error_code: dependencyErrorCode(error),
    error_name: String((error as { name?: unknown })?.name || "Error").slice(
      0,
      80,
    ),
    message: String(
      (error as { message?: unknown })?.message || error || "unknown",
    ).slice(0, 500),
  }));
}

export async function observeSupervisorCollection<T>(
  dependency: string,
  read: () => Promise<unknown>,
  options: CollectionOptions = {},
): Promise<SupervisorDependency<T>> {
  try {
    const value = await read();
    if (!Array.isArray(value)) {
      return {
        dependency,
        availability: "AMBIGUOUS",
        observation_state: "UNKNOWN",
        count: null,
        rows: [],
        error_code: "DEPENDENCY_RESULT_NOT_ARRAY",
        reason: "NON_ARRAY_RESULT",
      };
    }
    const rows = value as T[];
    const limit = Math.max(0, Math.floor(Number(options.limit || 0)));
    const limitReached = options.mode !== "EXISTENCE" && limit > 0 &&
      rows.length >= limit;
    return {
      dependency,
      availability: limitReached ? "AMBIGUOUS" : "COMPLETE",
      observation_state: rows.length ? "OBSERVED" : "EMPTY",
      count: rows.length,
      rows,
      error_code: limitReached ? "DEPENDENCY_PAGE_LIMIT_REACHED" : null,
      reason: limitReached ? "RESULT_SET_MAY_BE_TRUNCATED" : null,
    };
  } catch (error) {
    logDependencyFailure(dependency, error);
    return {
      dependency,
      availability: "UNAVAILABLE",
      observation_state: "ERROR",
      count: null,
      rows: [],
      error_code: dependencyErrorCode(error),
      reason: "READ_FAILED",
    };
  }
}

export async function observeSupervisorRecord<T>(
  dependency: string,
  read: () => Promise<unknown>,
): Promise<SupervisorDependency<T>> {
  try {
    const value = await read();
    if (value === null || value === undefined) {
      return {
        dependency,
        availability: "COMPLETE",
        observation_state: "EMPTY",
        count: 0,
        rows: [],
        error_code: null,
        reason: null,
      };
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      return {
        dependency,
        availability: "AMBIGUOUS",
        observation_state: "UNKNOWN",
        count: null,
        rows: [],
        error_code: "DEPENDENCY_RESULT_NOT_RECORD",
        reason: "NON_RECORD_RESULT",
      };
    }
    return {
      dependency,
      availability: "COMPLETE",
      observation_state: "OBSERVED",
      count: 1,
      rows: [value as T],
      error_code: null,
      reason: null,
    };
  } catch (error) {
    logDependencyFailure(dependency, error);
    return {
      dependency,
      availability: "UNAVAILABLE",
      observation_state: "ERROR",
      count: null,
      rows: [],
      error_code: dependencyErrorCode(error),
      reason: "READ_FAILED",
    };
  }
}

export function supervisorAuthorityDependency(
  dependency: string,
  demonstrated: boolean,
): SupervisorDependency {
  return demonstrated
    ? {
      dependency,
      availability: "COMPLETE",
      observation_state: "OBSERVED",
      count: 1,
      rows: [],
      error_code: null,
      reason: null,
    }
    : {
      dependency,
      availability: "AMBIGUOUS",
      observation_state: "UNKNOWN",
      count: null,
      rows: [],
      error_code: "INTERNAL_CALL_AUTHORITY_NOT_DEMONSTRATED",
      reason: "AUTHORITY_REQUIRED_FOR_RECOVERY",
    };
}

export function summarizeSupervisorDependencies(
  dependencies: SupervisorDependency[],
) {
  const blocked = dependencies.filter((item) =>
    item.availability !== "COMPLETE"
  );
  return {
    data_complete: blocked.length === 0,
    health_status: blocked.length ? "DEGRADED" as const : "COMPLETE" as const,
    readiness_status: blocked.length ? "UNKNOWN" as const : "COMPLETE" as const,
    automated_action_allowed: blocked.length === 0,
    blocked_dependencies: blocked.map((item) => item.dependency),
  };
}

export function unavailableSupervisorDependency(
  dependency: string,
  errorCode: string,
  reason: string,
): SupervisorDependency {
  return {
    dependency,
    availability: "UNAVAILABLE",
    observation_state: "UNKNOWN",
    count: null,
    rows: [],
    error_code: String(errorCode || "DEPENDENCY_UNAVAILABLE").slice(0, 180),
    reason: String(reason || "AUTHORITY_UNAVAILABLE").slice(0, 180),
  };
}

export function supervisorDependencyStateCounts(
  dependencies: SupervisorDependency[],
) {
  const availability = { COMPLETE: 0, UNAVAILABLE: 0, AMBIGUOUS: 0 };
  const observation = { OBSERVED: 0, EMPTY: 0, UNKNOWN: 0, ERROR: 0 };
  for (const item of dependencies) {
    availability[item.availability] += 1;
    observation[item.observation_state] += 1;
  }
  return { availability, observation };
}

export function publicSupervisorDependency(item: SupervisorDependency) {
  return {
    dependency: item.dependency,
    availability: item.availability,
    observation_state: item.observation_state,
    count: item.count,
    error_code: item.error_code,
    reason: item.reason,
  };
}

/** Incidents are append-only evidence until the exact dependency that opened
 * them is observed COMPLETE again. A dependency omitted from the current
 * sweep—including conditional internal authority—is not recovered. */
export function supervisorIncidentRecoveryDemonstrated(
  incident: any,
  dependencies: SupervisorDependency[],
) {
  const subject = String(incident?.subject_id || "");
  if (!subject) return false;
  const demonstrated = dependencies.find((dependency) =>
    dependency.dependency === subject
  );
  return demonstrated?.availability === "COMPLETE";
}
