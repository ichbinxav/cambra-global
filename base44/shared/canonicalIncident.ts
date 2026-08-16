export const CANONICAL_INCIDENT_ADAPTER_VERSION =
  "canonical-incident-adapter-v1.3.0";
export const INCIDENT_PLANE_CONTRACT = Object.freeze({
  canonical_authority: "AutonomyIncident",
  ecl_compatibility_ledger: "OperationalIncident",
  transport_delivery_ledger: "IncidentAlertDelivery",
  command_center_projection: "canonicalIncidentView",
  third_incident_entity_allowed: false,
});

type IncidentSourceLink = {
  entity: "AutonomyIncident" | "OperationalIncident";
  id: string;
  source: string;
};

export type BoundedOperationalCollection<T = unknown> = {
  dependency: string;
  coverage_status: "COMPLETE" | "UNKNOWN";
  reason_code:
    | null
    | "READ_FAILED"
    | "NON_ARRAY_RESULT"
    | "RESULT_SET_TRUNCATED";
  cap: number;
  requested_limit: number;
  observed_count: number | null;
  rows: T[];
};

/**
 * Performs the cap-plus-one read itself so callers cannot accidentally claim a
 * bounded page is complete after asking the datastore for only `cap` rows.
 * UNKNOWN observations preserve observed rows for a read-only projection, but
 * effectful callers must pass the result through
 * `requireCompleteOperationalCollection` before acting on absence.
 */
export async function observeBoundedOperationalCollection<T>(
  dependency: string,
  cap: number,
  read: (requestedLimit: number) => Promise<unknown>,
): Promise<BoundedOperationalCollection<T>> {
  const normalizedCap = Math.max(1, Math.floor(Number(cap || 0)));
  const requestedLimit = normalizedCap + 1;
  let value: unknown;
  try {
    value = await read(requestedLimit);
  } catch {
    return {
      dependency,
      coverage_status: "UNKNOWN",
      reason_code: "READ_FAILED",
      cap: normalizedCap,
      requested_limit: requestedLimit,
      observed_count: null,
      rows: [],
    };
  }
  if (!Array.isArray(value)) {
    return {
      dependency,
      coverage_status: "UNKNOWN",
      reason_code: "NON_ARRAY_RESULT",
      cap: normalizedCap,
      requested_limit: requestedLimit,
      observed_count: null,
      rows: [],
    };
  }
  const rows = value as T[];
  const truncated = rows.length > normalizedCap;
  return {
    dependency,
    coverage_status: truncated ? "UNKNOWN" : "COMPLETE",
    reason_code: truncated ? "RESULT_SET_TRUNCATED" : null,
    cap: normalizedCap,
    requested_limit: requestedLimit,
    observed_count: rows.length,
    rows,
  };
}

export function requireCompleteOperationalCollection<T>(
  observation: BoundedOperationalCollection<T>,
): T[] {
  if (observation.coverage_status !== "COMPLETE") {
    const dependency = text(observation.dependency).replace(
      /[^a-zA-Z0-9_.:-]/g,
      "_",
    ).slice(0, 160);
    throw new Error(
      `critical_operational_read_unknown:${dependency}:${observation.reason_code || "UNKNOWN"}`,
    );
  }
  return observation.rows;
}

export type CanonicalIncidentView = {
  canonical_key: string;
  dedupe_key: string;
  canonical_authority: "AutonomyIncident";
  adapter_version: string;
  source_links: IncidentSourceLink[];
  id: string;
  incident_type: string;
  domain: string;
  severity: "warning" | "critical";
  status: "open" | "resolved";
  workflow_state: string;
  owner_type: string;
  summary: string;
  first_seen_at: string | null;
  last_seen_at: string | null;
  resolved_at: string | null;
  occurrence_count: number;
};

const text = (value: unknown) => String(value || "").trim();
const severity = (value: unknown): "warning" | "critical" =>
  text(value).toLowerCase() === "critical" ? "critical" : "warning";
const canonicalKey = (row: any, source: IncidentSourceLink["entity"]) =>
  `incident:${text(row?.dedupe_key) || `unkeyed:${source}:${text(row?.id)}`}`;

export function projectAutonomyIncident(row: any): CanonicalIncidentView {
  const resolved = row?.status === "resolved";
  const rawWorkflow = text(row?.workflow_state);
  return {
    canonical_key: canonicalKey(row, "AutonomyIncident"),
    dedupe_key: text(row?.dedupe_key),
    canonical_authority: "AutonomyIncident",
    adapter_version: CANONICAL_INCIDENT_ADAPTER_VERSION,
    source_links: [{
      entity: "AutonomyIncident",
      id: text(row?.id),
      source: "autonomy",
    }],
    id: text(row?.id),
    incident_type: text(
      row?.subject_type || row?.domain || "autonomy_incident",
    ),
    domain: text(row?.domain || "platform"),
    severity: severity(row?.severity),
    status: resolved ? "resolved" : "open",
    workflow_state: resolved
      ? "resolved"
      : rawWorkflow && rawWorkflow !== "resolved"
      ? rawWorkflow
      : "investigating",
    owner_type: text(row?.owner_type || "operations"),
    summary: text(row?.summary),
    first_seen_at: text(row?.first_seen_at) || null,
    last_seen_at: text(row?.last_seen_at) || null,
    resolved_at: resolved ? text(row?.resolved_at) || null : null,
    occurrence_count: Math.max(1, Number(row?.occurrence_count || 1)),
  };
}

/** Read-only compatibility projection. OperationalIncident remains the ECL P7
 * source ledger during migration; it never becomes a second canonical writer. */
