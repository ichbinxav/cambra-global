import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import {
  EFFECT_CLASS_LITERAL_LABELS,
  EFFECT_CLASSES,
  EffectAuthorityError,
  requireEffectAuthorities,
  requireEffectAuthority,
} from "../../base44/shared/effectAuthority.ts";
import { MARKET_SCOPE_VERSION } from "../../base44/shared/marketLaunchScope.ts";

const actor = { id: "admin@example.test", type: "HUMAN_ADMIN" };
const tenant = { key: "brand-1", scope: "tenant" };
const subject = { type: "MaterialSubject", id: "subject-1" };

function context(overrides = {}) {
  return {
    jurisdiction: "ES",
    market_scope_requirement: "REQUIRED",
    emergency_not_applicable: true,
    emergency_not_applicable_reason: "pure local authority-gate fixture",
    max_authority_age_ms: 15_000,
    ...overrides,
  };
}

function verdict(effectClasses, overrides = {}) {
  return {
    status: "AUTHORIZED",
    authority_available: true,
    effect_classes: effectClasses,
    actor_id: actor.id,
    tenant_key: tenant.key,
    subject_type: subject.type,
    subject_id: subject.id,
    policy_key: "fixture-policy",
    policy_version: "v1",
    policy_state: "ACTIVE",
    authority_ref: "fixture:authority:1",
    observed_at: new Date().toISOString(),
    market_iso2: "ES",
    market_scope_version: MARKET_SCOPE_VERSION,
    ...overrides,
  };
}

function request(effectClass, overrides = {}) {
  return {
    effect_class: effectClass,
    actor,
    tenant,
    subject,
    context: context(),
    revalidate: vi.fn(async (_svc, exact) => verdict(exact.effect_classes)),
    ...overrides,
  };
}

