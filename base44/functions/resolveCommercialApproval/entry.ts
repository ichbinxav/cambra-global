import { safeBestEffort } from "../../shared/bestEffort.ts";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { sha256 } from "../../shared/intelligenceCore.ts";
import { appendFounderDecision } from "../../shared/negotiationDossier.ts";
import { captureEmergencyEpoch } from "../../shared/operationalControl.ts";
import {
  approvalImmutableContentHash,
  buildApprovalAuthoritySnapshot,
} from "../../shared/approvalAuthority.ts";
import {
  acquireResolutionAttempt,
  finalizeApproval,
  markResolutionEffectsStarted,
  releaseResolutionClaimIfNoEffects,
  renewResolutionLease,
} from "../../shared/approvalResolutionSaga.ts";
import { resolveCommunicationThreadBrandId } from "../../shared/communicationTenant.ts";

async function threadApprovalBindingMatches(
  svc: any,
  approval: any,
  thread: any,
  payload: any,
) {
  if (!(
    thread &&
    approval.related_entity_type === "CommunicationThread" &&
    String(approval.related_entity_id || "") === String(thread.id || "") &&
    String(payload?.thread_id || "") === String(thread.id || "")
  ))
    return false;
  return (
    String(await resolveCommunicationThreadBrandId(svc, thread)) ===
    String(approval.brand_id || "")
  );
}

async function validateCommercialBinding(
  svc: any,
  approval: any,
  entity: any,
  entityType: string,
) {
  if (!entity) return false;
  if (String(entity.brand_id || ""))
    return String(entity.brand_id) === String(approval.brand_id || "");
  if (entityType === "DynamicAgreement" && entity.negotiation_case_id) {
    const c = await svc.entities.NegotiationCase.get(
      entity.negotiation_case_id,
    );
    return String(c?.brand_id || "") === String(approval.brand_id || "");
  }
  return String(approval.brand_id || "") === "_platform";
}

async function validateApprovalTaskBinding(svc: any, approval: any) {
  const task = approval.agent_task_id
    ? await svc.entities.AgentTask.get(approval.agent_task_id)
    : null;
  return Boolean(
    task &&
    String(task.brand_id || "") === String(approval.brand_id || "") &&
    String(task.related_entity_type || "") ===
      String(approval.related_entity_type || "") &&
    String(task.related_entity_id || "") ===
      String(approval.related_entity_id || "") &&
    (!task.approval_id || String(task.approval_id) === String(approval.id)),
  );
}

async function validateNegotiationGraph(
  svc: any,
  approval: any,
  payload: any,
): Promise<any> {
  const c = await svc.entities.NegotiationCase.get(
    String(approval.related_entity_id || ""),
  );
  if (
    !c ||
    String(c.id) !== String(approval.related_entity_id || "") ||
    String(payload.case_id || "") !== String(c.id) ||
    String(c.brand_id || "") !== String(approval.brand_id || "") ||
    String(c.final_approval_id || "") !== String(approval.id)
  )
    return { ok: false, error: "negotiation_approval_binding_mismatch" };
  const activation = c.recover_id
    ? await svc.entities.DealActivation.get(c.recover_id)
    : null;
  if (
    activation &&
    (String(activation.brand_id || "") !== String(c.brand_id || "") ||
      String(activation.provider_id || "") !== String(c.provider_id || ""))
  )
    return { ok: false, error: "recover_negotiation_binding_mismatch" };
  if (
    payload.recover_id &&
    String(payload.recover_id) !== String(c.recover_id || "")
  )
    return { ok: false, error: "recover_payload_binding_mismatch" };
  if (
    payload.provider_id &&
    String(payload.provider_id) !== String(c.provider_id || "")
  )
    return { ok: false, error: "provider_payload_binding_mismatch" };
  const thread = c.thread_id
    ? await svc.entities.CommunicationThread.get(c.thread_id)
    : null;
  if (
    thread &&
    (String(thread.related_entity_type || "") !== "NegotiationCase" ||
      String(thread.related_entity_id || "") !== String(c.id) ||
      String(thread.recover_id || "") !== String(c.recover_id || "") ||
      String(thread.provider_id || "") !== String(c.provider_id || "") ||
      String(await resolveCommunicationThreadBrandId(svc, thread)) !==
        String(approval.brand_id || ""))
  )
    return { ok: false, error: "negotiation_thread_binding_mismatch" };
  return { ok: true, activation, thread };
}

async function validateAggregateContractGraph(
  svc: any,
  approval: any,
  payload: any,
): Promise<any> {
  const c = await svc.entities.NegotiationCase.get(
    String(approval.related_entity_id || ""),
  );
  if (
    !c ||
    String(payload.case_id || "") !== String(c.id || "") ||
    String(c.final_approval_id || "") !== String(approval.id || "") ||
    String(c.brand_id || "") !== String(approval.brand_id || "") ||
    String(c.negotiation_scope || "") !== "aggregate" ||
    String(approval.brand_id || "") !== "_platform"
  )
    return { ok: false, error: "aggregate_approval_binding_mismatch" };
  const [bid, offer, pool, rfp] = await Promise.all([
    svc.entities.AggregateBid.get(String(payload.bid_id || "")),
    svc.entities.NegotiationOffer.get(String(payload.offer_id || "")),
    svc.entities.AggregatePool.get(String(payload.pool_id || "")),
    svc.entities.AggregateRFP.get(String(payload.rfp_id || "")),
  ]);
  if (
    !bid ||
    !offer ||
    !pool ||
    !rfp ||
    String(c.aggregate_pool_id || "") !== String(pool.id || "") ||
    String(c.aggregate_rfp_id || "") !== String(rfp.id || "") ||
    String(c.aggregate_bid_id || "") !== String(bid.id || "") ||
    String(bid.negotiation_case_id || "") !== String(c.id || "") ||
    String(bid.negotiation_offer_id || "") !== String(offer.id || "") ||
    String(offer.negotiation_case_id || "") !== String(c.id || "") ||
    String(bid.rfp_id || "") !== String(rfp.id || "") ||
    String(bid.pool_id || "") !== String(pool.id || "") ||
    String(bid.provider_id || "") !== String(c.provider_id || "") ||
    String(rfp.pool_id || "") !== String(pool.id || "") ||
    (Array.isArray(rfp.provider_ids) &&
      rfp.provider_ids.length > 0 &&
      !rfp.provider_ids.map(String).includes(String(c.provider_id || "")))
  )
    return { ok: false, error: "aggregate_bid_or_context_changed" };
  const thread = c.thread_id
    ? await svc.entities.CommunicationThread.get(c.thread_id)
    : null;
  if (
    thread &&
    (String(thread.related_entity_type || "") !== "NegotiationCase" ||
      String(thread.related_entity_id || "") !== String(c.id || "") ||
      String(await resolveCommunicationThreadBrandId(svc, thread)) !==
        String(approval.brand_id || ""))
  )
    return { ok: false, error: "aggregate_thread_binding_mismatch" };
  return { ok: true, c, bid, offer, pool, rfp, thread };
}

