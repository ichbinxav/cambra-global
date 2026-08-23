import {
  claimSchedulerRun,
  finishSchedulerRunOrThrow,
  markSchedulerEffectStarted,
  schedulerClaimDeniedResponse,
} from "../../shared/schedulerRun.ts";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { requireAdminOrInternal } from "../../shared/internalGate.ts";
import {
  observeSupervisorCollection,
  publicSupervisorDependency,
  summarizeSupervisorDependencies,
  type SupervisorDependency,
  supervisorDependencyStateCounts,
} from "../../shared/supervisorObservation.ts";

export const OPERATING_HEALTH_PROJECTION_VERSION =
  "operating-health-advisory-v2.0.0";
export const OPERATIONAL_PLANE_DECLARATION = Object.freeze({"function_name":"operatingHealthWorker","classification":"ADVISORY_HEALTH_PROJECTION","status":"ACTIVE_NON_AUTHORITATIVE","authoritative_for":[]});

const clamp = (value: number) => Math.max(0, Math.min(1, value));

function exactRows(
  dependencies: SupervisorDependency<any>[],
  dependency: string,
) {
  return dependencies.find((row) => row.dependency === dependency)?.rows || [];
}

async function persistAssessment(svc: any, payload: any) {
  const existing = await svc.entities.OperatingHealthAssessment.filter(
    { assessment_key: payload.assessment_key },
    "-calculated_at",
    2,
  );
  if (!Array.isArray(existing)) {
    throw new Error("operating_health_assessment_read_ambiguous");
  }
  if (existing.length > 1) {
    throw new Error("operating_health_assessment_authority_ambiguous");
  }
  if (existing[0]) {
    await svc.entities.OperatingHealthAssessment.update(
      existing[0].id,
      payload,
    );
    const verified = await svc.entities.OperatingHealthAssessment.get(
      existing[0].id,
    );
    if (
      String(verified?.assessment_key || "") !== payload.assessment_key ||
      String(verified?.methodology_version || "") !==
        payload.methodology_version ||
      String(verified?.calculated_at || "") !== payload.calculated_at ||
      String(verified?.health_status || "") !== payload.health_status
    ) {
      throw new Error("operating_health_assessment_update_unconfirmed");
    }
    return verified;
  }
  const created = await svc.entities.OperatingHealthAssessment.create(payload);
  const post = await svc.entities.OperatingHealthAssessment.filter(
    { assessment_key: payload.assessment_key },
    "-calculated_at",
    2,
  );
  if (
    !Array.isArray(post) || post.length !== 1 ||
    String(post[0]?.id || "") !== String(created?.id || "")
  ) {
    throw new Error("operating_health_assessment_create_ambiguous");
  }
  return post[0];
}

function buildObservedAssessment(
  dependencies: SupervisorDependency<any>[],
  nowIso: string,
) {
  const tasks = exactRows(dependencies, "AgentTask.recent");
  const incidents = exactRows(dependencies, "AutonomyIncident.open");
  const threads = exactRows(dependencies, "CommunicationThread.recent");
  const lifecycles = exactRows(dependencies, "RevenueLifecycle.recent");
  const invoices = exactRows(dependencies, "Invoice.recent");
  const approvals = exactRows(dependencies, "Approval.pending");
  const conflicts = exactRows(dependencies, "KnowledgeConflict.open");
  const recent = tasks.filter((row: any) =>
    Date.now() - Date.parse(row.created_date || row.started_at || "") <
      7 * 86400000
  );
  const failed = recent.filter((row: any) => row.status === "failed").length;
  const systems = clamp(1 - failed / Math.max(10, recent.length));
  const acquisitionThreads = threads.filter((row: any) =>
    ["merchant_acquisition", "partner_acquisition"].includes(row.engine)
  );
  const acquisition = clamp(
    acquisitionThreads.filter((row: any) => row.last_outbound_at).length /
      Math.max(10, acquisitionThreads.length),
  );
  const paid = invoices.filter((row: any) => row.status === "paid").length;
  const cash = clamp(
    paid /
      Math.max(
        1,
        invoices.filter((row: any) => !["draft", "void"].includes(row.status))
          .length,
      ),
  );
  const revenue = clamp(
    lifecycles.filter((row: any) =>
      [
        "savings_verified",
        "billable",
        "invoiced",
        "payment_pending",
        "paid",
        "partially_paid",
      ].includes(row.state)
    ).length / Math.max(1, lifecycles.length),
  );
  const operations = clamp(1 - incidents.length / 20);
  const risk = clamp(
    1 -
      (conflicts.length +
          approvals.filter((row: any) => row.risk_level === 4).length) /
        30,
  );
  const score = Math.round(
    (systems * .2 + acquisition * .1 + revenue * .2 + cash * .2 +
      operations * .15 + systems * .05 + risk * .1) * 100,
  );
  const observedCount = dependencies.reduce(
    (total, dependency) => total + Number(dependency.count || 0),
    0,
  );
  const dependencyStates = dependencies.map(publicSupervisorDependency);
  const emptyBaseline = observedCount === 0;
  return {
    assessment_key: `operating-health:${nowIso.slice(0, 10)}`,
    score: emptyBaseline ? 0 : score,
    systems_health: emptyBaseline ? 0 : systems,
    acquisition_health: emptyBaseline ? 0 : acquisition,
    revenue_health: emptyBaseline ? 0 : revenue,
    cash_health: emptyBaseline ? 0 : cash,
    operations_health: emptyBaseline ? 0 : operations,
    ai_health: emptyBaseline ? 0 : systems,
    risk_health: emptyBaseline ? 0 : risk,
    health_status: emptyBaseline
      ? "EMPTY"
      : score >= 80
      ? "HEALTHY"
      : "ATTENTION_REQUIRED",
    readiness_status: "COMPLETE",
    data_complete: true,
    dependency_states_json: dependencyStates,
    blockers: [],
    inputs_json: {
      recent_tasks: recent.length,
      failed_tasks: failed,
      open_incidents: incidents.length,
      pending_approvals: approvals.length,
      open_conflicts: conflicts.length,
      revenue_lifecycles: lifecycles.length,
      invoices: invoices.length,
      paid_invoices: paid,
      observation_state_counts: supervisorDependencyStateCounts(dependencies),
      empty_baseline: emptyBaseline,
    },
    methodology_version: OPERATING_HEALTH_PROJECTION_VERSION,
    calculated_at: nowIso,
  };
}

