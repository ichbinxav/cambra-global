import { safeBestEffort } from "../../shared/bestEffort.ts";
// acceptRecoverMandate — RECOVER-1 (2026-08-03).
//
// Records the signature and authorizes the activation. THIS function is where the
// invariant "DealActivation never reaches 'authorized' without an active mandate"
// is enforced — IN LINE, not by guardDealActivationStatus.
//
// Why in line: that guard (and updateDealActivationStatus) were already dead
// before this chunk — no caller in src/, no registered entity automation (verified
// 2026-08-03: the app has ZERO entity automations), so the guard never fired at
// all. They were left to die in the PURGE-2 sweep of 2026-08-15 rather than
// resurrected: a precondition PREVENTS the invalid write instead of reverting it
// afterwards, and a reactive second writer of DealActivation.status could collide
// with the transient two-active-mandate overlap that supersession tolerates.
//
// Order of operations, and the reason for each:
//   1. re-verify the terms hash        → a fee/baseline change mid-popup refuses
//   2. RE-READ the mandate             → no double-accept, no accept-after-revoke
//   3. activate the mandate FIRST      → the mandate exists before authorization
//   4. RE-READ mandates, confirm active→ we never authorize on an assumption
//   5. RE-READ the activation, then    → state is checked immediately before each
//      walk activated → awaiting_authorization → authorized
//   6. supersede older active mandates
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { resolveFeePctForMonth } from "../../shared/billingFee.ts";
import { getSuccessFeePct } from "../../shared/generated/productPolicy.ts";
import { rejectClientTerms } from "../../shared/contractPolicySnapshot.ts";
import { normalizeLocale } from "../../shared/emailLocale.ts";
import { RECOVER_CONTRACT_TEMPLATE_VERSION } from "../../shared/recoverContractTemplates.ts";
import {
  deliveryIdempotencyKey,
  logContractEvent,
} from "../../shared/recoverContractState.ts";
import { fireAndForget } from "../../shared/invokeInternal.ts";
import {
  economicGateDeniedResponse,
  evaluateRecoverEconomicGate,
} from "../../shared/eclEconomicGate.ts";
import { assertMarketCapabilityAllowed } from "../../shared/marketPolicyRuntime.ts";
import {
  enforceLegalExecution,
  legalBlockResponse,
} from "../../shared/legalExecutionRuntime.ts";
import {
  createRecoverEvidenceAttestation,
  ensureRecoverSavingsEvidence,
  projectRecoverEvidenceBinding,
} from "../../shared/eclRecoverEvidence.ts";
import {
  evidenceAttestationTextFor,
  RECOVER_EVIDENCE_ATTESTATION_VERSION,
} from "../../shared/recoverMandateCopy.ts";
import {
  acceptanceEvidence,
  buildAcceptanceSnapshot,
  claimRecoverAcceptanceAuthority,
  commitRecoverMandateAcceptance,
  currentMonth,
  findVerifiedBaseline,
  hashSnapshot,
  recoverCasUpdatedCount,
  recoverCasUpdatedExactlyOne,
  resolveOwnedActivation,
} from "../../shared/recoverAcceptance.ts";
import {
  effectAuthorityErrorResponse,
  requireEffectAuthorities,
} from "../../shared/effectAuthority.ts";