async function validateAggregateExecutionGraph(
  svc: any,
  approval: any,
  payload: any,
): Promise<any> {
  const agreement = await svc.entities.DynamicAgreement.get(
    String(approval.related_entity_id || ""),
  );
  if (
    !agreement ||
    String(payload.agreement_id || "") !== String(agreement.id || "") ||
    String(agreement.execution_approval_id || "") !== String(approval.id || "")
  )
    return { ok: false, error: "aggregate_execution_binding_mismatch" };
  const [c, bid, pool, rfp, proposalApproval] = await Promise.all([
    svc.entities.NegotiationCase.get(
      String(agreement.negotiation_case_id || ""),
    ),
    svc.entities.AggregateBid.get(String(agreement.approved_bid_id || "")),
    svc.entities.AggregatePool.get(String(agreement.pool_id || "")),
    svc.entities.AggregateRFP.get(String(agreement.rfp_id || "")),
    svc.entities.Approval.get(String(agreement.approval_id || "")),
  ]);
  if (
    !c ||
    !bid ||
    !pool ||
    !rfp ||
    !proposalApproval ||
    String(c.id || "") !== String(payload.case_id || "") ||
    String(pool.id || "") !== String(payload.pool_id || "") ||
    String(c.brand_id || "") !== String(approval.brand_id || "") ||
    String(approval.brand_id || "") !== "_platform" ||
    String(c.aggregate_pool_id || "") !== String(pool.id || "") ||
    String(c.aggregate_rfp_id || "") !== String(rfp.id || "") ||
    String(c.provider_id || "") !== String(agreement.provider_id || "") ||
    String(bid.negotiation_case_id || "") !== String(c.id || "") ||
    String(bid.pool_id || "") !== String(pool.id || "") ||
    String(bid.rfp_id || "") !== String(rfp.id || "") ||
    String(bid.provider_id || "") !== String(agreement.provider_id || "") ||
    String(proposalApproval.status || "") !== "approved" ||
    String(proposalApproval.id || "") !== String(agreement.approval_id || "")
  )
    return { ok: false, error: "aggregate_execution_context_changed" };
  return { ok: true, agreement, c, bid, pool, rfp };
}

async function validateContractReviewGraph(
  svc: any,
  approval: any,
  payload: any,
): Promise<any> {
  const c = await svc.entities.NegotiationCase.get(
    String(approval.related_entity_id || ""),
  );
  const offer = payload.approved_offer_id
    ? await svc.entities.NegotiationOffer.get(String(payload.approved_offer_id))
    : null;
  if (
    !c ||
    String(payload.case_id || "") !== String(c.id || "") ||
    String(c.brand_id || "") !== String(approval.brand_id || "") ||
    !offer ||
    String(c.approved_offer_id || "") !== String(offer.id || "") ||
    String(offer.negotiation_case_id || "") !== String(c.id || "") ||
    (payload.document_id &&
      String(c.contract_document_id || "") !== String(payload.document_id)) ||
    (payload.contract_match_status &&
      String(c.contract_match_status || "") !==
        String(payload.contract_match_status))
  )
    return { ok: false, error: "contract_review_binding_mismatch" };
  return { ok: true, c, offer };
}

async function upsertTierByKey(
  svc: any,
  entityName: "AgreementTier" | "ProviderCompensationTier",
  tierKey: string,
  payload: any,
) {
  const entity = svc.entities[entityName];
  const rows = await entity.filter({ tier_key: tierKey }, "-updated_at", 5);
  if (rows.length > 1) throw new Error(`${entityName}_duplicate_tier_key`);
  if (rows[0]) {
    await entity.update(rows[0].id, payload);
    return { ...rows[0], ...payload };
  }
  return entity.create(payload);
}

async function beginResolutionEffects(
  svc: any,
  approval: any,
  resolutionKey: string,
) {
  const marked = await markResolutionEffectsStarted(
    svc,
    approval,
    resolutionKey,
  );
  return renewResolutionLease(svc, marked, resolutionKey);
}