export function adaptOperationalIncident(row: any): CanonicalIncidentView {
  const active = ["open", "acknowledged", "recovering"].includes(
    text(row?.status),
  );
  return {
    canonical_key: canonicalKey(row, "OperationalIncident"),
    dedupe_key: text(row?.dedupe_key),
    canonical_authority: "AutonomyIncident",
    adapter_version: CANONICAL_INCIDENT_ADAPTER_VERSION,
    source_links: [{
      entity: "OperationalIncident",
      id: text(row?.id),
      source: text(row?.source || "ecl_operational_incident"),
    }],
    id: `operational:${text(row?.id)}`,
    incident_type: text(row?.incident_type || "ecl_operational_incident"),
    domain: text(row?.domain || "platform"),
    severity: severity(row?.severity),
    status: active ? "open" : "resolved",
    workflow_state: row?.status === "recovering"
      ? "auto_resolution"
      : row?.status === "acknowledged"
      ? "investigating"
      : active
      ? "new"
      : "resolved",
    owner_type: row?.status === "recovering" ? "automation" : "operations",
    summary: text(row?.summary),
    first_seen_at: text(row?.first_seen_at) || null,
    last_seen_at: text(row?.last_seen_at) || null,
    resolved_at: active ? null : text(row?.resolved_at) || null,
    occurrence_count: Math.max(1, Number(row?.occurrence_count || 1)),
  };
}

function latest(left: CanonicalIncidentView, right: CanonicalIncidentView) {
  return Date.parse(left.last_seen_at || "") >=
      Date.parse(right.last_seen_at || "")
    ? left
    : right;
}

/** One command-center row per stable dedupe key. If both ledgers describe the
 * same episode, AutonomyIncident owns the canonical fields and both source
 * links remain visible for parity/reconciliation. */
export function canonicalIncidentView(
  autonomyRows: any[] = [],
  operationalRows: any[] = [],
) {
  const rows = [
    ...autonomyRows.map(projectAutonomyIncident),
    ...operationalRows.map(adaptOperationalIncident),
  ];
  const merged = new Map<string, CanonicalIncidentView>();
  for (const candidate of rows) {
    const existing = merged.get(candidate.canonical_key);
    if (!existing) {
      merged.set(candidate.canonical_key, candidate);
      continue;
    }
    const autonomy = existing.source_links.some((link) =>
        link.entity === "AutonomyIncident"
      )
      ? existing
      : candidate.source_links.some((link) =>
          link.entity === "AutonomyIncident"
        )
      ? candidate
      : latest(existing, candidate);
    const other = autonomy === existing ? candidate : existing;
    const mergedStatus =
      existing.status === "open" || candidate.status === "open"
        ? "open"
        : "resolved";
    const active = autonomy.status === "open"
      ? autonomy
      : other.status === "open"
      ? other
      : autonomy;
    merged.set(candidate.canonical_key, {
      ...autonomy,
      severity:
        existing.severity === "critical" || candidate.severity === "critical"
          ? "critical"
          : "warning",
      status: mergedStatus,
      workflow_state: mergedStatus === "open"
        ? active.workflow_state === "resolved"
          ? "investigating"
          : active.workflow_state || "investigating"
        : "resolved",
      resolved_at: mergedStatus === "open"
        ? null
        : autonomy.resolved_at || other.resolved_at || null,
      first_seen_at:
        [existing.first_seen_at, candidate.first_seen_at].filter(Boolean)
          .sort()[0] || null,
      last_seen_at: latest(existing, candidate).last_seen_at,
      occurrence_count: Math.max(
        existing.occurrence_count,
        candidate.occurrence_count,
      ),
      source_links: [...autonomy.source_links, ...other.source_links]
        .filter((link, index, all) =>
          all.findIndex((item) =>
            item.entity === link.entity && item.id === link.id
          ) === index
        ),
    });
  }
  return [...merged.values()].sort((left, right) =>
    Date.parse(right.last_seen_at || "") - Date.parse(left.last_seen_at || "")
  );
}

export function canonicalIncidentCoverage(
  autonomyRows: any[] = [],
  operationalRows: any[] = [],
  canonicalRows: CanonicalIncidentView[] = canonicalIncidentView(
    autonomyRows,
    operationalRows,
  ),
  sourceCoverage: {
    autonomy_complete: boolean;
    operational_complete: boolean;
  } = { autonomy_complete: true, operational_complete: true },
) {
  const activeRows = canonicalRows.filter((row) => row.status === "open");
  const sourceRowsObserved = autonomyRows.length + operationalRows.length;
  const dataComplete = sourceCoverage.autonomy_complete === true &&
    sourceCoverage.operational_complete === true;
  return {
    data_complete: dataComplete,
    count_semantics: dataComplete ? "EXACT" as const : "OBSERVED_LOWER_BOUND" as const,
    source_coverage: {
      AutonomyIncident: sourceCoverage.autonomy_complete
        ? "COMPLETE" as const
        : "UNKNOWN" as const,
      OperationalIncident: sourceCoverage.operational_complete
        ? "COMPLETE" as const
        : "UNKNOWN" as const,
    },
    source_rows_observed: sourceRowsObserved,
    source_rows_by_ledger: {
      AutonomyIncident: autonomyRows.length,
      OperationalIncident: operationalRows.length,
    },
    canonical_rows_observed: canonicalRows.length,
    active_rows_observed: activeRows.length,
    duplicate_source_rows_collapsed: Math.max(
      0,
      sourceRowsObserved - canonicalRows.length,
    ),
    canonical_keys_unique: new Set(
      canonicalRows.map((row) => row.canonical_key),
    ).size === canonicalRows.length,
  };
}