async function singleRow(entity: any, filter: any, errorCode: string) {
  const rows = await entity.filter(filter, "-created_date", 2);
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error(errorCode);
  return rows[0];
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((error: any) =>
      safeBestEffort(error, {
        operation: "acceptRecoverMandate",
        fallback: null,
        severity: "critical",
      })
    );
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const authenticatedAt = new Date().toISOString();

    const body = await req.json().catch(() => ({}));
    // v61 (Checkpoint C) — the client may never carry economic-term keys.
    const termsGuard = rejectClientTerms(body);
    // `=== false`, not `!`: tsconfig.critical.json runs strict:false, where
    // truthiness narrowing does NOT discriminate the union. Same runtime branch.
    if (termsGuard.ok === false) {
      // Destructured INSIDE the guard so the union narrows to its false arm.
      const { keys } = termsGuard;
      return Response.json({ error: "client_terms_forbidden", keys }, {
        status: 400,
      });
    }
    const {
      mandate_id,
      signed_by_name,
      signed_by_role,
      evidence_attestation_accepted,
      accepted,
    } = body || {};
    if (!mandate_id) {
      return Response.json({ error: "mandate_id required" }, { status: 400 });
    }
    if (accepted !== true) {
      return Response.json({ error: "explicit acceptance required" }, {
        status: 400,
      });
    }
    if (evidence_attestation_accepted !== true) {
      return Response.json(
        { error: "explicit evidence attestation required" },
        { status: 400 },
      );
    }
    if (!signed_by_name || String(signed_by_name).trim().length < 2) {
      return Response.json({ error: "signed_by_name required" }, {
        status: 400,
      });
    }

    const svc = base44.asServiceRole;
    const email = String(user.email || "").toLowerCase();

    // .catch((error:any)=>safeBestEffort(error,{operation:'acceptRecoverMandate',fallback:[],severity:'critical'})) — .filter({ id }) throws on an unknown id instead of returning [].
    const first = await svc.entities.Mandate.filter(
      { id: mandate_id },
      "-created_date",
      1,
    );
    const mandate = first?.[0];
    if (!mandate) {
      return Response.json({ error: "mandate not found" }, { status: 404 });
    }
    // RECOVER-4 audit fix (2026-08-04): NO admin bypass here, deliberately.
    // signed_by_email below is the SESSION's email, and it is both the legal
    // attribution of the signature and the sole recipient of the contractual
    // copy — so an admin "helping" would have recorded themselves as the
    // signatory and had the merchant's agreement emailed to CAMBRA instead.
    // An electronic acceptance can only be performed by its owner; admins read
    // and revoke, they never sign on someone's behalf.
    if (String(mandate.owner_email || "").toLowerCase() !== email) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    if (!["acceptance_started", "active"].includes(mandate.status)) {
      return Response.json({
        error: "mandate_not_pending",
        status: mandate.status,
      }, { status: 409 });
    }

    const owned = await resolveOwnedActivation(
      svc,
      user,
      mandate.deal_activation_id,
    );
    if (!owned.ok) {
      return Response.json({ error: owned.error }, { status: owned.status });
    }
    const { activation, ownerEmail } = owned;
    if (mandate.status === "active") {
      const replayActivation = await singleRow(svc.entities.DealActivation, {
        id: activation.id,
      }, "activation_authority_unavailable");
      const replayMandates = await svc.entities.Mandate.filter(
        { deal_activation_id: activation.id },
        "-created_date",
        25,
      );
      const replayActive = (replayMandates || []).filter((m: any) =>
        m.status === "active"
      );
      if (
        replayActivation.status === "authorized" &&
        replayActivation.active_mandate_id === mandate_id &&
        replayActive.length === 1 && replayActive[0].id === mandate_id
      ) {
        return Response.json({
          ok: true,
          already_accepted: true,
          mandate_id: mandate.id,
          activation_authorized: true,
        });
      }
      if (
        replayActivation.status !== "awaiting_authorization" ||
        replayActivation.authorization_mandate_id !== mandate_id ||
        replayActive.length !== 1 || replayActive[0].id !== mandate_id
      ) {
        return Response.json({
          error: "active_mandate_invariant_review_required",
        }, { status: 409 });
      }
    }
    if (owned.brand?.market_context_rollout === "production") {
      try {
        await assertMarketCapabilityAllowed(svc, {
          brand: owned.brand,
          brand_id: owned.brand.id,
          capability: "CONTRACT",
          actor_type: "recover_mandate_accept",
        });
      } catch (e: any) {
        return Response.json({
          error: "market_capability_denied:CONTRACT",
          decision: e?.decision || null,
        }, { status: 409 });
      }
    }
    try {
      await enforceLegalExecution(svc, {
        requested_action: "ACCEPT_RECOVER_MANDATE",
        merchant_id: activation.brand_id,
        jurisdiction: owned.brand?.billing_country || owned.brand?.country,
        case_id: activation.id,
        deal_activation_id: activation.id,
        actor: {
          id: email,
          type: "HUMAN_MERCHANT",
          tool: "acceptRecoverMandate",
          allowed_actions: ["ACCEPT_RECOVER_MANDATE"],
        },
      });
    } catch (error) {
      const response = legalBlockResponse(error);
      if (response) return response;
      throw error;
    }

    // 1 — terms must be identical to what was displayed.
    const month = currentMonth();
    const baseline = await findVerifiedBaseline(svc, activation);
    if (!baseline) {
      return Response.json({ error: "no_verified_baseline" }, { status: 409 });
    }
    const fee = await resolveFeePctForMonth(
      svc,
      {
        deal_activation_id: activation.id,
        brand_id: activation.brand_id,
        provider_id: activation.provider_id,
        fallbackPct: activation.node_share_percent ?? getSuccessFeePct(),
      },
      month,
    );
    // Refresh the server-resolved evidence immediately before signature. If
    // Stripe changed while the modal was open, this creates/processes the newer
    // evidence and the snapshot hash below changes → terms_changed.
    const eclNow = new Date().toISOString();
    const materialized = await ensureRecoverSavingsEvidence({
      base44,
      svc,
      activation,
      baseline,
      ownerEmail,
      now: eclNow,
    });
    if (materialized.ok === false) {
      return Response.json({
        ok: false,
        error: materialized.code || "ecl_evidence_materialization_failed",
      }, { status: 409 });
    }
    const evidenceBinding = mandate.status === "active"
      ? mandate.acceptance_snapshot_json?.ecl_evidence_binding || null
      : projectRecoverEvidenceBinding(materialized.evidence);
    if (!evidenceBinding) {
      return Response.json({
        ok: false,
        error: "ecl_evidence_binding_unavailable",
      }, { status: 409 });
    }

    const liveHash = await hashSnapshot(
      buildAcceptanceSnapshot({
        activation,
        baseline,
        fee,
        month,
        evidenceBinding,
        brand: owned.brand,
      }),
    );
    const storedHash = mandate.status === "active"
      ? await hashSnapshot(mandate.acceptance_snapshot_json)
      : liveHash;
    const freshHash = mandate.status === "active" ? storedHash : liveHash;
    if (freshHash !== mandate.acceptance_snapshot_hash) {
      return Response.json(
        {
          error: mandate.status === "active"
            ? "accepted_snapshot_integrity_failed"
            : "terms_changed",
          expected: mandate.acceptance_snapshot_hash,
          actual: freshHash,
        },
        { status: 409 },
      );
    }

    // The merchant's explicit second checkbox becomes a durable
    // EvidenceAttestation bound to the exact evidence id+checksum frozen in the
    // acceptance snapshot. Only AFTER that attestation exists may the
    // recover_proposal gate pass.
    const language = normalizeLocale(owned.brand?.locale);
    const attestation = await createRecoverEvidenceAttestation({
      svc,
      user,
      activation,
      baseline,
      ownerEmail,
      legalText: evidenceAttestationTextFor(language),
      legalTextVersion: RECOVER_EVIDENCE_ATTESTATION_VERSION,
      language,
      expectedEvidenceId: evidenceBinding.evidence_id,
      expectedChecksum: evidenceBinding.checksum,
    });
    if (!attestation.ok) {
      return Response.json({
        ok: false,
        error: attestation.code || "ecl_attestation_failed",
      }, { status: 409 });
    }

    // ECL P5 TOCTOU seal — re-evaluate immediately before the first contractual
    // write. A proposal that was valid at start cannot be accepted after
    // review/rejection/expiry, and recover_proposal now sees the attestation.
    const freezeGate = await evaluateRecoverEconomicGate({
      svc,
      gateName: "freeze_baseline",
      brandId: activation.brand_id,
      dealActivationId: activation.id,
      baseline,
      now: eclNow,
    });
    if (!freezeGate.allowed) return economicGateDeniedResponse(freezeGate);
    const proposalGate = await evaluateRecoverEconomicGate({
      svc,
      gateName: "recover_proposal",
      brandId: activation.brand_id,
      dealActivationId: activation.id,
      baseline,
      now: eclNow,
    });
    if (!proposalGate.allowed) return economicGateDeniedResponse(proposalGate);

    // 2 — re-read the mandate immediately before writing it.
    const recheck = await svc.entities.Mandate.filter(
      { id: mandate_id },
      "-created_date",
      1,
    );
    const fresh = recheck?.[0];
    if (!fresh) {
      return Response.json({ error: "mandate not found" }, { status: 404 });
    }
    if (!["acceptance_started", "active"].includes(fresh.status)) {
      return Response.json({
        error: "mandate_not_pending",
        status: fresh.status,
      }, { status: 409 });
    }

    // R5 OTR-012 — signature/authorization commits re-read the authenticated
    // actor, mandate, tenant activation, Brand, legal execution and market
    // policy. There is still no sign/mandate EmergencyControl capability; that
    // limitation remains explicit instead of being represented as contained.
    try {
      await requireEffectAuthorities(svc, {
        effect_classes: ["APPROVE", "SIGN_MANDATE"],
        actor: { id: email, type: "HUMAN_MERCHANT" },
        tenant: { key: activation.brand_id, scope: "tenant" },
        subject: { type: "Mandate", id: mandate_id },
        context: {
          jurisdiction: owned.brand?.billing_country || owned.brand?.country,
          market_scope_requirement: "REQUIRED",
          emergency_not_applicable: true,
          emergency_not_applicable_reason:
            "EmergencyControl has no sign_mandate capability; repository gap remains open",
          expected_policy_key: "market:CONTRACT",
          phase: `accept_recover_mandate_commit:${mandate_id}`,
        },
        revalidate: async (authoritySvc: any, exact: any) => {
          const freshActor = await base44.auth.me();
          if (
            !freshActor ||
            String(freshActor.email || "").toLowerCase() !==
              exact.actor_id.toLowerCase()
          ) {
            return {
              status: "DENIED",
              authority_available: true,
              effect_classes: exact.effect_classes,
              actor_id: String(freshActor?.email || "").toLowerCase(),
              tenant_key: exact.tenant_key,
              subject_type: exact.subject_type,
              subject_id: exact.subject_id,
              policy_key: "market:CONTRACT",
              policy_version: "denied",
              policy_state: "DENIED",
              authority_ref: "auth:merchant",
              observed_at: new Date().toISOString(),
            };
          }
          const freshMandates = await authoritySvc.entities.Mandate.filter(
            { id: exact.subject_id },
            "-created_date",
            2,
          );
          if (!Array.isArray(freshMandates) || freshMandates.length !== 1) {
            throw new Error("mandate_effect_authority_unavailable");
          }
          const authorityMandate = freshMandates[0];
          if (
            String(authorityMandate.owner_email || "").toLowerCase() !==
              exact.actor_id.toLowerCase() ||
            !["acceptance_started", "active"].includes(
              String(authorityMandate.status || ""),
            ) ||
            String(authorityMandate.acceptance_snapshot_hash || "") !==
              freshHash
          ) throw new Error("mandate_effect_authority_changed");
          const freshActivations = await authoritySvc.entities.DealActivation
            .filter(
              { id: authorityMandate.deal_activation_id },
              "-created_date",
              2,
            );
          if (
            !Array.isArray(freshActivations) || freshActivations.length !== 1
          ) {
            throw new Error("mandate_activation_authority_unavailable");
          }
          const freshActivation = freshActivations[0];
          if (String(freshActivation.brand_id || "") !== exact.tenant_key) {
            throw new Error("mandate_tenant_binding_changed");
          }
          const freshBrands = await authoritySvc.entities.Brand.filter(
            { id: exact.tenant_key },
            "-created_date",
            2,
          );
          if (!Array.isArray(freshBrands) || freshBrands.length !== 1) {
            throw new Error("mandate_brand_authority_unavailable");
          }
          const freshBrand = freshBrands[0];
          const jurisdiction = String(
            freshBrand.billing_country || freshBrand.country || "",
          ).trim().toUpperCase();
          const marketDecision = await assertMarketCapabilityAllowed(
            authoritySvc,
            {
              brand: freshBrand,
              brand_id: freshBrand.id,
              jurisdiction,
              capability: "CONTRACT",
              enforce: true,
              actor_type: "recover_mandate_accept_effect",
            },
          );
          const legalDecision: any = await enforceLegalExecution(authoritySvc, {
            requested_action: "ACCEPT_RECOVER_MANDATE",
            merchant_id: freshActivation.brand_id,
            jurisdiction,
            case_id: freshActivation.id,
            deal_activation_id: freshActivation.id,
            actor: {
              id: exact.actor_id,
              type: "HUMAN_MERCHANT",
              tool: "acceptRecoverMandate",
              allowed_actions: ["ACCEPT_RECOVER_MANDATE"],
            },
          });
          return {
            status: "AUTHORIZED",
            authority_available: true,
            effect_classes: exact.effect_classes,
            actor_id: exact.actor_id,
            tenant_key: exact.tenant_key,
            subject_type: exact.subject_type,
            subject_id: exact.subject_id,
            policy_key: "market:CONTRACT",
            policy_version: String(
              marketDecision.policy_version || marketDecision.policy_id || "",
            ),
            policy_state: "ACTIVE",
            authority_ref: String(
              legalDecision?.authority_snapshot_id ||
                `JurisdictionCapabilityPolicy:${
                  marketDecision.policy_id || ""
                }`,
            ),
            authority_hash: legalDecision?.authority_snapshot_hash || null,
            observed_at: new Date().toISOString(),
            market_iso2: jurisdiction,
            market_scope_version: exact.market_scope_version,
          };
        },
      });
    } catch (error) {
      const response = effectAuthorityErrorResponse(error);
      if (response) return response;
      throw error;
    }

    // 3 — serialize acceptance on the activation before the mandate transition.
    // `awaiting_authorization` without a binding is legacy/ambiguous and is
    // deliberately review-required; overwriting it would let two mandates race.
    try {
      await claimRecoverAcceptanceAuthority(svc, {
        activationId: activation.id,
        mandateId: mandate_id,
        now: new Date().toISOString(),
      });
    } catch (error: any) {
      return Response.json({
        error: String(error?.message || "activation_acceptance_claim_failed"),
      }, { status: 409 });
    }

    // 4 — the mandate becomes active BEFORE anything is authorized, through an
    // exact compare-and-swap. Only the invocation whose token survives readback
    // may continue to supersession or activation authorization.
    const evidence = acceptanceEvidence(req, authenticatedAt);
    const signedAt = new Date().toISOString();
    const acceptanceCommitToken = crypto.randomUUID();
    // RECOVER-3 — the document language is FROZEN here, from the STORED
    // Brand.locale, never from a header or the browser: a copy regenerated months
    // later must read in the language the merchant accepted in.
    const mandatePatch = {
      status: "active",
      acceptance_commit_token: acceptanceCommitToken,
      // RECOVER-3 — delivery is marked owed BEFORE anything is attempted and
      // WITHOUT waiting for RECOVER-2. If the non-blocking generation call below
      // is lost when this invocation ends, the reconciler still finds this row.
      language,
      contract_pdf_pending: true,
      contract_pdf_status: "pending",
      contract_pdf_attempt_count: 0,
      contract_email_status: "not_ready",
      contract_email_attempt_count: 0,
      contract_delivery_idempotency_key: deliveryIdempotencyKey({
        mandateId: mandate_id,
        snapshotHash: freshHash,
        templateVersion: RECOVER_CONTRACT_TEMPLATE_VERSION,
        language,
      }),
      signed_by_name: String(signed_by_name).trim(),
      signed_by_email: email,
      signed_by_role: signed_by_role || "",
      signer_capacity_status: signed_by_role ? "declared" : "unverified",
      signed_at: signedAt,
      legal_entity_name: owned.brand?.name || mandate.legal_entity_name || "",
      authenticated_at: evidence.authenticated_at,
      ip_address: evidence.ip_address,
      user_agent: evidence.user_agent,
    };
    if (fresh.status === "acceptance_started") {
      try {
        await commitRecoverMandateAcceptance(svc, {
          mandateId: mandate_id,
          snapshotHash: freshHash,
          commitToken: acceptanceCommitToken,
          signedByEmail: email,
          patch: mandatePatch,
        });
      } catch (error: any) {
        return Response.json({
          error: String(error?.message || "mandate_changed_concurrently"),
        }, { status: 409 });
      }
    } else if (
      fresh.status !== "active" ||
      fresh.acceptance_snapshot_hash !== freshHash ||
      fresh.signed_by_email !== email
    ) {
      return Response.json({ error: "mandate_changed_concurrently" }, {
        status: 409,
      });
    }

    // 5 — supersede every older active mandate through CAS, then prove the
    // invariant before authorizing. No best-effort writes on legal authority.
    let mandates = await svc.entities.Mandate.filter(
      { deal_activation_id: activation.id },
      "-created_date",
      25,
    );
    const superseded: string[] = [];
    for (const m of mandates || []) {
      if (m.id === mandate_id || m.status !== "active") continue;
      const changed = await svc.entities.Mandate.updateMany({
        id: m.id,
        status: "active",
      }, {
        $set: {
          status: "superseded",
          superseded_at: new Date().toISOString(),
          superseded_by_id: mandate_id,
        },
      });
      if (!recoverCasUpdatedExactlyOne(changed)) {
        return Response.json({
          error: "mandate_supersession_concurrency_conflict",
        }, { status: 409 });
      }
      superseded.push(m.id);
    }
    if (superseded.length) {
      await svc.entities.Mandate.update(mandate_id, {
        supersedes_id: superseded[0],
      });
    }

    mandates = await svc.entities.Mandate.filter(
      { deal_activation_id: activation.id },
      "-created_date",
      25,
    );
    const activeMandates = (mandates || []).filter((m: any) =>
      m.status === "active"
    );
    if (activeMandates.length !== 1 || activeMandates[0].id !== mandate_id) {
      return Response.json({ error: "active_mandate_invariant_failed" }, {
        status: 409,
      });
    }

    // 6 — authorize only if the activation still carries OUR exact binding.
    const authorizedAt = new Date().toISOString();
    const authorization = await svc.entities.DealActivation.updateMany({
      id: activation.id,
      status: "awaiting_authorization",
      authorization_mandate_id: mandate_id,
    }, {
      $set: {
        status: "authorized",
        active_mandate_id: mandate_id,
        last_updated: authorizedAt,
      },
    });
    const authorizedActivation = await singleRow(
      svc.entities.DealActivation,
      { id: activation.id },
      "activation_authorization_readback_unavailable",
    );
    const authorized = authorizedActivation.status === "authorized" &&
      authorizedActivation.active_mandate_id === mandate_id;
    if (!authorized) {
      return Response.json({
        error: "activation_authorization_concurrency_conflict",
      }, { status: 409 });
    }
    const postAuthorizationMandate = await singleRow(
      svc.entities.Mandate,
      { id: mandate_id },
      "mandate_post_authorization_read_unavailable",
    );
    if (postAuthorizationMandate.status !== "active") {
      // A concurrent revocation won after the precondition read. Compensate the
      // authorization pointer by CAS so `authorized` never remains backed by a
      // revoked/superseded mandate.
      await svc.entities.DealActivation.updateMany({
        id: activation.id,
        status: "authorized",
        active_mandate_id: mandate_id,
      }, {
        $set: {
          status: "activated",
          active_mandate_id: "",
          authorization_mandate_id: "",
          last_updated: new Date().toISOString(),
        },
      });
      const compensatedActivation = await singleRow(
        svc.entities.DealActivation,
        { id: activation.id },
        "activation_compensation_readback_unavailable",
      );
      if (
        compensatedActivation.status === "authorized" &&
        compensatedActivation.active_mandate_id === mandate_id
      ) throw new Error("activation_authorization_compensation_failed");
      return Response.json({ error: "mandate_changed_during_authorization" }, {
        status: 409,
      });
    }
    const authorizationCount = recoverCasUpdatedCount(authorization);
    if (authorizationCount === null || authorizationCount > 1) {
      return Response.json({
        error: "activation_authorization_authority_ambiguous",
      }, { status: 503 });
    }
    if (authorizationCount === 0) {
      return Response.json({
        ok: true,
        already_accepted: true,
        mandate_id,
        activation_authorized: true,
      });
    }

    await svc.entities.AuthorizationLog.create({
      brand_id: activation.brand_id || "",
      provider_id: activation.provider_id || "",
      deal_activation_id: activation.id,
      action_type: "mandate_accepted",
      description: `Recover mandate accepted at ${fee.pct}% success fee${
        authorized ? " · activation authorized" : ""
      }`,
      approved_by: email,
      approved_at: signedAt,
      source: "acceptRecoverMandate",
      document_version: mandate.document_version || "",
    }).catch((error: any) =>
      safeBestEffort(error, {
        operation: "acceptRecoverMandate",
        fallback: null,
        severity: "critical",
      })
    );

    await svc.entities.OperationalLog.create({
      deal_activation_id: activation.id,
      brand_id: activation.brand_id || "",
      provider_id: activation.provider_id || "",
      event_type: "mandate_signed",
      message: `Recover mandate ${mandate_id} signed`,
      data_json: {
        fee_pct: Number(fee.pct),
        fee_source: fee.source,
        baseline_id: baseline.id,
        snapshot_hash: freshHash,
        authorized,
        superseded,
      },
      actor_email: email,
      created_at: signedAt,
    }).catch((error: any) =>
      safeBestEffort(error, {
        operation: "acceptRecoverMandate",
        fallback: null,
        severity: "critical",
      })
    );

    // RECOVER-3 — queue the contractual PDF WITHOUT blocking this response: the
    // merchant continues straight to the payment-method setup. The document is a
    // later representation of an acceptance that is already valid, so nothing
    // here may fail the acceptance.
    await logContractEvent(
      svc,
      "recover_contract_pdf_queued",
      { ...mandate, id: mandate_id },
      { language },
      email,
    );
    fireAndForget(base44, "generateRecoverContractPdf", { mandate_id });
    // P9 — once Recover is authorized CAMBRA takes operational ownership. This
    // is intentionally non-blocking: the legal acceptance remains valid even if
    // orchestration infrastructure is temporarily unavailable; the client/admin
    // migration surfaces can idempotently start it again.
    if (authorized && activation.vertical === "payments") {
      // P14 — refresh private-program eligibility before/alongside operational takeover.
      // This is advisory and non-blocking; it cannot activate pricing or execute a contract.
      fireAndForget(base44, "aggregateEligibilityWorker", {});
      fireAndForget(base44, "startPaymentsMigration", {
        deal_activation_id: activation.id,
      });
    }

    return Response.json({
      ok: true,
      mandate_id,
      status: "active",
      fee_pct: Number(fee.pct),
      activation_authorized: authorized,
      superseded_mandate_ids: superseded,
    });
  } catch (error) {
    console.error("acceptRecoverMandate failed", error);
    return Response.json({ error: "recover_acceptance_failed" }, {
      status: 500,
    });
  }
}