Deno.serve(async (req) => {
  let recovery: { svc: any; approvalId: string; resolutionKey: string } | null =
    null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((error: any) =>
      safeBestEffort(error, {
        operation: "resolveCommercialApproval",
        fallback: null,
        severity: "critical",
      }),
    );
    if (!user || user.role !== "admin")
      return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const id = String(body?.approval_id || "");
    const decision = String(body?.decision || "");
    const resolutionKey = String(body?.resolution_command_key || "");
    if (!id || !["approve", "reject"].includes(decision))
      return Response.json(
        { ok: false, error: "approval_id_and_decision_required" },
        { status: 400 },
      );
    const svc = base44.asServiceRole;
    const ap = await svc.entities.Approval.get(id).catch((error: any) =>
      safeBestEffort(error, {
        operation: "resolveCommercialApproval",
        fallback: null,
        severity: "critical",
      }),
    );
    if (!ap)
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    recovery = { svc, approvalId: ap.id, resolutionKey };
    if (
      ap.status !== "resolving" ||
      !resolutionKey ||
      String(ap.resolution_command_key || "") !== resolutionKey
    )
      return Response.json(
        {
          ok: false,
          error: "founder_command_resolution_claim_required",
          status: ap.status,
        },
        { status: 409 },
      );
    const expectedAuthorityHash = String(body?.expected_authority_hash || "");
    if (
      !expectedAuthorityHash ||
      String(ap.resolution_authority_hash || "") !== expectedAuthorityHash
    )
      return Response.json(
        { ok: false, error: "approval_authority_claim_mismatch" },
        { status: 409 },
      );
    if (
      String(ap.resolution_actor_email || "").toLowerCase() !==
        String(user.email || "").toLowerCase() ||
      String(ap.resolution_decision || "") !== decision ||
      String(ap.resolution_reason || "") !==
        (decision === "reject" ? String(body?.reason || "") : "")
    )
      return Response.json(
        { ok: false, error: "approval_resolution_binding_mismatch" },
        { status: 409 },
      );
    const denyPreflight = async (
      error: string,
      candidate: any = ap,
      detail: any = {},
    ) => {
      let release: any = {
        released: false,
        retry_requires_new_preview: false,
      };
      if (candidate?.resolution_effects_started !== true) {
        release = await releaseResolutionClaimIfNoEffects(
          svc,
          candidate,
          resolutionKey,
        ).catch((releaseError:any)=>safeBestEffort(releaseError,{operation:'resolveCommercialApproval.release_denied_preflight_claim',fallback:{released:false},severity:'critical'}));
      }
      return Response.json(
        {
          ok: false,
          error,
          retry_requires_new_preview:
            release.retry_requires_new_preview === true,
          ...detail,
        },
        { status: 409 },
      );
    };
    const currentContentHash = await sha256({
      approval: await approvalImmutableContentHash(ap, user.email),
      decision,
      reason: decision === "reject" ? String(body?.reason || "") : "",
    });
    if (String(ap.resolution_content_hash || "") !== currentContentHash)
      return denyPreflight("approval_content_changed_repreview_required");
    const task = ap.agent_task_id
      ? await svc.entities.AgentTask.get(ap.agent_task_id)
      : null;
    if (!(await validateApprovalTaskBinding(svc, ap)))
      return denyPreflight("approval_task_binding_mismatch");
    if (ap.resolution_effects_started !== true) {
      const currentAuthorityHash = await sha256(
        await buildApprovalAuthoritySnapshot(svc, ap, task, user.email),
      );
      if (currentAuthorityHash !== expectedAuthorityHash)
        return denyPreflight("approval_authority_changed_repreview_required");
    }
    const attempt = await acquireResolutionAttempt(svc, ap, resolutionKey);
    if (!attempt.acquired)
      return Response.json(
        {
          ok: false,
          error: attempt.in_progress
            ? "approval_resolution_in_progress"
            : "approval_resolution_phase_invalid",
          in_progress: attempt.in_progress,
          phase: attempt.approval?.resolution_phase || "unknown",
        },
        { status: 409 },
      );
    let ownedApproval = attempt.approval;
    if (ap.expires_at && Date.parse(ap.expires_at) <= Date.now()) {
      await finalizeApproval(svc, ownedApproval, resolutionKey, "expired");
      return Response.json(
        { ok: false, error: "approval_expired" },
        { status: 409 },
      );
    }
    const now = new Date().toISOString();
    if (decision === "reject") {
      const payload = ap.draft_payload_json || {};
      let rejectedThread: any = null;
      let rejectedCase: any = null;
      let rejectedAgreement: any = null;
      const resumingRejectedEffects =
        ownedApproval.resolution_effects_started === true;
      if (
        ap.action_type === "post_meeting_commitment_review" ||
        ap.action_type === "commercial_reply_exception" ||
        ap.action_type === "provider_negotiation_review" ||
        ap.action_type === "aggregate_procurement_review"
      ) {
        rejectedThread = await svc.entities.CommunicationThread.get(
          String(payload.thread_id || ""),
        );
        if (
          !(await threadApprovalBindingMatches(
            svc,
            ap,
            rejectedThread,
            payload,
          ))
        )
          return denyPreflight(
            "thread_approval_binding_mismatch",
            ownedApproval,
          );
        if (payload.message_id) {
          const message = await svc.entities.CommunicationMessage.get(
            String(payload.message_id),
          );
          if (
            !message ||
            String(message.thread_id || "") !== String(rejectedThread.id) ||
            String(message.direction || "") !== "inbound"
          )
            return denyPreflight(
              "message_thread_binding_mismatch",
              ownedApproval,
            );
        }
      }
      if (ap.action_type === "final_provider_deal") {
        rejectedCase = await svc.entities.NegotiationCase.get(
          ap.related_entity_id,
        );
        if (resumingRejectedEffects) {
          const offer = await svc.entities.NegotiationOffer.get(
            String(payload.offer_id || ""),
          );
          if (
            !rejectedCase ||
            String(rejectedCase.brand_id || "") !== String(ap.brand_id || "") ||
            String(payload.case_id || "") !== String(rejectedCase.id || "") ||
            String(payload.recover_id || "") !==
              String(rejectedCase.recover_id || "") ||
            String(payload.provider_id || "") !==
              String(rejectedCase.provider_id || "") ||
            !["", String(ap.id)].includes(
              String(rejectedCase.final_approval_id || ""),
            ) ||
            !offer ||
            String(offer.negotiation_case_id || "") !==
              String(rejectedCase.id || "")
          )
            return Response.json(
              { ok: false, error: "rejected_negotiation_post_state_invalid" },
              { status: 409 },
            );
        } else {
          const graph = await validateNegotiationGraph(svc, ap, payload);
          if (!graph.ok) return denyPreflight(graph.error, ownedApproval);
          const offer = await svc.entities.NegotiationOffer.get(
            String(payload.offer_id || ""),
          );
          if (
            !offer ||
            String(offer.negotiation_case_id || "") !==
              String(ap.related_entity_id || "")
          )
            return denyPreflight("offer_missing_or_changed", ownedApproval);
        }
      }
      if (ap.action_type === "aggregate_contract") {
        rejectedCase = await svc.entities.NegotiationCase.get(
          ap.related_entity_id,
        );
        if (resumingRejectedEffects) {
          const [rfp, pool, bid, offer, partial] = await Promise.all([
            svc.entities.AggregateRFP.get(String(payload.rfp_id || "")),
            svc.entities.AggregatePool.get(String(payload.pool_id || "")),
            svc.entities.AggregateBid.get(String(payload.bid_id || "")),
            svc.entities.NegotiationOffer.get(String(payload.offer_id || "")),
            svc.entities.DynamicAgreement.filter(
              { approval_id: ap.id },
              "-created_at",
              5,
            ),
          ]);
          if (
            !rejectedCase ||
            String(rejectedCase.brand_id || "") !== "_platform" ||
            String(payload.case_id || "") !== String(rejectedCase.id || "") ||
            !["", String(ap.id)].includes(
              String(rejectedCase.final_approval_id || ""),
            ) ||
            !rfp ||
            !pool ||
            !bid ||
            !offer ||
            String(bid.negotiation_case_id || "") !==
              String(rejectedCase.id || "") ||
            String(bid.negotiation_offer_id || "") !== String(offer.id || "") ||
            String(bid.rfp_id || "") !== String(rfp.id || "") ||
            String(bid.pool_id || "") !== String(pool.id || "") ||
            String(rfp.pool_id || "") !== String(pool.id || "") ||
            partial.some(
              (row: any) =>
                String(row.negotiation_case_id || "") !==
                String(rejectedCase.id || ""),
            )
          )
            return Response.json(
              { ok: false, error: "rejected_aggregate_post_state_invalid" },
              { status: 409 },
            );
        } else {
          const graph = await validateAggregateContractGraph(svc, ap, payload);
          if (!graph.ok) return denyPreflight(graph.error, ownedApproval);
          rejectedCase = graph.c;
        }
      }
      if (ap.action_type === "aggregate_contract_execution") {
        rejectedAgreement = await svc.entities.DynamicAgreement.get(
          ap.related_entity_id,
        );
        if (resumingRejectedEffects) {
          if (
            !rejectedAgreement ||
            !["", String(ap.id)].includes(
              String(rejectedAgreement.execution_approval_id || ""),
            ) ||
            !["contracting", "active"].includes(
              String(rejectedAgreement.status || ""),
            ) ||
            String(payload.agreement_id || "") !==
              String(rejectedAgreement.id || "")
          )
            return Response.json(
              { ok: false, error: "rejected_execution_post_state_invalid" },
              { status: 409 },
            );
        } else {
          const graph = await validateAggregateExecutionGraph(svc, ap, payload);
          if (!graph.ok) return denyPreflight(graph.error, ownedApproval);
          rejectedAgreement = graph.agreement;
        }
      }
      if (
        ap.action_type === "contract_mismatch" ||
        ap.action_type === "contract_exception"
      ) {
        const graph = await validateContractReviewGraph(svc, ap, payload);
        if (!graph.ok) return denyPreflight(graph.error, ownedApproval);
      }
      ownedApproval = await beginResolutionEffects(
        svc,
        ownedApproval,
        resolutionKey,
      );
      if (rejectedCase) {
        // Close the feedback loop. Until now the founder's reason was written
        // to Approval.rejected_reason and never read again, so the agent
        // re-entered the next round with no idea why its position was refused
        // and was free to repeat it. Persisting it on the case is what lets
        // buildNegotiationDossier surface it as Block 4 of the next prompt.
        await svc.entities.NegotiationCase.update(rejectedCase.id, {
          status: "negotiating",
          final_approval_id: null,
          next_action: "founder_rejected_or_counter",
          founder_feedback_json: appendFounderDecision(
            rejectedCase.founder_feedback_json,
            {
              round: Number(rejectedCase.round || 0),
              decision: "rejected",
              reason: String(body?.reason || ""),
              decided_at: new Date().toISOString(),
              decided_by: String(user?.email || "admin"),
            },
          ),
        });
        if (ap.action_type === "aggregate_contract") {
          const p = ap.draft_payload_json || {};
          const partial = await svc.entities.DynamicAgreement.filter(
            { approval_id: ap.id },
            "-created_at",
            5,
          );
          for (const agreement of partial)
            await svc.entities.DynamicAgreement.update(agreement.id, {
              status: "archived",
            });
          if (p.rfp_id)
            await svc.entities.AggregateRFP.update(String(p.rfp_id), {
              status: "negotiating",
            }).catch((error: any) =>
              safeBestEffort(error, {
                operation: "resolveCommercialApproval",
                fallback: null,
                severity: "critical",
              }),
            );
          if (p.pool_id)
            await svc.entities.AggregatePool.update(String(p.pool_id), {
              status: "negotiating",
            }).catch((error: any) =>
              safeBestEffort(error, {
                operation: "resolveCommercialApproval",
                fallback: null,
                severity: "critical",
              }),
            );
        }
      }
      if (rejectedAgreement) {
        await svc.entities.DynamicAgreement.update(rejectedAgreement.id, {
          execution_approval_id: null,
          status: "contracting",
        });
      }
      if (ap.action_type === "post_meeting_commitment_review") {
        if (rejectedThread)
          await svc.entities.CommunicationThread.update(rejectedThread.id, {
            conversation_state: "PAUSED",
            automation_paused: true,
            pause_reason: "post_meeting_commitment_rejected",
          }).catch((error: any) =>
            safeBestEffort(error, {
              operation: "resolveCommercialApproval",
              fallback: null,
              severity: "critical",
            }),
          );
      }
      if (rejectedCase) {
        const observedCase = await svc.entities.NegotiationCase.get(
          rejectedCase.id,
        );
        if (
          String(observedCase?.status || "") !== "negotiating" ||
          observedCase?.final_approval_id
        )
          throw new Error("rejected_negotiation_postcondition_failed");
      }
      if (rejectedAgreement) {
        const observedAgreement = await svc.entities.DynamicAgreement.get(
          rejectedAgreement.id,
        );
        if (
          String(observedAgreement?.status || "") !== "contracting" ||
          observedAgreement?.execution_approval_id
        )
          throw new Error("rejected_execution_postcondition_failed");
      }
      await finalizeApproval(svc, ownedApproval, resolutionKey, "rejected", {
        approved_by: user.email,
        approved_at: now,
        rejected_reason: String(body?.reason || ""),
      });
      await svc.entities.OperationalLog.create({
        event_type: "commercial_approval_rejected",
        message: ap.action_type,
        data_json: {
          approval_id: ap.id,
          related_entity_id: ap.related_entity_id,
          reason: body?.reason || null,
        },
        actor_email: user.email,
        created_at: now,
      }).catch((error: any) =>
        safeBestEffort(error, {
          operation: "resolveCommercialApproval",
          fallback: null,
          severity: "critical",
        }),
      );
      return Response.json({ ok: true, status: "rejected" });
    }

    let materialEpoch:any=null;
    try {
      materialEpoch=await captureEmergencyEpoch(
        svc,
        [
          "commercial_reply_exception",
          "post_meeting_commitment_review",
        ].includes(ap.action_type)
          ? "communications"
          : "negotiations",
      );
    } catch (error: any) {
      return denyPreflight(
        error?.message || "emergency_control_paused",
        ownedApproval,
      );
    }

    if (ap.action_type === "final_provider_deal") {
      const payload = ap.draft_payload_json || {};
      const graph = await validateNegotiationGraph(svc, ap, payload);
      if (!graph.ok) return denyPreflight(graph.error, ownedApproval);
      const c = await svc.entities.NegotiationCase.get(ap.related_entity_id);
      const offer = await svc.entities.NegotiationOffer.get(
        String(payload.offer_id || ""),
      ).catch((error: any) =>
        safeBestEffort(error, {
          operation: "resolveCommercialApproval",
          fallback: null,
          severity: "critical",
        }),
      );
      if (!offer || offer.negotiation_case_id !== c.id)
        return denyPreflight("offer_missing_or_changed", ownedApproval);
      if (offer.valid_until && Date.parse(offer.valid_until) <= Date.now())
        return denyPreflight(
          "offer_expired_reapproval_required",
          ownedApproval,
        );
      const activation = graph.activation;
      if (
        !activation ||
        !["authorized", "migrating", "live", "monetizing"].includes(
          String(activation.status),
        )
      )
        return denyPreflight("recover_no_longer_authorized", ownedApproval);
      const mandates = await svc.entities.Mandate.filter(
        { deal_activation_id: c.recover_id, status: "active" },
        "-signed_at",
        5,
      ).catch((error: any) =>
        safeBestEffort(error, {
          operation: "resolveCommercialApproval",
          fallback: [],
          severity: "critical",
        }),
      );
      const mandate = mandates[0];
      if (
        !mandate ||
        String(mandate.id) !==
          String(c.authority_snapshot_json?.mandate_id || "") ||
        String(mandate.deal_activation_id || "") !==
          String(c.recover_id || "") ||
        String(mandate.brand_id || "") !== String(c.brand_id || "") ||
        String(mandate.provider_id || "") !== String(c.provider_id || "")
      )
        return denyPreflight(
          "mandate_changed_reapproval_required",
          ownedApproval,
        );
      ownedApproval = await beginResolutionEffects(
        svc,
        ownedApproval,
        resolutionKey,
      );
      await svc.entities.NegotiationCase.update(c.id, {
        status: "approved",
        approved_offer_id: offer.id,
        next_action: offer.material_commitment
          ? "request_contract_and_verify"
          : "request_written_confirmation_or_contract",
      });
      const thread = graph.thread;
      if (thread) {
        await svc.entities.CommunicationThread.update(thread.id, {
          status: "open",
          automation_paused: false,
          pause_reason: null,
        });
        const internal = Deno.env.get("INTERNAL_CALL_SECRET") || "";
        const send = await svc.functions.invoke("commercialSendMessage", {
          thread_id: thread.id,
          action: "contract_request",
          classification: "clarification",
          subject: `Re: ${c.provider_name} commercial terms`,
          text: "Thanks. We have internal approval to proceed on the commercial basis discussed. Please send the final written agreement or pricing confirmation reflecting the exact agreed terms, including any term, minimum, termination, settlement and implementation conditions. CAMBRA Payments",
          approval_id: ap.id,
          agent_name: "provider_negotiation",
          idempotency_key: `post-approval-contract-request:${ap.id}`,
          internal_secret: internal,
          manual_override: true,
          emergency_epoch_claim: materialEpoch,
        });
        const sendResult = send?.data || send || {};
        if (sendResult.ok === false)
          throw new Error(
            `post_approval_contract_request_failed:${sendResult.error || "unknown"}`,
          );
      }
      const observedCase = await svc.entities.NegotiationCase.get(c.id);
      if (
        String(observedCase?.status || "") !== "approved" ||
        String(observedCase?.approved_offer_id || "") !== String(offer.id)
      )
        throw new Error("provider_deal_postcondition_failed");
      await finalizeApproval(svc, ownedApproval, resolutionKey, "approved", {
        approved_by: user.email,
        approved_at: now,
      });
      await svc.entities.OperationalLog.create({
        event_type: "final_provider_deal_approved",
        message: c.provider_name,
        data_json: {
          approval_id: ap.id,
          case_id: c.id,
          offer_id: offer.id,
          revalidated_at: now,
          contract_execution: false,
          migration_go_live: false,
        },
        actor_email: user.email,
        created_at: now,
      }).catch((error: any) =>
        safeBestEffort(error, {
          operation: "resolveCommercialApproval",
          fallback: null,
          severity: "critical",
        }),
      );
      return Response.json({
        ok: true,
        status: "approved",
        case_id: c.id,
        offer_id: offer.id,
        revalidated: true,
        continued: "contract_request",
      });
    }

    if (ap.action_type === "aggregate_contract") {
      const p = ap.draft_payload_json || {};
      const graph = await validateAggregateContractGraph(svc, ap, p);
      if (!graph.ok) return denyPreflight(graph.error, ownedApproval);
      const { c, bid, offer, pool, rfp } = graph;
      if (offer.valid_until && Date.parse(offer.valid_until) <= Date.now())
        return denyPreflight(
          "offer_expired_reapproval_required",
          ownedApproval,
        );
      const providerEconomics =
        bid.provider_economics_json || p.provider_economics || {};
      const terms = {
        pricing: bid.pricing_json || {},
        tiers: bid.tier_schedule_json || [],
        provider_compensation: providerEconomics,
        legal: bid.legal_terms_json || {},
        provider_id: c.provider_id,
        pool_id: pool.id,
        rfp_id: rfp.id,
        bid_id: bid.id,
      };
      const termsHash = await sha256(terms);
      const family = `CAMBRA-${String(c.provider_name || "PROVIDER")
        .toUpperCase()
        .replace(
          /[^A-Z0-9]+/g,
          "-",
        )}-${String(pool.country || "GLOBAL").toUpperCase()}-${pool.vertical}`;
      const existingForApproval = await svc.entities.DynamicAgreement.filter(
        { approval_id: ap.id },
        "-created_at",
        5,
      );
      if (existingForApproval.length > 1) {
        if (ownedApproval.resolution_effects_started !== true)
          return denyPreflight(
            "duplicate_agreement_for_approval",
            ownedApproval,
          );
        return Response.json(
          { ok: false, error: "duplicate_agreement_for_approval" },
          { status: 409 },
        );
      }
      let agreement = existingForApproval[0] || null;
      if (agreement) {
        if (
          String(agreement.terms_hash || "") !== termsHash ||
          String(agreement.negotiation_case_id || "") !== String(c.id) ||
          String(agreement.approved_bid_id || "") !== String(bid.id) ||
          String(agreement.pool_id || "") !== String(pool.id) ||
          String(agreement.rfp_id || "") !== String(rfp.id)
        )
          return ownedApproval.resolution_effects_started === true
            ? Response.json(
                { ok: false, error: "partial_agreement_context_mismatch" },
                { status: 409 },
              )
            : denyPreflight(
                "partial_agreement_context_mismatch",
                ownedApproval,
              );
      }
      ownedApproval = await beginResolutionEffects(
        svc,
        ownedApproval,
        resolutionKey,
      );
      if (!agreement) {
        const prior = await svc.entities.DynamicAgreement.filter(
          { agreement_family_key: family },
          "-version",
          50,
        );
        const version =
          Math.max(0, ...prior.map((x: any) => Number(x.version || 0))) + 1;
        agreement = await svc.entities.DynamicAgreement.create({
          agreement_key: `${family}-approval-${ap.id}`,
          agreement_family_key: family,
          version,
          pool_id: pool.id,
          rfp_id: rfp.id,
          provider_id: c.provider_id,
          provider_name: c.provider_name,
          negotiation_case_id: c.id,
          approved_bid_id: bid.id,
          status: "contracting",
          vertical: pool.vertical,
          program_name: `CAMBRA ${pool.country || "EU"} ${c.provider_name} Aggregate Program`,
          currency: bid.currency || pool.currency || "EUR",
          legal_terms_json: bid.legal_terms_json || {},
          commercial_terms_json: {
            pricing: bid.pricing_json || {},
            tier_schedule: bid.tier_schedule_json || [],
            demand_snapshot: rfp.demand_snapshot_json || {},
          },
          provider_compensation_terms_json: providerEconomics,
          provider_compensation_legal_status: Object.keys(providerEconomics)
            .length
            ? "legal_review_required"
            : "not_reviewed",
          provider_compensation_disclosure_policy: Object.keys(
            providerEconomics,
          ).length
            ? "LEGAL_REVIEW_REQUIRED"
            : "",
          provider_compensation_activation_allowed: false,
          approval_id: ap.id,
          terms_hash: termsHash,
          supersedes_agreement_id: prior[0]?.id || undefined,
          created_at: now,
        });
        const observed = await svc.entities.DynamicAgreement.filter(
          { approval_id: ap.id },
          "-created_at",
          5,
        );
        if (observed.length !== 1)
          return Response.json(
            { ok: false, error: "agreement_creation_race_detected" },
            { status: 409 },
          );
        agreement = observed[0];
      }
      const tiers =
        Array.isArray(bid.tier_schedule_json) && bid.tier_schedule_json.length
          ? bid.tier_schedule_json
          : [
              {
                name: "Base",
                metric: "addressable_volume",
                threshold_value: 0,
                variable_rate_bps: bid.pricing_json?.variable_rate_bps,
                fixed_fee_minor: bid.pricing_json?.fixed_fee_minor || 0,
                monthly_fee_minor: bid.pricing_json?.monthly_fee_minor || 0,
                activation_mode: "automatic_contractual",
              },
            ];
      let i = 0;
      for (const t of tiers) {
        i++;
        const tierKey = `${agreement.id}:tier:${i}`;
        await upsertTierByKey(svc, "AgreementTier", tierKey, {
          tier_key: tierKey,
          agreement_id: agreement.id,
          tier_number: i,
          name: String(t.name || `Tier ${i}`),
          metric: String(t.metric || "addressable_volume"),
          threshold_value: Math.max(0, Number(t.threshold_value || 0)),
          secondary_conditions_json: t.secondary_conditions_json || {},
          pricing_json: {
            variable_rate_bps:
              t.variable_rate_bps ?? bid.pricing_json?.variable_rate_bps,
            fixed_fee_minor:
              t.fixed_fee_minor ?? bid.pricing_json?.fixed_fee_minor ?? 0,
            monthly_fee_minor:
              t.monthly_fee_minor ?? bid.pricing_json?.monthly_fee_minor ?? 0,
            pricing_model:
              bid.pricing_json?.pricing_model || "aggregate_private",
            merchant_underwriting_required: true,
          },
          rebate_json: t.rebate_json || {},
          activation_mode: String(t.activation_mode || "provider_confirmation"),
          provider_validation_status: "pending",
          qualification_status: "locked",
          progress_pct: 0,
          amount_remaining: Math.max(0, Number(t.threshold_value || 0)),
          updated_at: now,
        });
      }
      const compensationTiers = Array.isArray(providerEconomics?.tiers)
        ? providerEconomics.tiers
        : [];
      let ci = 0;
      for (const t of compensationTiers) {
        ci++;
        const tierKey = `${agreement.id}:provider-comp:${ci}`;
        await upsertTierByKey(svc, "ProviderCompensationTier", tierKey, {
          tier_key: tierKey,
          agreement_id: agreement.id,
          tier_number: ci,
          name: String(t.name || `Provider Revenue Tier ${ci}`),
          metric: String(t.metric || "processed_volume"),
          threshold_value: Math.max(0, Number(t.threshold_value || 0)),
          compensation_type: String(
            (providerEconomics.compensation_types || [])[0] || "OTHER",
          ),
          rate_bps: t.rate_bps == null ? undefined : Number(t.rate_bps),
          percentage: t.percentage == null ? undefined : Number(t.percentage),
          fixed_fee_minor:
            t.fixed_fee_minor == null ? undefined : Number(t.fixed_fee_minor),
          conditions_json: t.conditions_json || {},
          activation_mode: String(t.activation_mode || "provider_confirmation"),
          provider_validation_status: "pending",
          qualification_status: "locked",
          progress_pct: 0,
          amount_remaining: Math.max(0, Number(t.threshold_value || 0)),
          updated_at: now,
        });
      }
      await svc.entities.NegotiationCase.update(c.id, {
        status: "approved",
        approved_offer_id: offer.id,
        next_action: "request_exact_aggregate_contract",
      });
      await svc.entities.AggregateBid.update(bid.id, { status: "approved" });
      await svc.entities.AggregateRFP.update(rfp.id, { status: "contracting" });
      await svc.entities.AggregatePool.update(pool.id, {
        status: "contracting",
        last_negotiated_at: now,
      });
      const thread = graph.thread;
      if (thread) {
        await svc.entities.CommunicationThread.update(thread.id, {
          status: "open",
          automation_paused: false,
          pause_reason: null,
        });
        const internal = Deno.env.get("INTERNAL_CALL_SECRET") || "";
        const send = await svc.functions.invoke("commercialSendMessage", {
          thread_id: thread.id,
          action: "contract_request",
          classification: "clarification",
          subject: `Re: ${c.provider_name} CAMBRA Aggregate terms`,
          text: "We have internal approval to proceed on the commercial basis discussed. Please send the final written agreement or rate-card confirmation reflecting the exact merchant pricing, merchant tiers, CAMBRA partnership economics (if any), provider-compensation tiers, activation criteria, rebates, payment terms, clawbacks, term, notice, settlement, implementation and any minimum or exclusivity conditions. Merchant terms and CAMBRA compensation must remain separately stated. This approval does not itself activate provider compensation, create a volume guarantee or execute a contract.",
          approval_id: ap.id,
          agent_name: "collective_negotiation",
          idempotency_key: `aggregate-contract-request:${ap.id}`,
          internal_secret: internal,
          manual_override: true,
          emergency_epoch_claim: materialEpoch,
        });
        const sendResult = send?.data || send || {};
        if (sendResult.ok === false)
          throw new Error(
            `aggregate_contract_request_failed:${sendResult.error || "unknown"}`,
          );
      }
      const [observedCase, observedBid, observedRfp, observedPool] =
        await Promise.all([
          svc.entities.NegotiationCase.get(c.id),
          svc.entities.AggregateBid.get(bid.id),
          svc.entities.AggregateRFP.get(rfp.id),
          svc.entities.AggregatePool.get(pool.id),
        ]);
      if (
        String(observedCase?.status || "") !== "approved" ||
        String(observedCase?.approved_offer_id || "") !== String(offer.id) ||
        String(observedBid?.status || "") !== "approved" ||
        String(observedRfp?.status || "") !== "contracting" ||
        String(observedPool?.status || "") !== "contracting"
      )
        throw new Error("aggregate_contract_postcondition_failed");
      await finalizeApproval(svc, ownedApproval, resolutionKey, "approved", {
        approved_by: user.email,
        approved_at: now,
      });
      await svc.entities.OperationalLog.create({
        event_type: "intelligence_event",
        message: "aggregate_contract_proposal_approved",
        data_json: {
          agreement_id: agreement.id,
          case_id: c.id,
          bid_id: bid.id,
          rfp_id: rfp.id,
          pool_id: pool.id,
          contract_execution: false,
          terms_hash: termsHash,
        },
        actor_email: user.email,
        created_at: now,
      }).catch((error: any) =>
        safeBestEffort(error, {
          operation: "resolveCommercialApproval",
          fallback: null,
          severity: "critical",
        }),
      );
      return Response.json({
        ok: true,
        status: "approved",
        agreement_id: agreement.id,
        continued: "exact_contract_request",
        contract_execution: false,
      });
    }

    if (ap.action_type === "aggregate_contract_execution") {
      const p = ap.draft_payload_json || {};
      const graph = await validateAggregateExecutionGraph(svc, ap, p);
      if (!graph.ok) return denyPreflight(graph.error, ownedApproval);
      const { agreement: a, c } = graph;
      if (
        !["contracting", "active"].includes(String(a.status)) ||
        String(a.execution_approval_id || "") !== String(ap.id)
      )
        return denyPreflight(
          "aggregate_execution_binding_mismatch",
          ownedApproval,
        );
      if (
        c.contract_match_status !== "match" ||
        !c.contract_document_id ||
        String(c.contract_document_id) !== String(p.contract_document_id || "")
      )
        return denyPreflight("exact_contract_match_required", ownedApproval);
      if (String(a.terms_hash) !== String(p.terms_hash || ""))
        return denyPreflight(
          "agreement_terms_changed_reapproval_required",
          ownedApproval,
        );
      ownedApproval = await beginResolutionEffects(
        svc,
        ownedApproval,
        resolutionKey,
      );
      await svc.entities.DynamicAgreement.update(a.id, {
        status: "active",
        contract_document_id: c.contract_document_id,
        activated_at: a.activated_at || now,
        start_at: a.start_at || now,
      });
      await svc.entities.AggregateRFP.update(a.rfp_id, {
        status: "won",
        closed_at: a.activated_at || now,
      });
      await svc.entities.AggregatePool.update(a.pool_id, {
        status: "active",
        last_negotiated_at: now,
      });
      const tiers = await svc.entities.AgreementTier.filter(
        { agreement_id: a.id },
        "tier_number",
        100,
      );
      for (const t of tiers) {
        if (t.activation_mode === "automatic_contractual")
          await svc.entities.AgreementTier.update(t.id, {
            provider_validation_status: "confirmed",
          });
      }
      const compensationTiers =
        await svc.entities.ProviderCompensationTier.filter(
          { agreement_id: a.id },
          "tier_number",
          100,
        );
      for (const t of compensationTiers) {
        if (t.activation_mode === "automatic_contractual")
          await svc.entities.ProviderCompensationTier.update(t.id, {
            provider_validation_status: "confirmed",
          });
      }
      const internal = Deno.env.get("INTERNAL_CALL_SECRET") || "";
      await svc.functions
        .invoke("aggregateAgreementWorker", { internal_secret: internal })
        .catch((error: any) =>
          safeBestEffort(error, {
            operation: "resolveCommercialApproval",
            fallback: null,
            severity: "critical",
          }),
        );
      await svc.functions
        .invoke("aggregateEligibilityWorker", { internal_secret: internal })
        .catch((error: any) =>
          safeBestEffort(error, {
            operation: "resolveCommercialApproval",
            fallback: null,
            severity: "critical",
          }),
        );
      const observedAgreement = await svc.entities.DynamicAgreement.get(a.id);
      if (
        String(observedAgreement?.status || "") !== "active" ||
        String(observedAgreement?.contract_document_id || "") !==
          String(c.contract_document_id || "")
      )
        throw new Error("aggregate_execution_postcondition_failed");
      await finalizeApproval(svc, ownedApproval, resolutionKey, "approved", {
        approved_by: user.email,
        approved_at: now,
      });
      await svc.entities.OperationalLog.create({
        event_type: "intelligence_event",
        message: "aggregate_contract_activated",
        data_json: {
          agreement_id: a.id,
          pool_id: a.pool_id,
          provider_id: a.provider_id,
          contract_document_id: c.contract_document_id,
          exact_match: true,
        },
        actor_email: user.email,
        created_at: now,
      }).catch((error: any) =>
        safeBestEffort(error, {
          operation: "resolveCommercialApproval",
          fallback: null,
          severity: "critical",
        }),
      );
      return Response.json({
        ok: true,
        status: "approved",
        agreement_id: a.id,
        agreement_status: "active",
      });
    }

    if (
      ap.action_type === "contract_mismatch" ||
      ap.action_type === "contract_exception"
    ) {
      const payload = ap.draft_payload_json || {};
      const graph = await validateContractReviewGraph(svc, ap, payload);
      if (!graph.ok) return denyPreflight(graph.error, ownedApproval);
      const c = graph.c;
      ownedApproval = await beginResolutionEffects(
        svc,
        ownedApproval,
        resolutionKey,
      );
      await svc.entities.NegotiationCase.update(c.id, {
        status: "contract_received",
        next_action: "manual_contract_resolution_required",
      });
      const observedCase = await svc.entities.NegotiationCase.get(c.id);
      if (
        String(observedCase?.next_action || "") !==
        "manual_contract_resolution_required"
      )
        throw new Error("contract_review_postcondition_failed");
      await finalizeApproval(svc, ownedApproval, resolutionKey, "approved", {
        approved_by: user.email,
        approved_at: now,
      });
      await svc.entities.OperationalLog.create({
        event_type: "provider_contract_exception_acknowledged",
        message: ap.action_type,
        data_json: {
          approval_id: ap.id,
          case_id: c.id,
          contract_execution: false,
          migration_go_live: false,
        },
        actor_email: user.email,
        created_at: now,
      }).catch((error: any) =>
        safeBestEffort(error, {
          operation: "resolveCommercialApproval",
          fallback: null,
          severity: "critical",
        }),
      );
      return Response.json({
        ok: true,
        status: "approved",
        continued: "manual_contract_resolution_required",
        contract_execution: false,
      });
    }

    if (
      ap.action_type === "commercial_reply_exception" ||
      ap.action_type === "provider_negotiation_review" ||
      ap.action_type === "aggregate_procurement_review"
    ) {
      const payload = ap.draft_payload_json || {};
      const thread = await svc.entities.CommunicationThread.get(
        String(payload.thread_id || ""),
      ).catch((error: any) =>
        safeBestEffort(error, {
          operation: "resolveCommercialApproval",
          fallback: null,
          severity: "critical",
        }),
      );
      if (!(await threadApprovalBindingMatches(svc, ap, thread, payload)))
        return denyPreflight("thread_approval_binding_mismatch", ownedApproval);
      const expectedEngine =
        ap.action_type === "provider_negotiation_review"
          ? "provider_negotiation"
          : ap.action_type === "aggregate_procurement_review"
            ? "aggregate_procurement"
            : null;
      if (expectedEngine && String(thread.engine || "") !== expectedEngine)
        return denyPreflight("thread_engine_binding_mismatch", ownedApproval);
      if (payload.proposed_reply) {
        const last = await svc.entities.CommunicationMessage.get(
          String(payload.message_id || ""),
        ).catch((error: any) =>
          safeBestEffort(error, {
            operation: "resolveCommercialApproval",
            fallback: null,
            severity: "critical",
          }),
        );
        if (
          !last ||
          String(last.thread_id || "") !== String(thread.id) ||
          String(last.direction || "") !== "inbound"
        )
          return denyPreflight(
            "message_thread_binding_mismatch",
            ownedApproval,
          );
        ownedApproval = await beginResolutionEffects(
          svc,
          ownedApproval,
          resolutionKey,
        );
        const internal = Deno.env.get("INTERNAL_CALL_SECRET") || "";
        const r = await svc.functions.invoke("commercialSendMessage", {
          thread_id: thread.id,
          action: "routine_reply",
          classification: String(payload.classification || "question"),
          subject: `Re: ${last?.subject || ""}`,
          text: String(payload.proposed_reply),
          approval_id: ap.id,
          agent_name: "commercial_reply",
          idempotency_key: `approved-exception:${ap.id}`,
          internal_secret: internal,
          manual_override: true,
          emergency_epoch_claim: materialEpoch,
        });
        const rd = r?.data || r || {};
        if (rd.ok === false)
          return Response.json(
            {
              ok: false,
              error: "approved_reply_send_failed",
              detail: rd.error,
            },
            { status: 500 },
          );
      }
      if (ownedApproval.resolution_effects_started !== true)
        ownedApproval = await beginResolutionEffects(
          svc,
          ownedApproval,
          resolutionKey,
        );
      await svc.entities.CommunicationThread.update(thread.id, {
        status: "awaiting_counterparty",
        automation_paused: false,
        pause_reason: null,
      });
      const observedThread = await svc.entities.CommunicationThread.get(
        thread.id,
      );
      if (
        String(observedThread?.status || "") !== "awaiting_counterparty" ||
        observedThread?.automation_paused === true
      )
        throw new Error("commercial_reply_postcondition_failed");
      await finalizeApproval(svc, ownedApproval, resolutionKey, "approved", {
        approved_by: user.email,
        approved_at: now,
      });
      return Response.json({
        ok: true,
        status: "approved",
        continued: "reply_sent",
      });
    }

    if (ap.action_type === "post_meeting_commitment_review") {
      const payload = ap.draft_payload_json || {};
      const thread = await svc.entities.CommunicationThread.get(
        String(payload.thread_id || ""),
      ).catch((error: any) =>
        safeBestEffort(error, {
          operation: "resolveCommercialApproval",
          fallback: null,
          severity: "critical",
        }),
      );
      if (
        !(await threadApprovalBindingMatches(svc, ap, thread, payload)) ||
        String(thread.meeting_outcome_json?.captured_at || "") !==
          String(payload.outcome?.captured_at || "")
      )
        return denyPreflight(
          "meeting_outcome_changed_reapproval_required",
          ownedApproval,
        );
      ownedApproval = await beginResolutionEffects(
        svc,
        ownedApproval,
        resolutionKey,
      );
      if (ap.agent_task_id)
        await svc.entities.AgentTask.update(ap.agent_task_id, {
          status: "completed",
          output_summary:
            "Founder reviewed post-meeting items. No legal, financial or contractual execution was performed.",
          completed_at: now,
        }).catch((error: any) =>
          safeBestEffort(error, {
            operation: "resolveCommercialApproval",
            fallback: null,
            severity: "critical",
          }),
        );
      await svc.entities.CommunicationThread.update(thread.id, {
        conversation_state: "MEETING_COMPLETED",
        automation_paused: false,
        pause_reason: null,
        post_meeting_status: "pending",
      });
      const observedThread = await svc.entities.CommunicationThread.get(
        thread.id,
      );
      if (
        String(observedThread?.conversation_state || "") !==
          "MEETING_COMPLETED" ||
        observedThread?.automation_paused === true
      )
        throw new Error("post_meeting_postcondition_failed");
      await finalizeApproval(svc, ownedApproval, resolutionKey, "approved", {
        approved_by: user.email,
        approved_at: now,
      });
      await svc.entities.OperationalLog.create({
        event_type: "FOUNDER_MEETING_OUTCOME_APPROVED",
        message:
          "Post-meeting communication may resume; consequential execution remains separately gated.",
        data_json: {
          approval_id: ap.id,
          thread_id: thread.id,
          execution: false,
        },
        actor_email: user.email,
        created_at: now,
      }).catch((error: any) =>
        safeBestEffort(error, {
          operation: "resolveCommercialApproval",
          fallback: null,
          severity: "critical",
        }),
      );
      return Response.json({
        ok: true,
        status: "approved",
        continued: "post_meeting_followup",
        execution: false,
      });
    }

    return denyPreflight("unsupported_commercial_approval_type", ownedApproval);
  } catch (error) {
    console.error("resolveCommercialApproval failed", error);
    let retryRequiresNewPreview = false;
    if (recovery?.svc && recovery.approvalId && recovery.resolutionKey) {
      const latest = await recovery.svc.entities.Approval.get(
        recovery.approvalId,
      ).catch((readError:any)=>safeBestEffort(readError,{operation:'resolveCommercialApproval.failure_recovery_authority_read',fallback:null,severity:'critical'}));
      if (
        latest?.status === "resolving" &&
        String(latest.resolution_command_key || "") ===
          recovery.resolutionKey &&
        latest.resolution_effects_started !== true
      ) {
        const released = await releaseResolutionClaimIfNoEffects(
          recovery.svc,
          latest,
          recovery.resolutionKey,
        ).catch((releaseError:any)=>safeBestEffort(releaseError,{operation:'resolveCommercialApproval.release_failed_resolution_claim',fallback:{released:false},severity:'critical'}));
        retryRequiresNewPreview =
          released.retry_requires_new_preview === true;
      }
    }
    return Response.json(
      {
        ok: false,
        error: "commercial_approval_resolution_failed",
        retry_requires_new_preview: retryRequiresNewPreview,
      },
      { status: 500 },
    );
  }
});
