import { safeBestEffort } from "../../shared/bestEffort.ts";
// P9 — Recover Fulfilment & Migration Operations.
// Idempotently turns an authorized payments Recover into an operational migration.
// The merchant has already mandated CAMBRA to act: standard tasks are owned by
// CAMBRA/provider, not pushed back to the merchant.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { requireUserOrInternal } from "../../shared/internalGate.ts";
import { sha256 } from "../../shared/intelligenceCore.ts";
import {
  assertEmergencyEpochUnchanged,
  captureEmergencyEpoch,
} from "../../shared/operationalControl.ts";
import { assertMarketCapabilityAllowed } from "../../shared/marketPolicyRuntime.ts";
import {
  enforceLegalExecution,
  legalBlockResponse,
} from "../../shared/legalExecutionRuntime.ts";
import { requireCriticalOperation } from "../../shared/criticalExecution.ts";
import {
  effectAuthorityErrorResponse,
  requireEffectAuthorities,
} from "../../shared/effectAuthority.ts";

const PLAN_VERSION = "payments-recover-p9-v1";
const PLAN = [
  // key, title, description, owner, customer stage, SLA days
  [
    "takeover",
    "CAMBRA takes over",
    "We open the migration case, lock scope and assign operational ownership.",
    "admin",
    "preparing",
    1,
  ],
  [
    "provider_coordination",
    "Provider coordination",
    "CAMBRA coordinates commercial onboarding and required provider documentation.",
    "admin",
    "provider_coordination",
    2,
  ],
  [
    "provider_ready",
    "Provider ready",
    "The target PSP account, pricing and payment capabilities are confirmed.",
    "provider",
    "provider_coordination",
    5,
  ],
  [
    "technical_configuration",
    "Payment configuration",
    "CAMBRA prepares the payment configuration and integration changes required for cutover.",
    "admin",
    "provider_coordination",
    3,
  ],
  [
    "migration_testing",
    "Migration testing",
    "CAMBRA validates payment, 3DS, refund, webhook and reconciliation flows before live traffic moves.",
    "admin",
    "scheduled",
    2,
  ],
  [
    "cutover_ready",
    "Cutover ready",
    "CAMBRA confirms rollback, timing and all go-live prerequisites.",
    "admin",
    "scheduled",
    1,
  ],
  [
    "go_live",
    "Going live",
    "CAMBRA moves the approved payment scope to the new provider or conditions.",
    "admin",
    "going_live",
    1,
  ],
  [
    "verify_savings",
    "Verify savings",
    "CAMBRA observes live payment data against the locked baseline before savings become billable.",
    "admin",
    "verifying",
    35,
  ],
];
function updatedExactlyOne(result: any) {
  return Boolean(
    result &&
      (result.updated === 1 || result.modified_count === 1 ||
        result.matched_count === 1),
  );
}
function dueIn(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
async function readCompleteMigrationTaskInventory(
  svc: any,
  activationId: string,
  operation: string,
) {
  const rows = await requireCriticalOperation(
    operation,
    () =>
      svc.entities.MigrationTask.filter(
        { deal_activation_id: activationId },
        "order",
        101,
      ),
  );
  if (!Array.isArray(rows) || rows.length >= 101) {
    throw Object.assign(
      new Error("payments_migration_task_inventory_incomplete"),
      { code: "PAYMENTS_MIGRATION_TASK_INVENTORY_INCOMPLETE", status: 409 },
    );
  }
  return rows;
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    // Accept the authenticated merchant/admin path AND the canonical internal
    // secret used by acceptRecoverMandate's fire-and-forget handoff. Without
    // this, the automatic takeover could silently fail when no user session is
    // propagated through the service-role function invocation.
    const gate = await requireUserOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;
    const me = gate.user;
    const activationId = String(body?.deal_activation_id || "");
    if (!activationId) {
      return Response.json({ error: "deal_activation_id required" }, {
        status: 400,
      });
    }

    const svc = base44.asServiceRole;
    let migrationEpoch: any;
    try {
      migrationEpoch = await captureEmergencyEpoch(svc, "migrations");
    } catch (error: any) {
      // public-errors:allow-diagnostic — bounded emergency_control_* namespace.
      return Response.json({
        error: error?.message || "emergency_control_paused:migrations",
      }, { status: Number(error?.status || 409) });
    }
    const rows = await svc.entities.DealActivation.filter(
      { id: activationId },
      "-created_date",
      1,
    ).catch((error: any) =>
      safeBestEffort(error, {
        operation: "startPaymentsMigration",
        fallback: [],
        severity: "critical",
      })
    );
    const activation: any = rows?.[0];
    if (!activation) {
      return Response.json({ error: "activation_not_found" }, { status: 404 });
    }
    const isOwner = !!me &&
      String(activation.user_email || "").toLowerCase() ===
        String(me.email || "").toLowerCase();
    if (!gate.isInternal && !isOwner && me?.role !== "admin") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    if (activation.vertical !== "payments") {
      return Response.json({ error: "payments_only" }, { status: 409 });
    }
    let marketBrand: any;
    try {
      marketBrand = await requireCriticalOperation(
        "payments_migration_brand_authority_read",
        () => svc.entities.Brand.get(String(activation.brand_id || "")),
      );
    } catch {
      return Response.json({
        error: "payments_migration_brand_authority_unavailable",
        material_effects_fail_closed: true,
      }, { status: 503 });
    }
    if (!marketBrand) {
      return Response.json({
        error: "payments_migration_brand_authority_missing",
        material_effects_fail_closed: true,
      }, { status: 409 });
    }
    if (marketBrand?.market_context_rollout === "production") {
      try {
        await assertMarketCapabilityAllowed(svc, {
          brand: marketBrand,
          brand_id: marketBrand.id,
          capability: "MIGRATE",
          actor_type: "recover_migration",
        });
      } catch (e: any) {
        return Response.json({
          error: "market_capability_denied:MIGRATE",
          decision: e?.decision || null,
        }, { status: 409 });
      }
    }
    if (
      !["authorized", "migrating", "live", "monetizing"].includes(
        activation.status,
      )
    ) {
      return Response.json({
        error: "activation_not_ready",
        status: activation.status,
      }, { status: 409 });
    }

    const mandates = await svc.entities.Mandate.filter(
      { deal_activation_id: activationId, status: "active" },
      "-created_date",
      1,
    ).catch((error: any) =>
      safeBestEffort(error, {
        operation: "startPaymentsMigration",
        fallback: [],
        severity: "critical",
      })
    );
    if (!mandates.length) {
      return Response.json({ error: "active_mandate_required" }, {
        status: 409,
      });
    }
    try {
      await enforceLegalExecution(svc, {
        requested_action: "COORDINATE_MIGRATION",
        merchant_id: activation.brand_id,
        jurisdiction: marketBrand?.billing_country || marketBrand?.country,
        provider_id: activation.provider_id || null,
        case_id: activation.id,
        deal_activation_id: activation.id,
        actor: {
          id: gate.isInternal
            ? "recover_migration"
            : String(me?.email || "merchant"),
          type: gate.isInternal
            ? "AUTOMATION"
            : (me?.role === "admin" ? "HUMAN_ADMIN" : "HUMAN_MERCHANT"),
          tool: "startPaymentsMigration",
          allowed_actions: ["COORDINATE_MIGRATION"],
        },
      });
    } catch (error) {
      const response = legalBlockResponse(error);
      if (response) return response;
      throw error;
    }

    const migrationActorId = gate.isInternal
      ? "internal:recover_migration"
      : String(me?.email || "");
    const migrationActorType = gate.isInternal
      ? "AUTOMATION"
      : (me?.role === "admin" ? "HUMAN_ADMIN" : "HUMAN_MERCHANT");
    const migrationJurisdiction = String(
      marketBrand?.billing_country || marketBrand?.country || "",
    ).trim().toUpperCase();
    const revalidateMigrationEffectAuthority = async (
      effectClasses: Array<"SCHEDULE_MATERIAL" | "MIGRATE_GO_LIVE">,
      phase: string,
    ): Promise<Response | null> => {
      try {
        await requireEffectAuthorities(svc, {
          effect_classes: effectClasses,
          actor: { id: migrationActorId, type: migrationActorType },
          tenant: { key: activation.brand_id, scope: "tenant" },
          subject: { type: "DealActivation", id: activation.id },
          context: {
            jurisdiction: migrationJurisdiction,
            market_scope_requirement: "REQUIRED",
            emergency_epoch_claim: migrationEpoch,
            emergency_capabilities: ["migrations"],
            expected_policy_key: "market:MIGRATE",
            phase,
          },
          revalidate: async (authoritySvc: any, exact: any) => {
            const freshGate = await requireUserOrInternal(req, base44, body);
            const freshActorId = freshGate.isInternal
              ? "internal:recover_migration"
              : String(freshGate.user?.email || "");
            if (!freshGate.ok || freshActorId !== exact.actor_id) {
              return {
                status: "DENIED",
                authority_available: true,
                effect_classes: exact.effect_classes,
                actor_id: freshActorId,
                tenant_key: exact.tenant_key,
                subject_type: exact.subject_type,
                subject_id: exact.subject_id,
                policy_key: "market:MIGRATE",
                policy_version: "denied",
                policy_state: "DENIED",
                authority_ref: "auth:migration",
                observed_at: new Date().toISOString(),
              };
            }
            const freshActivations = await authoritySvc.entities.DealActivation
              .filter(
                { id: exact.subject_id },
                "-created_date",
                2,
              );
            if (
              !Array.isArray(freshActivations) || freshActivations.length !== 1
            ) {
              throw new Error("migration_activation_authority_unavailable");
            }
            const freshActivation = freshActivations[0];
            const freshOwner =
              String(freshActivation.user_email || "").toLowerCase() ===
                String(freshGate.user?.email || "").toLowerCase();
            if (
              String(freshActivation.brand_id || "") !== exact.tenant_key ||
              (!freshGate.isInternal && freshGate.user?.role !== "admin" &&
                !freshOwner)
            ) throw new Error("migration_tenant_or_actor_binding_changed");
            const freshBrands = await authoritySvc.entities.Brand.filter(
              { id: exact.tenant_key },
              "-created_date",
              2,
            );
            if (!Array.isArray(freshBrands) || freshBrands.length !== 1) {
              throw new Error("migration_brand_authority_unavailable");
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
                capability: "MIGRATE",
                enforce: true,
                actor_type: "recover_migration_effect",
              },
            );
            const legalDecision: any = await enforceLegalExecution(
              authoritySvc,
              {
                requested_action: "COORDINATE_MIGRATION",
                merchant_id: freshActivation.brand_id,
                jurisdiction,
                provider_id: freshActivation.provider_id || null,
                case_id: freshActivation.id,
                deal_activation_id: freshActivation.id,
                actor: {
                  id: exact.actor_id,
                  type: exact.actor_type,
                  tool: "startPaymentsMigration",
                  allowed_actions: ["COORDINATE_MIGRATION"],
                },
              },
            );
            return {
              status: "AUTHORIZED",
              authority_available: true,
              effect_classes: exact.effect_classes,
              actor_id: exact.actor_id,
              tenant_key: exact.tenant_key,
              subject_type: exact.subject_type,
              subject_id: exact.subject_id,
              policy_key: "market:MIGRATE",
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
        return null;
      } catch (error) {
        const response = effectAuthorityErrorResponse(error);
        if (response) return response;
        throw error;
      }
    };

    // Claim authorized → migrating before creating operational work. This is a
    // compare-and-set so a concurrent revocation/pause cannot be overwritten by
    // a stale start request. Concurrent starts converge on the already-migrating state.
    if (activation.status === "authorized") {
      const authorityDenied = await revalidateMigrationEffectAuthority(
        ["MIGRATE_GO_LIVE"],
        "start_payments_migration_activation_commit",
      );
      if (authorityDenied) return authorityDenied;
      await assertEmergencyEpochUnchanged(
        svc,
        migrationEpoch,
        "before_payments_migration_activation",
      );
      const claimed = await svc.entities.DealActivation.updateMany(
        { id: activationId, status: "authorized" },
        {
          $set: { status: "migrating", last_updated: new Date().toISOString() },
        },
      );
      if (!updatedExactlyOne(claimed)) {
        const fresh = (await svc.entities.DealActivation.filter(
          { id: activationId },
          "-created_date",
          1,
        ).catch((error: any) =>
          safeBestEffort(error, {
            operation: "startPaymentsMigration",
            fallback: [],
            severity: "critical",
          })
        ))?.[0];
        if (fresh?.status !== "migrating") {
          return Response.json({
            error: "activation_changed_concurrently",
            status: fresh?.status || "unknown",
          }, { status: 409 });
        }
      }
      try {
        await assertEmergencyEpochUnchanged(
          svc,
          migrationEpoch,
          "after_payments_migration_activation",
        );
      } catch (error: any) {
        const contained = await svc.entities.DealActivation.updateMany({
          id: activationId,
          status: "migrating",
        }, {
          $set: { status: "paused", last_updated: new Date().toISOString() },
        }).catch((containmentError: any) =>
          safeBestEffort(containmentError, {
            operation:
              "startPaymentsMigration.activation_epoch_race_containment",
            fallback: null,
            severity: "critical",
          })
        );
        return Response.json({
          error: "emergency_control_changed_during_migration_activation",
          review_required: true,
          ambiguity_state: "REVIEW_REQUIRED",
          automatic_retry_blocked: true,
          locally_contained: updatedExactlyOne(contained),
        }, { status: 409 });
      }
    }

    let tasks: any[];
    try {
      tasks = await readCompleteMigrationTaskInventory(
        svc,
        activationId,
        "payments_migration_plan_inventory_read",
      );
    } catch (error: any) {
      return Response.json({
        error: error?.code === "PAYMENTS_MIGRATION_TASK_INVENTORY_INCOMPLETE"
          ? "payments_migration_task_inventory_incomplete"
          : "payments_migration_task_inventory_unavailable",
        material_effects_fail_closed: true,
      }, { status: Number(error?.status || 503) });
    }
    let p9Tasks = tasks.filter((t) =>
      t?.metadata_json?.plan_version === PLAN_VERSION
    );
    if (!p9Tasks.length) {
      const authorityDenied = await revalidateMigrationEffectAuthority(
        ["SCHEDULE_MATERIAL"],
        "start_payments_migration_plan_commit",
      );
      if (authorityDenied) return authorityDenied;
      await assertEmergencyEpochUnchanged(
        svc,
        migrationEpoch,
        "before_payments_migration_plan_materialization",
      );
      // Preserve legacy task history but remove it from active operations. P9 is
      // the canonical plan from this point forward; we never silently delete evidence.
      for (
        const legacy of tasks.filter((t) =>
          !["done", "canceled"].includes(t.status)
        )
      ) {
        await svc.entities.MigrationTask.update(legacy.id, {
          status: "canceled",
          updated_at: new Date().toISOString(),
          metadata_json: {
            ...(legacy.metadata_json || {}),
            superseded_by_plan: PLAN_VERSION,
          },
        }).catch((error: any) =>
          safeBestEffort(error, {
            operation: "startPaymentsMigration",
            fallback: null,
            severity: "critical",
          })
        );
      }
      const approvedNegotiation = (await svc.entities.NegotiationCase.filter(
        { recover_id: activationId, status: "approved" },
        "-closed_at",
        1,
      ).catch((error: any) =>
        safeBestEffort(error, {
          operation: "startPaymentsMigration",
          fallback: [],
          severity: "critical",
        })
      ))[0] || null;
      const aggregateEligibility =
        (await svc.entities.MerchantRateEligibility.filter(
          {
            brand_id: activation.brand_id,
            status: { $in: ["eligible", "potentially_eligible"] },
          },
          "-evaluated_at",
          20,
        ).catch((error: any) =>
          safeBestEffort(error, {
            operation: "startPaymentsMigration",
            fallback: [],
            severity: "critical",
          })
        )).map((e: any) => ({
          id: e.id,
          agreement_id: e.agreement_id,
          rate_card_id: e.rate_card_id,
          provider_id: e.provider_id,
          status: e.status,
          provider_underwriting_status: e.provider_underwriting_status,
          confidence: e.confidence,
        }));
      const migrationSnapshotPayload = {
        activation_id: activationId,
        brand_id: activation.brand_id || "",
        provider_id: activation.provider_id || "",
        mandate_id: mandates[0]?.id || null,
        mandate_snapshot_hash: mandates[0]?.acceptance_snapshot_hash || null,
        approved_negotiation_case_id: approvedNegotiation?.id || null,
        approved_offer_id: approvedNegotiation?.approved_offer_id || null,
        aggregate_eligibility: aggregateEligibility,
        plan_version: PLAN_VERSION,
      };
      const migrationSnapshotHash = await sha256(migrationSnapshotPayload);
      const snapshotAuthorityDenied = await revalidateMigrationEffectAuthority(
        ["SCHEDULE_MATERIAL"],
        "start_payments_migration_snapshot_commit",
      );
      if (snapshotAuthorityDenied) return snapshotAuthorityDenied;
      const migrationSnapshot = await svc.entities.IntelligenceSnapshot.create({
        snapshot_key: `migration:${activationId}:${
          migrationSnapshotHash.slice(0, 16)
        }`,
        snapshot_type: "payments_migration_start",
        related_entity_type: "DealActivation",
        related_entity_id: activationId,
        brand_id: activation.brand_id || "",
        vertical: "payments",
        claim_ids: [],
        pricing_version_ids: [],
        benchmark_refs_json: {},
        policy_version: mandates[0]?.policy_version || undefined,
        calculation_version: PLAN_VERSION,
        snapshot_json: migrationSnapshotPayload,
        snapshot_hash: migrationSnapshotHash,
        captured_at: new Date().toISOString(),
      }).catch((error: any) =>
        safeBestEffort(error, {
          operation: "startPaymentsMigration",
          fallback: null,
          severity: "critical",
        })
      );
      const planAuthorityDenied = await revalidateMigrationEffectAuthority(
        ["SCHEDULE_MATERIAL"],
        "start_payments_migration_bulk_commit",
      );
      if (planAuthorityDenied) return planAuthorityDenied;
      await svc.entities.MigrationTask.bulkCreate(
        PLAN.map((p: any[], idx: number) => ({
          deal_activation_id: activationId,
          intelligence_snapshot_id: migrationSnapshot?.id || undefined,
          brand_id: activation.brand_id || "",
          provider_id: activation.provider_id || "",
          task_type: p[0],
          step_name: p[0],
          description: p[2],
          status: idx === 0 ? "done" : (idx === 1 ? "in_progress" : "pending"),
          order: idx + 1,
          owner_type: p[3],
          requires_provider_input: p[3] === "provider",
          requires_brand_input: false,
          requires_admin_review: p[3] === "admin",
          completed_at: idx === 0 ? new Date().toISOString() : undefined,
          updated_at: new Date().toISOString(),
          due_date: idx === 1 ? dueIn(Number(p[5] || 3)) : undefined,
          metadata_json: {
            plan_version: PLAN_VERSION,
            customer_stage: p[4],
            customer_visible: true,
            sla_days: Number(p[5] || 3),
            retry_count: 0,
          },
        })),
      );
      try {
        await assertEmergencyEpochUnchanged(
          svc,
          migrationEpoch,
          "after_payments_migration_plan_materialization",
        );
      } catch (error: any) {
        let created: any[] = [];
        let containmentInventoryComplete = true;
        try {
          created = await readCompleteMigrationTaskInventory(
            svc,
            activationId,
            "payments_migration_epoch_race_inventory_read",
          );
        } catch {
          containmentInventoryComplete = false;
        }
        for (
          const row of created.filter((candidate: any) =>
            candidate?.metadata_json?.plan_version === PLAN_VERSION &&
            !["done", "canceled"].includes(candidate.status)
          )
        ) {
          await svc.entities.MigrationTask.updateMany({
            id: row.id,
            status: row.status,
          }, {
            $set: {
              status: "blocked",
              blocked_reason:
                "emergency_epoch_changed_during_plan_materialization",
              updated_at: new Date().toISOString(),
            },
          }).catch((containmentError: any) =>
            safeBestEffort(containmentError, {
              operation: "startPaymentsMigration.epoch_race_task_containment",
              fallback: null,
              severity: "critical",
            })
          );
        }
        await svc.entities.DealActivation.updateMany({
          id: activationId,
          status: "migrating",
        }, {
          $set: { status: "paused", last_updated: new Date().toISOString() },
        }).catch((containmentError: any) =>
          safeBestEffort(containmentError, {
            operation:
              "startPaymentsMigration.epoch_race_activation_containment",
            fallback: null,
            severity: "critical",
          })
        );
        return Response.json({
          error: "emergency_control_changed_during_migration_plan",
          review_required: true,
          ambiguity_state: "REVIEW_REQUIRED",
          automatic_retry_blocked: true,
          task_containment_inventory_complete: containmentInventoryComplete,
        }, { status: 409 });
      }
      try {
        tasks = await readCompleteMigrationTaskInventory(
          svc,
          activationId,
          "payments_migration_post_create_inventory_read",
        );
      } catch (error: any) {
        await svc.entities.DealActivation.updateMany({
          id: activationId,
          status: "migrating",
        }, {
          $set: { status: "paused", last_updated: new Date().toISOString() },
        }).catch((containmentError: any) =>
          safeBestEffort(containmentError, {
            operation:
              "startPaymentsMigration.post_create_inventory_containment",
            fallback: null,
            severity: "critical",
          })
        );
        return Response.json({
          error: error?.code === "PAYMENTS_MIGRATION_TASK_INVENTORY_INCOMPLETE"
            ? "payments_migration_task_inventory_incomplete"
            : "payments_migration_task_inventory_unavailable",
          review_required: true,
          ambiguity_state: "REVIEW_REQUIRED",
          automatic_retry_blocked: true,
          material_effects_fail_closed: true,
        }, { status: Number(error?.status || 503) });
      }
      p9Tasks = tasks.filter((t) =>
        t?.metadata_json?.plan_version === PLAN_VERSION
      );
      // Base44 has no transaction/unique constraint here. Collapse a concurrent
      // double-start deterministically: earliest task per step wins, later rows
      // are retained as canceled audit evidence rather than silently deleted.
      for (const step of PLAN.map((p: any[]) => p[0])) {
        const same = p9Tasks.filter((t) => t.step_name === step).sort((a, b) =>
          String(a.created_date || a.id).localeCompare(
            String(b.created_date || b.id),
          )
        );
        for (const duplicate of same.slice(1)) {
          if (duplicate.status !== "canceled") {
            await svc.entities.MigrationTask.update(duplicate.id, {
              status: "canceled",
              updated_at: new Date().toISOString(),
              metadata_json: {
                ...(duplicate.metadata_json || {}),
                duplicate_of: same[0]?.id || null,
                duplicate_collapsed: true,
              },
            }).catch((error: any) =>
              safeBestEffort(error, {
                operation: "startPaymentsMigration",
                fallback: null,
                severity: "critical",
              })
            );
          }
        }
      }
      try {
        tasks = await readCompleteMigrationTaskInventory(
          svc,
          activationId,
          "payments_migration_deduplicated_inventory_read",
        );
      } catch (error: any) {
        await svc.entities.DealActivation.updateMany({
          id: activationId,
          status: "migrating",
        }, {
          $set: { status: "paused", last_updated: new Date().toISOString() },
        }).catch((containmentError: any) =>
          safeBestEffort(containmentError, {
            operation:
              "startPaymentsMigration.deduplicated_inventory_containment",
            fallback: null,
            severity: "critical",
          })
        );
        return Response.json({
          error: error?.code === "PAYMENTS_MIGRATION_TASK_INVENTORY_INCOMPLETE"
            ? "payments_migration_task_inventory_incomplete"
            : "payments_migration_task_inventory_unavailable",
          review_required: true,
          ambiguity_state: "REVIEW_REQUIRED",
          automatic_retry_blocked: true,
          material_effects_fail_closed: true,
        }, { status: Number(error?.status || 503) });
      }
      p9Tasks = tasks.filter((t) =>
        t?.metadata_json?.plan_version === PLAN_VERSION &&
        t.status !== "canceled"
      );
      await svc.entities.OperationalLog.create({
        deal_activation_id: activationId,
        brand_id: activation.brand_id || "",
        provider_id: activation.provider_id || "",
        event_type: "tasks_generated",
        message: "P9 payments migration orchestration started",
        data_json: { plan_version: PLAN_VERSION, task_count: PLAN.length },
        actor_email: me?.email || (gate.isInternal ? "internal" : "system"),
        created_at: new Date().toISOString(),
      }).catch((error: any) =>
        safeBestEffort(error, {
          operation: "startPaymentsMigration",
          fallback: null,
          severity: "critical",
        })
      );
    }

    if (activation.status === "authorized") {
      await svc.entities.OperationalLog.create({
        deal_activation_id: activationId,
        brand_id: activation.brand_id || "",
        provider_id: activation.provider_id || "",
        event_type: "status_changed",
        message: "Recover fulfilment started: authorized → migrating",
        data_json: {
          from: "authorized",
          to: "migrating",
          plan_version: PLAN_VERSION,
        },
        actor_email: me?.email || (gate.isInternal ? "internal" : "system"),
        created_at: new Date().toISOString(),
      }).catch((error: any) =>
        safeBestEffort(error, {
          operation: "startPaymentsMigration",
          fallback: null,
          severity: "critical",
        })
      );
    }

    try {
      await assertEmergencyEpochUnchanged(
        svc,
        migrationEpoch,
        "after_payments_migration_start",
      );
    } catch (error: any) {
      const contained = await svc.entities.DealActivation.updateMany({
        id: activationId,
        status: "migrating",
      }, { $set: { status: "paused", last_updated: new Date().toISOString() } })
        .catch((containmentError: any) =>
          safeBestEffort(containmentError, {
            operation: "startPaymentsMigration.final_epoch_race_containment",
            fallback: null,
            severity: "critical",
          })
        );
      return Response.json({
        error: "emergency_control_changed_during_migration_start",
        review_required: true,
        ambiguity_state: "REVIEW_REQUIRED",
        automatic_retry_blocked: true,
        locally_contained: updatedExactlyOne(contained),
      }, { status: 409 });
    }
    return Response.json({
      ok: true,
      activation_id: activationId,
      status: activation.status === "authorized"
        ? "migrating"
        : activation.status,
      task_count: p9Tasks.length,
      plan_version: PLAN_VERSION,
    });
  } catch (error) {
    console.error("startPaymentsMigration failed", error);
    return Response.json({ error: "migration_start_failed" }, { status: 500 });
  }
}