describe("OTR-012 effect authority facade", () => {
  it("keeps the exact ten safe keys and the founder-facing SIGN/MANDATE and BILL/CHARGE labels", () => {
    expect(EFFECT_CLASSES).toEqual([
      "SEND",
      "NEGOTIATE",
      "SCHEDULE_MATERIAL",
      "EXECUTE",
      "APPROVE",
      "SIGN_MANDATE",
      "SPEND",
      "BILL_CHARGE",
      "MIGRATE_GO_LIVE",
      "PROMOTE_LEARNING",
    ]);
    expect(EFFECT_CLASS_LITERAL_LABELS.SIGN_MANDATE).toBe("SIGN/MANDATE");
    expect(EFFECT_CLASS_LITERAL_LABELS.BILL_CHARGE).toBe("BILL/CHARGE");
  });

  it("denies every effect class before the simulated effect when its existing authority denies", async () => {
    for (const effectClass of EFFECT_CLASSES) {
      let effects = 0;
      const input = request(effectClass, {
        revalidate: vi.fn(async (_svc, exact) =>
          verdict(exact.effect_classes, { status: "DENIED" })
        ),
      });
      await expect(requireEffectAuthority({}, input)).rejects.toMatchObject({
        code: "EFFECT_AUTHORITY_DENIED",
        effects: false,
      });
      expect(effects).toBe(0);
    }
  });

  it("blocks every class in protected FR before calling a domain authority or effect", async () => {
    for (const effectClass of EFFECT_CLASSES) {
      let effects = 0;
      const revalidate = vi.fn(async (_svc, exact) =>
        verdict(exact.effect_classes)
      );
      await expect(requireEffectAuthority(
        {},
        request(effectClass, {
          context: context({ jurisdiction: "FR" }),
          revalidate,
        }),
      )).rejects.toBeInstanceOf(EffectAuthorityError);
      expect(revalidate).not.toHaveBeenCalled();
      expect(effects).toBe(0);
    }
  });

  it("gives unknown actors and actor/tenant/subject mismatches the same public denial", async () => {
    const unknown = requireEffectAuthority(
      {},
      request("EXECUTE", {
        actor: { id: "", type: "UNKNOWN" },
      }),
    ).catch((error) => error);
    const mismatch = requireEffectAuthority(
      {},
      request("EXECUTE", {
        revalidate: vi.fn(async (_svc, exact) =>
          verdict(exact.effect_classes, {
            actor_id: "other@example.test",
            tenant_key: "other-brand",
            subject_id: "other-subject",
          })
        ),
      }),
    ).catch((error) => error);
    const [unknownError, mismatchError] = await Promise.all([
      unknown,
      mismatch,
    ]);
    expect({
      message: unknownError.message,
      code: unknownError.code,
      status: unknownError.status,
    }).toEqual({
      message: "effect_authority_denied",
      code: "EFFECT_AUTHORITY_DENIED",
      status: 409,
    });
    expect({
      message: mismatchError.message,
      code: mismatchError.code,
      status: mismatchError.status,
    }).toEqual({
      message: "effect_authority_denied",
      code: "EFFECT_AUTHORITY_DENIED",
      status: 409,
    });
  });

  it("fails closed on unavailable or stale authority and never treats an exception as an empty allow", async () => {
    await expect(requireEffectAuthority(
      {},
      request("SPEND", {
        revalidate: vi.fn(async () => {
          throw new Error("policy_store_down");
        }),
      }),
    )).rejects.toMatchObject({
      code: "EFFECT_AUTHORITY_UNAVAILABLE",
      status: 503,
      effects: false,
    });
    await expect(requireEffectAuthority(
      {},
      request("APPROVE", {
        revalidate: vi.fn(async (_svc, exact) =>
          verdict(exact.effect_classes, {
            observed_at: new Date(Date.now() - 60_000).toISOString(),
          })
        ),
      }),
    )).rejects.toMatchObject({
      code: "EFFECT_AUTHORITY_DENIED",
      effects: false,
    });
  });

  it("requires an Emergency epoch or an explicit non-applicability reason", async () => {
    await expect(requireEffectAuthority(
      {},
      request("SEND", {
        context: context({
          emergency_not_applicable: false,
          emergency_not_applicable_reason: "",
        }),
      }),
    )).rejects.toMatchObject({
      code: "EFFECT_AUTHORITY_UNAVAILABLE",
      status: 503,
    });
  });

  it("rejects unknown market-scope literals before consulting domain authority", async () => {
    for (const requirement of ["", "PLATFORM_ALLOWED", "OPTIONAL", "UNKNOWN"]) {
      const revalidate = vi.fn(async (_svc, exact) =>
        verdict(exact.effect_classes)
      );
      await expect(requireEffectAuthority(
        {},
        request("EXECUTE", {
          context: context({ market_scope_requirement: requirement }),
          revalidate,
        }),
      )).rejects.toMatchObject({
        code: "EFFECT_AUTHORITY_DENIED",
        blocker: "effect_market_scope_requirement_invalid",
      });
      expect(revalidate).not.toHaveBeenCalled();
    }
  });

  it("never lets a communications epoch authorize negotiations or unknown capabilities", async () => {
    const communicationsClaim = {
      control_id: "emergency-1",
      control_revision: 7,
      capabilities: ["communications"],
      captured_at: new Date().toISOString(),
      state: {},
    };
    const revalidate = vi.fn(async (_svc, exact) =>
      verdict(exact.effect_classes)
    );
    await expect(requireEffectAuthority(
      {},
      request("NEGOTIATE", {
        context: context({
          emergency_not_applicable: false,
          emergency_not_applicable_reason: "",
          emergency_epoch_claim: communicationsClaim,
          emergency_capabilities: ["negotiations"],
        }),
        revalidate,
      }),
    )).rejects.toMatchObject({
      code: "EFFECT_AUTHORITY_UNAVAILABLE",
      blocker: "effect_emergency_capability_binding_mismatch",
    });
    expect(revalidate).not.toHaveBeenCalled();

    await expect(requireEffectAuthority(
      {},
      request("SEND", {
        context: context({
          emergency_not_applicable: false,
          emergency_not_applicable_reason: "",
          emergency_epoch_claim: communicationsClaim,
          emergency_capabilities: ["root_override"],
        }),
        revalidate,
      }),
    )).rejects.toMatchObject({
      code: "EFFECT_AUTHORITY_UNAVAILABLE",
      blocker: "effect_emergency_capabilities_invalid",
    });
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("authorizes a batch only when the exact classes, actor, tenant, subject, market and policy match", async () => {
    const effectClasses = [...EFFECT_CLASSES];
    const result = await requireEffectAuthorities({}, {
      effect_classes: effectClasses,
      actor,
      tenant,
      subject,
      context: context({
        expected_policy_key: "fixture-policy",
        expected_policy_version: "v1",
      }),
      revalidate: vi.fn(async (_svc, exact) => verdict(exact.effect_classes)),
    });
    expect(result.authorized).toBe(true);
    expect(result.effect_classes).toEqual([...effectClasses].sort());
    expect(result).toMatchObject({
      tenant_key: "brand-1",
      subject_id: "subject-1",
      jurisdiction: "ES",
      policy_key: "fixture-policy",
      policy_version: "v1",
    });
  });

  it("places the facade before each wired commit or provider-effect primitive", () => {
    const read = (path) => fs.readFileSync(path, "utf8");
    const commercial = read(
      "base44/functions/commercialSendMessage/entry.ts",
    );
    expect(commercial.lastIndexOf("requireEffectAuthorities")).toBeLessThan(
      commercial.indexOf("markCommercialSendTransportStarted", 40_000),
    );
    expect(commercial).toContain("commercial_provider_transport_boundary");
    expect(commercial.lastIndexOf("revalidateCommercialEffectAuthority"))
      .toBeLessThan(
        commercial.indexOf("markCommercialSendTransportStarted", 40_000),
      );
    const mandate = read("base44/functions/acceptRecoverMandate/entry.ts");
    expect(mandate.indexOf("requireEffectAuthorities")).toBeLessThan(
      mandate.indexOf("claimRecoverAcceptanceAuthority(svc"),
    );
    const migration = read("base44/functions/startPaymentsMigration/entry.ts");
    expect(migration.indexOf("revalidateMigrationEffectAuthority"))
      .toBeLessThan(
        migration.indexOf("entities.DealActivation.updateMany"),
      );
    expect(migration.lastIndexOf("revalidateMigrationEffectAuthority"))
      .toBeLessThan(
        migration.indexOf("entities.MigrationTask.bulkCreate"),
      );
    expect(migration).toContain("start_payments_migration_bulk_commit");
    const billing = read("base44/functions/createPaymentLink/entry.ts");
    expect(billing.indexOf("requireEffectAuthorities")).toBeLessThan(
      billing.indexOf("stripe.checkout.sessions.create"),
    );
    const learning = read("base44/functions/intelligenceAdmin/entry.ts");
    expect(learning.indexOf("requireEffectAuthority(s")).toBeLessThan(
      learning.indexOf("entities.KnowledgeClaim.update"),
    );
  });
});
