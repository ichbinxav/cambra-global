import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyHardStop,
  offerHasMaterialCommitment,
  policyIsActive,
  routineActionAllowed,
} from "../../base44/shared/commercialAutonomy.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = p => fs.readFileSync(path.join(ROOT, p), "utf8");

const policy = {
  status: "active",
  approved_at: "2026-08-09T12:00:00.000Z",
  approved_by: "founder@cambra.global",
  effective_at: "2026-08-09T12:00:00.000Z",
  allowed_routine_actions: ["initial_outreach", "routine_reply", "counterproposal", "clarification"],
  prohibited_actions: ["accept_final_offer", "sign_contract", "migration_go_live"],
};

describe("commercial autonomy deterministic authority", () => {
  it("requires a real active founder-approved policy", () => {
    expect(policyIsActive(policy, Date.parse("2026-08-09T13:00:00Z"))).toBe(true);
    expect(policyIsActive({ ...policy, approved_by: null }, Date.parse("2026-08-09T13:00:00Z"))).toBe(false);
    expect(policyIsActive({ ...policy, status: "paused" }, Date.parse("2026-08-09T13:00:00Z"))).toBe(false);
  });

  it("allows only allowlisted routine classifications/actions", () => {
    expect(routineActionAllowed(policy, "routine_reply", "question").allowed).toBe(true);
    expect(routineActionAllowed(policy, "counterproposal", "clarification").allowed).toBe(true);
    expect(routineActionAllowed(policy, "sign_contract", "clarification").allowed).toBe(false);
    expect(routineActionAllowed(policy, "routine_reply", "legal").allowed).toBe(false);
    expect(routineActionAllowed(policy, "routine_reply", "final_offer").allowed).toBe(false);
  });

  it("hard-stops opt-out, complaint, legal and security language deterministically", () => {
    expect(classifyHardStop("Please don't contact me again")).toBe("unsubscribe");
    expect(classifyHardStop("This is spam and I want to file a complaint")).toBe("complaint");
    expect(classifyHardStop("Our lawyer will contact you")).toBe("legal");
    expect(classifyHardStop("We suspect a data breach")).toBe("security");
  });

  it("treats lock-in, minimums, contract terms and termination terms as material", () => {
    expect(offerHasMaterialCommitment({ conditions_json: { lock_in: true } })).toBe(true);
    expect(offerHasMaterialCommitment({ minimum_commitment: "€10k/month" })).toBe(true);
    expect(offerHasMaterialCommitment({ contract_term_months: 24 })).toBe(true);
    expect(offerHasMaterialCommitment({ termination_terms: "3 month fee" })).toBe(true);
    expect(offerHasMaterialCommitment({ variable_fee_bps: 25 })).toBe(false);
  });
});

describe("commercial autonomy static boundaries", () => {
  it("never fabricates calendar slots", () => {
    const src = read("base44/functions/meetingAgent/entry.ts");
    expect(src).toContain("calendar_availability_unverified");
    expect(src).not.toContain("Generate 3 reasonable slots");
  });

  it("inbound Resend verifies webhook signature before processing", () => {
    const src = read("base44/functions/resendInboundWebhook/entry.ts");
    expect(src).toContain("new Webhook(secret)");
    expect(src).toContain("wh.verify(raw");
    expect(src.indexOf("wh.verify(raw")).toBeLessThan(src.indexOf("email.received"));
  });

  it("autonomous sender requires internal proof unless explicit admin override", () => {
    const src = read("base44/functions/commercialSendMessage/entry.ts");
    expect(src).toContain("internal_autonomy_proof_required");
    expect(src).toContain("manual_override === true");
  });

  it("provider negotiation cannot auto-accept a final/material offer", () => {
    const src = read("base44/functions/providerNegotiationAgent/entry.ts");
    expect(src).toContain("action_type:'final_provider_deal'");
    expect(src).toContain("risk_level:4");
    expect(src).toContain("awaiting_final_approval");
    expect(src).not.toContain("sign_contract'");
  });

  it("final approval revalidates offer, Recover and mandate", () => {
    const src = read("base44/functions/resolveCommercialApproval/entry.ts");
    expect(src).toContain("offer_expired_reapproval_required");
    expect(src).toContain("recover_no_longer_authorized");
    expect(src).toContain("mandate_changed_reapproval_required");
    expect(src).toContain("contract_execution:false");
    expect(src).toContain("migration_go_live:false");
  });

  it("contract mismatch is deterministic and cannot execute the contract", () => {
    const src = read("base44/functions/reviewProviderContract/entry.ts");
    expect(src).toContain("approved_offer_required_before_contract_review");
    expect(src).toContain("contract_match_status:status");
    expect(src).toContain("action_type:status==='mismatch'?'contract_mismatch':'contract_exception'");
    expect(src).toContain("contract_execution:false");
  });

  it("hourly acquisition remains fail-closed without active policy", () => {
    const cfg = read("base44/functions/autonomousCommercialWorker/function.jsonc");
    const src = read("base44/functions/autonomousCommercialWorker/entry.ts");
    expect(cfg).toContain('"repeat_unit": "hours"');
    expect(cfg).toContain('"repeat_interval": 1');
    expect(src).toContain("acquisition_policy_missing");
    expect(src).toContain("outside_business_hours");
    expect(src).toContain("ContactSuppression");
  });
});
