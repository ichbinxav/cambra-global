import { safeBestEffort } from "../../shared/bestEffort.ts";
// reconcileRecoverBilling — CAMBRA v0.65.0 / ECL P6.
//
// Read-only against Stripe: GET current invoice state, validate the frozen
// local↔remote binding, then repair ONLY local lifecycle mirrors. It never
// creates/finalizes/pays/refunds/credits a Stripe object and never edits frozen
// invoice economics. Runs every 15 minutes and is also admin/internal callable.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { requireAdminOrInternal } from "../../shared/internalGate.ts";
import {
  claimSchedulerRun,
  finishSchedulerRunOrThrow,
  markSchedulerEffectStarted,
  schedulerClaimDeniedResponse,
} from "../../shared/schedulerRun.ts";
import {
  resolveBillingMode,
  stripeRequest,
} from "../../shared/stripeBilling.ts";
import {
  convergeRecoverBillingWebhook,
  convergeRecoverBillingWebhookMismatch,
  expectedInvoiceTotalMinor,
  healRecoverInvoiceDuplicatesForReport,
  readBoundedPaymentEvents,
  readExactEntityOrNull,
  reconciliationEventHash,
  recoverReportProjectionForInvoiceStatus,
  selectLeastRecentlyReconciledInvoices,
  stripeStatusProjection,
  validateStripeInvoiceBinding,
} from "../../shared/economicExecution.ts";
import { sha256Canonical } from "../../shared/legalExecution.ts";
import {
  runtimeDeploymentIdentity,
  validateRuntimeDeploymentIdentity,
} from "../../shared/runtimeEvidence.ts";
import {
  createCanonicalAgentTask,
  settleCanonicalAgentTask,
} from "../../shared/agentTaskEnvelope.ts";

const MAX_BATCH = 100;
const PLATFORM_TENANT = "_platform";
const RECONCILER_AGENT = "recover_billing_reconciler";

