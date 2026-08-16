import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { safeBestEffort } from "../../shared/bestEffort.ts";
import { quarantineProbe } from "../../shared/internalGate.ts";

/**
 * Quarantined compatibility surface.
 *
 * autonomousOperationsSupervisor is CAMBRA's one general supervisor.
 * operatingHealthWorker is a non-authoritative advisory projection and
 * productionReadinessWorker is a release evaluator. This physical endpoint is
 * retained only to preserve Base44 topology and make stale callers fail
 * visibly. It performs no AgentTask, Event, incident or health-plane write;
 * quarantineProbe may emit its bounded compatibility-access audit record.
 */
export const SYSTEM_HEALTH_COMPATIBILITY_STATE =
  "QUARANTINED_COMPATIBILITY_NO_WRITES" as const;
export const OPERATIONAL_PLANE_DECLARATION = Object.freeze({"function_name":"systemHealthAgent","classification":"QUARANTINED_COMPATIBILITY","status":"HTTP_410_NO_OPERATIONAL_PLANE_WRITES","authoritative_for":[]});

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  await quarantineProbe(base44, "systemHealthAgent");
  const user = await base44.auth.me().catch((error: any) =>
    safeBestEffort(error, {
      operation: "systemHealthAgent.auth",
      fallback: null,
      severity: "critical",
    })
  );
  if (!user) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  return Response.json({
    ok: false,
    error: "system_health_parallel_plane_quarantined",
    compatibility_state: SYSTEM_HEALTH_COMPATIBILITY_STATE,
    canonical_general_supervisor: "autonomousOperationsSupervisor",
    advisory_projection: "operatingHealthWorker",
    release_readiness_evaluator: "productionReadinessWorker",
    canonical_incident_authority: "AutonomyIncident",
    material_effects: 0,
    operational_plane_writes: 0,
    compatibility_probe_audit_write_possible: true,
  }, { status: 410 });
});
