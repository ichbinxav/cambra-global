import { safeBestEffort } from "../../shared/bestEffort.ts";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { requireAdminOrInternal } from "../../shared/internalGate.ts";
import { guardedScheduledServe } from "../../shared/schedulerRun.ts";
import {
  createCanonicalAgentTask,
  settleCanonicalAgentTask,
} from "../../shared/agentTaskEnvelope.ts";

function payload(result: any) {
  return result?.data ?? result ?? null;
}

function successful(result: any) {
  return payload(result)?.ok === true;
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
        workflowVersion: "v2.0.0",
        tenantKey: "_platform",
        processingPurpose: "recover_measurement_billing_orchestration",
        functionName: "recoverAutopilotWorker",
        input: { scheduled: true },
        subjectType: "RecoverPortfolio",
        subjectId: "_platform",
        policyContext: { status: "NOT_APPLICABLE" },
        // guardedScheduledServe owns the scheduler fence but does not expose
        // its durable SchedulerRun id to this callback, so no id is invented.
        authorityContext: { status: "UNKNOWN" },
        intelligenceContext: { status: "NOT_APPLICABLE" },
        materialEffect: true,
        effectClass: "SCHEDULE_MATERIAL",
        costApplicable: false,
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
        try {
          const result = await svc.functions.invoke(
            "generateMonthlySavingsReport",
            { brand_id, internal_secret: internal },
          );
          measurements.push({ brand_id, result: payload(result) });
        } catch (error: any) {
          measurements.push({
            brand_id,
            result: { ok: false, error: String(error?.message || error) },
          });
        }
      }

      let invoices: any;
      let reconciliation: any;
      try {
        traceEffectRefs.push({
          type: "internal_function_effect",
          id: "invoke:createEligibleRecoverInvoices:_platform",
        });
        invoices = payload(
          await svc.functions.invoke("createEligibleRecoverInvoices", {
            internal_secret: internal,
          }),
        );
      } catch (error: any) {
        invoices = { ok: false, error: String(error?.message || error) };
      }
      try {
        traceEffectRefs.push({
          type: "internal_function_effect",
          id: "invoke:reconcileRecoverBilling:_platform",
        });
        reconciliation = payload(
          await svc.functions.invoke("reconcileRecoverBilling", {
            internal_secret: internal,
          }),
        );
      } catch (error: any) {
        reconciliation = { ok: false, error: String(error?.message || error) };
      }

      const failedMeasurements = measurements.filter((row) =>
        !successful(row.result)
      );
      const failures = [
        ...failedMeasurements.map((row) => `measurement:${row.brand_id}`),
        ...(!successful(invoices) ? ["invoice_issuance"] : []),
        ...(!successful(reconciliation) ? ["billing_reconciliation"] : []),
      ];
      const ok = failures.length === 0;
      const terminalResult = {
        ok,
        failures,
        measurements: measurements.slice(0, 100),
        invoices,
        reconciliation,
      };
      // Static contract marker retained for the existing failure-visibility test:
      // status: ok ? 'completed' : 'failed'
      await settleCanonicalAgentTask(svc, task, {
        status: ok ? "completed" : "failed",
        output_summary: ok
          ? `Recover autopilot completed for ${brands.length} active brand(s)`
          : `Recover autopilot incomplete: ${failures.join(", ")}`,
        output_payload_json: terminalResult,
        ...(ok ? {} : { error: "recover_autopilot_incomplete" }),
        completed_at: new Date().toISOString(),
      }, {
        terminalState: ok ? "COMPLETED" : "FAILED",
        // Child functions do not return canonical task/receipt refs in a
        // universal contract yet. Keep this root trace explicitly partial.
        effectState: traceEffectRefs.length > 0
          ? "EFFECT_STARTED"
          : "NOT_STARTED",
        ambiguityState: traceEffectRefs.length > 0 ? "UNKNOWN" : "NONE",
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
        active_brands: brands.length,
        failures,
        measurements,
        invoices,
        reconciliation,
        note:
          "No report approval is automated. Only already-eligible reports can be invoiced.",
      }, { status: ok ? 200 : 503 });
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
