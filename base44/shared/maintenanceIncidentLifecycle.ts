const ABSENCE_RECONCILABLE_PREFIXES = Object.freeze([
  "final:scheduler:",
  "p17:agent_degraded:",
  "p17:oauth_expired:",
  "p17:credential_authority:",
  "p17:integration_error:",
  "p17:pricing_stale:",
  "p17:provider_revenue_mismatch:",
  "p18:",
  "p19:",
]);

const ABSENCE_RECONCILABLE_KEYS = new Set([
  "p17:webhook_retry_backlog",
  "p17:billing_reconciliation_error",
  "p17:security_repeated_failures",
]);

export const MAINTENANCE_INCIDENT_LIFECYCLE_VERSION =
  "maintenance-incident-lifecycle-1.0.0";

export function maintenanceIncidentAbsenceResolution(
  incident: any,
  activeSignalKeys: Set<string>,
) {
  if (incident?.status !== "open") return null;
  if (!incident?.details_json?.maintenance_version) return null;
  const key = String(incident?.dedupe_key || "");
  if (!key || activeSignalKeys.has(key)) return null;
  if (key.startsWith("p17:stuck_task:")) return null;
  const managed = ABSENCE_RECONCILABLE_KEYS.has(key) ||
    ABSENCE_RECONCILABLE_PREFIXES.some((prefix) => key.startsWith(prefix));
  if (!managed) return null;
  return {
    reason: "active_signal_absent_in_current_complete_sweep",
    lifecycle_version: MAINTENANCE_INCIDENT_LIFECYCLE_VERSION,
  };
}

export function staleTaskIncidentSubjectId(incident: any) {
  if (incident?.status !== "open") return null;
  const key = String(incident?.dedupe_key || "");
  if (
    !key.startsWith("stale_task:") &&
    !key.startsWith("p17:stuck_task:")
  ) return null;
  if (String(incident?.subject_type || "") !== "AgentTask") return null;
  return String(incident?.subject_id || "").trim() || null;
}