function buildDegradedAssessment(
  dependencies: SupervisorDependency<any>[],
  nowIso: string,
  blockers: string[],
) {
  return {
    assessment_key: `operating-health:${nowIso.slice(0, 10)}`,
    score: 0,
    systems_health: 0,
    acquisition_health: 0,
    revenue_health: 0,
    cash_health: 0,
    operations_health: 0,
    ai_health: 0,
    risk_health: 0,
    health_status: "DEGRADED",
    readiness_status: "UNKNOWN",
    data_complete: false,
    dependency_states_json: dependencies.map(publicSupervisorDependency),
    blockers,
    inputs_json: {
      observation_state_counts: supervisorDependencyStateCounts(dependencies),
      automated_action_allowed: false,
    },
    methodology_version: OPERATING_HEALTH_PROJECTION_VERSION,
    calculated_at: nowIso,
  };
}

Deno.serve(async (req) => {
  let schedulerSvc: any = null;
  let schedulerClaim: any = null;
  let schedulerOk = true;
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.clone().json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response as Response;
    const svc = base44.asServiceRole;
    schedulerSvc = svc;
    schedulerClaim = await claimSchedulerRun(svc, req, {
      worker_key: "operatingHealthWorker",
      cadence_seconds: 86400,
    });
    {
      const denied = schedulerClaimDeniedResponse(schedulerClaim);
      if (denied) return denied;
    }

    const dependencies: SupervisorDependency<any>[] = await Promise.all([
      observeSupervisorCollection(
        "AgentTask.recent",
        () => svc.entities.AgentTask.list("-created_date", 1000),
        { limit: 1000 },
      ),
      observeSupervisorCollection(
        "AutonomyIncident.open",
        () =>
          svc.entities.AutonomyIncident.filter(
            { status: "open" },
            "-last_seen_at",
            500,
          ),
        { limit: 500 },
      ),
      observeSupervisorCollection(
        "CommunicationThread.recent",
        () => svc.entities.CommunicationThread.list("-created_date", 1000),
        { limit: 1000 },
      ),
      observeSupervisorCollection(
        "RevenueLifecycle.recent",
        () => svc.entities.RevenueLifecycle.list("-updated_at", 2000),
        { limit: 2000 },
      ),
      observeSupervisorCollection(
        "Invoice.recent",
        () => svc.entities.Invoice.list("-issued_at", 2000),
        { limit: 2000 },
      ),
      observeSupervisorCollection(
        "Approval.pending",
        () =>
          svc.entities.Approval.filter(
            { status: "pending" },
            "-created_date",
            500,
          ),
        { limit: 500 },
      ),
      observeSupervisorCollection(
        "KnowledgeConflict.open",
        () =>
          svc.entities.KnowledgeConflict.filter(
            { status: { $in: ["open", "investigating"] } },
            "-created_at",
            500,
          ),
        { limit: 500 },
      ),
    ]);
    const dependencySummary = summarizeSupervisorDependencies(dependencies);
    const nowIso = new Date().toISOString();
    const assessment = dependencySummary.automated_action_allowed
      ? buildObservedAssessment(dependencies, nowIso)
      : buildDegradedAssessment(
        dependencies,
        nowIso,
        dependencySummary.blocked_dependencies,
      );

    // The only effect is this advisory projection. No health-dependent repair,
    // readiness promotion or other automated action occurs on UNKNOWN/ERROR.
    schedulerClaim = await markSchedulerEffectStarted(svc, schedulerClaim);
    {
      const denied = schedulerClaimDeniedResponse(schedulerClaim);
      if (denied) return denied;
    }
    const persisted = await persistAssessment(svc, assessment);
    if (!dependencySummary.automated_action_allowed) {
      // Persisting a fail-closed diagnostic is a completed scheduler run, not a
      // failed effect. The degraded assessment still grants no action authority.
      return Response.json({
        ok: true,
        execution_status: "COMPLETED_WITH_DEGRADED_INPUTS",
        diagnostic_only: true,
        reason: "operating_health_dependencies_unknown",
        health_status: "DEGRADED",
        readiness_status: "UNKNOWN",
        automated_action_allowed: false,
        assessment: persisted,
      });
    }
    return Response.json({
      ok: true,
      assessment: persisted,
      note:
        "Advisory composite only; never replaces underlying domain metrics.",
    });
  } catch (error) {
    schedulerOk = false;
    console.error(error);
    return Response.json({
      ok: false,
      error: "operating_health_failed",
      health_status: "DEGRADED",
      readiness_status: "UNKNOWN",
      automated_action_allowed: false,
    }, { status: 500 });
  } finally {
    if (schedulerSvc && schedulerClaim) {
      await finishSchedulerRunOrThrow(
        schedulerSvc,
        schedulerClaim,
        { worker_key: "operatingHealthWorker" },
        schedulerOk,
      );
    }
  }
});
