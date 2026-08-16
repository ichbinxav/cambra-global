import { safeBestEffort } from "../../shared/bestEffort.ts";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { callCambraClaude } from "../../shared/commercialModelRouter.ts";
import { sendCostGovernedEmail } from "../../shared/costGovernance.ts";
import { internalErrorResponse } from "../../shared/publicErrors.ts";
import { sha256 } from "../../shared/intelligenceCore.ts";
import {
  captureEmergencyEpoch,
  emergencyState,
} from "../../shared/operationalControl.ts";
import {
  assertExternalApprovalExecutionActive,
  beginExternalApprovalEffects,
  checkpointExternalApprovalExecution,
  claimExternalApprovalExecution,
  completeExternalApprovalExecution,
  externalExecutionHttpStatus,
  markExternalApprovalReviewRequired,
  releaseExternalApprovalClaim,
} from "../../shared/externalApprovalExecution.ts";

const AGENT_NAME = "newsletter";
const TASK_TYPE = "send_newsletter";
const RISK_LEVEL = 2;
const ACTION_TYPE = "send_newsletter";

async function callClaude(svc, prompt, eventKey) {
  return (await callCambraClaude(prompt, {
    tier: "standard",
    maxTokens: 4096,
    svc,
    eventKey,
    source: "newsletterAgent",
  })).text;
}

