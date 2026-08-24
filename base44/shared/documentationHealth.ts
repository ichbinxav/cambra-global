export const DOCUMENTATION_HEALTH_PROJECTION_VERSION =
  "documentation-health-projection-1.0.0";

export function projectDocumentationHealth(assessment: any) {
  const outdated = Math.max(0, Number(assessment?.outdated_count || 0));
  const contradictory = Math.max(
    0,
    Number(assessment?.contradictory_count || 0),
  );
  const unverified = Math.max(0, Number(assessment?.unverified_count || 0));
  const actualDrift = outdated + contradictory + unverified;
  const pendingProposals = Math.max(
    0,
    Number(assessment?.incomplete_count || 0),
  );
  const incidentReviewProposals = Math.max(
    0,
    Number(assessment?.critical_drift_count || 0),
  );
  const sourceHealthScore = Math.max(
    0,
    100 - outdated * 10 - contradictory * 25 - unverified * 10,
  );

  return {
    actual_drift: actualDrift,
    pending_change_proposals: pendingProposals,
    incident_review_proposals: incidentReviewProposals,
    source_health_score: sourceHealthScore,
    proposal_workflow_score: assessment?.score ?? null,
    status: contradictory > 0
      ? "critical"
      : actualDrift > 0
      ? "attention"
      : "current",
    proposal_status: incidentReviewProposals > 0 || pendingProposals > 0
      ? "attention"
      : "current",
  };
}
