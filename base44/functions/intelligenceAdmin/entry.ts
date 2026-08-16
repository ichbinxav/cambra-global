import { safeBestEffort } from "../../shared/bestEffort.ts";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import {
  sameIntelligenceTenantBinding,
  validateIntelligenceTenantScope,
  validateStoredIntelligenceRecord,
} from "../../shared/intelligenceTenantScope.ts";
import {
  assessClaimPromotionLineage,
  CLAIM_PROMOTION_POLICY_VERSION,
} from "../../shared/intelligenceLearningLineage.ts";
import {
  effectAuthorityErrorResponse,
  requireEffectAuthority,
} from "../../shared/effectAuthority.ts";

const fail = (error: string, status = 409) =>
  Response.json({ ok: false, error }, { status });

function requestedBinding(body: any) {
  return {
    tenant_scope: body?.tenant_scope,
    brand_id: body?.brand_id,
    domain: body?.domain,
    purpose: body?.purpose,
  };
}

function evidenceAdminBindingMatches(body: any, evidence: any) {
  const requested = validateIntelligenceTenantScope(
    requestedBinding(body),
    "claim",
  );
  const stored = validateStoredIntelligenceRecord(evidence, "evidence");
  return requested.ok && stored.ok && requested.scope_key === stored.scope_key;
}

async function loadExactRows(service: any, entityName: string, ids: any) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return {
      ok: false as const,
      error: `exact_${entityName}_refs_required`,
      rows: [],
    };
  }
  const normalized = ids.map((id: any) => String(id || "").trim());
  if (
    normalized.some((id: string) => !id || /[\s*?]/.test(id)) ||
    new Set(normalized).size !== normalized.length
  ) {
    return {
      ok: false as const,
      error: `invalid_${entityName}_refs`,
      rows: [],
    };
  }
  const rows: any[] = [];
  for (const id of normalized) {
    const row = await service.entities[entityName].get(id).catch((error: any) =>
      safeBestEffort(error, {
        operation: `intelligenceAdmin.${entityName}Lineage`,
        fallback: null,
        severity: "critical",
      })
    );
    if (!row) {
      return {
        ok: false as const,
        error: `${entityName}_lineage_unavailable`,
        rows: [],
      };
    }
    rows.push(row);
  }
  return { ok: true as const, rows };
}

