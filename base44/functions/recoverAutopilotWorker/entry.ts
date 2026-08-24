import { safeBestEffort } from "../../shared/bestEffort.ts";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { requireAdminOrInternal } from "../../shared/internalGate.ts";
import {
  guardedScheduledServe,
  schedulerClaimForRequest,
} from "../../shared/schedulerRun.ts";
import {
  createCanonicalAgentTask,
  settleCanonicalAgentTask,
} from "../../shared/agentTaskEnvelope.ts";
import {
  classifyRecoverChildOutcome,
  decodeRecoverInvocationError,
} from "../../shared/recoverAutopilotOutcome.ts";

async function invokeChild(svc: any, name: string, input: any) {
  try {
    const response = await svc.functions.invoke(name, input);
    return classifyRecoverChildOutcome(response);
  } catch (error: any) {
    const decoded = decodeRecoverInvocationError(error);
    return classifyRecoverChildOutcome(decoded, Number(decoded.http_status || 0));
  }
}

guardedScheduledServe(
  { worker_key: "recoverAutopilotWorker", cadence_seconds: 86400 },
  createClientFromRequest,
  async (req) => {
    let task: any = null;
    const traceEffectRefs: any[] = [];
    try {
      const base44 = createClientFromRequest(req);
      const body = await req.json().catch(() => ({}));
      const gate = await requireAdminOrInternal(req, base44, body);
      if (!gate.ok) {
        return gate.response ||
          Response.json({ ok: false, error: "forbidden" }, { status: 403 });
      }
      const svc = base44.asServiceRole;
      const internal = Deno.env.get("INTERNAL_CALL_SECRET") || "";
      const schedulerClaim = schedulerClaimForRequest(req);
      task = await createCanonicalAgentTask(svc, req, {
        brand_id: "_platform",
        agent_name: "recover_autopilot",
        task_type: "verification_billing_orchestration",
        status: "running",
        requires_approval: false,
        risk_level: 2,
        input_summary:
          "Generate due measurements, issue already-approved invoices, reconcile processor state",
        started_at: new Date().toISOString(),
      }, {
        workflowKey: "recover_autopilot_orchestration",
        workflowVersion: "v2.1.0",
        tenantKey: "_platform",
        processingPurpose: "recover_measurement_billing_orchestration",
        functionName: "recoverAutopilotWorker",
        input: { scheduled: true },
        subjectType: "RecoverPortfolio",
        subjectId: "_platform",
        policyContext: { status: "NOT_APPLICABLE" },
        // Authority remains unknown until each child revalidates its own gate;
        // the exact outer SchedulerRun is recorded separately as lineage only.
        authorityContext: { status: "UNKNOWN" },
        intelligenceContext: { status: "NOT_APPLICABLE" },
        materialEffect: true,
        effectClass: "SCHEDULE_MATERIAL",
        costApplicable: false,
        ...(schedulerClaim
          ? {
            parentRun: String(schedulerClaim.run_key),
            sourceRefs: [{
              type: "SchedulerRun",
              id: String(schedulerClaim.run.id),
              version: String(
                schedulerClaim.run?.details_json?.guard_version ||
                  "scheduler-guard-unknown",
              ),
            }],
          }
          : {}),
      });

      // This is an authority-bearing source read. An outage is not equivalent to
      // "zero active merchants" and must fail the run.
      const active = await svc.entities.DealActivation.filter(
        { status: { $in: ["live", "monetizing"] } },
        "-last_updated",
        300,
      );
      const brands = [
        ...new Set((active || []).map((a: any) => a.brand_id).filter(Boolean)),
      ];
      const measurements: any[] = [];
      for (const brand_id of brands) {
        traceEffectRefs.push({
          type: "internal_function_effect",
          id: `invoke:generateMonthlySavingsReport:${brand_id}`,
        });
        const outcome = await invokeChild(svc, "generateMonthlySavingsReport", {
          brand_id,
          internal_secret: internal,
        });
        measurements.push({ brand_id, state: outcome.state, result: outcome.data });
      }

      traceEffectRefs.push({
        type: "internal_function_effect",
        id: "invoke:createEligibleRecoverInvoices:_platform",
      });
      const invoiceOutcome = await invokeChild(
        svc,
        "createEligibleRecoverInvoices",
        { internal_secret: internal },
      );
      const invoices = invoiceOutcome.data;
      traceEffectRefs.push({
        type: "internal_function_effect",
        id: "invoke:reconcileRecoverBilling:_platform",
      });
      const reconciliationOutcome = await invokeChild(
        svc,
        "reconcileRecoverBilling",
        { internal_secret: internal },
      );
      const reconciliation = reconciliationOutcome.data;

      const failedMeasurements = measurements.filter((row) =>
        row.state === "FAILED"
      );
      const reviewMeasurements = measurements.filter((row) =>
        row.state === "WAITING_INPUT"
      );
      const failures = [
        ...failedMeasurements.map((row) => `measurement:${row.brand_id}`),
        ...(invoiceOutcome.state === "FAILED" ? ["invoice_issuance"] : []),
        ...(reconciliationOutcome.state === "FAILED"
          ? ["billing_reconciliation"]
          : []),
      ];
      const reviewBlocks = [
        ...reviewMeasurements.map((row) => `measurement:${row.brand_id}`),
        ...(invoiceOutcome.state === "WAITING_INPUT"
          ? ["invoice_issuance"]
          : []),
        ...(reconciliationOutcome.state === "WAITING_INPUT"
          ? ["billing_reconciliation"]
          : []),
      ];
      const ok = failures.length === 0 && reviewBlocks.length === 0;
      const waitingInput = failures.length === 0 && reviewBlocks.length > 0;
      const taskStatus = failures.length > 0
        ? "failed"
        : waitingInput
        ? "waiting_input"
        : "completed";
      const terminalResult = {
        ok,
        failures,
        review_required: waitingInput,
        review_blocks: reviewBlocks,
        measurements: measurements.slice(0, 100),
        invoices,
        reconciliation,
      };
      await settleCanonicalAgentTask(svc, task, {
        status: taskStatus,
        output_summary: ok
          ? `Recover autopilot completed for ${brands.length} active brand(s)`
          : waitingInput
          ? `Recover autopilot requires input: ${reviewBlocks.join(", ")}`
          : `Recover autopilot incomplete: ${failures.join(", ")}`,
        output_payload_json: terminalResult,
        ...(failures.length > 0 ? { error: "recover_autopilot_incomplete" } : {}),
        completed_at: new Date().toISOString(),
      }, {
        terminalState: ok
          ? "COMPLETED"
          : waitingInput
          ? "REVIEW_REQUIRED"
          : "FAILED",
        // Child functions do not return canonical task/receipt refs in a
        // universal contract yet. Keep this root trace explicitly partial.
        effectState: traceEffectRefs.length > 0
          ? "EFFECT_STARTED"
          : "NOT_STARTED",
        ambiguityState: failures.length > 0 && traceEffectRefs.length > 0
          ? "UNKNOWN"
          : "NONE",
        result: terminalResult,
        effectRefs: traceEffectRefs,
        receiptRefs: [],
        effectCoverageComplete: false,
        terminalEvent: {
          eventType: "agent.task.terminal",
          source: "recoverAutopilotWorker",
          payload: terminalResult,
        },
      });

      return Response.json({
        ok,
        review_required: waitingInput,
        active_brands: brands.length,
        failures,
        review_blocks: reviewBlocks,
        measurements,
        invoices,
        reconciliation,
        note:
          "No report approval is automated. Only already-eligible reports can be invoiced.",
      }, { status: failures.length > 0 ? 503 : 200 });
    } catch (error) {
      console.error(error);
      if (task?.id) {
        try {
          const base44 = createClientFromRequest(req);
          await settleCanonicalAgentTask(base44.asServiceRole, task, {
            status: "failed",
            error: "recover_autopilot_failed",
            completed_at: new Date().toISOString(),
          }, {
            terminalState: "FAILED",
            effectState: traceEffectRefs.length > 0
              ? "FAILED_POST_EFFECT"
              : "FAILED_PRE_EFFECT",
            ambiguityState: traceEffectRefs.length > 0 ? "UNKNOWN" : "NONE",
            result: { ok: false, error: "recover_autopilot_failed" },
            effectRefs: traceEffectRefs,
            receiptRefs: [],
            effectCoverageComplete: traceEffectRefs.length === 0,
            terminalEvent: {
              eventType: "agent.task.terminal",
              source: "recoverAutopilotWorker",
              payload: { ok: false, error: "recover_autopilot_failed" },
            },
          });
        } catch (markError) {
          safeBestEffort(markError, {
            operation: "recoverAutopilotWorker",
            fallback: null,
            severity: "critical",
          });
        }
      }
      return Response.json({ ok: false, error: "recover_autopilot_failed" }, {
        status: 500,
      });
    }
  },
);
