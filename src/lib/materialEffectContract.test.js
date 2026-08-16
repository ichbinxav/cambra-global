import { describe, expect, it } from "vitest";
import {
  commercialSendMaterialEffectState,
  materialEffectTakeoverDecision,
  projectMaterialEffectState,
  schedulerMaterialEffectState,
  webhookDlqMaterialEffectState,
} from "../../base44/shared/materialEffectContract.ts";

describe("material effect contract facade", () => {
  it.each(["OBSERVED", "ACCEPTED"])(
    "never promotes provider %s acknowledgement to EXECUTED",
    (nativeState) => {
      expect(projectMaterialEffectState({
        native_state: nativeState,
        effects_started: false,
        terminal_success: true,
      })).toBe("CLAIMED");
      expect(projectMaterialEffectState({
        native_state: nativeState,
        effects_started: true,
        terminal_success: true,
      })).toBe("EFFECT_STARTED");
    },
  );

  it("projects existing scheduler, email and DLQ states without owning them", () => {
    expect(schedulerMaterialEffectState({
      status: "COMPLETED",
      effects_started: true,
    })).toBe("EXECUTED");
    expect(schedulerMaterialEffectState({
      status: "EXPIRED_PRE_EFFECT",
      effects_started: false,
    })).toBe("EXPIRED_PRE_EFFECT");

    expect(commercialSendMaterialEffectState({
      state: "ACCEPTED",
      provider_effect_started: true,
    })).toBe("EFFECT_STARTED");
    expect(commercialSendMaterialEffectState({
      state: "REVIEW_REQUIRED",
      provider_effect_started: true,
    })).toBe("REVIEW_REQUIRED");
    expect(commercialSendMaterialEffectState({ state: "COMMITTED" })).toBe(
      "EXECUTED",
    );
    expect(commercialSendMaterialEffectState({ state: "ROLLED_BACK" })).toBe(
      "RELEASED",
    );

    expect(webhookDlqMaterialEffectState({
      claim_state: "DELIVERING",
      claim_effects_started: true,
    })).toBe("EFFECT_STARTED");
    expect(webhookDlqMaterialEffectState({
      claim_state: "REVIEW_REQUIRED",
      claim_effects_started: true,
    })).toBe("REVIEW_REQUIRED");
  });

  it("allows takeover only after a pre-effect lease expiry", () => {
    expect(materialEffectTakeoverDecision({
      state: "CLAIMED",
      lease_expired: true,
    })).toMatchObject({ takeover_allowed: true, review_required: false });
    expect(materialEffectTakeoverDecision({
      state: "EXPIRED_PRE_EFFECT",
      lease_expired: true,
    })).toMatchObject({ takeover_allowed: true, review_required: false });
    expect(materialEffectTakeoverDecision({
      state: "CLAIMED",
      lease_expired: false,
    })).toMatchObject({ takeover_allowed: false, review_required: false });

    for (const state of [
      "EFFECT_STARTED",
      "FAILED_POST_EFFECT",
      "REVIEW_REQUIRED",
    ]) {
      expect(materialEffectTakeoverDecision({
        state,
        lease_expired: true,
      }), state).toMatchObject({
        takeover_allowed: false,
        review_required: true,
      });
    }
  });

  it.each(["EXPIRED_PRE_EFFECT", "FAILED_PRE_EFFECT"])(
    "quarantines contradictory %s evidence after an effect started",
    (nativeState) => {
      const projected = projectMaterialEffectState({
        native_state: nativeState,
        effects_started: true,
      });
      expect(projected).toBe("REVIEW_REQUIRED");
      expect(materialEffectTakeoverDecision({
        state: projected,
        lease_expired: true,
      })).toMatchObject({
        takeover_allowed: false,
        review_required: true,
      });
    },
  );
});