Deno.serve(async (req) => {
  let task = null;
  let execution: any = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode === "execute" ? "execute" : "draft";

    // ═══ EXECUTE — sends to subscribers via SendEmail integration ══════
    if (mode === "execute") {
      const emergency = await emergencyState(base44.asServiceRole);
      if (
        !emergency.control_available || emergency.safe_mode ||
        emergency.communications_paused
      ) {
        return Response.json({
          ok: false,
          error: "emergency_control_paused:communications",
          safe_mode: emergency.safe_mode,
          reason: emergency.reason || null,
        }, { status: 409 });
      }
      const communicationEpoch = await captureEmergencyEpoch(
        base44.asServiceRole,
        "communications",
      );
      const approvalId = body?.approval_id;
      if (!approvalId) {
        return Response.json({ ok: false, error: "approval_id required" }, {
          status: 400,
        });
      }
      const ap = await base44.asServiceRole.entities.Approval.get(approvalId)
        .catch((error: any) =>
          safeBestEffort(error, {
            operation: "newsletterAgent",
            fallback: null,
            severity: "secondary",
          })
        );
      if (!ap) {
        return Response.json({ ok: false, error: "Approval not found" }, {
          status: 404,
        });
      }
      if (ap.action_type !== ACTION_TYPE) {
        return Response.json({
          ok: false,
          error: `action_type mismatch: ${ap.action_type}`,
        }, { status: 400 });
      }
      if (ap.status !== "approved") {
        return Response.json({
          ok: false,
          error: `Cannot execute: status="${ap.status}"`,
          gate: "blocked",
        }, { status: 403 });
      }

      task = await base44.asServiceRole.entities.AgentTask.get(ap.agent_task_id)
        .catch((error: any) =>
          safeBestEffort(error, {
            operation: "newsletterAgent",
            fallback: null,
            severity: "secondary",
          })
        );
      if (!task) {
        return Response.json({ ok: false, error: "AgentTask not found" }, {
          status: 404,
        });
      }
      try {
        execution = await claimExternalApprovalExecution(base44.asServiceRole, {
          approval: ap,
          task,
          commandKey: body.execution_command_key,
          actorEmail: user.email,
          actionType: ACTION_TYPE,
          agentName: AGENT_NAME,
          taskType: TASK_TYPE,
          riskLevel: RISK_LEVEL,
        });
        if (!execution.acquired) {
          if (execution.state === "replay") {
            return Response.json({
              ...execution.result,
              ok: true,
              idempotent_replay: true,
            });
          }
          return Response.json({
            ok: false,
            error: execution.error || "external_execution_not_claimed",
            execution_state: execution.state,
            review_required: execution.state === "review_required",
          }, { status: externalExecutionHttpStatus(execution) });
        }
        const payload = ap.draft_payload_json || {};
        if (
          !String(payload.subject || "").trim() ||
          !String(payload.body || "").trim()
        ) throw new Error("newsletter_approved_payload_incomplete");
        // Subscribers come from the Lead entity (landing opt-ins) with explicit consent.
        const subscribers = await base44.asServiceRole.entities.Lead
          .filter(
            { consent: true, benchmark_opt_in: true },
            "-created_date",
            1000,
          ).catch((error: any) =>
            safeBestEffort(error, {
              operation: "newsletterAgent",
              fallback: [],
              severity: "secondary",
            })
          );
        const seen = new Set<string>();
        const recipients = subscribers.filter((sub: any) => {
          const email = String(sub.email || "").trim().toLowerCase();
          if (!sub.id || !email || seen.has(email)) return false;
          seen.add(email);
          return true;
        });
        if (!recipients.length) {
          throw new Error("newsletter_no_eligible_subscribers");
        }

        await beginExternalApprovalEffects(base44.asServiceRole, execution);
        const processedRecipientIds: string[] = [];
        const providerReceiptIds: string[] = [];
        for (const sub of recipients) {
          await assertExternalApprovalExecutionActive(
            base44.asServiceRole,
            execution,
          );
          const recipientKey = String(sub.id).trim();
          const transport = await sendCostGovernedEmail(base44.asServiceRole, {
            event_key: `email:newsletter:${ap.id}:${recipientKey}`,
            stable_event_key: true,
            source: "newsletterAgent",
            related_entity_type: "Approval",
            related_entity_id: ap.id,
            emergency_epoch_claim: communicationEpoch,
          }, {
            from_name: "CAMBRA",
            to: sub.email,
            subject: payload.subject,
            body: payload.body,
          });
          if (transport?.duplicate === true) {
            throw new Error(
              `newsletter_recipient_effect_already_claimed:${recipientKey}`,
            );
          }
          const providerReceiptId=String(transport?.id||transport?.message_id||"").trim();
          if(!providerReceiptId)throw new Error(
            `newsletter_recipient_provider_receipt_missing:${recipientKey}`,
          );
          processedRecipientIds.push(recipientKey);
          providerReceiptIds.push(providerReceiptId);
          await checkpointExternalApprovalExecution(
            base44.asServiceRole,
            execution,
            {
              sent: processedRecipientIds.length,
              total: recipients.length,
              processed_recipient_ids: processedRecipientIds,
              provider_receipt_ids: providerReceiptIds,
            },
          );
        }
        const result = await completeExternalApprovalExecution(
          base44.asServiceRole,
          execution,
          {
            task_id: task.id,
            sent: processedRecipientIds.length,
            total: recipients.length,
            processed_recipient_ids: processedRecipientIds,
            provider_receipt_ids: providerReceiptIds,
            execution_receipt_ref:
              `newsletter-provider-batch:${await sha256(providerReceiptIds)}`,
          },
          `Newsletter sent to ${processedRecipientIds.length} of ${recipients.length} subscribers`,
        );
        return Response.json(result);
      } catch (error) {
        const code = String(
          (error as any)?.code || (error as Error)?.message ||
            "newsletter_external_execution_failed",
        );
        if (execution?.acquired) {
          if (execution.effectsStarted) {
            await markExternalApprovalReviewRequired(
              base44.asServiceRole,
              execution,
              code,
              { progress: execution.task?.execution_result_json || null },
            );
          } else {await releaseExternalApprovalClaim(
              base44.asServiceRole,
              execution,
              code,
            );}
        }
        return Response.json({
          ok: false,
          error: code,
          review_required: execution?.effectsStarted === true,
        }, {
          status: execution?.effectsStarted
            ? 409
            : Number((error as any)?.status || 500),
        });
      }
    }

    // ═══ DRAFT — Claude only ════════════════════════════════════════════
    const theme = body?.theme || "monthly infrastructure update";

    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: true,
      risk_level: RISK_LEVEL,
      input_summary: `Draft newsletter: ${theme}`,
      started_at: new Date().toISOString(),
    });

    const prompt = [
      "Eres editor del newsletter de CAMBRA (infraestructura económica para ecommerce independientes).",
      "Audiencia: founders de ecommerce. Tono editorial, no marketing.",
      "",
      "Devuelve EXACTAMENTE este formato:",
      "SUBJECT: <una línea, max 60 chars, sin clickbait>",
      "INTRO:",
      "<2-3 párrafos, voz de founder, ningún 'hola subscriptor'>",
      "SECTION_1_TITLE: <título>",
      "SECTION_1_BODY:",
      "<2-3 párrafos con un dato concreto>",
      "SECTION_2_TITLE: <título>",
      "SECTION_2_BODY:",
      "<2-3 párrafos>",
      "SECTION_3_TITLE: <título>",
      "SECTION_3_BODY:",
      "<2-3 párrafos>",
      "CTA: <una línea con acción clara>",
      "",
      `Tema del mes: ${theme}`,
    ].join("\n");

    const text = await callClaude(
      base44.asServiceRole,
      prompt,
      task?.id || crypto.randomUUID(),
    );
    const subjectMatch = text.match(/SUBJECT:\s*(.+)/i);
    const introMatch = text.match(/INTRO:\s*([\s\S]+?)\nSECTION_1_TITLE:/i);
    const s1tMatch = text.match(/SECTION_1_TITLE:\s*(.+)/i);
    const s1bMatch = text.match(
      /SECTION_1_BODY:\s*([\s\S]+?)\nSECTION_2_TITLE:/i,
    );
    const s2tMatch = text.match(/SECTION_2_TITLE:\s*(.+)/i);
    const s2bMatch = text.match(
      /SECTION_2_BODY:\s*([\s\S]+?)\nSECTION_3_TITLE:/i,
    );
    const s3tMatch = text.match(/SECTION_3_TITLE:\s*(.+)/i);
    const s3bMatch = text.match(/SECTION_3_BODY:\s*([\s\S]+?)\nCTA:/i);
    const ctaMatch = text.match(/CTA:\s*(.+)/i);

    const subject = (subjectMatch?.[1] || theme).trim();
    const intro = (introMatch?.[1] || "").trim();
    const s1 = {
      title: (s1tMatch?.[1] || "").trim(),
      body: (s1bMatch?.[1] || "").trim(),
    };
    const s2 = {
      title: (s2tMatch?.[1] || "").trim(),
      body: (s2bMatch?.[1] || "").trim(),
    };
    const s3 = {
      title: (s3tMatch?.[1] || "").trim(),
      body: (s3bMatch?.[1] || "").trim(),
    };
    const cta = (ctaMatch?.[1] || "").trim();

    if (!intro || !s1.body) {
      throw new Error(
        `Claude returned unparseable newsletter: ${text.slice(0, 200)}`,
      );
    }

    const bodyHtml = [
      intro,
      `\n## ${s1.title}\n\n${s1.body}`,
      `\n## ${s2.title}\n\n${s2.body}`,
      `\n## ${s3.title}\n\n${s3.body}`,
      `\n\n---\n\n${cta}`,
    ].join("\n");

    const draftPayload = {
      subject,
      body: bodyHtml,
      intro,
      sections: [s1, s2, s3],
      cta,
    };
    const approval = await base44.asServiceRole.entities.Approval.create({
      brand_id: "_platform",
      agent_task_id: task.id,
      action_type: ACTION_TYPE,
      risk_level: RISK_LEVEL,
      draft_content: `Newsletter\n\nSubject: ${subject}\n\n${bodyHtml}`,
      draft_payload_json: draftPayload,
      status: "pending",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "waiting_approval",
      approval_id: approval.id,
      output_summary: `Newsletter draft ready — awaiting approval`,
      output_payload_json: { draft: draftPayload, approval_id: approval.id },
    });

    return Response.json({
      ok: true,
      task_id: task.id,
      approval_id: approval.id,
      status: "waiting_approval",
    });
  } catch (error) {
    if (task?.id) {
      try {
        const base44 = createClientFromRequest(req);
        await base44.asServiceRole.entities.AgentTask.update(task.id, {
          status: "failed",
          error: error.message,
          completed_at: new Date().toISOString(),
        });
      } catch (_) { /* swallow */ }
    }
    return internalErrorResponse(error, "newsletterAgent");
  }
});
