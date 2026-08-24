import { describe, expect, it } from "vitest";
import {
  integrationHealthScope,
  productionIntegrationHealthIssue,
} from "../../base44/shared/integrationHealth.ts";
import { projectDocumentationHealth } from "../../base44/shared/documentationHealth.ts";
import {
  maintenanceIncidentAbsenceResolution,
  staleTaskIncidentSubjectId,
} from "../../base44/shared/maintenanceIncidentLifecycle.ts";

describe("Maintenance truth projections", () => {
  it("excludes only explicit internal demo and dogfood providers", () => {
    expect(integrationHealthScope({ provider: "demo_provider" }))
      .toMatchObject({ included: false });
    expect(integrationHealthScope({ provider: "stripe_self_test" }))
      .toMatchObject({ included: false });
    expect(productionIntegrationHealthIssue({
      provider: "shopify",
      status: "error",
    })).toBe(true);
    expect(productionIntegrationHealthIssue({
      provider: "demo_apikey_provider",
      status: "error",
    })).toBe(false);
  });

  it("does not relabel pending documentation proposals as source drift", () => {
    expect(projectDocumentationHealth({
      score: 40,
      outdated_count: 0,
      incomplete_count: 108,
      contradictory_count: 0,
      unverified_count: 0,
      critical_drift_count: 8,
    })).toEqual({
      actual_drift: 0,
      pending_change_proposals: 108,
      incident_review_proposals: 8,
      source_health_score: 100,
      proposal_workflow_score: 40,
      status: "current",
      proposal_status: "attention",
    });
  });

  it("resolves only maintenance-owned absent signals or terminal stale tasks", () => {
    const managed = {
      status: "open",
      dedupe_key: "final:scheduler:worker:failed",
      details_json: { maintenance_version: "p17" },
    };
    expect(maintenanceIncidentAbsenceResolution(managed, new Set()))
      .toMatchObject({
        reason: "active_signal_absent_in_current_complete_sweep",
      });
    expect(maintenanceIncidentAbsenceResolution(
      managed,
      new Set([managed.dedupe_key]),
    )).toBeNull();
    expect(maintenanceIncidentAbsenceResolution({
      ...managed,
      dedupe_key: "dr:backup:failure",
      details_json: {},
    }, new Set())).toBeNull();
    expect(staleTaskIncidentSubjectId({
      status: "open",
      dedupe_key: "stale_task:task-1",
      subject_type: "AgentTask",
      subject_id: "task-1",
    })).toBe("task-1");
  });
});