Deno.serve(async (req) => {
  try {
    const b = createClientFromRequest(req);
    const u = await b.auth.me().catch((error: any) =>
      safeBestEffort(error, {
        operation: "intelligenceAdmin",
        fallback: null,
        severity: "secondary",
      })
    );
    if (!u) {
      return Response.json({ ok: false, error: "Unauthorized" }, {
        status: 401,
      });
    }
    if (u.role !== "admin") {
      return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const s = b.asServiceRole;
    const a = String(body.action || "");
    const reason = String(body.reason || "").trim();
    if (!reason) {
      return Response.json({ ok: false, error: "reason_required" }, {
        status: 400,
      });
    }
    let before: any = null;
    let after: any = null;
    let subject = "";

    if (a === "quarantine_evidence") {
      before = await s.entities.IntelligenceEvidence.get(String(body.id || ""))
        .catch((error: any) =>
          safeBestEffort(error, {
            operation: "intelligenceAdmin",
            fallback: null,
            severity: "secondary",
          })
        );
      if (!before) {
        return Response.json({ ok: false, error: "not_found" }, {
          status: 404,
        });
      }
      const stored = validateStoredIntelligenceRecord(before, "evidence");
      if (stored.ok) {
        if (!evidenceAdminBindingMatches(body, before)) {
          return fail("evidence_tenant_binding_mismatch", 403);
        }
      }
      // Invalid legacy evidence can only move into quarantine; no scope is
      // invented and no other mutation is allowed.
      await s.entities.IntelligenceEvidence.update(before.id, {
        quarantined: true,
        quarantine_reason: reason,
      });
      after = { ...before, quarantined: true, quarantine_reason: reason };
      subject = `IntelligenceEvidence:${before.id}`;
    } else if (a === "set_claim_state") {
      before = await s.entities.KnowledgeClaim.get(String(body.id || "")).catch(
        (error: any) =>
          safeBestEffort(error, {
            operation: "intelligenceAdmin",
            fallback: null,
            severity: "secondary",
          }),
      );
      if (!before) {
        return Response.json({ ok: false, error: "not_found" }, {
          status: 404,
        });
      }
      const state = String(body.state || "");
      if (
        ![
          "candidate",
          "observed",
          "corroborated",
          "verified",
          "active",
          "stale",
          "superseded",
          "archived",
          "quarantined",
        ].includes(state)
      ) {
        return Response.json({ ok: false, error: "invalid_state" }, {
          status: 400,
        });
      }
      const stored = validateStoredIntelligenceRecord(before, "claim");
      if (!stored.ok) {
        if (state !== "quarantined") {
          return fail("legacy_claim_scope_ambiguous", 409);
        }
      } else {
        const requested = validateIntelligenceTenantScope(
          requestedBinding(body),
          "claim",
        );
        if (
          !requested.ok ||
          !sameIntelligenceTenantBinding(
            requestedBinding(body),
            before,
            "claim",
          )
        ) {
          return fail("claim_tenant_binding_mismatch", 403);
        }
      }
      if (
        ["verified", "active"].includes(state) &&
        String(before.truth_level || "") === "inferred"
      ) {
        return Response.json({
          ok: false,
          error:
            "inferred_claim_cannot_be_admin_promoted_to_verified_without_new_evidence",
        }, { status: 409 });
      }
      let promotionDecision: any = null;
      if (["verified", "active"].includes(state)) {
        const evidence = await loadExactRows(
          s,
          "IntelligenceEvidence",
          before.evidence_ids,
        );
        if (!evidence.ok) return fail(evidence.error, 409);
        const observations = await loadExactRows(
          s,
          "IntelligenceObservation",
          before.observation_ids,
        );
        if (!observations.ok) return fail(observations.error, 409);
        promotionDecision = assessClaimPromotionLineage({
          claim: before,
          evidence_rows: evidence.rows,
          observation_rows: observations.rows,
          evaluated_at: new Date().toISOString(),
        });
        if (!promotionDecision.ok) {
          return Response.json({
            ok: false,
            error: "claim_promotion_lineage_not_verified",
            reason_codes: promotionDecision.reason_codes,
            manual_promotion_grants_learning_authority: false,
          }, { status: 409 });
        }

        const tenantKey = stored.ok && stored.tenant_scope === "tenant"
          ? String(stored.brand_id || "")
          : "_platform";
        let jurisdiction: string | null = null;
        let marketRequirement: "REQUIRED" | "NOT_APPLICABLE_PLATFORM" =
          "NOT_APPLICABLE_PLATFORM";
        if (stored.ok && stored.tenant_scope === "tenant") {
          const brands = await s.entities.Brand.filter(
            { id: tenantKey },
            "-created_date",
            2,
          );
          if (!Array.isArray(brands) || brands.length !== 1) {
            return fail("claim_promotion_brand_authority_unavailable", 503);
          }
          jurisdiction = String(
            brands[0].billing_country || brands[0].country || "",
          ).trim().toUpperCase();
          marketRequirement = "REQUIRED";
        }
        try {
          await requireEffectAuthority(s, {
            effect_class: "PROMOTE_LEARNING",
            actor: { id: u.email, type: "HUMAN_ADMIN" },
            tenant: {
              key: tenantKey,
              scope: stored.ok && stored.tenant_scope === "tenant"
                ? "tenant"
                : "platform",
            },
            subject: { type: "KnowledgeClaim", id: before.id },
            context: {
              jurisdiction,
              market_scope_requirement: marketRequirement,
              market_scope_not_applicable_reason:
                marketRequirement === "NOT_APPLICABLE_PLATFORM"
                  ? "allowlisted global public-research claim has no merchant launch market"
                  : undefined,
              emergency_not_applicable: true,
              emergency_not_applicable_reason:
                "EmergencyControl has no learning-promotion capability; CONTRACT_ONLY remains enforced",
              expected_policy_key: "learning-eligibility:claim-promotion",
              expected_policy_version: CLAIM_PROMOTION_POLICY_VERSION,
              phase: `knowledge_claim_promotion_commit:${before.id}`,
            },
            revalidate: async (authoritySvc: any, exact: any) => {
              const freshActor = await b.auth.me();
              if (
                !freshActor || freshActor.role !== "admin" ||
                String(freshActor.email || "") !== exact.actor_id
              ) {
                return {
                  status: "DENIED",
                  authority_available: true,
                  effect_classes: exact.effect_classes,
                  actor_id: String(freshActor?.email || ""),
                  tenant_key: exact.tenant_key,
                  subject_type: exact.subject_type,
                  subject_id: exact.subject_id,
                  policy_key: "learning-eligibility:claim-promotion",
                  policy_version: CLAIM_PROMOTION_POLICY_VERSION,
                  policy_state: "DENIED",
                  authority_ref: "auth:admin",
                  observed_at: new Date().toISOString(),
                };
              }
              const claims = await authoritySvc.entities.KnowledgeClaim.filter(
                { id: exact.subject_id },
                "-created_date",
                2,
              );
              if (!Array.isArray(claims) || claims.length !== 1) {
                throw new Error("claim_effect_authority_unavailable");
              }
              const freshClaim = claims[0];
              const freshBinding = validateStoredIntelligenceRecord(
                freshClaim,
                "claim",
              );
              if (
                !freshBinding.ok ||
                (freshBinding.tenant_scope === "tenant"
                    ? String(freshBinding.brand_id || "")
                    : "_platform") !== exact.tenant_key ||
                String(freshClaim.knowledge_state || "") !==
                  String(before.knowledge_state || "")
              ) {
                throw new Error("claim_effect_authority_binding_changed");
              }
              const freshEvidence = await loadExactRows(
                authoritySvc,
                "IntelligenceEvidence",
                freshClaim.evidence_ids,
              );
              const freshObservations = await loadExactRows(
                authoritySvc,
                "IntelligenceObservation",
                freshClaim.observation_ids,
              );
              if (!freshEvidence.ok || !freshObservations.ok) {
                throw new Error("claim_effect_lineage_unavailable");
              }
              const freshPromotion = assessClaimPromotionLineage({
                claim: freshClaim,
                evidence_rows: freshEvidence.rows,
                observation_rows: freshObservations.rows,
                evaluated_at: new Date().toISOString(),
              });
              if (!freshPromotion.ok) {
                return {
                  status: "DENIED",
                  authority_available: true,
                  effect_classes: exact.effect_classes,
                  actor_id: exact.actor_id,
                  tenant_key: exact.tenant_key,
                  subject_type: exact.subject_type,
                  subject_id: exact.subject_id,
                  policy_key: "learning-eligibility:claim-promotion",
                  policy_version: CLAIM_PROMOTION_POLICY_VERSION,
                  policy_state: "DENIED",
                  authority_ref: `KnowledgeClaim:${freshClaim.id}`,
                  observed_at: new Date().toISOString(),
                };
              }
              let marketIso2: string | null = null;
              if (freshBinding.tenant_scope === "tenant") {
                const brands = await authoritySvc.entities.Brand.filter(
                  { id: exact.tenant_key },
                  "-created_date",
                  2,
                );
                if (!Array.isArray(brands) || brands.length !== 1) {
                  throw new Error(
                    "claim_promotion_brand_authority_unavailable",
                  );
                }
                marketIso2 = String(
                  brands[0].billing_country || brands[0].country || "",
                ).trim().toUpperCase();
              }
              return {
                status: "AUTHORIZED",
                authority_available: true,
                effect_classes: exact.effect_classes,
                actor_id: exact.actor_id,
                tenant_key: exact.tenant_key,
                subject_type: exact.subject_type,
                subject_id: exact.subject_id,
                policy_key: "learning-eligibility:claim-promotion",
                policy_version: freshPromotion.policy_version,
                policy_state: "ACTIVE",
                authority_ref:
                  `KnowledgeClaim:${freshClaim.id}:${freshPromotion.policy_version}`,
                observed_at: new Date().toISOString(),
                market_iso2: marketIso2,
                market_scope_version: exact.market_scope_version,
              };
            },
          });
        } catch (error) {
          const response = effectAuthorityErrorResponse(error);
          if (response) return response;
          throw error;
        }
      }
      const stateUpdate = {
        knowledge_state: state,
        claim_use_class: "DESCRIPTIVE",
        training_eligible: false,
        model_eligible: false,
        calibration_eligible: false,
        learning_eligibility_decision_id: null,
        promotion_decision_json: promotionDecision
          ? {
            ...promotionDecision,
            requested_state: state,
            applied_state: state,
            decided_by: u.email,
            decided_at: new Date().toISOString(),
            reason,
            independent_learning_decision_required: true,
          }
          : {
            requested_state: state,
            applied_state: state,
            decided_by: u.email,
            decided_at: new Date().toISOString(),
            reason,
            manual_state_change: true,
            independent_learning_decision_required: true,
          },
      };
      await s.entities.KnowledgeClaim.update(before.id, stateUpdate);
      after = { ...before, ...stateUpdate };
      subject = `KnowledgeClaim:${before.id}`;
    } else if (a === "resolve_conflict") {
      before = await s.entities.KnowledgeConflict.get(String(body.id || ""))
        .catch((error: any) =>
          safeBestEffort(error, {
            operation: "intelligenceAdmin",
            fallback: null,
            severity: "secondary",
          })
        );
      if (!before) {
        return Response.json({ ok: false, error: "not_found" }, {
          status: 404,
        });
      }
      const state = String(body.state || "resolved");
      if (!["resolved", "expected_variation", "data_error"].includes(state)) {
        return Response.json({ ok: false, error: "invalid_state" }, {
          status: 400,
        });
      }
      after = {
        ...before,
        status: state,
        resolution_json: { reason, notes: body.notes || "" },
        resolved_at: new Date().toISOString(),
        resolved_by: u.email,
      };
      await s.entities.KnowledgeConflict.update(before.id, {
        status: after.status,
        resolution_json: after.resolution_json,
        resolved_at: after.resolved_at,
        resolved_by: u.email,
      });
      subject = `KnowledgeConflict:${before.id}`;
    } else if (a === "recalculate_moat") {
      const internal = Deno.env.get("INTERNAL_CALL_SECRET") || "";
      const r = await s.functions.invoke("moatCuratorWorker", {
        internal_secret: internal,
      });
      before = {};
      after = r?.data || r;
      subject = "MoatMetric:recalculation";
    } else {
      return Response.json({ ok: false, error: "unknown_action" }, {
        status: 400,
      });
    }

    await s.entities.OperationalLog.create({
      event_type: "intelligence_override",
      message: a,
      data_json: { subject, reason, before, after },
      actor_email: u.email,
      created_at: new Date().toISOString(),
    }).catch((error: any) =>
      safeBestEffort(error, {
        operation: "intelligenceAdmin",
        fallback: null,
        severity: "secondary",
      })
    );
    return Response.json({ ok: true, action: a, subject });
  } catch (e) {
    console.error(e);
    return Response.json({ ok: false, error: "intelligence_admin_failed" }, {
      status: 500,
    });
  }
});
