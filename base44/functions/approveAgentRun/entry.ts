import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { quarantineProbe } from "../../shared/internalGate.ts";
import { safeBestEffort } from "../../shared/bestEffort.ts";

/**
 * Deprecated compatibility surface.
 *
 * AgentTask is CAMBRA's only durable work lifecycle and Approval is its only
 * material human-decision boundary. AgentRun is legacy read-only history. This
 * physical entry point remains present solely to preserve Base44 topology and
 * to make stale callers fail visibly; it performs no AgentRun, Recommendation
 * or external-effect write.
 */
export const AGENT_RUN_COMPATIBILITY_STATE =
  "DEPRECATED_READ_ONLY_NO_WRITES" as const;

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  await quarantineProbe(base44, "approveAgentRun");

  // Authentication lookup failure is deliberately mapped to the same
  // fail-closed unauthenticated result, but it must remain observable.
  const user = await base44.auth.me().catch((error: any) =>
    safeBestEffort(error, {
      operation: "approveAgentRun.auth",
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
    error: "agent_run_approval_surface_deprecated",
    compatibility_state: AGENT_RUN_COMPATIBILITY_STATE,
    canonical_work_entity: "AgentTask",
    canonical_approval_entity: "Approval",
    canonical_admin_surface: "/admin/approvals",
    material_effects: 0,
    migration_required: true,
  }, { status: 410 });
});