export default async function (req: Request): Promise<Response> {
  let svc: any = null;
  let task: any = null;
  let schedulerClaim: any = null;
  let schedulerOk = true;
  let schedulerRuntime: any = null;
  const traceEffectRefs: any[] = [];
  const traceReceiptRefs: any[] = [];
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;

    const requested = Number(body?.args?.limit ?? body?.limit ?? 50);
    const limit = Math.max(
      1,
      Math.min(
        MAX_BATCH,
        Number.isFinite(requested) ? Math.floor(requested) : 50,
      ),
    );
    svc = base44.asServiceRole;
    schedulerClaim = await claimSchedulerRun(svc, req, {
      worker_key: "reconcileRecoverBilling",
      cadence_seconds: 900,
    });
    {
      const denied = schedulerClaimDeniedResponse(schedulerClaim);
      if (denied) return denied;
    }
    schedulerClaim = await markSchedulerEffectStarted(svc, schedulerClaim);
    {
      const denied = schedulerClaimDeniedResponse(schedulerClaim);
      if (denied) return denied;
    }
    const runtimeIdentity = runtimeDeploymentIdentity();
    const runtimeValidation = validateRuntimeDeploymentIdentity(
      runtimeIdentity,
      { environment: "production" },
    );
    schedulerRuntime = {
      runtime_identity_hash: await sha256Canonical(runtimeIdentity),
      runtime_git_sha: runtimeIdentity.git_sha,
      runtime_identity_status: runtimeValidation.status,
      runtime_identity_blockers: runtimeValidation.blockers,
    };
    const mode = resolveBillingMode();
    task = await createCanonicalAgentTask(svc, req, {
      brand_id: PLATFORM_TENANT,
      agent_name: RECONCILER_AGENT,
      task_type: "recover_billing_reconciliation",
      status: "running",
      requires_approval: false,
      risk_level: 1,
      input_summary:
        `P7-observed P6 Stripe read-only reconciliation · limit ${limit}`,
      started_at: new Date().toISOString(),
    }, {
      workflowKey: "recover_billing_reconciliation",
      workflowVersion: "v2.0.0",
      tenantKey: PLATFORM_TENANT,
      processingPurpose: "stripe_read_only_billing_convergence",
      functionName: "reconcileRecoverBilling",
      input: {
        limit,
        mode,
        runtime_identity_hash: schedulerRuntime.runtime_identity_hash,
      },
      parentRun: schedulerClaim.run_key,
      subjectType: "RecoverInvoiceBatch",
      subjectId: schedulerClaim.run_key,
      policyContext: {
        status: "OBSERVED",
        key: `stripe_billing_mode:${mode}`,
        version: "v2",
      },
      authorityContext: {
        status: "OBSERVED",
        id: schedulerClaim.run_key,
        key: "scheduler_run_fence",
        version: "v3",
      },
      intelligenceContext: { status: "NOT_APPLICABLE" },
      materialEffect: true,
      effectClass: "EXECUTE",
      costApplicable: false,
      sourceRefs: [{ type: "SchedulerRun", id: schedulerClaim.run_key }],
    });
    // The authority read is deliberately cap+1. It both proves whether this
    // cycle has bounded backlog and prevents an unbounded in-memory scan. Each
    // selected row is stamped before its Stripe read so a poison row cannot
    // monopolise the oldest page forever.
    const rows = await svc.entities.Invoice.filter(
      {
        payment_provider: "stripe",
        monthly_savings_report_id: { $nin: [null, ""] },
        stripe_invoice_id: { $nin: [null, ""] },
      },
      "last_reconciled_at",
      limit + 1,
    );
    const selection = selectLeastRecentlyReconciledInvoices(rows, limit);
    const candidates = selection.candidates;

    const results: any[] = [];
    let corrected = 0;
    let matched = 0;
    let mismatched = 0;
    let errors = 0;

    for (const candidate of candidates) {
      const result: any = {
        invoice_id: candidate.id,
        stripe_invoice_id: candidate.stripe_invoice_id,
      };
      results.push(result);
      try {
        const attemptAt = new Date().toISOString();
        await svc.entities.Invoice.update(candidate.id, {
          last_reconciled_at: attemptAt,
        });
        const attempted = await readExactEntityOrNull(svc.entities.Invoice, {
          id: candidate.id,
        }, "recover_reconciler_attempt");
        if (!attempted || attempted.last_reconciled_at !== attemptAt) {
          throw new Error("recover_reconciler_attempt_not_observed");
        }
        result.attempt_recorded_at = attemptAt;

        // Heal transient duplicate drafts left by a crash/race. Multiple
        // committed invoices are never auto-deleted; the helper throws.
        const inv = await healRecoverInvoiceDuplicatesForReport(
          svc,
          candidate.monthly_savings_report_id,
        );
        if (!inv) {
          result.skipped = "invoice_missing_after_heal";
          continue;
        }
        if (inv.id !== candidate.id) {
          result.skipped = "duplicate_draft_collapsed";
          continue;
        }

        const stripeReadEffectRef =
          `stripe-read:${mode}:${inv.stripe_invoice_id}:${attemptAt}`;
        traceEffectRefs.push({
          type: "provider_read_effect",
          id: stripeReadEffectRef,
        });
        result.effect_ref = stripeReadEffectRef;
        const remoteRes = await stripeRequest(
          mode,
          "GET",
          `invoices/${inv.stripe_invoice_id}`,
        );
        const nowIso = new Date().toISOString();
        if (!remoteRes.ok) {
          errors++;
          const err = `stripe_get_failed:${remoteRes.status}:${
            remoteRes.data?.error?.code || "unknown"
          }`;
          const errorHash =
            `p6:reconciliation-error:${inv.id}:${inv.stripe_invoice_id}`;
          const existing = (await readBoundedPaymentEvents(svc, {
            invoice_id: inv.id,
            event_hash: errorHash,
          }, 5))[0];
          await convergeRecoverBillingWebhookMismatch(svc, {
            invoice_id: inv.id,
            invoice_patch: {
              reconciliation_status: "error",
              reconciliation_error: err.slice(0, 1500),
              last_reconciled_at: nowIso,
            },
            invoice_readback: {
              reconciliation_status: "error",
              reconciliation_error: err.slice(0, 1500),
            },
            event_hash: errorHash,
            event_record: {
              invoice_id: inv.id,
              brand_id: inv.brand_id || "",
              amount: expectedInvoiceTotalMinor(inv) / 100,
              currency: inv.currency || "EUR",
              event_type: "saga_review_required",
              processor: "stripe",
              processor_ref: inv.stripe_invoice_id,
              error_code: err.slice(0, 100),
              metadata_json: existing?.metadata_json ||
                {
                  mode,
                  source: "reconcileRecoverBilling",
                  operation: "stripe_current_state_read",
                },
              occurred_at: existing?.occurred_at || nowIso,
            },
          });
          traceReceiptRefs.push({
            type: "PaymentEvent.event_hash",
            id: errorHash,
          });
          result.receipt_ref = errorHash;
          result.error = err;
          continue;
        }

        const remote = remoteRes.data;
        const binding = validateStripeInvoiceBinding(inv, remote);
        if (!binding.ok) {
          mismatched++;
          const reason = binding.reasons.join("|").slice(0, 1500);
          const mismatchHash = reconciliationEventHash(inv, remote, "mismatch");
          const existing = (await readBoundedPaymentEvents(svc, {
            invoice_id: inv.id,
            event_hash: mismatchHash,
          }, 5))[0];
          await convergeRecoverBillingWebhookMismatch(svc, {
            invoice_id: inv.id,
            invoice_patch: {
              reconciliation_status: "mismatch",
              reconciliation_error: reason,
              last_reconciled_at: nowIso,
            },
            invoice_readback: {
              reconciliation_status: "mismatch",
              reconciliation_error: reason,
            },
            event_hash: mismatchHash,
            event_record: {
              invoice_id: inv.id,
              brand_id: inv.brand_id || "",
              amount: expectedInvoiceTotalMinor(inv) / 100,
              currency: inv.currency || "EUR",
              event_type: "reconciliation_mismatch",
              processor: "stripe",
              processor_ref: inv.stripe_invoice_id,
              error_code: reason.slice(0, 100),
              metadata_json: existing?.metadata_json ||
                {
                  mode,
                  reasons: binding.reasons,
                  source: "reconcileRecoverBilling",
                },
              occurred_at: existing?.occurred_at || nowIso,
            },
          });
          traceReceiptRefs.push({
            type: "PaymentEvent.event_hash",
            id: mismatchHash,
          });
          result.receipt_ref = mismatchHash;
          result.mismatch = binding.reasons;
          continue;
        }

        const projection = stripeStatusProjection(inv, remote, nowIso);
        const invoicePatch = {
          ...projection.patch,
          reconciliation_status: projection.changed ? "drift_corrected" : "ok",
        };
        const invoiceReadback = Object.fromEntries(
          Object.entries(invoicePatch).filter(([key]) =>
            key !== "last_reconciled_at"
          ),
        );
        const observedHash = reconciliationEventHash(inv, remote, "observed");
        const existingObserved = (await readBoundedPaymentEvents(svc, {
          invoice_id: inv.id,
          event_hash: observedHash,
        }, 5))[0];
        const reportProjection = recoverReportProjectionForInvoiceStatus(
          projection.targetStatus,
        );
        let activationId: string | null = null;
        let activationPatch: Record<string, unknown> | undefined;
        let activationReadback: Record<string, unknown> | undefined;
        if (projection.targetStatus === "paid" && inv.deal_activation_id) {
          const act = await readExactEntityOrNull(svc.entities.DealActivation, {
            id: inv.deal_activation_id,
          }, "recover_reconciler_activation");
          if (!act) throw new Error("recover_reconciler_activation_not_found");
          if (act.status === "live" || act.status === "monetizing") {
            activationId = String(act.id);
            activationPatch = act.status === "live"
              ? { status: "monetizing", last_updated: nowIso }
              : {};
            activationReadback = { status: "monetizing" };
          }
        }
        await convergeRecoverBillingWebhook(svc, {
          invoice_id: inv.id,
          invoice_patch: invoicePatch,
          invoice_readback: invoiceReadback,
          event_hash: observedHash,
          event_record: {
            invoice_id: inv.id,
            brand_id: inv.brand_id || "",
            amount: Number(remote.total || 0) / 100,
            currency: inv.currency || "EUR",
            event_type: "reconciliation_observed",
            processor: "stripe",
            processor_ref: inv.stripe_invoice_id,
            metadata_json: existingObserved?.metadata_json || {
              mode,
              source: "reconcileRecoverBilling",
              observed_remote_status: String(remote.status || ""),
              target_status: projection.targetStatus,
              amount_paid_minor: Number(remote.amount_paid || 0),
              amount_due_minor: Number(remote.amount_due || 0),
            },
            occurred_at: existingObserved?.occurred_at || nowIso,
          },
          report_id: inv.monthly_savings_report_id || null,
          report_patch: inv.monthly_savings_report_id
            ? reportProjection
            : undefined,
          report_readback: inv.monthly_savings_report_id
            ? reportProjection
            : undefined,
          activation_id: activationId,
          activation_patch: activationPatch,
          activation_readback: activationReadback,
        });
        traceReceiptRefs.push({
          type: "PaymentEvent.event_hash",
          id: observedHash,
        });
        result.receipt_ref = observedHash;
        if (projection.changed) corrected++;
        else matched++;

        result.ok = true;
        result.corrected = projection.changed;
        result.status = projection.targetStatus;
      } catch (error) {
        errors++;
        result.error = (error as Error).message;
      }
    }

    const summary = {
      ok: errors === 0,
      mode,
      scanned: candidates.length,
      eligible_read_count: selection.observed_count,
      selection_read_cap: selection.read_cap,
      backlog: selection.backlog,
      coverage_status: selection.coverage_status,
      invalid_timestamp_count: selection.invalid_timestamp_count,
      matched,
      corrected,
      mismatched,
      errors,
      results,
      guarantee: "stripe_read_only_local_convergence",
    };
    schedulerOk = summary.ok;
    if (task?.id) {
      const unresolvedProviderReads = results.filter((row) =>
        row.effect_ref && !row.receipt_ref
      );
      const effectState = unresolvedProviderReads.length > 0
        ? "FAILED_POST_EFFECT"
        : traceEffectRefs.length > 0
        ? "EXECUTED"
        : "NOT_STARTED";
      await settleCanonicalAgentTask(svc, task, {
        status: errors === 0 ? "completed" : "failed",
        output_summary:
          `Recover reconciliation: ${matched} matched · ${corrected} corrected · ${mismatched} mismatch · ${errors} errors`,
        output_payload_json: {
          scanned: candidates.length,
          eligible_read_count: selection.observed_count,
          selection_read_cap: selection.read_cap,
          backlog: selection.backlog,
          coverage_status: selection.coverage_status,
          invalid_timestamp_count: selection.invalid_timestamp_count,
          matched,
          corrected,
          mismatched,
          errors,
          guarantee: summary.guarantee,
        },
        ...(errors > 0
          ? { error: `${errors} invoice reconciliation error(s)` }
          : {}),
        completed_at: new Date().toISOString(),
      }, {
        terminalState: errors === 0 ? "COMPLETED" : "FAILED",
        effectState,
        ambiguityState: unresolvedProviderReads.length > 0 ? "UNKNOWN" : "NONE",
        result: summary,
        effectRefs: traceEffectRefs,
        receiptRefs: traceReceiptRefs,
        effectCoverageComplete: traceEffectRefs.length > 0 &&
          unresolvedProviderReads.length === 0 &&
          traceReceiptRefs.length === traceEffectRefs.length,
      });
    }
    return Response.json(summary);
  } catch (error) {
    schedulerOk = false;
    const message = String(
      (error as Error)?.message || error || "reconciliation_failed",
    );
    if (svc && task?.id) {
      try {
        await settleCanonicalAgentTask(svc, task, {
          status: "failed",
          error: message.slice(0, 500),
          completed_at: new Date().toISOString(),
        }, {
          terminalState: "FAILED",
          effectState: traceEffectRefs.length > 0
            ? "FAILED_POST_EFFECT"
            : "FAILED_PRE_EFFECT",
          ambiguityState: traceEffectRefs.length > 0 ? "UNKNOWN" : "NONE",
          result: { ok: false, error: message },
          effectRefs: traceEffectRefs,
          receiptRefs: traceReceiptRefs,
          effectCoverageComplete: traceEffectRefs.length === 0,
        });
      } catch (traceError) {
        safeBestEffort(traceError, {
          operation: "reconcileRecoverBilling.trace_terminal",
          fallback: null,
          severity: "critical",
        });
      }
    }
    return Response.json({ ok: false, error: message }, { status: 500 });
  } finally {
    if (svc && schedulerClaim) {
      await finishSchedulerRunOrThrow(svc, schedulerClaim, {
        worker_key: "reconcileRecoverBilling",
        ...(schedulerRuntime ||
          {
            runtime_identity_status: "INCOMPLETE",
            runtime_identity_blockers: ["runtime_binding_not_recorded"],
          }),
      }, schedulerOk);
    }
  }
}
